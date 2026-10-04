// The multimeter part (issue #96): two probes and a V / A / Ω mode that
// behaves like a lab meter, including the ammeter-in-parallel mistake.
//
// Contract these tests are written against (circuit3d/js/parts/multimeter.js):
// - type 'multimeter', category 'Instruments', pins ['red', 'black'],
//   values.mode a choice of V, A and Ω (default V); `ai: false`.
// - Placement: off the board, like the battery. Each probe is a wire end,
//   "MM1.red" and "MM1.black", so a probe goes in any hole.
// - elements by mode: V → one R of 10 MΩ red–black; A → one R of 0.1 Ω;
//   Ω → none (open in the main solve, so the board always solves).
// - measure(r) → { mode, reading, unit, fuse }:
//     V: reading = V(red) − V(black), unit 'V'
//     A: reading = current red → black in mA, unit 'mA', fuse true when
//        |I| > 10 A (10000 mA)
//     Ω: reading '--' (the main solve does not read ohms)
// - The reading shows in the results panel (a line or headline in
//   result.lines), formatted like '4.50 V', '14.9 mA', or 'FUSE'.
// - require('../circuit3d/js/parts/multimeter.js').ohms(components, wires,
//   label): solves a copy of the board with a 1 mA test current between the
//   probes → { reading: ohms, unit: 'Ω' }; when a source is connected to the
//   probes' circuit → { reading: '--', unit: 'Ω', why: '…turn the power off…' }.
// - ai: false: Parts.all() keeps the part, the registry accepts it, and the
//   server sends no tool and no prompt line for it.
//
// Every number was hand-computed and checked against the real simulator
// (Board.toSim → Sim.analyze); no mocks.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out
const Server   = require('../backend/server.js');
const Parts    = require('../circuit3d/js/parts');
const Sim      = require('../circuit3d/js/simulate.js');
const Board    = require('../circuit3d/js/board-model.js');
const Readings = require('../circuit3d/js/readings.js');
const testSpan = require('./fixtures/parts/test_span.js');

// ── Helpers ───────────────────────────────────────────────────

const wiresOf = pairs => pairs.map(([from, to], i) => ({ id: 'W' + (i + 1), from, to }));
const BAT   = { type: 'battery', label: 'BAT1' };                   // 9 V
const POWER = [['BAT1.0', 'tp_1'], ['BAT1.1', 'tn_1']];             // + rail, − rail
const res   = (label, holes, ohms) => ({ type: 'resistor', label, holes, values: { resistance: ohms } });
// LED holes are [cathode, anode].
const led   = (label, holes) => ({ type: 'led', label, holes, values: { color: 'red' } });
const meter = mode => ({ type: 'multimeter', label: 'MM1', values: { mode } });

function meterDef() {
  const def = Parts.get('multimeter');
  assert.ok(def, `no multimeter part registered; parts: ${Parts.all().map(d => d.type).join(', ')}`);
  return def;
}

function solve(parts, pairs) {
  if (parts.some(p => p.type === 'multimeter')) meterDef();
  const board = Board.toSim({ parts, wires: wiresOf(pairs) });
  const result = Sim.analyze(board.components, board.wires);
  return { board, result };
}

// The meter's measure() from a solve.
function reading(result) {
  const part = result.parts && result.parts.MM1;
  assert.ok(part && part.m, `the solve has no reading for MM1 (status ${result.status}); parts: ${Object.keys(result.parts || {}).join(', ')}`);
  return part.m;
}

// Result lines a board with the meter has that the same board without it doesn't.
const texts = result => result.lines.map(l => l.text);
const newLines = (withMeter, without) => texts(withMeter).filter(t => !texts(without).includes(t));

function ohmsFn() {
  meterDef();
  let mod;
  try { mod = require('../circuit3d/js/parts/multimeter.js'); } catch (e) { assert.fail(`circuit3d/js/parts/multimeter.js did not load: ${e.message}`); }
  assert.equal(typeof (mod && mod.ohms), 'function', 'multimeter.js must export ohms(components, wires, label)');
  return mod.ohms;
}
function ohmsOf(parts, pairs) {
  const ohms = ohmsFn();
  const board = Board.toSim({ parts, wires: wiresOf(pairs) });
  return ohms(board.components, board.wires, 'MM1');
}

function near(got, want, tol, what) {
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want} ± ${tol}, got ${JSON.stringify(got)}`);
}

// ── The part ──────────────────────────────────────────────────

test('the multimeter is registered: Instruments, pins red and black, mode V / A / Ω defaulting to V, ai false', () => {
  const def = meterDef();
  assert.equal(def.category, 'Instruments');
  assert.deepStrictEqual([...def.pins], ['red', 'black']);
  assert.ok(def.values && def.values.mode && def.values.mode.choices, 'values.mode must be a choice');
  assert.deepStrictEqual(Object.keys(def.values.mode.choices).sort(), ['A', 'V', 'Ω'].sort());
  assert.equal(def.values.mode.default, 'V');
  assert.strictEqual(def.ai, false);
  assert.ok(Parts.all().includes(def), 'Parts.all() keeps the multimeter');
});

// ── 1. V mode across R2 of a 1k/1k divider on 9 V ──────────────
// R1 a10–a14, R2 b14–b18, both 1 kΩ; tp → c10, c18 → tn. Red on d14,
// black on d18. R2 ∥ 10 MΩ = 999.9 Ω, so V = 9 × 999.9 / 1999.9 =
// 4.49978 V, against 4.5 V with no meter: 0.0002 V of loading.

const DIVIDER_PARTS = [BAT, res('R1', ['a10', 'a14'], 1000), res('R2', ['b14', 'b18'], 1000)];
const DIVIDER_WIRES = [...POWER, ['tp_10', 'c10'], ['c18', 'tn_18']];
const V_PROBES      = [['MM1.red', 'd14'], ['MM1.black', 'd18']];

test('V mode across R2 of a 1k/1k divider on 9 V reads 4.50 V, within 0.01 V of R2 with no meter', () => {
  const bare = solve(DIVIDER_PARTS, DIVIDER_WIRES);
  const noMeter = Readings.from(bare.result, bare.board).part('R2').V;
  near(noMeter, 4.5, 1e-6, 'R2 with no meter');

  const { result } = solve([...DIVIDER_PARTS, meter('V')], [...DIVIDER_WIRES, ...V_PROBES]);
  assert.equal(result.status, 'ok');
  const m = reading(result);
  assert.equal(m.mode, 'V');
  assert.equal(m.unit, 'V');
  assert.ok(typeof m.reading === 'number', `V reading should be a number; got ${JSON.stringify(m.reading)}`);
  assert.equal(m.reading.toFixed(2), '4.50', `V reading ${m.reading}`);
  assert.ok(Math.abs(m.reading - noMeter) < 0.01, `the meter moved R2 by ${Math.abs(m.reading - noMeter)} V`);
  assert.ok(!m.fuse, 'V mode never blows the fuse');
});

test('V mode: the reading is in the results panel ("4.50 V")', () => {
  const bare = solve(DIVIDER_PARTS, DIVIDER_WIRES).result;
  const { result } = solve([...DIVIDER_PARTS, meter('V')], [...DIVIDER_WIRES, ...V_PROBES]);
  const added = newLines(result, bare);
  assert.ok(added.some(t => t.includes('4.50 V')), `no new results line shows "4.50 V"; new lines: ${JSON.stringify(added)}`);
});

// ── 2. A mode in series with the demo LED loop ─────────────────
// tp → c10, R1 470 Ω a10–a14, LED1 anode b14 / cathode b18; the loop's
// ground wire c18 → tn is broken by the meter: c18 → red, black → tn_18.
// I = (9 − 2.0) / (470 + 0.1 LED + 0.1 meter) = 14.887 mA, red → black.

const LOOP_PARTS = [BAT, res('R1', ['a10', 'a14'], 470), led('LED1', ['b18', 'b14'])];
const LOOP_WIRES = [...POWER, ['tp_10', 'c10']];
const SERIES     = [['c18', 'MM1.red'], ['MM1.black', 'tn_18']];

test('A mode in series with the demo LED loop reads 14.9 mA, no fuse', () => {
  const { result } = solve([...LOOP_PARTS, meter('A')], [...LOOP_WIRES, ...SERIES]);
  assert.equal(result.status, 'ok');
  const m = reading(result);
  assert.equal(m.mode, 'A');
  assert.equal(m.unit, 'mA');
  near(m.reading, 14.887, 0.01, 'A reading (mA), red → black');
  assert.equal(m.reading.toFixed(1), '14.9');
  assert.strictEqual(m.fuse, false);
  const lit = result.parts.LED1 && result.parts.LED1.m;
  assert.ok(lit && lit.on === true, 'the LED stays lit with the ammeter in series');
});

test('A mode: the reading is in the results panel ("14.9 mA")', () => {
  const bare = solve(LOOP_PARTS, [...LOOP_WIRES, ['c18', 'tn_18']]).result;
  const { result } = solve([...LOOP_PARTS, meter('A')], [...LOOP_WIRES, ...SERIES]);
  const added = newLines(result, bare);
  assert.ok(added.some(t => t.includes('14.9 mA')), `no new results line shows "14.9 mA"; new lines: ${JSON.stringify(added)}`);
});

// ── 3. A mode straight across the battery ─────────────────────
// The lab mistake: 0.1 Ω across 9 V is 90 A (90000 mA) > 10 A.

test('A mode straight across the battery blows the fuse, and the results panel says FUSE', () => {
  const { result } = solve([BAT, meter('A')], [...POWER, ['tp_5', 'MM1.red'], ['MM1.black', 'tn_5']]);
  const m = reading(result);
  assert.equal(m.mode, 'A');
  assert.strictEqual(m.fuse, true, `fuse should blow at 90 A; measure: ${JSON.stringify(m)}`);
  assert.ok(texts(result).some(t => t.includes('FUSE')), `no results line says FUSE: ${JSON.stringify(texts(result))}`);
});

// ── 4. Ω mode: ohms() with the power off, and refusing with it on ──

test('Ω mode: a lone 470 Ω resistor with the probes on its leads reads 470 Ω', () => {
  const r = ohmsOf([res('R1', ['a10', 'a14'], 470), meter('Ω')], [['MM1.red', 'c10'], ['MM1.black', 'c14']]);
  assert.equal(r.unit, 'Ω');
  near(r.reading, 470, 1, 'ohms across R1');
});

test('Ω mode: two 1 kΩ in parallel read 500 Ω', () => {
  // R1 a10–a14 and R2 b10–b14 share both columns.
  const r = ohmsOf([res('R1', ['a10', 'a14'], 1000), res('R2', ['b10', 'b14'], 1000), meter('Ω')],
                   [['MM1.red', 'c10'], ['MM1.black', 'c14']]);
  near(r.reading, 500, 1, 'ohms across R1 ∥ R2');
});

test('Ω mode: with the 9 V battery across the resistor it reads -- and says to turn the power off', () => {
  const r = ohmsOf([BAT, res('R1', ['a10', 'a14'], 470), meter('Ω')],
                   [...POWER, ['tp_10', 'b10'], ['b14', 'tn_14'], ['MM1.red', 'c10'], ['MM1.black', 'c14']]);
  assert.equal(r.reading, '--', `with the power on: ${JSON.stringify(r)}`);
  assert.equal(r.unit, 'Ω');
  assert.match(String(r.why), /power off/i);
});

test('Ω mode: a battery powering a different circuit does not stop it reading 470 Ω', () => {
  // BAT1 lights R2 (a30–a34) on its own loop; R1 (a10–a14) touches nothing powered.
  const r = ohmsOf([BAT, res('R1', ['a10', 'a14'], 470), res('R2', ['a30', 'a34'], 1000), meter('Ω')],
                   [...POWER, ['tp_30', 'b30'], ['b34', 'tn_34'], ['MM1.red', 'c10'], ['MM1.black', 'c14']]);
  near(r.reading, 470, 1, 'ohms across R1, the battery on another circuit');
});

// ── 5. Ω mode in the main solve ───────────────────────────────
// BAT1 across R1 470 Ω (tp → c10, c14 → tn), meter probes d10 / d14 in Ω:
// the meter adds no elements, so R1 still carries 9 / 470 = 19.149 mA.

test('Ω mode across a powered resistor: the board still solves, R1 is unchanged, and the meter reads --', () => {
  const { result } = solve([BAT, res('R1', ['a10', 'a14'], 470), meter('Ω')],
                           [...POWER, ['tp_10', 'c10'], ['c14', 'tn_14'], ['MM1.red', 'd10'], ['MM1.black', 'd14']]);
  assert.equal(result.status, 'ok');
  const m = reading(result);
  assert.equal(m.mode, 'Ω');
  assert.equal(m.reading, '--');
  const board = Board.toSim({ parts: [BAT, res('R1', ['a10', 'a14'], 470), meter('Ω')],
    wires: wiresOf([...POWER, ['tp_10', 'c10'], ['c14', 'tn_14'], ['MM1.red', 'd10'], ['MM1.black', 'd14']]) });
  near(Readings.from(result, board).part('R1').I, 19.149, 0.01, 'R1 current (mA) with the Ω meter across it');
});

// ── 6. ai: false — the AI never sees the meter ────────────────

const DEMO_REQUEST = 'Build a single LED circuit with a current-limiting resistor.';
const toolName = def => (def.ai && def.ai.tool) || 'place_' + def.type;
const aiParts = () => Parts.all().filter(def => def.ai !== false);
const mentionsMeter = s => /multimeter/i.test(s);

test('ai false: no tool in CIRCUIT_TOOLS places or names the multimeter', () => {
  const def = meterDef();
  const decls = Server.CIRCUIT_TOOLS[0].function_declarations;
  assert.ok(!decls.some(d => d.name === toolName(def)), `CIRCUIT_TOOLS has ${toolName(def)}`);
  const naming = decls.filter(d => mentionsMeter(JSON.stringify(d))).map(d => d.name);
  assert.deepStrictEqual(naming, [], 'tools that mention the multimeter');
});

test('ai false: set_value offers no key that only the multimeter has (its mode)', () => {
  meterDef();
  const aiKeys = new Set(aiParts().flatMap(d => (d.ai.values || Object.keys(d.values || {}))));
  const props = Server.CIRCUIT_TOOLS[0].function_declarations.find(d => d.name === 'set_value').parameters.properties;
  if (!aiKeys.has('mode')) assert.equal(props.mode, undefined, 'set_value offers the meter\'s mode');
});

test('ai false: the system prompt never names the multimeter', () => {
  meterDef();
  assert.ok(!mentionsMeter(Server.SYSTEM_PROMPT), 'SYSTEM_PROMPT mentions the multimeter');
});

test('ai false: selectTools sends no multimeter tool, for the demo request or one that asks for a meter', () => {
  const def = meterDef();
  const cases = [[DEMO_REQUEST, []], ['measure the voltage across R2 with a multimeter', ['multimeter']]];
  for (const [message, board] of cases) {
    const names = Server.selectTools(message, board).map(t => t.name);
    assert.ok(!names.includes(toolName(def)), `"${message}" sends ${toolName(def)}: ${names.join(', ')}`);
    const naming = Server.selectTools(message, board).filter(t => mentionsMeter(JSON.stringify(t))).map(t => t.name);
    assert.deepStrictEqual(naming, [], `"${message}": tools that mention the multimeter`);
  }
});

// Last: registers a test-only part.
test('the registry accepts ai: false, and still refuses a part with no ai at all', () => {
  assert.doesNotThrow(() => Parts.define(Object.assign(testSpan(), { type: 'test_no_ai', prefix: 'TNA', ai: false })),
    'define() should accept ai: false');
  assert.strictEqual(Parts.get('test_no_ai').ai, false);
  const missing = Object.assign(testSpan(), { type: 'test_ai_missing', prefix: 'TAM' });
  delete missing.ai;
  assert.throws(() => Parts.define(missing), /ai is required/);
});
