// The electrolytic capacitor part (issue #104): charges through a resistor
// on the real time-stepping simulator (#102), reads V, I and the stored
// energy ½CV², and is flagged backwards (reversed by more than 1 V) or over
// (|V| above its 25 V rating) through Readings, the way the mistake checker
// (#95) and the smoke (#99) read every part. It stays out of the AI's tools.
//
// Run with:  npm test
//
// The part-file contract itself (define's rules) and the part's own
// examples[] are already checked for every registered part by
// test/parts-registry.test.js and test/parts-examples.test.js, so they are
// not repeated here. The page (sidebar, Run, the clock, the hover card) is
// e2e/capacitor.spec.js.
//
// Seams these tests assume (stated so the builder matches them):
// - type 'capacitor', registered by parts/index.js (Node) like the others.
// - Its elements are one C element, polarised: true, vmax: 25, whose pins
//   are [+, −]: element pins[0] is the part's + lead, so a charged
//   capacitor has a positive state voltage (docs/API-CONTRACT.md, C). The
//   tests find the + and − part pins from that element, so the pin names
//   and their order in `pins` are the builder's choice.
// - The kit values are one `choices` value (like the Zener's model): one
//   choice per kit value, each choice's overrides giving the C element its
//   farads. The tests read the farads through elements(), so the value key,
//   the choice names and the override key are the builder's choice.
// - measure(r) → { V, I, energy }: V = V(+) − V(−) in volts, I the
//   capacitor's current in mA (+ while charging, + → −), energy = ½CV² in
//   µJ. (The issue's "Measure and line: V, I (mA), and energy".)
// - warnings(r, m) say "backwards" when V(+) − V(−) < −1 V, so
//   Readings.problems() gives { kind: 'backwards', labels: [label] }.
// - Readings.part(label) gains energy (µJ) for a capacitor, and over is
//   true when |V| > 25 V, so problems() gives { kind: 'over' } and the smoke
//   picks it up. Its why names the 25 V rating.
// - tools/hover-card.js cardLines(label, part) shows the energy for a
//   capacitor (any of µJ / mJ / J), beside V and I.
//
// Every expected value is the closed-form RC answer or a hand number,
// checked within 2 % (backward Euler at dt = τ/50 is about 1 % off).

const assert = require('node:assert');
process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out
const Server   = require('../backend/server.js');
const Parts    = require('../circuit3d/js/parts');
const Sim      = require('../circuit3d/js/simulate.js');
const Board    = require('../circuit3d/js/board-model.js');
const Readings = require('../circuit3d/js/readings.js');

// Loaded per test, so a module that can't load fails each test by name.
const HoverCard = () => require('../circuit3d/js/tools/hover-card.js');

// ── The part, read through the registry ───────────────────────

const KIT_UF = [1, 10, 47, 100, 220, 470, 1000, 4700];   // the issue's kit values, µF

function capDef() {
  const def = Parts.get('capacitor');
  assert.ok(def, `no capacitor part registered; parts: ${Parts.all().map(d => d.type).join(', ')}`);
  return def;
}

// The values elements() gets for a part with `given` set, choices merged in
// (as simulate.js's partValues).
function merged(def, given) {
  const out = {};
  for (const [key, spec] of Object.entries(def.values || {})) out[key] = spec.default;
  Object.assign(out, given || {});
  for (const [key, spec] of Object.entries(def.values || {})) {
    if (spec.choices && spec.choices[out[key]]) Object.assign(out, spec.choices[out[key]]);
  }
  return out;
}

const cElements = (def, given) => def.elements(merged(def, given), {}).filter(e => e.kind === 'C');

// The choices value that sets the capacitance: [key, spec].
function kitValue(def) {
  const entry = Object.entries(def.values || {}).find(([, spec]) => spec && spec.choices);
  assert.ok(entry, `the capacitor's kit values must be a choices value; values: ${JSON.stringify(def.values)}`);
  return entry;
}

const toUF = farads => Number((farads * 1e6).toPrecision(6));

// µF of each kit choice, by choice name.
function kit(def) {
  const [key, spec] = kitValue(def);
  return Object.keys(spec.choices).map(name => {
    const c = cElements(def, { [key]: name });
    assert.equal(c.length, 1, `choice "${name}": expected one C element, got ${c.length}`);
    return { name, uF: toUF(c[0].farads) };
  });
}

function choiceFor(def, uF) {
  const hit = kit(def).find(k => k.uF === uF);
  assert.ok(hit, `no kit choice gives ${uF} µF; kit: ${kit(def).map(k => k.uF).join(', ')}`);
  return hit.name;
}

// The part's + and − pin names: the C element's pins[0] and pins[1].
function polarity(def) {
  const [c] = cElements(def);
  assert.ok(c && def.pins.includes(c.pins[0]) && def.pins.includes(c.pins[1]),
    `the C element's pins must be the part's two leads; got ${JSON.stringify(c && c.pins)} for pins ${JSON.stringify(def.pins)}`);
  return { plus: c.pins[0], minus: c.pins[1] };
}

// A capacitor record for Board.toSim: + lead in `plus`, − lead in `minus`.
function cap(label, plus, minus, uF) {
  const def = capDef();
  const { plus: p } = polarity(def);
  const [key] = kitValue(def);
  return { type: 'capacitor', label, holes: def.pins.map(pin => (pin === p ? plus : minus)),
           values: { [key]: choiceFor(def, uF) } };
}

// ── Boards and solving ────────────────────────────────────────

const wiresOf = pairs => pairs.map(([from, to], i) => ({ id: 'W' + (i + 1), from, to }));
const BAT   = { type: 'battery', label: 'BAT1' };                       // 9 V
const POWER = [['BAT1.0', 'tp_1'], ['BAT1.1', 'tn_1']];                 // + rail, − rail
const bench = volts => ({ type: 'bench_supply', label: 'PS1', values: { voltage: volts } });
const BENCH_POWER = [['PS1.0', 'tp_1'], ['PS1.1', 'tn_1']];
const res   = (label, holes, ohms) => ({ type: 'resistor', label, holes, values: { resistance: ohms } });

// tp → c10, R1 1 kΩ a10–a14, C1 between column 14 and column 18, c18 → tn.
// reversed: C1's − lead in column 14 (toward +) and its + lead in 18.
function rc(uF, opts) {
  const o = opts || {};
  const power = o.volts != null ? bench(o.volts) : BAT;
  const capRec = o.reversed ? cap('C1', 'b18', 'b14', uF) : cap('C1', 'b14', 'b18', uF);
  const parts = [power, res('R1', ['a10', 'a14'], 1000), capRec];
  const pairs = [...(o.volts != null ? BENCH_POWER : POWER), ['tp_10', 'c10'], ['c18', 'tn_18']];
  return Board.toSim({ parts, wires: wiresOf(pairs) });
}

// A plain solve (no dt): the capacitor is open, so the source's full
// voltage sits across it.
function plain(board) {
  const result = Sim.analyze(board.components, board.wires);
  assert.equal(result.status, 'ok', `status: ${result.status}`);
  return { result, readings: Readings.from(result, board) };
}

// n steps of dt from 0 V (or `state`), carrying result.state.
function stepped(board, dt, n, state) {
  let result = null;
  let s = state || {};
  for (let k = 0; k < n; k++) {
    result = Sim.analyze(board.components, board.wires, { dt, state: s });
    assert.equal(result.status, 'ok', `step ${k + 1}: status ${result.status}`);
    s = result.state;
  }
  return { result, state: s, readings: Readings.from(result, board) };
}

function measured(result, label) {
  const p = result.parts && result.parts[label];
  assert.ok(p && p.m, `analyze().parts has no measure() for ${label}; parts: ${Object.keys(result.parts || {}).join(', ')}`);
  return p.m;
}

const within = (got, want, pct, what) =>
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= Math.abs(want) * pct / 100,
    `${what}: expected ${want} within ${pct} %, got ${got}`);
const near = (got, want, tol, what) =>
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want} ± ${tol}, got ${got}`);

const kinds = (readings, label) => readings.problems().filter(p => p.labels.includes(label)).map(p => p.kind);

const charge = (volts, t, tau) => volts * (1 - Math.exp(-t / tau));

// ── 1. The part ───────────────────────────────────────────────

test('the capacitor is registered: one polarised C element rated 25 V, ai false', () => {
  const def = capDef();
  assert.ok(Parts.all().includes(def), 'Parts.all() keeps the capacitor');
  assert.strictEqual(def.ai, false, 'ai: false, like the multimeter');
  const c = cElements(def);
  assert.equal(c.length, 1, `one C element; got ${JSON.stringify(def.elements(merged(def), {}))}`);
  assert.strictEqual(c[0].polarised, true, 'the C element is polarised');
  assert.strictEqual(c[0].vmax, 25, 'the C element is rated 25 V');
  polarity(def);
});

test('the kit values are 1, 10, 47, 100, 220, 470, 1000 and 4700 µF, and the default is one of them', () => {
  const def = capDef();
  assert.deepStrictEqual(kit(def).map(k => k.uF).sort((a, b) => a - b), KIT_UF);
  const [, spec] = kitValue(def);
  const dflt = kit(def).find(k => k.name === spec.default);
  assert.ok(dflt, `the default "${spec.default}" is a kit choice`);
  assert.ok(KIT_UF.includes(toUF(cElements(def)[0].farads)), 'the default capacitance (with no values given) is a kit value');
});

// ── 2. RC charging, known answers ─────────────────────────────
// 9 V → 1 kΩ → C, from 0 V: V(t) = 9 (1 − e^(−t/RC)), stepped at τ/50
// (10 ms at most, as Sim.pickDt would) for the given time.
//   1000 µF, τ = 1 s:    t = 1 s   → 9 (1 − e^−1)       = 5.689 V (the issue's QA number)
//   4700 µF, τ = 4.7 s:  t = 1 s   → 9 (1 − e^(−1/4.7)) = 1.725 V
//   100 µF,  τ = 0.1 s:  t = 0.1 s → 9 (1 − e^−1)       = 5.689 V

test.each([
  // uF     dt      steps  t      tau
  [1000,   0.02,   50,    1,     1],
  [4700,   0.02,   50,    1,     4.7],
  [100,    0.002,  50,    0.1,   0.1],
])('9 V → 1 kΩ → %s µF: V within 2 percent of 9(1 − e^(−t/τ))', (uF, dt, steps, t, tau) => {
  const { result } = stepped(rc(uF), dt, steps);
  const m = measured(result, 'C1');
  within(m.V, charge(9, t, tau), 2, `${uF} µF: V(+) − V(−) at t = ${t} s`);
});

// The first step from 0 V, 1000 µF, dt = 20 ms: G = C/dt = 0.05 S, so
// (9 − v)/1000 = 0.05 v → v = 0.17647 V, I = 0.05 × 0.17647 = 8.824 mA,
// charging (+ into the + lead).
test('measure: the first charging step reads V 0.176 V and I +8.82 mA', () => {
  const { result } = stepped(rc(1000), 0.02, 1);
  const m = measured(result, 'C1');
  near(m.V, 0.17647, 1e-4, 'V after one step');
  near(m.I, 8.824, 0.01, 'I after one step (mA, + while charging)');
});

// energy = ½ C V², in µJ.
//   1000 µF on a 5 V bench supply (open, so 5 V across): ½ × 1e-3 × 25 = 12,500 µJ
//   47 µF on the 9 V battery: ½ × 47e-6 × 81 = 1,903.5 µJ
test.each([
  // uF    volts  energy µJ
  [1000,  5,     12500],
  [47,    9,     1903.5],
])('energy: %s µF at %s V stores ½CV² = %s µJ, in measure() and Readings.part()', (uF, volts, want) => {
  const board = rc(uF, volts === 9 ? {} : { volts });
  const { result, readings } = plain(board);
  const m = measured(result, 'C1');
  near(m.V, volts, 1e-3, 'V across the open capacitor');
  near(m.I, 0, 1e-3, 'no current in a plain solve');
  within(m.energy, want, 0.1, 'measure().energy (µJ)');
  const p = readings.part('C1');
  assert.ok(p, 'Readings.part(C1)');
  within(p.energy, want, 0.1, 'Readings.part(C1).energy (µJ)');
});

test('energy follows the charge: at 1 s on the 1000 µF RC it is ½CV² of that moment\'s V', () => {
  const { result, readings } = stepped(rc(1000), 0.02, 50);
  const m = measured(result, 'C1');
  const want = 0.5 * 1e-3 * m.V * m.V * 1e6;   // about 16,000 µJ at 5.66 V
  within(m.energy, want, 0.1, 'measure().energy at 1 s');
  within(readings.part('C1').energy, want, 0.1, 'Readings.part(C1).energy at 1 s');
});

// ── 3. Backwards ──────────────────────────────────────────────
// Reversed (− lead toward +) on a plain solve the whole source voltage is
// across it backwards. Flagged only past 1 V reversed.

test.each([
  // source         reversed by   backwards?
  ['9 V battery',   9,            true],
  ['bench 1.5 V',   1.5,          true],
  ['bench 0.5 V',   0.5,          false],
])('reversed on the %s (%s V backwards): backwards is %s', (what, volts, want) => {
  const board = rc(1000, { reversed: true, volts: what.startsWith('bench') ? volts : undefined });
  const { result, readings } = plain(board);
  near(measured(result, 'C1').V, -volts, 1e-3, 'V(+) − V(−), reversed');
  assert.strictEqual(kinds(readings, 'C1').includes('backwards'), want,
    `problems() for C1 reversed by ${volts} V: ${JSON.stringify(readings.problems())}`);
});

// Reversed in a time run: after one 20 ms step it is only 0.18 V backwards
// (not flagged); by 1 s it is 5.7 V backwards (flagged).
test('reversed while charging: not backwards at 0.18 V, backwards once past 1 V', () => {
  const board = rc(1000, { reversed: true });
  const first = stepped(board, 0.02, 1);
  near(measured(first.result, 'C1').V, -0.17647, 1e-4, 'V after one step, reversed');
  assert.ok(!kinds(first.readings, 'C1').includes('backwards'),
    `0.18 V reversed is not backwards yet: ${JSON.stringify(first.readings.problems())}`);
  const later = stepped(board, 0.02, 49, first.state);
  within(measured(later.result, 'C1').V, -charge(9, 1, 1), 2, 'V at 1 s, reversed');
  assert.ok(kinds(later.readings, 'C1').includes('backwards'),
    `5.7 V reversed is backwards: ${JSON.stringify(later.readings.problems())}`);
});

// ── 4. Over its 25 V rating ───────────────────────────────────

test.each([
  // bench V   over?
  [24,        false],
  [26,        true],
  [30,        true],
])('on a %s V bench supply: part().over is %s, and problems() agrees', (volts, want) => {
  const { result, readings } = plain(rc(1000, { volts }));
  near(measured(result, 'C1').V, volts, 1e-3, 'V across the open capacitor');
  const p = readings.part('C1');
  assert.ok(p, 'Readings.part(C1)');
  assert.strictEqual(p.over, want, `Readings.part(C1).over at ${volts} V`);
  const over = readings.problems().find(q => q.kind === 'over' && q.labels.includes('C1'));
  assert.strictEqual(!!over, want, `problems() 'over' for C1 at ${volts} V: ${JSON.stringify(readings.problems())}`);
  if (over) {
    assert.match(over.why, /25 ?V/, 'the why names the 25 V rating');
    assert.doesNotMatch(over.why, /NaN|undefined|null/, `the why reads as plain English: "${over.why}"`);
  }
  assert.ok(!kinds(readings, 'C1').includes('backwards'), 'the right way round is never backwards');
});

// 30 V → 1 kΩ → 10 µF, τ = 10 ms, dt = 0.2 ms: 18.9 V at 10 ms (fine),
// 29.4 V at 40 ms (over): over follows the simulated voltage.
test('charging toward 30 V: not over at 10 ms (≈ 19 V), over by 40 ms (≈ 29.4 V)', () => {
  const board = rc(10, { volts: 30 });
  const early = stepped(board, 0.0002, 50);
  within(measured(early.result, 'C1').V, charge(30, 0.01, 0.01), 2, 'V at 10 ms');
  assert.strictEqual(early.readings.part('C1').over, false, 'under 25 V at 10 ms');
  const late = stepped(board, 0.0002, 150, early.state);
  within(measured(late.result, 'C1').V, charge(30, 0.04, 0.01), 2, 'V at 40 ms');
  assert.strictEqual(late.readings.part('C1').over, true, 'over 25 V at 40 ms');
  assert.ok(kinds(late.readings, 'C1').includes('over'), `problems() 'over' at 40 ms: ${JSON.stringify(late.readings.problems())}`);
});

// ── 5. Normal charging is no mistake ──────────────────────────

test('normal charging on 9 V: no warning, not backwards, not over', () => {
  const { result, readings } = stepped(rc(1000), 0.02, 50);
  assert.deepStrictEqual(result.parts.C1.warnings, [], 'no warnings while charging the right way round');
  assert.deepStrictEqual(kinds(readings, 'C1'), [], `problems() for C1: ${JSON.stringify(readings.problems())}`);
  assert.strictEqual(readings.part('C1').over, false);
});

// ── 6. The hover card shows the energy ────────────────────────
// 1000 µF at 5 V: 12,500 µJ = 12.5 mJ = 0.0125 J, whichever unit it uses.

test('hover card: a capacitor\'s card shows V and its stored energy (12,500 µJ at 5 V on 1000 µF)', () => {
  const { readings } = plain(rc(1000, { volts: 5 }));
  const lines = HoverCard().cardLines('C1', readings.part('C1'));
  assert.ok(Array.isArray(lines), `cardLines gives lines; got ${JSON.stringify(lines)}`);
  const text = lines.join(' | ');
  assert.match(text, /\b5\.0 V\b/, `the card shows V: ${text}`);
  const m = /(\d[\d,]*(?:\.\d+)?)\s?(µJ|uJ|mJ|J)\b/.exec(text);
  assert.ok(m, `the card shows the stored energy in µJ, mJ or J: ${text}`);
  const scale = { 'µJ': 1, uJ: 1, mJ: 1e3, J: 1e6 }[m[2]];
  within(Number(m[1].replace(/,/g, '')) * scale, 12500, 1, `energy on the card (${m[0]}) in µJ`);
});

// ── 7. ai: false — the AI never sees the capacitor ────────────

const DEMO_REQUEST = 'Build a single LED circuit with a current-limiting resistor.';
const CAP_REQUEST  = 'Build an RC circuit: charge a 1000 µF capacitor through a 1 kΩ resistor from the battery.';
const mentionsCap = s => /capacitor/i.test(s);

test('ai false: no tool in CIRCUIT_TOOLS places or names the capacitor, and the system prompt never does', () => {
  const def = capDef();
  const decls = Server.CIRCUIT_TOOLS[0].function_declarations;
  assert.ok(!decls.some(d => d.name === 'place_' + def.type), 'CIRCUIT_TOOLS has place_capacitor');
  assert.deepStrictEqual(decls.filter(d => mentionsCap(JSON.stringify(d))).map(d => d.name), [], 'tools that mention the capacitor');
  assert.ok(!mentionsCap(Server.SYSTEM_PROMPT), 'SYSTEM_PROMPT mentions the capacitor');
});

test('ai false: selectTools sends no capacitor tool, for the demo request or one that asks for a capacitor', () => {
  const def = capDef();
  for (const message of [DEMO_REQUEST, CAP_REQUEST]) {
    const tools = Server.selectTools(message, []);
    assert.ok(!tools.some(t => t.name === 'place_' + def.type), `"${message}" sends place_capacitor`);
    assert.deepStrictEqual(tools.filter(t => mentionsCap(JSON.stringify(t))).map(t => t.name), [],
      `"${message}": tools that mention the capacitor`);
  }
});
