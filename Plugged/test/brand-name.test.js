// The product is called Edison everywhere a person sees it (issue #186).
// No visible "Sparky", "Plugged" or "PLUGGED" in the shipped pages, the JS
// strings a person reads, or the AI's system prompt; and no code identifier,
// DOM id or storage key renamed, so the code and saved boards keep working.
//
// Run with:  npm test
//
// What counts as visible in a page (a rough parse, no DOM):
// - its text once <script>, <style> and <!-- comments --> are cut and the
//   tags stripped (the <title> is text too);
// - the values of title=, placeholder=, aria-label= and alt=.
// Ids, classes, src/href paths, inline handlers (onclick="SparkyChat…") and
// script contents are code, not text, and are never checked.

const fs   = require('node:fs');
const path = require('node:path');
process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out
const Server = require('../backend/server.js');
const Eval   = require('../scripts/ai-eval.js');

const ROOT  = path.join(__dirname, '..');
const read  = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const BRAND = /Sparky|Plugged|PLUGGED/;

const PAGES = ['index.html', 'landing.html', 'dashboard.html', 'circuit3d/index.html', 'circuit3d/viewer.html',
  ...fs.readdirSync(path.join(ROOT, 'edison')).filter(f => f.endsWith('.html')).sort().map(f => `edison/${f}`)];

const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
const TAG   = /<\/?[a-zA-Z!](?:[^>"']|"[^"]*"|'[^']*')*>/g;   // a > inside a quoted value doesn't end the tag
const ATTR  = /\s([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

// What a person sees in html: [where, text] pairs.
function visible(html) {
  const body = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  const out = [];
  for (const [tag] of body.matchAll(TAG)) {
    for (const a of tag.matchAll(ATTR)) {
      if (ATTRS.includes(a[1].toLowerCase())) out.push([`${a[1].toLowerCase()}=`, a[2] ?? a[3]]);
    }
  }
  for (const line of body.replace(TAG, '\n').split('\n')) if (line.trim()) out.push(['text', line.trim()]);
  return out;
}
const brandHits = html => visible(html).filter(([, t]) => BRAND.test(t)).map(([where, t]) => `${where} "${t}"`);

// ── The visible-text guard ────────────────────────────────────────────────

test('self-check: the page reader finds a name in text, <title>, title=, placeholder=, aria-label= and alt=, and skips scripts, styles, comments, ids, classes, handlers and paths', () => {
  const sample = `<html><head><title>Sparky</title>
    <script>window.SparkyChat = { s: '<b>Plugged</b>' };</script><style>.sparky-x::after { content: "Plugged"; }</style></head>
    <body><div id="sparky-panel" class="sparky-x" onclick="if (a > 0) SparkyChat.open()">
    <img src="img/Plugged.png" alt="Plugged logo"><a href="/Plugged/x" aria-label="Sparky home" title='Sparky tip'>Home</a>
    <textarea id="sparky-input" placeholder="Ask Sparky"></textarea><p>Built by PLUGGED</p><!-- Sparky was here --></div></body></html>`;
  expect(brandHits(sample).sort()).toEqual([
    'alt= "Plugged logo"', 'aria-label= "Sparky home"', 'placeholder= "Ask Sparky"',
    'text "Built by PLUGGED"', 'text "Sparky"', 'title= "Sparky tip"',
  ].sort());
  expect(brandHits('<html><head><title>Edison</title></head><body id="sparky-body"><p>Edison</p></body></html>'), 'a clean page').toEqual([]);
});

test.each(PAGES)('%s shows no "Sparky", "Plugged" or "PLUGGED" (text, <title>, title=, placeholder=, aria-label=, alt=)', page => {
  const shown = visible(read(page));
  expect(shown.length, `${page}: the reader found some text (a guard over nothing proves nothing)`).toBeGreaterThan(0);
  expect(brandHits(read(page)), `${page}: visible old names`).toEqual([]);
});

test('the editor\'s chat box reads "Ask Edison anything…"', () => {
  const box = read('circuit3d/index.html').match(/<textarea\b[^>]*\bid="sparky-input"[^>]*>/);
  expect(box, 'circuit3d/index.html keeps <textarea id="sparky-input">').toBeTruthy();
  expect(box[0].match(/placeholder="([^"]*)"/)?.[1], 'its placeholder').toBe('Ask Edison anything…');
});

// The visible strings that live in JS: chat.js's fallback message, the
// server's replies, the Edison skin's top-bar name. Only string literals with
// a space in them are read (an identifier, key or path has none), and comment
// and console.* lines are skipped (log prefixes keep their name).
const jsFiles = () => {
  const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => {
    const p = `${d}/${e.name}`;
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
  return [...walk('circuit3d'), ...walk('edison'), ...fs.readdirSync(path.join(ROOT, 'backend')).filter(f => f.endsWith('.js')).map(f => `backend/${f}`)];
};
const LITERAL = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
function shownStrings(file) {
  const hits = [];
  read(file).split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line) || /\bconsole\./.test(line)) return;
    for (const m of line.matchAll(LITERAL)) if (/\s/.test(m[2]) && BRAND.test(m[2])) hits.push(`${file}:${i + 1} ${m[0]}`);
  });
  return hits;
}

test('the JS strings a person reads (chat, photo, labs, app, the Edison skin, the server\'s replies) name no Sparky or Plugged', () => {
  const files = jsFiles();
  expect(files, 'the scan covers chat.js, the skin and server.js').toEqual(expect.arrayContaining(['circuit3d/js/chat.js', 'edison/skin.js', 'backend/server.js']));
  expect(files.flatMap(shownStrings)).toEqual([]);
});

test('the AI introduces itself as Edison: the system prompt says "You are Edison" and names no Sparky or Plugged', () => {
  expect(typeof Server.SYSTEM_PROMPT, 'server.js exports SYSTEM_PROMPT').toBe('string');
  expect(Server.SYSTEM_PROMPT).toMatch(/\bYou are Edison\b/);
  expect(Server.SYSTEM_PROMPT.split('\n').filter(l => BRAND.test(l)), 'prompt lines with an old name').toEqual([]);
});

// Pin: npm run ai-eval spots the server's "could not reach the AI service"
// reply by its opening words (scripts/ai-eval.js FALLBACK). Renaming the
// reply without the script would grade an outage as a failed build.
test('pin: the server\'s 502 reply still counts as an error in npm run ai-eval, not a failed build', () => {
  const m = read('backend/server.js').match(/sendJSON\(res,\s*502,\s*\{\s*reply:\s*(['"`])(.+?)\1/);
  expect(m, 'server.js answers 502 with a fixed reply').toBeTruthy();
  const testCase = { id: 'T-OUTAGE', message: 'x', checks: { parts: { led: 1 } } };
  expect(Eval.outcome(testCase, { reply: m[2], actions: [] }), `"${m[2]}"`).toBe('error');
});

// ── Pins: nothing a program reads was renamed ─────────────────────────────

// Baseline counted on origin/dev 3bd3c0d, before the rename, across every
// .js/.html/.css file under circuit3d/ and edison/:
//   sparky-input 14, sparkyAsk 7, SparkyChat 6 (27 in all).
const IDENTIFIERS = { 'sparky-input': 14, sparkyAsk: 7, SparkyChat: 6 };

// At least the baseline, not exactly: new code may use these names (the voice
// work adds sparkyAsk and SparkyChat calls and a #mic-btn inside
// #sparky-input-row), but a rename drops a count below it.
test('pin: the identifiers sparkyAsk, SparkyChat and sparky-input are used at least as often as before the rename', () => {
  const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => {
    const p = `${d}/${e.name}`;
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return /\.(js|html|css)$/.test(e.name) ? [p] : [];
  });
  const text = [...walk('circuit3d'), ...walk('edison')].map(read).join('\n');
  const got = Object.fromEntries(Object.keys(IDENTIFIERS).map(id => [id, (text.match(new RegExp(id, 'g')) || []).length]));
  for (const [id, base] of Object.entries(IDENTIFIERS)) expect(got[id], `${id} uses`).toBeGreaterThanOrEqual(base);
});

// Saved boards, the open circuit, the UI choice and the user's name load from
// these keys; a renamed key strands what is already saved.
test.each([
  ['circuit3d/js/storage.js', 'sparky_current_uid'],
  ['circuit3d/js/storage.js', 'sparky_local_projects'],
  ['circuit3d/js/storage.js', 'sparky_starred'],
  ['circuit3d/js/storage.js', 'sparky_username'],
  ['circuit3d/js/storage.js', 'sparky_open_circuit'],
  ['circuit3d/js/app.js', 'sparky_load_circuit'],
  ['dashboard.html', 'sparky_load_circuit'],
  ['dashboard.html', 'sparky_username'],
  ['landing.html', 'sparky_load_circuit'],
  ['edison/ui-flag.js', 'plugged.ui'],
])('pin: %s still uses the storage key %s', (file, key) => {
  expect(read(file).includes(`'${key}'`), `'${key}' in ${file}`).toBe(true);
});
