// The "pin wired to nothing" check, narrowed to pins a part opts into
// (issue #56, the #31 follow-up).
//
// #31 made findCircuitProblems name every pin of a footprint part on the
// power–ground path whose hole joins nothing. That is right for a pot's
// wiper, but wrong for parts that legitimately leave pins unused (a pot
// wired as a rheostat, a slide switch's spare throw, an RGB LED using one
// colour, a chip's NC pins). Now a part lists the pins that must connect,
// and only those are checked.
//
// Shapes these tests assume (stated so the builder matches them):
// - AiSpec gets an optional `mustWire: string[]`: pin names of the part.
//   parts/registry.js validates it in checkAi: a list (not a string or other
//   value), each entry one of the part's pins, no pin twice. A refusal is a
//   PartDefinitionError naming the part (define's "Part "<type>" is invalid"
//   header) and the field (`ai.mustWire`), and for a bad pin the pin itself.
// - The potentiometer sets `ai: { …, mustWire: ['wiper'] }`. No other real
//   part sets it.
// - server.js findCircuitProblems (footprintProblems) names a pin as "wired
//   to nothing" only when the pin is in def.ai.mustWire. A part without
//   mustWire is only checked for being between power and ground. The
//   wording of the line stays as #31 has it. No type checks in server.js.
// - docs/API-CONTRACT.md's AiSpec block lists `mustWire`.
//
// Test-only parts: test_three (test/fixtures/parts/test_three.js, no
// mustWire) and test_must, a copy of it that sets ai.mustWire = ['out'].
// Both are defined BEFORE server.js is required, since the server builds its
// tools from Parts.all() when it loads. Vitest gives each file its own
// module registry, so they don't leak into other files.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out

const Parts     = require('../circuit3d/js/parts');
const testThree = require('./fixtures/parts/test_three.js');

// A test_three copy under a new type, name and prefix, with `change` applied.
function threeAs(type, name, prefix, change = () => {}) {
  const d = testThree();
  Object.assign(d, { type, name, prefix });
  d.examples[0].parts[1] = { type, label: prefix + '1', holes: ['a10', 'a11', 'a12'] };
  d.examples[0].expect   = { [prefix + '1']: { current: 0 } };
  change(d);
  return d;
}

if (!Parts.get('test_three')) Parts.define(testThree());

// test_must: test_three that opts its `out` pin in. Today define() refuses
// the unknown field ai.mustWire; keep the error so the tests using this part
// fail with it instead of the whole file failing to load.
let mustError = null;
try {
  if (!Parts.get('test_must')) Parts.define(threeAs('test_must', 'Test must', 'TM', d => { d.ai.mustWire = ['out']; }));
} catch (e) { mustError = e; }
function needMust() {
  assert.ok(!mustError, `define() must accept test_three with ai.mustWire ['out']; it threw: ${mustError && mustError.message}`);
  assert.ok(Parts.get('test_must'), 'test_must is registered');
}

const Server  = require('../backend/server.js');
const Recipes = require('./fixtures/recipes.js');

const N    = Recipes.HIGHEST_COL;   // 63
const wire = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });
const problems = actions => Server.findCircuitProblems(actions.map(a => ({ ...a })));

const START = [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  wire('BAT1.0', `tp_${N}`, 'red'),
  wire('BAT1.1', `tn_${N}`, 'black'),
];

// ── The registry: ai.mustWire ─────────────────────────────────────────────

// define(def) must throw a PartDefinitionError about ai.mustWire itself
// (not today's 'unknown field "ai.mustWire"'), matching every pattern.
function rejectsMustWire(def, patterns) {
  let err = null;
  try { Parts.define(def); } catch (e) { err = e; }
  assert.ok(err, `define() should have refused ai.mustWire ${JSON.stringify(def.ai.mustWire)}`);
  assert.ok(err instanceof Parts.PartDefinitionError, `expected a PartDefinitionError, got ${err.name}: ${err.message}`);
  assert.doesNotMatch(err.message, /unknown field "ai\.mustWire"/,
    'ai.mustWire must be a known AiSpec field; the refusal should be about its value');
  for (const p of patterns) assert.match(err.message, p);
}

describe('ai.mustWire in parts/registry.js', () => {
  test("accepts ai.mustWire listing existing pins (['out'], ['in', 'out'])", () => {
    for (const [type, prefix, list] of [['test_mw_one', 'MWA', ['out']], ['test_mw_two', 'MWB', ['in', 'out']]]) {
      let err = null;
      try { Parts.define(threeAs(type, 'Test mw', prefix, d => { d.ai.mustWire = list; })); } catch (e) { err = e; }
      assert.ok(!err, `ai.mustWire ${JSON.stringify(list)} should be accepted; define() threw: ${err && err.message}`);
      assert.deepStrictEqual([...Parts.get(type).ai.mustWire], list);
    }
  });

  test('refuses a pin the part does not have, naming the part, the field and the pin', () => {
    rejectsMustWire(threeAs('test_mw_bad', 'Test mw', 'MWC', d => { d.ai.mustWire = ['wiper']; }),
      [/test_mw_bad/, /mustWire/, /wiper/]);
  });

  test('refuses a pin listed twice, naming the part and the field', () => {
    rejectsMustWire(threeAs('test_mw_twice', 'Test mw', 'MWD', d => { d.ai.mustWire = ['out', 'out']; }),
      [/test_mw_twice/, /mustWire/]);
  });

  test('refuses a mustWire that is not a list, naming the part and the field', () => {
    rejectsMustWire(threeAs('test_mw_str', 'Test mw', 'MWE', d => { d.ai.mustWire = 'out'; }),
      [/test_mw_str/, /mustWire/]);
  });

  test("only the potentiometer sets ai.mustWire, to ['wiper']", () => {
    assert.ok(Parts.get('potentiometer'), 'the potentiometer is registered');
    const REAL = ['resistor', 'led', 'battery', 'buzzer', 'button', 'potentiometer'];
    const set = {};
    for (const def of Parts.all()) {
      if (REAL.includes(def.type) && def.ai.mustWire !== undefined) set[def.type] = [...def.ai.mustWire];
    }
    assert.deepStrictEqual(set, { potentiometer: ['wiper'] });
  });
});

// ── findCircuitProblems: only mustWire pins are named ─────────────────────

describe('findCircuitProblems names an unwired pin only when the part lists it in ai.mustWire', () => {
  // test_three at c2 facing right: in c2, gnd c3, out c4. in → + (tp_2 → a2),
  // gnd → − (a3 → tn_3). It sits between power and ground; out (c4) is
  // wired to nothing, which test_three (no mustWire) allows.
  const THREE_OUT_UNUSED = [
    ...START,
    { tool: 'place_test_three', hole: 'c2', direction: 'right' },
    wire('tp_2', 'a2', 'red'), wire('a3', 'tn_3', 'black'),
  ];

  test("test_three (no mustWire) with its out pin wired to nothing is not flagged", () => {
    assert.deepStrictEqual(problems(THREE_OUT_UNUSED), []);
  });

  test('finishAIReply keeps that build as sent, with no "Heads up"', () => {
    const out = Server.finishAIReply({ reply: 'Built it.', actions: THREE_OUT_UNUSED.map(a => ({ ...a })) });
    assert.deepStrictEqual(out.actions, THREE_OUT_UNUSED);
    assert.equal(out.reply, 'Built it.');
  });

  test("test_must (mustWire ['out']) with out wired to nothing is flagged, naming out and c4", () => {
    needMust();
    const got = problems([
      ...START,
      { tool: 'place_test_must', hole: 'c2', direction: 'right' },
      wire('tp_2', 'a2', 'red'), wire('a3', 'tn_3', 'black'),
    ]);
    assert.equal(got.length, 1, `exactly one problem: ${JSON.stringify(got)}`);
    assert.match(got[0], /test must/);
    assert.match(got[0], /\bout pin\b/);
    assert.match(got[0], /\bc4\b/);
    assert.match(got[0], /wired to nothing/);
  });

  test("test_must (mustWire ['out']) wired in → + and out → −, gnd unused: not flagged", () => {
    needMust();
    // in c2, gnd c3, out c4: in → + (tp_2 → a2), out → − (a4 → tn_4).
    assert.deepStrictEqual(problems([
      ...START,
      { tool: 'place_test_must', hole: 'c2', direction: 'right' },
      wire('tp_2', 'a2', 'red'), wire('a4', 'tn_4', 'black'),
    ]), []);
  });

  // A pot wired as a rheostat: pot at c2 facing right, pin 1 c2, wiper c3,
  // pin 3 c4. Wiper → + (tp_3 → a3); pin 1 feeds a resistor b2–b6 and an LED
  // (anode c6, cathode c8) to − (a8 → tn_8). Pin 3 (c4) is left open, which
  // is how a rheostat is wired.
  test('a pot wired as a rheostat (pin 3 open, wiper used) is not flagged', () => {
    assert.ok(Parts.get('potentiometer'), 'the potentiometer is registered');
    assert.deepStrictEqual(problems([
      ...START,
      { tool: 'place_potentiometer', hole: 'c2', direction: 'right', resistance: 1000 },
      wire('tp_3', 'a3', 'red'),
      { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
      { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
      wire('a8', 'tn_8', 'black'),
    ]), []);
  });
});

// ── The contract ──────────────────────────────────────────────────────────

test('docs/API-CONTRACT.md: the AiSpec block lists mustWire', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'API-CONTRACT.md'), 'utf8');
  const m = doc.match(/###\s*`AiSpec`\s*\n```js\n([\s\S]*?)```/);
  assert.ok(m, 'an "### `AiSpec`" heading followed by a ```js block in docs/API-CONTRACT.md');
  assert.match(m[1], /\bmustWire\??\s*:/, `the AiSpec block lists mustWire:\n${m[1]}`);
});
