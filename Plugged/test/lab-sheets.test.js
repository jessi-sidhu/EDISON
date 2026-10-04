// The lab sheet's data and checks, circuit3d/labs/sheets.js (issue #151).
// The page half (?lab=, the panel, Run, the inspector edit, ?lab=lab9) is
// e2e/lab-sheet.spec.js.
//
// Contract (docs/API-CONTRACT.md → "Edison and the course hub" → "Lab
// sheets"): window.LabSheets / module.exports, UMD.
// - LabSheets.get(id) → Sheet | null; LabSheets.ids() → string[].
// - Sheet = { id, code, title, week, starter, steps: [{ n, text, hint, check }] }.
// - check: { kind: 'part', label } | { kind: 'measure', label, quantity:
//   'I'|'V', expect, unit, tol } (|measured − expect| ≤ tol × |expect|) |
//   { kind: 'peak', label, pin, expect, unit: 'V', tol } | { kind: 'manual' }.
// - LabSheets.evaluate(check, readings, board, memo) → 'passed' | 'failed' |
//   'pending'. Never throws; anything missing or floating is 'pending'.
//   `board` is the board as the page holds it (App.state: components with
//   labels, wires).
//
// The half-built rule: while the circuit is half-built, missing parts
// and floating nodes give *Not yet* ('pending'), never *Check failed* or a
// crash. Here that is every Lab 1 board with one starter part deleted, and
// the starter's parts with no wires at all. 'failed' is only for a complete
// circuit that reads wrong (R1 at 4.7 kΩ).
//
// Lab 1 on the real board (circuit3d/labs/lab1.sparky, solved here with the
// real simulator, test/lab1-circuit.test.js owns the circuit itself):
//   I(R1) 4.3103 mA, V(R2) 5.6897 V, I(R3) 1.7241 mA (and I(R2) 2.5862 mA).
// So the sheet's measure steps expect 4.31 mA, 5.69 V and 1.72 mA.
//
// Everything runs the app's real code: board-io's load path, Sim.analyze and
// Readings. Nothing is mocked; the one fake is the peak test's readings
// object, which stands in for a time run (the peak check's memo logic is
// what's tested; Lab 2 below runs the real TL072 time solve).
//
// Lab 2 (issue #152), at the end of this file:
// the TL072 inverting amplifier fed by the function generator. The starter
// circuit3d/labs/lab2.sparky holds U1 (across the centre gap), PS1 and FG1,
// unwired; test/fixtures/lab2-finish.js adds the student's wires and Rin /
// Rf (R1 10 kΩ, R2 100 kΩ), and the board is time-stepped with the real
// simulator for 2 s of sim time at the page's own dt (Sim.pickDt), with
// LabSheets.evaluate called after every step on one shared memo, as the
// page's lab sheet does on every plugged:sim. Hand-computed: the generator
// is 50 Ω behind its 1 Vp EMF and IN1− is a virtual ground, so OUT1 peaks at
// 1 × 100 000 / 10 050 = 9.950 V, first at t = 0.25 s (1 Hz), under the
// TL072's ±10.5 V clip on ±12 V.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const Sim      = require('../circuit3d/js/simulate.js');
const IO       = require('../circuit3d/js/board-io.js');
const Parts    = require('../circuit3d/js/parts');
const Readings = require('../circuit3d/js/readings.js');

const ROOT   = path.join(__dirname, '..');
const SHEETS = path.join(ROOT, 'circuit3d', 'labs', 'sheets.js');
const LAB1   = path.join(ROOT, 'circuit3d', 'labs', 'lab1.sparky');

function labSheets() {
  assert.ok(fs.existsSync(SHEETS), `the lab sheets module should be at ${path.relative(ROOT, SHEETS)}`);
  return require(SHEETS);
}

// The saved file as the page's board, the way app.js's rebuildBoard reads it
// (holes by pin name, wire ends on a part's pin by name), as in
// test/lab1-circuit.test.js.
function load(file) {
  const components = IO.rebuildComponents(file.components, rec => {
    const def = Parts.get(rec.type);
    if (!def) return null;
    const offboard = def.place.kind === 'offboard';
    const holeRefs = offboard ? null : IO.loadHoleRefs(rec);
    const comp = { type: rec.type, label: rec.label, values: Object.assign({}, rec.values || {}), holeRefs,
                   pins: def.pins.map(() => ({ x: 0, y: 0, z: 0 })) };
    if (rec.controls) comp.controls = Object.assign({}, rec.controls);
    return comp;
  }, t => !!Parts.get(t));
  const end = (hole, ci, name, pi) => {
    const comp = !hole && ci >= 0 ? components[ci] : null;
    return { hole: hole ? { col: hole.col, row: hole.row } : null, comp, idx: comp ? IO.pinIndex(comp, name, pi) : -1 };
  };
  const wires = (file.wires || []).map(w => {
    const a = end(w.startHole, w.startCompIdx, w.startPin, w.startPinIdx);
    const b = end(w.endHole,   w.endCompIdx,   w.endPin,   w.endPinIdx);
    return { startHole: a.hole, endHole: b.hole, startComp: a.comp, startPinIdx: a.idx,
             endComp: b.comp, endPinIdx: b.idx };
  });
  return { components, wires };
}

const lab1  = () => load(JSON.parse(fs.readFileSync(LAB1, 'utf8')));
const solve = b => Readings.from(Sim.analyze(b.components, b.wires), b);

// Take a part off the board, with every wire that ends on one of its pins
// (what App.deletePart does).
function without(board, label) {
  const comp = board.components.find(c => c.label === label);
  assert.ok(comp, `Lab 1 has ${label}`);
  return {
    components: board.components.filter(c => c !== comp),
    wires: board.wires.filter(w => w.startComp !== comp && w.endComp !== comp),
  };
}

const measureSteps = L => L.get('lab1').steps.filter(s => s.check && s.check.kind === 'measure');
const STATUSES = ['passed', 'failed', 'pending'];

test('Lab 1 sheet: 4–6 numbered steps, code LAB-01, starter is the lab file', () => {
  const s = labSheets().get('lab1');
  expect(s).toMatchObject({ id: 'lab1', code: 'LAB-01', starter: 'labs/lab1.sparky' });
  expect(s.steps.length, 'Lab 1 has 4–6 steps').toBeGreaterThanOrEqual(4);
  expect(s.steps.length, 'Lab 1 has 4–6 steps').toBeLessThanOrEqual(6);
  expect(s.steps.map(x => x.n)).toEqual(s.steps.map((_, i) => i + 1));
  for (const st of s.steps) {
    expect(typeof st.text === 'string' && st.text.length > 0, `step ${st.n} has text`).toBe(true);
    expect(typeof st.hint === 'string' && st.hint.length > 0, `step ${st.n} has a hint`).toBe(true);
  }
  // The starter is the lab file on disk, relative to circuit3d/.
  expect(fs.existsSync(path.join(ROOT, 'circuit3d', s.starter)), `${s.starter} exists under circuit3d/`).toBe(true);
});

test('every measure check on Lab 1 passes on the finished starter circuit', () => {
  const L = labSheets();
  const b = lab1(); const r = solve(b); const memo = {};
  const steps = measureSteps(L);
  expect(steps.length, 'Lab 1 has measure steps').toBeGreaterThan(0);
  for (const st of steps) expect(L.evaluate(st.check, r, b, memo), `step ${st.n}`).toBe('passed');
});

// Pin on the real solve (test/lab1-circuit.test.js owns the circuit), plus
// the sheet's half: each measure step expects its solved value to 3 figures,
// so a step can't pass on a loose tolerance around a wrong number.
test('I(R1) is 4.31 mA on Lab 1 (the QA value), and each measure step expects its solved value', () => {
  const r = solve(lab1());
  expect(r.part('R1').I).toBeCloseTo(4.31, 1);
  const steps = measureSteps(labSheets());
  const r1 = steps.find(s => s.check.label === 'R1' && s.check.quantity === 'I');
  expect(r1, 'a step measures I(R1)').toBeTruthy();
  expect(r1.check).toMatchObject({ expect: 4.31, unit: 'mA' });
  for (const st of steps) {
    const solved = Math.abs(r.part(st.check.label)[st.check.quantity]);
    expect(Math.abs(Math.abs(st.check.expect) - solved), `step ${st.n}: expects ${st.check.expect}, the board solves ${solved}`)
      .toBeLessThanOrEqual(0.005 * solved);
    expect(st.check.unit, `step ${st.n}'s unit`).toBe(st.check.quantity === 'I' ? 'mA' : 'V');
  }
});

test('a wrong value fails, a missing part is pending, never throws', () => {
  const L = labSheets();
  const b = lab1(); b.components.find(c => c.label === 'R1').values.resistance = 4700;
  const r = solve(b);
  const c = { kind: 'measure', label: 'R1', quantity: 'I', expect: 4.31, unit: 'mA', tol: 0.05 };
  // The loop is closed (about 1.66 mA flows), so a wrong reading is a real
  // 'failed', not the open-loop 'pending' of a missing wire.
  expect(Math.abs(r.part('R1').I), 'I(R1) in mA with R1 at 4.7 kΩ').toBeCloseTo(1.66, 1);
  expect(L.evaluate(c, r, b, {})).toBe('failed');
  expect(L.evaluate({ ...c, label: 'R9' }, r, b, {})).toBe('pending');
  expect(L.evaluate(c, null, b, {})).toBe('pending');
  expect(L.evaluate({ kind: 'nope' }, r, b, {})).toBe('pending');

  // Malformed input of every kind: 'pending', never a throw.
  const throwing = { part() { throw new Error('boom'); } };
  const odd = [
    ['no check',               undefined,                                         r,        b,    {}],
    ['readings that throw',    c,                                                 throwing, b,    {}],
    ['no board, part check',   { kind: 'part', label: 'R1' },                     r,        null, {}],
    ['no memo, peak check',    { kind: 'peak', label: 'R1', pin: 'out1', expect: 10, unit: 'V', tol: 0.05 }, r, b, undefined],
    ['measure, no quantity',   { kind: 'measure', label: 'R1', expect: 4.31, tol: 0.05 }, r, b,  {}],
  ];
  for (const [what, check, readings, board, memo] of odd) {
    let got;
    expect(() => { got = L.evaluate(check, readings, board, memo); }, what).not.toThrow();
    expect(got, what).toBe('pending');
  }
});

test('peak tracks the largest |V| seen across calls', () => {
  const L = labSheets();
  const memo = {}; const check = { kind: 'peak', label: 'U1', pin: 'out1', expect: 10, unit: 'V', tol: 0.05 };
  const fake = v => ({ part: () => ({ opamps: [{ pin: 'out1', vout: v }] }) });
  expect(L.evaluate(check, fake(4), {}, memo)).toBe('pending');
  expect(L.evaluate(check, fake(-10.1), {}, memo)).toBe('passed');
});

// Review (#152): a clipped or current-limited op-amp is not a reading. Samples
// whose mode isn't linear never count toward the peak (a missing mode counts
// as linear, as the fake above shows), so an open loop that clips right at the
// expected value stays pending; the linear 9.95 V of the finished amp passes.
test('peak ignores samples where the op-amp is not linear', () => {
  const L = labSheets();
  const memo = {}; const check = { kind: 'peak', label: 'U1', pin: 'out1', expect: 10, unit: 'V', tol: 0.03 };
  const fake = (vout, mode) => ({ part: () => ({ opamps: [{ pin: 'out1', vout, mode }] }) });
  expect(L.evaluate(check, fake(10.0, 'high'), {}, memo), 'clipped high at 10.0 V').toBe('pending');
  expect(L.evaluate(check, fake(-10.0, 'low'), {}, memo), 'clipped low at -10.0 V').toBe('pending');
  expect(L.evaluate(check, fake(10.0, 'isrc+'), {}, memo), 'current-limited at 10.0 V').toBe('pending');
  expect(L.evaluate(check, fake(9.95, 'linear'), {}, memo), 'linear 9.95 V').toBe('passed');
});

// The sheet asks the student to measure; it must not print the answer. For
// every sheet, no step's text or hint contains its own check's expected
// value as the sheet would write it (2 decimals, or 3 significant figures:
// '4.31', '5.69', '1.72' on Lab 1), nor the plain number with its unit
// ('10 V', '10.0 V', '10 Vp' for Lab 2's peak; '10 kΩ' or a gain of −10 is
// fine: that is how to work it out, not the reading).
test('no step gives away its expected value in its text or hint', () => {
  const L = labSheets();
  expect(L.ids().length, 'there are sheets').toBeGreaterThan(0);
  let checked = 0;
  for (const id of L.ids()) {
    for (const st of L.get(id).steps) {
      const c = st.check;
      if (!c || typeof c.expect !== 'number') continue;
      const forms = [...new Set([Math.abs(c.expect).toFixed(2), Math.abs(c.expect).toPrecision(3)])];
      const withUnit = new RegExp(`(^|[^\\d.])${String(Math.abs(c.expect)).replace('.', '\\.')}(\\.0+)?\\s?${c.unit || ''}`);
      for (const field of ['text', 'hint']) {
        for (const f of forms) {
          expect(String(st[field] || '').includes(f), `${id} step ${st.n}'s ${field} shows the answer ${f}: "${st[field]}"`).toBe(false);
        }
        if (c.unit) {
          expect(withUnit.test(String(st[field] || '')), `${id} step ${st.n}'s ${field} shows the answer ${Math.abs(c.expect)} ${c.unit}: "${st[field]}"`).toBe(false);
        }
      }
      checked++;
    }
  }
  expect(checked, 'some step has an expected value').toBeGreaterThan(0);
});

test('unknown ids', () => {
  const L = labSheets();
  expect(L.get('lab9')).toBe(null);
  expect(L.ids()).toContain('lab1');
});

// The half-built rule. Each row is a half-built Lab 1. Real readings exist for
// what is left (with R2 deleted, R3 still carries 2.33 mA through R1 alone,
// and I(R1) is 2.33 mA), but the circuit isn't the lab's yet, so a measure
// step is *Not yet*, not *Check failed*. The supply step (a 'part' check on
// PS1) still passes while PS1 is on the board. No call throws.
//
// The most common half-built state is every part placed and one wire still
// to draw (lab1.sparky has four: W1 PS1+ to the top + rail, W2 PS1 com to the
// top − rail, W3 the + rail to R1, W4 R3/R2's far node to the − rail). With
// any one missing the loop is open: no current flows (W1/W3 solve to V = 0,
// I = 0; W2/W4 leave ~2e-8 mA of leakage), so each measure step is *Not yet*.
// Orchestrator decision: a measure check is 'pending' while the part it reads
// carries no current, |I| < 1e-6 mA (the loop isn't closed yet).
const LAB1_WIRES = 4;
const HALF_BUILT = [
  ['R2 deleted',                       b => without(b, 'R2')],
  ['R1 deleted',                       b => without(b, 'R1')],
  ['R3 deleted',                       b => without(b, 'R3')],
  ['PS1 deleted',                      b => without(b, 'PS1')],
  ['no wires (every node floating)',   b => ({ components: b.components, wires: [] })],
  ...Array.from({ length: LAB1_WIRES }, (_, i) =>
    [`wire W${i + 1} missing`,         b => {
      expect(b.wires.length, 'lab1.sparky has four wires').toBe(LAB1_WIRES);
      return { ...b, wires: b.wires.filter((_, j) => j !== i) };
    }]),
];

test.each(HALF_BUILT)('half-built Lab 1, %s: every measure step is pending (never failed), and no step throws', (_, make) => {
  const L = labSheets();
  const b = make(lab1()); const r = solve(b); const memo = {};
  const hasPS1 = b.components.some(c => c.label === 'PS1');
  for (const st of L.get('lab1').steps) {
    let got;
    expect(() => { got = L.evaluate(st.check, r, b, memo); }, `step ${st.n} throws`).not.toThrow();
    expect(STATUSES, `step ${st.n} gives a status`).toContain(got);
    const k = st.check.kind;
    if (k === 'measure') {
      const p = r.part(st.check.label);
      const read = p ? `V = ${p.V}, I = ${p.I}` : 'no reading';
      expect(got, `step ${st.n} (${st.check.quantity}(${st.check.label}), ${read})`).toBe('pending');
    }
    if (k === 'part' && st.check.label === 'PS1') expect(got, `step ${st.n} (PS1 placed: ${hasPS1})`).toBe(hasPS1 ? 'passed' : 'pending');
  }
});

// ── Lab 2: the TL072 inverting amplifier (issue #152) ────────────────────────

const LAB2 = path.join(ROOT, 'circuit3d', 'labs', 'lab2.sparky');
const { lab2Finish } = require('./fixtures/lab2-finish.js');

function lab2Sheet(L) {
  const s = L.get('lab2');
  assert.ok(s, `LabSheets.get('lab2') is null; the sheets are ${JSON.stringify(L.ids())}`);
  return s;
}

function lab2Starter() {
  assert.ok(fs.existsSync(LAB2), `Lab 2's starter circuit should be at ${path.relative(ROOT, LAB2)}`);
  return load(JSON.parse(fs.readFileSync(LAB2, 'utf8')));
}

// "a2" → { col: 1, row: 'a' }; "tp_50" → { col: 49, row: 'tp' } (as
// board-model.js and App.parseHole read a hole); anything else null.
function holeRef(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  if (!m) return null;
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}

// U1's holes by pin name ({ out1: 'f30', … }), from the loaded starter.
function chipHoles(board) {
  const u1 = board.components.find(c => c.label === 'U1');
  assert.ok(u1 && u1.type === 'tl072', `Lab 2's starter has the TL072 as U1: ${JSON.stringify(board.components.map(c => [c.label, c.type]))}`);
  return Object.fromEntries(Parts.get('tl072').pins.map((pin, k) => {
    const h = u1.holeRefs && u1.holeRefs[k];
    return [pin, h ? h.row + (h.col + 1) : null];
  }));
}

// Example parts and [from, to] wires onto a page board, the records
// App.placePart and App.finishWire leave (a pin end as LABEL.k, by index).
function add(board, { parts = [], wires = [] }) {
  for (const p of parts) {
    board.components.push({ type: p.type, label: p.label, values: Object.assign({}, p.values), holeRefs: p.holes.map(holeRef),
                            pins: Parts.get(p.type).pins.map(() => ({ x: 0, y: 0, z: 0 })) });
  }
  const end = s => {
    const h = holeRef(s);
    if (h) return { hole: h, comp: null, idx: -1 };
    const [label, k] = String(s).split('.');
    const comp = board.components.find(c => c.label === label);
    assert.ok(comp, `wire end ${s}: the board has no ${label}`);
    return { hole: null, comp, idx: Number(k) };
  };
  for (const [from, to] of wires) {
    const a = end(from), b = end(to);
    board.wires.push({ startHole: a.hole, endHole: b.hole, startComp: a.comp, startPinIdx: a.idx, endComp: b.comp, endPinIdx: b.idx });
  }
  return board;
}

// The starter with the given stages of test/fixtures/lab2-finish.js added
// (pick(stages) → a list of { parts, wires }).
function lab2Board(pick) {
  const b = lab2Starter();
  for (const stage of pick(lab2Finish(chipHoles(b)))) add(b, stage);
  return b;
}
const finishedLab2 = () => lab2Board(s => [s.supply, s.input, s.feedback]);

// The page's time run (simulate.js startTimeRun): dt from Sim.pickDt for the
// board's wave, each step solved at the end of its dt with the state carried
// on, for `seconds` of sim time. each(readings, t, result) after every step.
function timeRun(board, seconds, each) {
  const dt = Sim.pickDt(undefined, Sim.estimateFreqMax(board.components));
  assert.ok(dt > 0 && dt <= 0.05, `a usable dt for a 1 Hz board (got ${dt})`);
  let state = {};
  const n = Math.round(seconds / dt);
  for (let k = 1; k <= n; k++) {
    const t = k * dt;
    const result = Sim.analyze(board.components, board.wires, { dt, state, t });
    if (result.state) state = result.state;
    each(Readings.from(result, board), t, result);
  }
}

// |V(OUT1)| this step, from the readings the lab sheet gets, or null.
function out1(readings) {
  const p = readings.part('U1');
  const op = p && p.opamps && p.opamps.find(o => o.pin === Parts.get('tl072').pins[0]);
  return op && typeof op.vout === 'number' ? Math.abs(op.vout) : null;
}

const peakStep = s => {
  const st = s.steps.find(x => x.check && x.check.kind === 'peak');
  assert.ok(st, `Lab 2 has a peak step: ${JSON.stringify(s.steps.map(x => x.check))}`);
  return st;
};

// The sheet's steps (from the issue): 1 place the TL072 across the centre
// gap (part U1); 2 wire ±12 V to pins 8 and 4 (manual); 3 the generator
// through Rin to pin 2 (part R1); 4 Rf from pin 1 to pin 2 (part R2); 5 run
// and read the output peak on the scope (peak at U1's OUT1, expect 10 V);
// 6 explain the phase flip (manual). The tolerance is at most 0.05 (see the
// half-built test below for why it may need to be tighter).
test('Lab 2 sheet: code LAB-02, starter labs/lab2.sparky, steps numbered 1..n with the lab\'s checks, the peak at U1 OUT1 expecting 10 V', () => {
  const s = lab2Sheet(labSheets());
  expect(s).toMatchObject({ id: 'lab2', code: 'LAB-02', starter: 'labs/lab2.sparky' });
  expect(typeof s.title === 'string' && s.title.length > 0, 'Lab 2 has a title').toBe(true);
  expect(fs.existsSync(path.join(ROOT, 'circuit3d', s.starter)), `${s.starter} exists under circuit3d/`).toBe(true);
  expect(s.steps.map(x => x.n)).toEqual(s.steps.map((_, i) => i + 1));
  for (const st of s.steps) {
    expect(typeof st.text === 'string' && st.text.length > 0, `step ${st.n} has text`).toBe(true);
    expect(typeof st.hint === 'string' && st.hint.length > 0, `step ${st.n} has a hint`).toBe(true);
  }
  expect(s.steps.map(st => [st.check.kind, st.check.label || null]), 'the steps\' checks, in order').toEqual([
    ['part', 'U1'], ['manual', null], ['part', 'R1'], ['part', 'R2'], ['peak', 'U1'], ['manual', null],
  ]);
  const peak = peakStep(s).check;
  expect(peak).toMatchObject({ pin: Parts.get('tl072').pins[0], expect: 10, unit: 'V' });
  expect(peak.tol, 'the peak tolerance').toBeGreaterThan(0);
  expect(peak.tol, 'the peak tolerance').toBeLessThanOrEqual(0.05);
});

// Done when (#152): the starter leaves steps pending. Run on the starter
// (the generator makes it a time run) for 2 s: nothing is wired, so the peak
// step is Not yet at every step; the chip's step passes (the starter holds
// U1), R1's and R2's don't (the student adds them); manual steps wait.
test('Lab 2 starter: U1 (a TL072 across the centre gap), PS1 and FG1, nothing wired; over 2 s the peak step stays pending at every step, and only U1\'s part step passes', () => {
  const L = labSheets();
  const s = lab2Sheet(L);
  const b = lab2Starter();
  const labels = b.components.map(c => c.label);
  expect([...labels].sort(), 'the starter\'s parts').toEqual(['FG1', 'PS1', 'U1']);
  expect(Object.fromEntries(b.components.map(c => [c.label, c.type]))).toEqual({ U1: 'tl072', PS1: 'bench_supply', FG1: 'function_generator' });
  expect(b.wires, 'the starter is unwired').toEqual([]);
  const rows = Object.values(chipHoles(b)).map(h => h && h[0]);
  expect(new Set(rows), `U1's legs sit in rows e and f, across the centre gap: ${JSON.stringify(chipHoles(b))}`).toEqual(new Set(['e', 'f']));

  const memo = {}; const seen = new Map(s.steps.map(st => [st.n, new Set()]));
  let steps = 0;
  timeRun(b, 2, r => {
    steps++;
    for (const st of s.steps) {
      let got;
      expect(() => { got = L.evaluate(st.check, r, b, memo); }, `step ${st.n} throws`).not.toThrow();
      seen.get(st.n).add(got);
    }
  });
  expect(steps, 'the time run took steps').toBeGreaterThan(0);
  for (const st of s.steps) {
    const want = st.check.kind === 'part' && labels.includes(st.check.label) ? 'passed' : 'pending';
    expect([...seen.get(st.n)], `step ${st.n} (${st.check.kind} ${st.check.label || ''}) on the starter, at every step`).toEqual([want]);
  }
});

// Done when (#152): the peak step passes after 2 s of sim time on the
// finished board. One memo for the whole run, as the page keeps one per Run.
// OUT1 swings ±9.950 V (hand-computed above), first reaching its crest at
// t = 0.25 s; before t = 0.2 s it is under 9.47 V (9.950 · sin(0.4π)), more
// than 5 % short of 10 V, so the step is Not yet there; from the crest on
// the memo holds the peak through the troughs, so it stays Passed.
test('finished Lab 2, time-stepped for 2 s with one shared memo: OUT1 peaks at 9.950 V, the peak step is pending before the first crest and passed from it to t = 2 s; every checked step passes', () => {
  const L = labSheets();
  const s = lab2Sheet(L);
  const peak = peakStep(s);
  const b = finishedLab2();
  const memo = {}; const trace = [];
  let maxV = 0;
  timeRun(b, 2, (r, t, result) => {
    expect(result.status, `the finished board solves at t = ${t} s: ${(result.lines || []).map(l => l.text).join(' | ')}`).toBe('ok');
    const v = out1(r);
    if (v !== null) maxV = Math.max(maxV, v);
    trace.push({ t, v, status: L.evaluate(peak.check, r, b, memo) });
  });
  expect(trace[trace.length - 1].t, 'the run covers 2 s of sim time').toBeCloseTo(2, 6);
  expect(maxV, 'the largest |V(OUT1)| over 2 s: 1 V × 100 kΩ / 10.05 kΩ').toBeCloseTo(9.950, 2);

  const show = list => list.map(x => `t=${x.t.toFixed(2)} ${x.v === null ? 'null' : x.v.toFixed(2)} V ${x.status}`).join('; ');
  const early = trace.filter(x => x.t < 0.2 - 1e-9);
  const late  = trace.filter(x => x.t >= 0.25 - 1e-9);
  expect(early.filter(x => x.status !== 'pending'), `before t = 0.2 s the peak step is pending: ${show(early)}`).toEqual([]);
  expect(late.filter(x => x.status !== 'passed').map(x => show([x])), 'from the first crest (t = 0.25 s) to t = 2 s the peak step is passed').toEqual([]);

  // And at t = 2 s every checked step is passed on the finished board (the
  // manual ones are the student's to tick).
  const r = (() => { let last; timeRun(b, 2, x => { last = x; }); return last; })();
  for (const st of s.steps.filter(x => x.check.kind !== 'manual' && x.check.kind !== 'peak')) {
    expect(L.evaluate(st.check, r, b, memo), `step ${st.n} (${st.check.kind} ${st.check.label}) on the finished board`).toBe('passed');
  }
});

// The half-built rule for Lab 2: a half-built amplifier is Not yet, never
// Passed. Each row is the starter plus part of the student's work
// (test/fixtures/lab2-finish.js), time-stepped for 2 s with one memo; the
// peak step must be 'pending' at every step (peak never fails, and a
// half-built circuit must not pass).
//
// Three rows clip. With no feedback the op-amp runs open loop and OUT1
// slams between the rails, ±10.5 V (12 V less the 1.5 V headroom); with
// the supply's COM unwired the chip has no ground reference and clips too.
// |10.5 − 10| = 0.5 V is exactly a tol of 0.05 × 10 V, so a check
// that only compares the peak with 10 V ± 5 % reads a clipped op-amp as the
// amplifier's peak and passes step 5 before step 4 (Rf) is done. The real
// peak is 9.950 V, so a clipped output must not count: e.g. a tighter tol
// (0.03 still passes 9.950 V), or ignoring samples where the op-amp isn't
// linear (readings.part('U1').opamps[k].mode), or both. The sheet's choice.
const LAB2_HALF_BUILT = [
  // what                                                              stages added to the starter
  ['stopped after step 2: the supply wired, no generator, Rin or Rf', s => [s.supply]],
  ['stopped after step 3: Rin in, no Rf yet (open loop, OUT1 clips at ±10.5 V)', s => [s.supply, s.input]],
  ['step 4 half done: Rf placed but not yet joined to pin 2 (open loop, clips)', s => [s.supply, s.input, { parts: s.feedback.parts, wires: [] }]],
  ['finished but the supply\'s COM not wired (no ground reference, clips)', s => [{ parts: [], wires: s.supply.wires.filter(w => w[0] !== 'PS1.1') }, s.input, s.feedback]],
  ['finished but the generator\'s COM not wired (no input signal)', s => [s.supply, { parts: s.input.parts, wires: s.input.wires.filter(w => w[0] !== 'FG1.1') }, s.feedback]],
];

test.each(LAB2_HALF_BUILT)('half-built Lab 2, %s: the peak step is pending at every step of 2 s, never passed', (_, pick) => {
  const L = labSheets();
  const peak = peakStep(lab2Sheet(L));
  const b = lab2Board(pick);
  const memo = {}; const statuses = new Set();
  let maxV = 0, steps = 0;
  timeRun(b, 2, (r, t, result) => {
    // Setup check: the board solves, so a failure below is the sheet's.
    expect(result.status, `the half-built board solves at t = ${t} s`).toBe('ok');
    const v = out1(r);
    if (v !== null) maxV = Math.max(maxV, v);
    let got;
    expect(() => { got = L.evaluate(peak.check, r, b, memo); }, `the peak step throws at t = ${t} s`).not.toThrow();
    statuses.add(got);
    steps++;
  });
  expect(steps).toBeGreaterThan(0);
  expect([...statuses], `the peak step over 2 s (largest |V(OUT1)| seen: ${maxV.toFixed(4)} V)`).toEqual(['pending']);
});

// tools/labs.js lists Lab 2. Every sheet is in the
// ENSC 220 Labs menu as "Lab <n>…", and the menu opens the sheet's starter.
test('the ENSC 220 Labs menu lists every lab sheet, Lab 2 included, as "Lab <n>", opening the sheet\'s starter', () => {
  const L = labSheets();
  expect(L.ids(), 'the sheets include Lab 2').toContain('lab2');
  const Labs = require('../circuit3d/js/tools/labs.js');
  for (const id of L.ids()) {
    const s = L.get(id);
    const item = Labs.LABS.find(l => l.id === id);
    expect(item, `the Labs menu lists ${id}: ${JSON.stringify(Labs.LABS)}`).toBeTruthy();
    expect(item.title, `${id}'s menu item`).toMatch(new RegExp(`^Lab ${Number(s.code.slice(4))}\\b`));
    expect(Labs.urlFor(id), `${id}'s menu file is its sheet's starter`).toBe(s.starter);
  }
});
