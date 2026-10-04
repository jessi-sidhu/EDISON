// Current-flow dots (issue #100): how fast the dots move for a current, and
// which way current flows along every wire and through every two-lead part,
// as pure logic on real solves (Board.toSim → Sim.analyze → Readings.from),
// no mocks. The browser side (one InstancedMesh, dots moving in the render
// loop, the toggle, Stop hiding them) is e2e/flow-dots.spec.js.
//
// API these tests are written against (tools/flow-dots.js, UMD like
// tools/smoke.js and tools/colouring.js; DOM/THREE wiring only when
// `document` exists):
//   dotSpeed(mA)  how fast a dot moves for a current in mA (the Readings unit),
//                 in world units per second. Sign ignored (|I|). 0 below the
//                 simulator's "nothing is flowing" level (1 µA = 0.001 mA,
//                 simulate.js OPEN_AMPS), so a dead branch gets no dots.
//                 Never decreasing in |I|; clamped so 1 mA visibly moves and
//                 100 mA isn't a blur.
//   flows(readings, board) → { wires, parts }, board the { components, wires }
//                 given to Sim.analyze (App.state in the page):
//     wires[i]    the current in mA through board.wires[i] (same index; in the
//                 page App.state.wires[i] carries the id). Signed: + flows from
//                 the wire's start end to its end end, − the other way.
//                 Exactly 0 when no current flows (|I| below the dotSpeed
//                 threshold), so no dots.
//     parts[label] for each part with two leads in board holes: its current in
//                 mA, signed pin 0 → pin 1 like Readings.part(label).I (a lit
//                 LED, pins [cathode, anode], is negative). Exactly 0 when
//                 none flows.
//   A wire's current comes from the solve's own element currents (Readings
//   kcl) and where each pin sits; wires in parallel share their current.
//
// Every value below is hand-computed and was checked against the real simulator.

const assert = require('node:assert');

const Sim      = require('../circuit3d/js/simulate.js');
const Board    = require('../circuit3d/js/board-model.js');
const Readings = require('../circuit3d/js/readings.js');
const GEO      = require('../circuit3d/js/board-geometry.js');

// Loaded per test, so a module that can't load in Node fails each test by name.
const FlowDots = () => require('../circuit3d/js/tools/flow-dots.js');

// ── Helpers (as readings.test.js / smoke.test.js) ──────────────

const BAT   = { type: 'battery', label: 'BAT1' };                   // 9 V
const POWER = [['BAT1.0', 'tp_1'], ['BAT1.1', 'tn_1']];             // + rail, − rail
const res   = (label, holes, ohms) => ({ type: 'resistor', label, holes, values: { resistance: ohms } });
// LED holes are [cathode, anode].
const led   = (label, holes) => ({ type: 'led', label, holes, values: { color: 'red' } });

// Board → { readings, board } as the page has them on plugged:sim.
function solve(parts, pairs) {
  const board = Board.toSim({ parts, wires: pairs.map(([from, to], i) => ({ id: 'W' + (i + 1), from, to })) });
  const result = Sim.analyze(board.components, board.wires);
  return { readings: Readings.from(result, board), board };
}

function near(got, want, tol, what) {
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol,
    `${what}: expected ${want} ± ${tol}, got ${got}`);
}

const isZero = (got, what) => assert.ok(got === 0 || Object.is(got, -0),
  `${what}: expected exactly 0 (no current, no dots), got ${got}`);

// ── The demo circuit (demo.sparky, the "Try it out" board) ────
// BAT1.0 → tp_4, BAT1.1 → tn_16, tp_3 → a3; R1 470 Ω (default) b3–b7;
// LED1 cathode c9 / anode c7; a9 → a12; SW1 b12–b15; a15 → tn_15.
// Pressed: (9 − 2.0) / 470.1 = 14.890 mA round + → R1 → LED1 → SW1 → −.
const DEMO_WIRES = [['BAT1.0', 'tp_4'], ['BAT1.1', 'tn_16'], ['tp_3', 'a3'], ['a9', 'a12'], ['a15', 'tn_15']];
const demoParts = pressed => [
  BAT,
  { type: 'resistor', label: 'R1', holes: ['b3', 'b7'] },
  led('LED1', ['c9', 'c7']),
  { type: 'button', label: 'SW1', holes: ['b12', 'b15'], controls: { pressed } },
];
const DEMO_MA = 14.890;

// ── dotSpeed ───────────────────────────────────────────────────

test('dotSpeed: no current, or less than 1 µA, gives no movement', () => {
  const { dotSpeed } = FlowDots();
  // 1.6e-8 mA is what the released demo's leak (GMIN) puts through R1.
  for (const mA of [0, -0, 1.6e-8, -1.6e-8, 1e-5, 0.0009, -0.0009]) {
    assert.strictEqual(Math.abs(dotSpeed(mA)), 0, `dotSpeed(${mA}) should be 0 (nothing flowing); got ${dotSpeed(mA)}`);
  }
});

test('dotSpeed: 1 mA visibly moves, more current is never slower, 100 mA is clamped, sign ignored', () => {
  const { dotSpeed } = FlowDots();
  const HS = GEO.HS;   // hole pitch, world units

  const at1 = dotSpeed(1), at100 = dotSpeed(100);
  assert.ok(at1 >= 0.5 * HS, `1 mA should move at least half a hole pitch a second (${0.5 * HS} u/s); got ${at1}`);
  assert.ok(at100 <= 25 * HS, `100 mA should be at most 25 hole pitches a second (${25 * HS} u/s), not a blur; got ${at100}`);
  assert.ok(at100 > at1, `faster with more current: dotSpeed(100) ${at100} should beat dotSpeed(1) ${at1}`);

  const ladder = [0.002, 0.01, 0.1, 1, 2, 4.5, 9, DEMO_MA, 20, 50, 100, 1000, 70000];
  ladder.reduce((prev, mA) => {
    const s = dotSpeed(mA);
    assert.ok(Number.isFinite(s) && s > 0, `dotSpeed(${mA}) should be a positive number; got ${s}`);
    assert.ok(s >= prev.s, `never slower with more current: dotSpeed(${mA}) = ${s} < dotSpeed(${prev.mA}) = ${prev.s}`);
    return { mA, s };
  }, { mA: 0, s: 0 });

  // Clamped: a short (70 A through an LED straight across 9 V) is no faster than the 100 mA cap allows.
  assert.ok(dotSpeed(70000) <= 25 * HS, `a short is clamped too; got ${dotSpeed(70000)}`);

  for (const mA of [0.5, DEMO_MA, 100]) {
    assert.strictEqual(dotSpeed(-mA), dotSpeed(mA), `direction does not change speed at ${mA} mA`);
  }
});

// ── flows: the demo circuit ────────────────────────────────────

test('flows: the demo pressed flows from + through R1 and LED1, the button, back to −, on every wire', () => {
  const { readings, board } = solve(demoParts(true), DEMO_WIRES);
  const f = FlowDots().flows(readings, board);

  assert.ok(Array.isArray(f.wires) && f.wires.length === board.wires.length,
    `one current per wire, same order as board.wires (${board.wires.length}); got ${JSON.stringify(f.wires)}`);
  // + out of the battery to the + rail, rail to R1's column, LED cathode
  // column to the button, button to the − rail: all drawn start → end.
  near(f.wires[0], DEMO_MA, 0.01, 'W1 BAT1.0 → tp_4 carries the loop current out of +, start → end');
  near(f.wires[2], DEMO_MA, 0.01, 'W3 tp_3 → a3 carries it from the + rail to R1, start → end');
  near(f.wires[3], DEMO_MA, 0.01, 'W4 a9 → a12 carries it from the LED cathode to the button, start → end');
  near(f.wires[4], DEMO_MA, 0.01, 'W5 a15 → tn_15 carries it from the button to the − rail, start → end');
  // Drawn BAT1.1 → tn_16, but the current comes back from the − rail into
  // the battery's −: end → start, so negative.
  near(f.wires[1], -DEMO_MA, 0.01, 'W2 BAT1.1 → tn_16 carries it from the − rail back into −, end → start');

  // Through the parts, pin 0 → pin 1: R1 lead1 b3 → lead2 b7 (+), LED1 anode
  // c7 → cathode c9 is pin 1 → pin 0 (−), SW1 lead1 b12 → lead2 b15 (+).
  near(f.parts.R1, DEMO_MA, 0.01, 'R1 lead1 → lead2');
  near(f.parts.LED1, -DEMO_MA, 0.01, 'LED1 anode → cathode, so negative pin 0 → pin 1');
  near(f.parts.SW1, DEMO_MA, 0.01, 'SW1 lead1 → lead2 while pressed');
});

test('flows: the demo released has no current anywhere, so no dots on any wire or part', () => {
  const { readings, board } = solve(demoParts(false), DEMO_WIRES);
  // The solver's leak puts ~1e-8 mA through R1: below 1 µA, so nothing flows.
  const f = FlowDots().flows(readings, board);
  f.wires.forEach((mA, i) => isZero(mA, `released: wire W${i + 1}`));
  for (const label of ['R1', 'LED1', 'SW1']) isZero(f.parts[label], `released: ${label}`);
});

// ── flows: harder circuits ─────────────────────────────────────

test('flows: series, parallel branches, a dead branch and a wire to nowhere', () => {
  const cases = [
    // R1 1 kΩ a10–a14, R2 2 kΩ a20–a24, each across 9 V on its own wires:
    // 9 mA through R1's wires, 4.5 mA through R2's.
    { what: '1 kΩ and 2 kΩ in parallel across 9 V',
      parts: [BAT, res('R1', ['a10', 'a14'], 1000), res('R2', ['a20', 'a24'], 2000)],
      wires: [...POWER, ['tp_10', 'c10'], ['c14', 'tn_14'], ['tp_20', 'c20'], ['c24', 'tn_24']],
      want: [9 + 4.5, -(9 + 4.5), 9, 9, 4.5, 4.5], currents: { R1: 9, R2: 4.5 } },
    // The same 1 kΩ, its ground wire drawn from the rail to the column: the
    // current still runs column → rail, so that wire reads negative.
    { what: 'a wire drawn against the current',
      parts: [BAT, res('R1', ['a10', 'a14'], 1000)],
      wires: [...POWER, ['tp_10', 'c10'], ['tn_14', 'c14']],
      want: [9, -9, 9, -9], currents: { R1: 9 } },
    // 1 kΩ / 2 kΩ divider, 3 mA, plus R3 1 kΩ from the + column (10) to the
    // empty column 30 and a wire from the + rail to the empty column 40:
    // neither closes a loop, so both carry nothing.
    { what: 'series divider with a dangling resistor and a wire to nowhere',
      parts: [BAT, res('R1', ['a10', 'a14'], 1000), res('R2', ['b14', 'b18'], 2000), res('R3', ['e10', 'e30'], 1000)],
      wires: [...POWER, ['tp_10', 'c10'], ['c18', 'tn_18'], ['tp_40', 'a40']],
      want: [3, -3, 3, 3, 0], currents: { R1: 3, R2: 3, R3: 0 } },
    // LED backwards behind 470 Ω (anode toward −): off, no current at all.
    { what: 'a backwards LED: nothing flows',
      parts: [BAT, res('R1', ['a10', 'a14'], 470), led('LED1', ['b14', 'b18'])],
      wires: [...POWER, ['tp_10', 'c10'], ['c18', 'tn_18']],
      want: [0, 0, 0, 0], currents: { R1: 0, LED1: 0 } },
  ];
  for (const c of cases) {
    const { readings, board } = solve(c.parts, c.wires);
    // The solver agrees with each part's expectation, so the case tests flow-dots.js, not the hand numbers.
    for (const [label, mA] of Object.entries(c.currents)) {
      near(Math.abs(readings.part(label).I), mA, 0.01, `${c.what}: the solver's own |I| for ${label}`);
    }
    const f = FlowDots().flows(readings, board);
    assert.strictEqual(f.wires.length, c.wires.length, `${c.what}: one current per wire`);
    c.want.forEach((mA, i) => {
      const w = `${c.what}: W${i + 1} ${c.wires[i][0]} → ${c.wires[i][1]}`;
      if (mA === 0) isZero(f.wires[i], w); else near(f.wires[i], mA, 0.01, w);
    });
    for (const [label, mA] of Object.entries(c.currents)) {
      const w = `${c.what}: ${label} pin 0 → pin 1`;
      if (mA === 0) isZero(f.parts[label], w); else near(f.parts[label], mA, 0.01, w);
    }
  }
});

test('flows: two wires in parallel from the + rail both carry current the same way, sharing it', () => {
  // R1 1 kΩ a10–a14 across 9 V = 9 mA; two wires tp_10 → c10 and tp_11 → d10
  // both feed column 10, so each shows dots and together they carry 9 mA.
  const { readings, board } = solve([BAT, res('R1', ['a10', 'a14'], 1000)],
    [...POWER, ['tp_10', 'c10'], ['tp_11', 'd10'], ['c14', 'tn_14']]);
  const f = FlowDots().flows(readings, board);
  assert.ok(f.wires[2] > 0.001 && f.wires[3] > 0.001,
    `both parallel wires carry current rail → column (dots on each); got W3 ${f.wires[2]}, W4 ${f.wires[3]}`);
  near(f.wires[2] + f.wires[3], 9, 0.01, 'together the parallel wires carry R1\'s 9 mA');
  near(f.wires[4], 9, 0.01, 'W5 c14 → tn_14 carries all of it');
});

test('flows: no readings give no current on any wire', () => {
  const { board } = solve(demoParts(true), DEMO_WIRES);
  const f = FlowDots().flows(null, board);
  assert.strictEqual(f.wires.length, board.wires.length, 'one entry per wire even without readings');
  f.wires.forEach((mA, i) => isZero(mA, `no readings: wire W${i + 1}`));
});
