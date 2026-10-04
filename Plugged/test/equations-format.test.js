// Equations (issue #92): the pure formatters behind the equation card.
//
// Contract these tests are written against (circuit3d/js/tools/equations.js,
// UMD like readings.js, so Node can require it):
// - formatKCL(kclRows) → string, or null for no rows.
//   kclRows is Readings' kcl(net): [{ label, pin?, amps }], amps = mA INTO
//   the net, signed. Each row is a term I(<label>): into the net is +, out
//   of it is −. Terms are joined with " + " / " − " (U+2212); a first term
//   that is negative takes a bare "−" prefix. Then the magnitudes with the
//   same signs, one decimal in mA, then their sum: "= 0 mA" when it rounds
//   to 0.0 (never "0.0" or "−0").
//     I(R1) − I(LED1) − I(R2) = 7.3 − 4.2 − 3.1 = 0 mA
// - formatOhm(type, values, reading) → string, or null.
//   type     the part type ('resistor', 'led', 'bulb', 'motor')
//   values   the part's resolved values, result.parts[label].r.values from
//            Sim.analyze (resistance; an LED's vf comes resolved from its
//            colour)
//   reading  readings.part(label): { V, I, ... }, V in volts, I in mA, both
//            signed. The string uses magnitudes (a lit LED reads I < 0, a
//            resistor placed lead2-first reads V < 0 and I < 0).
//   Resistor, bulb, motor:  V = IR → <|V|> V = <|I|> mA × <R> Ω
//   LED:                    V = Vf + I·ron → <|V|> V = <Vf> V + <|I|> mA × <ron> Ω
//   V and Vf one decimal in volts, I one decimal in mA, R and ron as they
//   are. An LED with |I| < 0.05 mA (off, e.g. backwards) reads exactly
//   "LED off → I = 0 mA" instead. ron is not one of the LED's values: it is the D element's ron,
//   Parts.get('led').elements(values)[0].ron (0.1 Ω, RON in parts/led.js).
//   null when V or I is null (a floating part) or the type has no Ohm's
//   law form (a button, a battery). Never throws.
//
// Circuits are solved for real (Board.toSim → Sim.analyze → Readings.from),
// as in readings.test.js; every expected string was checked against the
// real simulator. No mocks.

const assert = require('node:assert');

const Sim      = require('../circuit3d/js/simulate.js');
const Board    = require('../circuit3d/js/board-model.js');
const Readings = require('../circuit3d/js/readings.js');

const { formatKCL, formatOhm } = require('../circuit3d/js/tools/equations.js');

// ── Helpers (as in readings.test.js) ──────────────────────────

const wiresOf = pairs => pairs.map(([from, to], i) => ({ id: 'W' + (i + 1), from, to }));
const BAT   = { type: 'battery', label: 'BAT1' };                    // 9 V
const POWER = [['BAT1.0', 'tp_1'], ['BAT1.1', 'tn_1']];             // + rail, − rail
const res   = (label, holes, ohms) => ({ type: 'resistor', label, holes, values: { resistance: ohms } });
// LED holes are [cathode, anode].
const led   = (label, holes, color) => ({ type: 'led', label, holes, values: { color: color || 'red' } });

function solve(parts, pairs) {
  const board = Board.toSim({ parts, wires: wiresOf(pairs) });
  const result = Sim.analyze(board.components, board.wires);
  return { result, board, readings: Readings.from(result, board) };
}

// formatOhm's arguments for a solved part.
const ohmArgs = (solved, label, type) => [type, solved.result.parts[label].r.values, solved.readings.part(label)];

// ── Two LEDs in parallel, each with its own resistor ───────────
// tp → c10 → R1 470 Ω (a10–a14) → LED1 red (anode b14, cathode b18) → tn
// tp → c30 → R2 1 kΩ (a30–a34) → LED2 green (anode b34, cathode b38) → tn
// I1 = (9 − 2.0) / 470.1 = 14.890 mA, I2 = (9 − 2.2) / 1000.1 = 6.799 mA,
// battery 21.690 mA. The + rail is the junction: BAT1 in, R1 and R2 out.

const PARALLEL_PARTS = [BAT, res('R1', ['a10', 'a14'], 470), led('LED1', ['b18', 'b14'], 'red'),
                        res('R2', ['a30', 'a34'], 1000), led('LED2', ['b38', 'b34'], 'green')];
const PARALLEL_WIRES = [...POWER, ['tp_10', 'c10'], ['tp_30', 'c30'], ['c18', 'tn_18'], ['c38', 'tn_38']];

test('formatKCL: the issue\'s example rows give its exact line', () => {
  const rows = [{ label: 'R1', amps: 7.3 }, { label: 'LED1', amps: -4.2 }, { label: 'R2', amps: -3.1 }];
  assert.strictEqual(formatKCL(rows), 'I(R1) − I(LED1) − I(R2) = 7.3 − 4.2 − 3.1 = 0 mA');
});

test('formatKCL: two parallel LEDs, the + rail junction sums to = 0 mA', () => {
  const { readings } = solve(PARALLEL_PARTS, PARALLEL_WIRES);
  // BAT1 +21.690, R1 −14.890, R2 −6.799 (mA into the net).
  assert.strictEqual(formatKCL(readings.kcl(readings.netOf('tp_1'))),
    'I(BAT1) − I(R1) − I(R2) = 21.7 − 14.9 − 6.8 = 0 mA');
});

test('formatKCL: two parallel LEDs, every net with a part pin ends "= 0 mA"', () => {
  const { readings } = solve(PARALLEL_PARTS, PARALLEL_WIRES);
  // Column 14: R1 +14.890 in, LED1 anode −14.890 out.
  assert.strictEqual(formatKCL(readings.kcl(readings.netOf('e14'))), 'I(R1) − I(LED1) = 14.9 − 14.9 = 0 mA');
  // Column 34: R2 +6.799 in, LED2 anode −6.799 out.
  assert.strictEqual(formatKCL(readings.kcl(readings.netOf('e34'))), 'I(R2) − I(LED2) = 6.8 − 6.8 = 0 mA');
  // − rail: BAT1 −21.690 (out, the first term), LED1 +14.890 and LED2 +6.799 in.
  assert.strictEqual(formatKCL(readings.kcl(readings.netOf('tn_1'))),
    '−I(BAT1) + I(LED1) + I(LED2) = −21.7 + 14.9 + 6.8 = 0 mA');
});

test('formatKCL: a sum a hair below zero prints "= 0 mA", not "−0"', () => {
  assert.strictEqual(formatKCL([{ label: 'A', amps: 2.0 }, { label: 'B', amps: -2.00001 }]),
    'I(A) − I(B) = 2.0 − 2.0 = 0 mA');
});

// ── Ohm's law on a two-lead part ───────────────────────────────

test('formatOhm: 470 Ω at 14.9 mA gives V = IR → 7.0 V = 14.9 mA × 470 Ω, either way round', () => {
  // R1 470 Ω in series with a red LED on 9 V: 6.9985 V, 14.890 mA.
  const forward  = solve([BAT, res('R1', ['a10', 'a14'], 470), led('LED1', ['b18', 'b14'])],
                         [...POWER, ['tp_10', 'c10'], ['c18', 'tn_18']]);
  // The same, R1 placed lead2-first: V = −6.9985, I = −14.890.
  const backward = solve([BAT, res('R1', ['a14', 'a10'], 470), led('LED1', ['b18', 'b14'])],
                         [...POWER, ['tp_10', 'c10'], ['c18', 'tn_18']]);
  assert.strictEqual(formatOhm(...ohmArgs(forward, 'R1', 'resistor')), 'V = IR → 7.0 V = 14.9 mA × 470 Ω');
  assert.strictEqual(formatOhm(...ohmArgs(backward, 'R1', 'resistor')), 'V = IR → 7.0 V = 14.9 mA × 470 Ω');
});

test('formatOhm: a lit LED gives V = Vf + I·ron with its colour\'s Vf and ron 0.1 Ω', () => {
  const solved = solve(PARALLEL_PARTS, PARALLEL_WIRES);
  // LED1 red: V = −2.0015, I = −14.890; Vf 2.0. LED2 green: V = −2.2007, I = −6.799; Vf 2.2.
  assert.strictEqual(formatOhm(...ohmArgs(solved, 'LED1', 'led')), 'V = Vf + I·ron → 2.0 V = 2.0 V + 14.9 mA × 0.1 Ω');
  assert.strictEqual(formatOhm(...ohmArgs(solved, 'LED2', 'led')), 'V = Vf + I·ron → 2.2 V = 2.2 V + 6.8 mA × 0.1 Ω');
});

test('formatOhm: a backwards LED (not conducting) reads "LED off → I = 0 mA", not the Vf form', () => {
  // Red LED with cathode b14 (9 V side), anode b18 (tn): off, V = 9.0, I = 0.
  // Below 0.05 mA (rounds to 0.0 mA) the LED is off.
  const solved = solve([BAT, res('R1', ['a10', 'a14'], 470), led('LED1', ['b14', 'b18'])],
                       [...POWER, ['tp_10', 'c10'], ['c18', 'tn_18']]);
  assert.strictEqual(formatOhm(...ohmArgs(solved, 'LED1', 'led')), 'LED off → I = 0 mA');
});

test('formatOhm: a bulb and a motor use V = IR with their own resistance', () => {
  // Bulb 60 Ω straight across 6 V: 100 mA. Motor 10 Ω across 3 V: 300 mA.
  const bulb  = solve([{ type: 'battery', label: 'BAT1', values: { voltage: 6 } }, { type: 'bulb', label: 'LP1', holes: ['a10', 'a13'] }],
                      [...POWER, ['tp_10', 'c10'], ['c13', 'tn_13']]);
  const motor = solve([{ type: 'battery', label: 'BAT1', values: { voltage: 3 } }, { type: 'motor', label: 'M1', holes: ['a10', 'a14'] }],
                      [...POWER, ['tp_10', 'c10'], ['c14', 'tn_14']]);
  assert.strictEqual(formatOhm(...ohmArgs(bulb, 'LP1', 'bulb')), 'V = IR → 6.0 V = 100.0 mA × 60 Ω');
  assert.strictEqual(formatOhm(...ohmArgs(motor, 'M1', 'motor')), 'V = IR → 3.0 V = 300.0 mA × 10 Ω');
});

// ── Nothing to show ────────────────────────────────────────────

test('no rows, a floating part or a part with no Ohm\'s law form give null and never throw', () => {
  // R3 touches nothing: part() reads V null, I 0.
  const floating = solve([BAT, res('R3', ['a40', 'a44'], 470)], POWER);
  const cases = [
    ['formatKCL([])',             () => formatKCL([])],
    ['formatKCL(null)',           () => formatKCL(null)],
    ['formatOhm, floating R3',    () => formatOhm(...ohmArgs(floating, 'R3', 'resistor'))],
    ['formatOhm, null reading',   () => formatOhm('resistor', { resistance: 470 }, null)],
    ['formatOhm, a button',       () => formatOhm('button', {}, { V: 0, I: 14.9 })],
  ];
  for (const [name, call] of cases) {
    let out;
    assert.doesNotThrow(() => { out = call(); }, `${name} threw`);
    assert.strictEqual(out, null, `${name}`);
  }
});
