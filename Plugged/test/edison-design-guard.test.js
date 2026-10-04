// The Edison design guard (issue #147): fails when Edison drifts
// into the "obvious AI UI" tells (edison/DESIGN.md §3), and holds the §4
// palette.
// Scans every .css, .html and .js file under edison/ plus the editor skin
// circuit3d/css/theme-edison.css once it exists, and the Lab HUD
// stylesheets circuit3d/css/edison-hud*.css (issue #189, Lab HUD 1/4).
// The HUD's caps labels are its design: text-transform: uppercase is allowed
// in edison-hud*.css only (approved by Aarmen, edison/DESIGN.md "Editor: Lab
// HUD"); every other rule holds there too.
//
// Run with:  npm test
//
// Each rule first checks its own pattern against a known-bad and a known-good
// sample, so a pattern that can never match fails here instead of passing
// silently. Each scan also needs at least one Edison file: a guard over no
// files proves nothing.

const fs   = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// The Lab HUD stylesheets (issue #189): circuit3d/css/edison-hud.css and the
// later HUD issues' own edison-hud-*.css files.
const HUD_CSS = 'circuit3d/css/edison-hud.css';
const isHud = f => /^edison-hud(?:-[\w-]+)?\.css$/.test(path.basename(f)) &&
  path.relative(ROOT, path.resolve(ROOT, f)).split(path.sep).join('/').startsWith('circuit3d/css/');
const files = () => {
  const out = [];
  const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p); else if (/\.(css|html|js)$/.test(f.name)) out.push(p);
  } };
  const edison = path.join(ROOT, 'edison');
  if (fs.existsSync(edison)) walk(edison);
  const skin = path.join(ROOT, 'circuit3d/css/theme-edison.css');
  if (fs.existsSync(skin)) out.push(skin);
  const css = path.join(ROOT, 'circuit3d/css');
  for (const f of fs.readdirSync(css).map(n => path.join(css, n))) if (isHud(f)) out.push(f);
  return out;
};
const scanned = () => {
  const list = files();
  expect(list.length, 'the guard scans at least one Edison file (edison/ is missing or empty)').toBeGreaterThan(0);
  return list;
};
const rel = f => path.relative(ROOT, f);

// bad and good are one sample or a list; every bad must match, no good may.
const RULES = [
  // Every way a font gets named: the font-family property, the font shorthand,
  // a --font-* token, and a JS style.fontFamily assignment.
  { re: /(?:font-family|font|--font-[\w-]*|fontFamily)\s*[:=][^;\n]*\b(Inter|Space Grotesk|Geist|Instrument Serif|Fraunces)\b/i,
    what: 'banned font',
    bad: ["body { font-family: 'Inter', sans-serif; }", "  --font-dense: 'Space Grotesk', sans-serif;",
      ".big { font: 500 16px 'Inter', sans-serif; }", "el.style.fontFamily='Geist';"],
    good: ["body { font-family: 'Barlow', system-ui, sans-serif; }", "  --font-dense: 'Barlow Semi Condensed', 'Barlow', sans-serif;",
      ".big { font: 500 16px var(--font-ui); }", "el.style.fontFamily = 'B612 Mono';",
      '.x { font-family: var(--font-ui); } /* an Interface panel */'] },
  // A banned family fetched from Google Fonts (an @import or a <link>).
  { re: /family=(Inter|Space\+Grotesk|Geist|Instrument\+Serif|Fraunces)\b/i, what: 'banned font in a font URL',
    bad: ["@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');",
      '<link href="https://fonts.googleapis.com/css2?family=Barlow&family=Space+Grotesk:wght@500" rel="stylesheet">'],
    good: "@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@600&display=swap');" },
  // Allowed in the Lab HUD stylesheets only (issue #189, approved by Aarmen).
  { re: /text-transform\s*:\s*uppercase/i, what: 'all-caps text', allowIn: isHud,
    bad: '.label { text-transform: uppercase; }', good: '.label { text-transform: none; }' },
  { re: /backdrop-filter/i, what: 'glass blur',
    bad: '.panel { backdrop-filter: blur(8px); }', good: '.panel { background: var(--pad); }' },
  { re: /background-clip\s*:\s*text/i, what: 'gradient text',
    bad: 'h1 { background-clip: text; }', good: 'h1 { background-clip: padding-box; }' },
  // box-shadow: none is the only box-shadow allowed.
  { re: /box-shadow\s*:(?!\s*none)/i, what: 'box-shadow (use borders)',
    bad: '.card { box-shadow: 0 1px 2px #0003; }', good: '.card { box-shadow: none; }' },
  // The arrow as a character or an HTML entity, anywhere before the closing tag
  // (even inside a nested <span>).
  { re: /<(button|a)\b[^>]*>(?:(?!<\/\1>)[\s\S])*?(?:→|&rarr;|&#8594;|&#x2192;)/i, what: 'arrow welded to a button or link',
    bad: ['<a href="course.html">Open the course →</a>', '<button type="button">Next &rarr;</button>',
      '<a href="lab2.html">Lab 2 &#8594;</a>', '<button>Run &#x2192;</button>', '<a href=x><span>Open</span> →</a>'],
    good: ['<a href="course.html">Open the course</a>', '<a>Open</a> →', '<button>Run</button><p>Then → check the scope.</p>'] },
  { re: /\s·\s[^<\n]*\s·\s/, what: 'A · B · C meta string',
    bad: '<p>Lab 2 · Week 3 · Due Friday</p>', good: '<p>Lab 2 is due Friday.</p>' },
  // Extra case: edison/DESIGN.md §3 bans emoji in the nav.
  { re: /<nav\b[^>]*>(?:(?!<\/nav>)[\s\S])*?(?:\p{Emoji_Presentation}|\u{FE0F})/u, what: 'emoji in the nav',
    bad: '<nav><a href="#labs">📘 Labs</a></nav>', good: '<nav><a href="#labs">Labs</a></nav><p>✅ done</p>' },
];

// Gradients are allowed only on the line that declares the pad grid, and that
// line must hold that one declaration and nothing else. The repeating-*
// forms contain linear-/radial-/conic-gradient, so they are caught too.
const GRADIENT = /(?:linear|radial|conic)-gradient/i;
const PAD_GRID_DECLARATION = /^\s*--pad-grid-image\s*:[^;{}]*;?\s*$/;
const gradientLines = text => text.split('\n')
  .filter(line => GRADIENT.test(line) && !PAD_GRID_DECLARATION.test(line));

// Purple: hue 230–290°, HSL saturation above 40%. Spec §3 says 250°; Aarmen's
// delegate widened it to 230° so Tailwind indigo (#6366F1 ≈ 239°, #4F46E5 ≈
// 243°) is caught. The palette's bus blue #2C5CC0 sits at ≈ 220°.
const purple = hex => {
  const n = parseInt(hex, 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return false;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const hue = (h * 60 + 360) % 360, sat = d / (1 - Math.abs(mx + mn - 1));
  return hue >= 230 && hue <= 290 && sat > 0.4;
};
// Every hex colour in a text as 6 digits: #rrggbb, plus (added beyond the
// plan) #rgb, #rgba and #rrggbbaa, which would otherwise slip past.
const hexes = text => [...text.matchAll(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi)].map(m => {
  const h = m[1];
  return h.length <= 4 ? h.slice(0, 3).split('').map(c => c + c).join('') : h.slice(0, 6);
});

test('Edison files exist', () => { expect(files().length).toBeGreaterThan(0); });

// Issue #189: the HUD stylesheet exists and the guard reads it, so every rule
// below (gradients, box-shadow, purple, fonts...) holds there too.
test('the Lab HUD stylesheet circuit3d/css/edison-hud.css exists and is scanned', () => {
  expect(fs.existsSync(path.join(ROOT, HUD_CSS)), `${HUD_CSS} exists`).toBe(true);
  expect(scanned().map(rel), `the guard scans ${HUD_CSS}`).toContain(HUD_CSS);
});

// The uppercase exception covers the HUD stylesheets and nothing else.
test('the uppercase exception is the HUD stylesheets only', () => {
  for (const f of [HUD_CSS, 'circuit3d/css/edison-hud-chat.css', 'circuit3d/css/edison-hud-canvas.css'])
    expect(isHud(f), `${f} is a HUD stylesheet`).toBe(true);
  for (const f of ['circuit3d/css/theme-edison.css', 'edison/tokens.css', 'edison/edison-hud.css', 'edison/landing.css',
    'circuit3d/css/edison-hud.js', 'circuit3d/css/my-edison-hud.css', 'circuit3d/css/edison-hudx.css'])
    expect(isHud(f), `${f} is not a HUD stylesheet`).toBe(false);
  expect(RULES.filter(r => r.allowIn).map(r => r.what), 'only the all-caps rule has an exception').toEqual(['all-caps text']);
});

test.each(RULES)('no $what', ({ re, what, bad, good, allowIn }) => {
  for (const s of [bad].flat()) expect(re.test(s), `the ${what} rule catches: ${s}`).toBe(true);
  for (const s of [good].flat()) expect(re.test(s), `the ${what} rule allows: ${s}`).toBe(false);
  const hits = scanned().filter(f => !(allowIn && allowIn(f)) && re.test(fs.readFileSync(f, 'utf8'))).map(rel);
  expect(hits, `${what} in`).toEqual([]);
});

test('gradients only in the pad grid', () => {
  for (const bad of [
    '  background: linear-gradient(90deg, #E9EFE2, #CFDCC3);',
    // Mentioning the pad grid does not make another gradient on the line OK.
    '  background: linear-gradient(#7C3AED,#fff), var(--pad-grid-image);',
    '  background: conic-gradient(from 90deg, #E9EFE2, #CFDCC3);',
    '  background: repeating-linear-gradient(45deg, #E9EFE2 0 2px, #CFDCC3 2px 4px);',
    '  background: repeating-radial-gradient(circle, #E9EFE2 0 2px, #CFDCC3 2px 4px);',
    '  background: repeating-conic-gradient(#E9EFE2 0 25%, #CFDCC3 0 50%);',
    // The declaration must be the whole line, and the exact name.
    '  --pad-grid-image: linear-gradient(var(--pad-grid) 1px, transparent 1px); background: radial-gradient(#fff, #000);',
    '  --pad-grid-image-2: linear-gradient(var(--pad-grid) 1px, transparent 1px);',
  ]) expect(gradientLines(bad), `a stray gradient is caught: ${bad.trim()}`).toHaveLength(1);
  for (const good of [
    '  --pad-grid-image: linear-gradient(var(--pad-grid) 1px, transparent 1px);',
    '  --pad-grid-image: linear-gradient(var(--pad-grid) 1px, transparent 1px), linear-gradient(90deg, var(--pad-grid) 1px, transparent 1px);',
  ]) expect(gradientLines(good), `the pad grid declaration is allowed: ${good.trim()}`).toHaveLength(0);
  const hits = [];
  for (const f of scanned()) for (const line of gradientLines(fs.readFileSync(f, 'utf8'))) hits.push(`${rel(f)}: ${line.trim()}`);
  expect(hits).toEqual([]);
});

test('no purple', () => {
  for (const bad of ['7C3AED', '6366F1', '4F46E5']) expect(purple(bad), `#${bad} (violet / Tailwind indigo) is purple`).toBe(true);
  // The palette's blues and the other brand colours stay allowed.
  for (const ok of ['2C5CC0', '38B2D4', 'A6192E', '1D6A45']) expect(purple(ok), `#${ok} is not purple`).toBe(false);
  expect(hexes('a { color: #84E; border-color: #7C3AEDcc; }'), 'short and alpha hex are read').toEqual(['8844EE', '7C3AED']);
  const hits = scanned().flatMap(f => hexes(fs.readFileSync(f, 'utf8')).filter(purple).map(h => `${rel(f)} #${h}`));
  expect(hits).toEqual([]);
});

const TOKENS = path.join(ROOT, 'edison/tokens.css');
const readTokens = () => {
  expect(fs.existsSync(TOKENS), `${rel(TOKENS)} exists`).toBe(true);
  return fs.readFileSync(TOKENS, 'utf8');
};

// `--name: value` as a whole token: --graphite can't match inside --graphite-2
// (or --x-graphite), and #4D534E can't match the front of a longer hex.
const token = (name, value, flags = '') => new RegExp(`(?<![\\w-])--${name}\\s*:\\s*${value}`, flags);
const hexToken = (name, hex) => token(name, `#${hex}(?![0-9a-f])`, 'i');

test('the tokens file holds the DESIGN.md palette', () => {
  expect(hexToken('graphite', '262927').test('--graphite-2: #262927;'), '--graphite does not match --graphite-2').toBe(false);
  expect(hexToken('graphite-2', '4D534E').test('--graphite: #4D534E;'), '--graphite-2 does not match --graphite').toBe(false);
  expect(hexToken('graphite', '262927').test('--x-graphite: #262927;'), '--graphite does not match --x-graphite').toBe(false);
  expect(hexToken('graphite-2', '4D534E').test('--graphite-2: #4D534E80;'), 'a longer hex does not count').toBe(false);
  const css = readTokens();
  for (const [k, v] of Object.entries({ pad: 'E9EFE2', 'pad-grid': 'CFDCC3', graphite: '262927', 'graphite-2': '4D534E',
    mask: '1D6A45', 'bus-red': 'C4333B', 'bus-blue': '2C5CC0', bezel: '1E2225', ch1: 'E6B72E', ch2: '38B2D4', sfu: 'A6192E' }))
    expect(css, `--${k} is #${v}`).toMatch(hexToken(k, v));
});

// Extra case: the rest of the tokens file, the fonts and the scene background
// (edison/DESIGN.md §4). Numbers are proportional B612 with tabular figures
// (issue #148): B612 Mono's full-cell period read "14.9" as "14. 9".
test('the tokens file names the DESIGN.md fonts and a bezel scene background scene.js can read', () => {
  const family = f => `['"]${f}['"]`;
  expect(token('font-num', family('B612')).test("--font-num: 'B612 Mono', ui-monospace, monospace;"),
    "'B612 Mono' does not count as B612").toBe(false);
  const css = readTokens();
  for (const [k, f] of Object.entries({ 'font-ui': 'Barlow', 'font-dense': 'Barlow Semi Condensed',
    'font-display': 'Barlow Condensed', 'font-num': 'B612', 'font-text': 'STIX Two Text' }))
    expect(css, `--${k} starts with ${f}`).toMatch(token(k, family(f)));
  // Pin: proportional digits line up in columns only with tabular figures.
  expect(css, '.ed-num keeps tabular figures').toMatch(/\.ed-num\s*\{[^}]*font-variant-numeric\s*:\s*tabular-nums/);
  // scene.js takes --scene-bg only as a 6-digit hex; the viewport is the bezel (DESIGN.md §4).
  expect(css).toMatch(/--scene-bg\s*:\s*#1E2225\s*[;}]/i);
});

test('every rule in the tokens file is scoped to html[data-ui="edison"], so classic is untouched', () => {
  const css = readTokens().replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...css.matchAll(/([^{}]+)\{/g)].map(m => m[1].trim()).filter(s => !s.startsWith('@'));
  expect(selectors.length, 'the tokens file has rules').toBeGreaterThan(0);
  const loose = selectors.flatMap(s => s.split(',').map(x => x.trim())).filter(s => !s.startsWith('html[data-ui="edison"]'));
  expect(loose).toEqual([]);
});

// Issue #189: classic shares the editor's DOM, so every HUD rule needs the
// Edison scope. The mockup's hud.css used html[data-ui], which matches classic
// too. Keyframe steps (0%, to...) are not selectors.
const unscoped = text => {
  const css = text.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const selectors = [...css.matchAll(/([^{}]+)\{/g)].map(m => m[1].trim()).filter(s => !s.startsWith('@'));
  return { count: selectors.length,
    loose: selectors.flatMap(s => s.split(',').map(x => x.trim())).filter(s => !s.startsWith('html[data-ui="edison"]')) };
};
test('every rule in the HUD stylesheets is scoped to html[data-ui="edison"], so classic is untouched', () => {
  expect(unscoped('html[data-ui] body #topbar { height: 40px; }').loose, 'html[data-ui] alone is caught')
    .toEqual(['html[data-ui] body #topbar']);
  expect(unscoped('@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }\n' +
    '@media (max-width: 1024px) { html[data-ui="edison"] #topbar { height: 40px; } }').loose, 'keyframes and @media are fine').toEqual([]);
  const hud = scanned().filter(isHud);
  expect(hud.map(rel), 'the HUD stylesheets').toContain(HUD_CSS);
  for (const f of hud) {
    const { count, loose } = unscoped(fs.readFileSync(f, 'utf8'));
    expect(count, `${rel(f)} has rules`).toBeGreaterThan(0);
    expect(loose, `unscoped selectors in ${rel(f)}`).toEqual([]);
  }
});

// B612 is the proportional family (issue #148), at 400 and 700 (values are
// bold); B612 Mono may stay or go, but "family=B612+Mono" is not B612.
// DM Mono is the Lab HUD's base font (issue #189).
test('the fonts file loads Barlow, B612, STIX Two Text and DM Mono from Google Fonts', () => {
  const FONTS = path.join(ROOT, 'edison/fonts.css');
  expect(fs.existsSync(FONTS), `${rel(FONTS)} exists`).toBe(true);
  const css = fs.readFileSync(FONTS, 'utf8');
  expect(css).toMatch(/fonts\.googleapis\.com/);
  for (const family of ['Barlow', 'Barlow\\+Condensed', 'Barlow\\+Semi\\+Condensed', 'B612', 'STIX\\+Two\\+Text', 'DM\\+Mono'])
    expect(css, `the fonts file loads family=${family.replace(/\\/g, '')}`).toMatch(new RegExp(`family=${family}[:&'")]`));
  const b612 = /family=B612(?::([^&'")]*))?[&'")]/;
  expect(b612.test('family=B612+Mono:wght@400;700&display=swap'), 'B612 Mono does not count as B612').toBe(false);
  const axes = (b612.exec(css) || [])[1] || '';
  expect(axes, 'B612 loads weights 400 and 700').toMatch(/(?<!\d)400(?!\d)/);
  expect(axes, 'B612 loads weights 400 and 700').toMatch(/(?<!\d)700(?!\d)/);
});
