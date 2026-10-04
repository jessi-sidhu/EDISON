// Edison's help after a photo build (issue #143; the photo spec → "Build,
// then help"; docs/API-CONTRACT.md → "Page additions (photo)"). After Build
// it, the page asks Edison her question with a context line appended to the
// /api/ask `message` (question + "\n\n" + context). The server is unchanged,
// so the context must not change what the server does with the message:
// which tools selectTools sends, the NEW_BUILD match, or the "Fix it" check.
//
// Seams these tests assume (stated so the builder matches them):
// - Chat.photoContext(result) → the context line, a pure export of chat.js's
//   Node half (like Chat.modelHistoryText), so Node can check exactly what
//   the page sends. `result` is PhotoImport.build's output ({ actions,
//   labels, flags, skipped }); the page calls it on the result Build it hands
//   to photo.js (window.PhotoConfirm.built), and e2e/photo-build.spec.js
//   checks the page sends question + "\n\n" + Chat.photoContext(that result).
//   - It starts "Built from a photo of my real breadboard."
//   - No flags: exactly that sentence.
//   - Flags: then " Unsure readings: <labels and what>." naming each flagged
//     entry by its APP label (result.labels[flag.id]) when it has one. The
//     spec's own example, a polarity flag on LED1, is exactly
//     "Built from a photo of my real breadboard. Unsure readings: LED1 direction."
//   - Never a part keyword (any Parts.all() part's ai.keywords, as a whole
//     word with a plural "s", the way selectTools matches them), a NEW_BUILD
//     word, or "fix" / "repair".
// - server.js exports NEW_BUILD (the regex at server.js "const NEW_BUILD"),
//   next to selectTools. The builder adds it to module.exports.
// "applyBuild makes one undo step" is checked in the page
// (e2e/photo-build.spec.js: one Ctrl+Z empties the board): Chat.acceptBuild's
// one-batch undo already has its own tests, and applyBuild is browser-only.
//
// Every build here is the real PhotoImport.build on a Reading; nothing is mocked.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out
const Server = require('../backend/server.js');
const { isFixRequest } = require('../backend/ai-providers.js');
const Chat   = require('../circuit3d/js/chat.js');
const Parts  = require('../circuit3d/js/parts');
const {
  build, reading, resistor, ledOf, led, wire, battery, lead,
} = require('./fixtures/photo-import-helpers.js');

const PREFIX    = 'Built from a photo of my real breadboard.';
const QUESTIONS = ["My LED won't light, why?", "What's wrong with my circuit?"];
// The board the page sends with the ask: the demo build's part types.
const BOARDS    = [[], ['battery', 'resistor', 'led']];

function context(result) {
  assert.equal(typeof Chat.photoContext, 'function', 'chat.js exports no photoContext(result)');
  const ctx = Chat.photoContext(result);
  assert.equal(typeof ctx, 'string', `photoContext returned ${JSON.stringify(ctx)}, not a string`);
  return ctx;
}

const toolNames = (message, types) => Server.selectTools(message, types).map(t => t.name);

// selectTools' own whole-word rule (server.js namedIn), over every part.
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keywordsIn = text => {
  const t = text.toLowerCase();
  return Parts.all().flatMap(def => (def.ai.keywords || [])
    .filter(k => new RegExp(`(^|[^a-z0-9])${escapeRe(k)}s?(?![a-z0-9])`).test(t))
    .map(k => `${def.type}:${k}`));
};

// The stage board (no bridge, no flags), with the parts, wires and power given.
const stage = ({ parts, wires, power } = {}) => reading({
  parts: parts || [resistor('R1', 'a10', 'a14'), led('LED1', 'c14', 'c17')],
  wires: wires || [wire('W1', 'red', 'rail:aOuter:10', 'b10'), wire('W2', 'black', 'b17', 'rail:aInner:19')],
  power: power || [battery('rail:aOuter:3', 'rail:aInner:3')],
});

// The contract's mock Reading (the demo board): R1 bridged from the + rail.
const demo = () => reading({
  parts: [resistor('R1', 'rail:aOuter:10', 'a14'), led('LED1', 'c14', 'c17')],
  wires: [wire('W1', 'black', 'b17', 'rail:aInner:19')],
  power: [battery('rail:aOuter:3', 'rail:aInner:3')],
});

// Real builds that raise each kind of flag the import can give.
const BUILDS = [
  ['the demo board (R1 drawn with a jumper: moved)', demo()],
  ['LED colour unread (value)', stage({ parts: [resistor('R1', 'a10', 'a14'), led('LED1', 'c14', 'c17', '')] })],
  ['resistor value unread (value)', stage({ parts: [resistor('R1', 'a10', 'a14', 0), led('LED1', 'c14', 'c17')] })],
  ['LED legs unmarked (polarity)', stage({ parts: [resistor('R1', 'a10', 'a14'), ledOf('LED1', [{ hole: 'c14', role: 'unknown' }, { hole: 'c17', role: 'unknown' }])] })],
  ['battery voltage unread (value on power:0)', stage({ power: [battery('rail:aOuter:3', 'rail:aInner:3', 0)] })],
  ['a bench supply built as a battery (source)', stage({ power: [battery('rail:aOuter:3', 'rail:aInner:3', 9, 'bench_supply')] })],
  ['no battery in the photo (source, whole board)', stage({ power: [] })],
  ['rail signs unread (rails, whole board)', Object.assign(stage(), { board: { visible: true, cols: 63, rails: { aOuter: '?', aInner: '?', jInner: '?', jOuter: '?' }, split: false } })],
  ['an IC the import can\'t build (type)', stage({ parts: [resistor('R1', 'a10', 'a14'), led('LED1', 'c14', 'c17'),
    { id: 'U1', type: 'other', what: '8-pin chip', value: 0, bands: [], color: '', leads: [lead('e30'), lead('f30')], box: [0, 0, 0, 0], confidence: 0.4, unsure: [] }] })],
  ['a wire end not on a hole (position)', stage({ wires: [wire('W1', 'red', 'rail:aOuter:10', 'b10'), wire('W2', 'black', 'b17', '?')] })],
  ['both resistor leads in one strip (shorted)', stage({ parts: [resistor('R1', 'a10', 'b10'), led('LED1', 'c14', 'c17')] })],
];

// ── The spec's wording ─────────────────────────────────────────────────────

test('the spec\'s example: a polarity flag on LED1 → "Built from a photo of my real breadboard. Unsure readings: LED1 direction."', () => {
  const result = build(stage({ parts: [resistor('R1', 'a10', 'a14'), ledOf('LED1', [{ hole: 'c14', role: 'unknown' }, { hole: 'c17', role: 'unknown' }])] }));
  assert.deepStrictEqual(result.flags.map(f => `${f.kind}:${f.id}`), ['polarity:LED1'], 'the fixture raises exactly one polarity flag');
  assert.strictEqual(context(result), `${PREFIX} Unsure readings: LED1 direction.`);
});

test('no flags (the stage board): the context is only "Built from a photo of my real breadboard."', () => {
  const result = build(stage());
  assert.deepStrictEqual(result.flags, [], 'the stage board imports with no flags');
  assert.strictEqual(context(result), PREFIX);
});

// ── The context never changes what the server does with the message ───────

describe.each(BUILDS)('%s', (_name, r) => {
  const result = build(r);

  test('the context names every flagged part by its app label and has no part keyword, NEW_BUILD word or "fix"', () => {
    assert.ok(result.flags.length, 'the fixture raises a flag');
    const ctx = context(result);
    assert.ok(ctx.startsWith(PREFIX), `the context starts "${PREFIX}": ${JSON.stringify(ctx)}`);
    for (const f of result.flags) {
      const label = f.id != null && result.labels[f.id];
      if (label) assert.match(ctx, new RegExp(`\\b${escapeRe(label)}\\b`), `the context names ${f.kind}-flagged ${f.id} as ${label}: ${JSON.stringify(ctx)}`);
    }
    assert.deepStrictEqual(keywordsIn(ctx), [], `part keywords in ${JSON.stringify(ctx)}`);
    assert.ok(Server.NEW_BUILD instanceof RegExp, 'server.js exports no NEW_BUILD regex');
    assert.strictEqual(Server.NEW_BUILD.test(ctx), false, `NEW_BUILD matches ${JSON.stringify(ctx)}`);
    assert.strictEqual(isFixRequest(ctx), false, `"fix" / "repair" in ${JSON.stringify(ctx)}`);
  });

  test.each(QUESTIONS)('question + "\\n\\n" + context: the same tools, NEW_BUILD match and Fix-it check as "%s" alone', q => {
    const msg = q + '\n\n' + context(result);
    for (const types of BOARDS) {
      assert.deepStrictEqual(toolNames(msg, types), toolNames(q, types), `selectTools changed with board [${types}] for ${JSON.stringify(msg)}`);
    }
    assert.ok(Server.NEW_BUILD instanceof RegExp, 'server.js exports no NEW_BUILD regex');
    assert.strictEqual(Server.NEW_BUILD.test(msg), Server.NEW_BUILD.test(q), `the NEW_BUILD match changed for ${JSON.stringify(msg)}`);
    assert.strictEqual(isFixRequest(msg), isFixRequest(q), `the Fix-it check changed for ${JSON.stringify(msg)}`);
  });
});
