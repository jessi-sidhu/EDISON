// The mini scope (issue #121): the pure half of tools/scope.js, the recorder
// and its window maths, on synthetic sines sampled at irregular frame times
// and on real solves of a function generator (Board → Sim.analyze at t →
// Readings). Nothing under test is mocked. The page's half (the panel
// appearing on Run, Probe + a hole, Esc, the toggle, Stop) is
// e2e/scope.spec.js.
//
// Run with:  npm test
//
// API these tests are written against (spec: docs/superpowers/specs/
// 2026-10-01-phase-4-op-amp-and-sine-design.md → "The mini scope"), UMD like
// tools/flow-dots.js: window.Scope in the page, module.exports in Node, the
// DOM/canvas wiring only when `document` exists.
//   windowFor(freq)     seconds of history shown: 2 periods (2 / freq) for a
//                       generator frequency freq > 0; 5 s for none (null,
//                       undefined or 0).
//   recorder()          → rec, a fresh recorder:
//     rec.push({ t, ch1, ch2, freq })
//                       one plugged:sim frame: t the step's sim time (s), ch1
//                       and ch2 volts (null: no such channel this frame, e.g.
//                       no generator or no probe, or a floating hole), freq
//                       the generator's Hz (null: no generator). After a push
//                       the recorder keeps only the window windowFor(freq)
//                       back from that t.
//     rec.samples(ch)   ch 1 | 2 → [{ t, v }], oldest first, all inside the
//                       window (t ≥ latest t − windowFor(freq)).
//     rec.stats(ch)     → { vpp, freq } from the samples in the window, or
//                       null when the channel has none. vpp = max − min
//                       (volts). freq from rising crossings of the
//                       channel's middle level (its mean or (max + min) / 2,
//                       so a DC offset doesn't matter), interpolated between
//                       samples; null (the page shows "—") when there aren't
//                       two crossings, or when the frames are too sparse for
//                       the generator's frequency (fewer than about 8 samples
//                       a period: never an aliased or guessed number).
//     rec.scale()       S > 0, the view spans −S…+S (symmetric around 0):
//                       at least the larger channel's peak |v| in the window,
//                       at most 2.5× it (room for 1-2-5 rounding); a finite
//                       positive number when every sample is 0 or there are
//                       none.
//     rec.clear()       forgets everything (Stop).
//   source(readings, board) → { label, v, freq } for the first function
//                       generator in board.components: v its OUT voltage now
//                       (vs COM, volts), freq its frequency (Hz); null when
//                       the board has no function generator. board is the
//                       { components, wires } given to Sim.analyze.
//
// Every expected number is hand-computed: the generator is 50 Ω behind its
// EMF (parts/function_generator.js), so 1 Vp into 10 kΩ + 10 kΩ reads
// 20 000 / 20 050 = 0.99751 Vp at OUT and half that at the middle.

const assert = require('node:assert');

const Sim      = require('../circuit3d/js/simulate.js');
const Board    = require('../circuit3d/js/board-model.js');
const Readings = require('../circuit3d/js/readings.js');
const Parts    = require('../circuit3d/js/parts');

// Loaded per test, so a module that can't load in Node fails each test by name.
function Scope() {
  let mod;
  try { mod = require('../circuit3d/js/tools/scope.js'); } catch (e) {
    assert.fail(`circuit3d/js/tools/scope.js can't be loaded in Node: ${e.message}`);
  }
  for (const fn of ['windowFor', 'recorder', 'source'])
    assert.strictEqual(typeof mod[fn], 'function', `Scope.${fn} is a function (exports: ${Object.keys(mod).join(', ')})`);
  return mod;
}

function near(got, want, tol, what) {
  assert.ok(typeof got === 'number' && Number.isFinite(got) && Math.abs(got - want) <= tol,
    `${what}: expected ${want} (±${tol}), got ${got}`);
}

// ── Synthetic frames ───────────────────────────────────────────────────────

// A small seeded PRNG (mulberry32), so the "irregular" frame times are the
// same on every run.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Frame times up to `until` s: gaps of `gap` s on average, each between
// 0.5× and 1.5× (a page's frames are never even).
function frameTimes(until, gap, seed = 1) {
  const r = prng(seed), out = [];
  let t = 0;
  for (;;) {
    t += gap * (0.5 + r());
    if (t > until) return out;
    out.push(t);
  }
}

const sine = (amp, f, offset = 0) => t => offset + amp * Math.sin(2 * Math.PI * f * t);

// Pushes one frame per time; ch1/ch2 functions of t or null; freq the
// generator's. Calls each(rec, t) after every push when given.
function record(rec, times, { ch1 = null, ch2 = null, freq = null }, each) {
  for (const t of times) {
    rec.push({ t, ch1: ch1 ? ch1(t) : null, ch2: ch2 ? ch2(t) : null, freq });
    if (each) each(rec, t);
  }
  return rec;
}

const latest = times => times[times.length - 1];

// ── 1. The window ──────────────────────────────────────────────────────────

describe('windowFor: 2 periods of the generator, or 5 s with no generator', () => {
  test.each([
    // freq     seconds
    [1,         2],
    [0.25,      8],
    [2,         1],
    [100,       0.02],
    [null,      5],
    [undefined, 5],
    [0,         5],
  ])('windowFor(%s) = %s s', (freq, want) => {
    near(Scope().windowFor(freq), want, 1e-9, `windowFor(${freq})`);
  });
});

// ── 2. Vpp and frequency from a sine ───────────────────────────────────────

describe('a sine sampled at irregular ~60 fps frames: Vpp and the frequency it measures', () => {
  test.each([
    // amp  freq  offset  why
    [1,     1,    0,      'the issue\'s 1 Hz, 1 Vp sine: 2.00 Vpp at 1.0 Hz'],
    [5,     1,    5,      'a DC offset (the breathing-LED recipe\'s 0–10 V): it never crosses 0, still 10.00 Vpp at 1.0 Hz'],
    [2,     0.5,  -3,     'a negative offset (−5…−1 V), 0.5 Hz: 4.00 Vpp at 0.5 Hz'],
    [0.1,   2,    0,      'a small 2 Hz sine: 0.20 Vpp at 2.0 Hz'],
  ])('%s Vp at %s Hz, offset %s V (%s)', (amp, freq, offset) => {
    const S = Scope();
    const period = 1 / freq;
    // ~50 frames a period (60 fps at 1.2 Hz): plenty for any of these.
    const times = frameTimes(3 * period, period / 50, 7);
    const rec = record(S.recorder(), times, { ch1: sine(amp, freq, offset), freq });
    const st = rec.stats(1);
    assert.ok(st, 'stats(1) after 3 periods of CH1');
    // The peak falls between frames, so max − min can be a hair under 2·amp.
    near(st.vpp, 2 * amp, 2 * amp * 0.01, 'Vpp');
    near(st.freq, freq, freq * 0.01, 'measured frequency (Hz)');
  });

  test('the readouts don\'t flicker: from 2.2 s on, every frame of the 1 Hz, 1 Vp sine reads 2.00 Vpp and 1.0 Hz', () => {
    const S = Scope();
    const bad = [];
    const times = frameTimes(6, 1 / 60, 3);
    record(S.recorder(), times, { ch1: sine(1, 1), freq: 1 }, (rec, t) => {
      if (t < 2.2) return;
      const st = rec.stats(1);
      const ok = st && Math.abs(st.vpp - 2) <= 0.02 && typeof st.freq === 'number' && Math.abs(st.freq - 1) <= 0.02;
      if (!ok) bad.push(`t = ${t.toFixed(3)} s: ${JSON.stringify(st)}`);
    });
    // A crossing just inside the window's start (between the oldest kept
    // frame and the one before it) must still count, or f drops to "—" on
    // some frames.
    assert.deepStrictEqual(bad.slice(0, 5), [], `${bad.length} of the frames after 2.2 s read wrong or "—"`);
  });

  test('a DC channel (a steady 3 V): Vpp 0, and no frequency (null, shown "—")', () => {
    const S = Scope();
    const rec = record(S.recorder(), frameTimes(3, 1 / 60, 5), { ch1: sine(1, 1), ch2: () => 3, freq: 1 });
    const st = rec.stats(2);
    assert.ok(st, 'stats(2) for a channel with samples');
    near(st.vpp, 0, 1e-9, 'Vpp of a steady 3 V');
    assert.strictEqual(st.freq, null, `a steady 3 V has no frequency: got ${st.freq}`);
  });
});

// ── 3. Sparse frames (CI renders ~3 fps): "—", never a wrong number ─────────

describe('sparse frames: the frequency reads "—" rather than a wrong number', () => {
  test('1 Hz at ~3 frames a second (as on CI): freq null on every frame, Vpp never above the true 2.00', () => {
    const S = Scope();
    const seen = [];
    record(S.recorder(), frameTimes(10, 1 / 3, 11), { ch1: sine(1, 1), freq: 1 }, rec => {
      const st = rec.stats(1);
      seen.push(st);
    });
    const withF = seen.filter(st => st && st.freq !== null).map(st => st.freq.toFixed(3));
    assert.deepStrictEqual(withF, [], 'with ~3 samples a period every frequency read is a guess: show "—" (null)');
    const over = seen.filter(st => st && st.vpp > 2 + 1e-9).map(st => st.vpp);
    assert.deepStrictEqual(over, [], 'max − min of real samples is never more than the true Vpp');
  });

  test('50 Hz at ~60 fps (aliased: about one frame a period): freq null, not the alias', () => {
    const S = Scope();
    const seen = [];
    record(S.recorder(), frameTimes(5, 1 / 60, 13), { ch1: sine(1, 50), freq: 50 }, rec => seen.push(rec.stats(1)));
    const withF = seen.filter(st => st && st.freq !== null).map(st => st.freq.toFixed(2));
    assert.deepStrictEqual(withF, [], 'a 50 Hz sine seen at 60 fps has no honest frequency reading');
  });

  test('0.25 Hz at ~3 fps (12 frames a period, the browser test\'s case on CI): measured within 5% on every frame after 2.2 periods', () => {
    const S = Scope();
    const bad = [];
    record(S.recorder(), frameTimes(20, 1 / 3, 17), { ch1: sine(1, 0.25), freq: 0.25 }, (rec, t) => {
      if (t < 8.8) return;
      const st = rec.stats(1);
      if (!st || typeof st.freq !== 'number' || Math.abs(st.freq - 0.25) > 0.0125) bad.push(`t = ${t.toFixed(2)} s: ${JSON.stringify(st)}`);
    });
    assert.deepStrictEqual(bad.slice(0, 5), [], `${bad.length} frames after 8.8 s read "—" or more than 5% off`);
  });
});

// ── 4. The window trims old samples ────────────────────────────────────────

describe('the window keeps only the last 2 periods (or 5 s with no generator)', () => {
  // Every sample inside [t − w, t], and the oldest within one frame of the
  // window's start: nothing old kept, nothing recent dropped.
  function assertWindow(samples, t, w, gapMax, what) {
    assert.ok(Array.isArray(samples) && samples.length > 0, `${what}: samples is a non-empty array, got ${JSON.stringify(samples)}`);
    const ts = samples.map(s => s.t);
    const older = ts.filter(x => x < t - w - 1e-9);
    assert.deepStrictEqual(older, [], `${what}: samples older than the ${w} s window (now ${t.toFixed(3)} s)`);
    assert.ok(ts.every((x, i) => i === 0 || x > ts[i - 1]), `${what}: oldest first`);
    assert.ok(ts[0] - (t - w) <= gapMax, `${what}: the oldest kept sample is at ${ts[0].toFixed(3)} s, the window starts at ${(t - w).toFixed(3)} s`);
    near(ts[ts.length - 1], t, 1e-9, `${what}: the newest sample is now`);
  }

  test('1 Hz for 10 s: only the last 2 s are kept', () => {
    const S = Scope();
    const times = frameTimes(10, 1 / 60, 19);
    const rec = record(S.recorder(), times, { ch1: sine(1, 1), freq: 1 });
    assertWindow(rec.samples(1), latest(times), 2, 1.5 / 60, 'CH1 at 1 Hz');
  });

  test('the generator turned down to 0.5 Hz: the window grows to 4 s', () => {
    const S = Scope();
    const rec = S.recorder();
    const before = frameTimes(10, 1 / 60, 23);
    record(rec, before, { ch1: sine(1, 1), freq: 1 });
    const after = frameTimes(10, 1 / 60, 29).map(t => t + 10);
    record(rec, after, { ch1: sine(1, 0.5), freq: 0.5 });
    assertWindow(rec.samples(1), latest(after), 4, 1.5 / 60, 'CH1 at 0.5 Hz');
  });

  test('no generator (a capacitor run, CH2 probed): the last 5 s', () => {
    const S = Scope();
    const times = frameTimes(12, 1 / 60, 31);
    const rec = record(S.recorder(), times, { ch2: t => 9 * (1 - Math.exp(-t)), freq: null });
    assertWindow(rec.samples(2), latest(times), 5, 1.5 / 60, 'CH2 with no generator');
  });

  test('clear() (Stop) forgets both channels', () => {
    const S = Scope();
    const rec = record(S.recorder(), frameTimes(3, 1 / 60, 37), { ch1: sine(1, 1), ch2: sine(0.5, 1), freq: 1 });
    rec.clear();
    assert.deepStrictEqual([rec.samples(1), rec.samples(2)], [[], []], 'no samples after clear()');
    assert.deepStrictEqual([rec.stats(1), rec.stats(2)], [null, null], 'no stats after clear()');
  });
});

// ── 5. No generator: CH1 is empty ──────────────────────────────────────────

test('no generator: CH1 has no samples and no stats, CH2 still measures', () => {
  const S = Scope();
  const rec = record(S.recorder(), frameTimes(6, 1 / 60, 41), { ch2: sine(2, 1, 1), freq: null });
  assert.deepStrictEqual(rec.samples(1), [], 'CH1 samples with no generator');
  assert.strictEqual(rec.stats(1), null, 'CH1 stats with no generator');
  const st = rec.stats(2);
  assert.ok(st, 'CH2 stats');
  near(st.vpp, 4, 0.04, 'CH2 Vpp (2 Vp around 1 V)');
  near(st.freq, 1, 0.02, 'CH2 frequency, measured with no generator to go by');
});

// ── 6. Vertical scale: automatic, symmetric, from the larger channel ───────

describe('scale(): symmetric around 0, from the larger channel\'s peak in the window', () => {
  // S covers the peak and isn't wildly bigger.
  function assertScale(S, peak, what) {
    assert.ok(typeof S === 'number' && Number.isFinite(S) && S > 0, `${what}: scale is a finite positive number, got ${S}`);
    assert.ok(S >= peak - 1e-9, `${what}: scale ${S} must cover the peak ${peak}`);
    assert.ok(S <= 2.5 * peak + 1e-9, `${what}: scale ${S} is more than 2.5× the peak ${peak}`);
  }

  test.each([
    // what                                              ch1             ch2              peak
    ['CH1 1 Vp, no CH2',                                  sine(1, 1),     null,            1],
    ['CH1 0–10 V (5 Vp + 5 V): the peak is +10',          sine(5, 1, 5),  null,            10],
    ['CH1 1 Vp, CH2 −10…0 V: the larger is CH2\'s −10',   sine(1, 1),     sine(5, 1, -5),  10],
    ['CH1 1 Vp, CH2 0.5 Vp: CH1\'s 1 V',                  sine(1, 1),     sine(0.5, 1),    1],
  ])('%s', (what, ch1, ch2, peak) => {
    const rec = record(Scope().recorder(), frameTimes(3, 1 / 120, 43), { ch1, ch2, freq: 1 });
    // The samples' own peak (a hair under the sine's).
    const seen = Math.max(...[1, 2].flatMap(ch => rec.samples(ch).map(s => Math.abs(s.v))));
    near(seen, peak, peak * 0.01, `${what}: the samples' peak`);
    assertScale(rec.scale(), seen, what);
  });

  test('it follows the window: 10 Vp, then 1 Vp for longer than the window, scales back down', () => {
    const S = Scope();
    const rec = S.recorder();
    record(rec, frameTimes(3, 1 / 60, 47), { ch1: sine(10, 1), freq: 1 });
    assertScale(rec.scale(), 10 * 0.999, 'during the 10 Vp sine');
    record(rec, frameTimes(3, 1 / 60, 53).map(t => t + 3), { ch1: sine(1, 1), freq: 1 });
    const peak = Math.max(...rec.samples(1).map(s => Math.abs(s.v)));
    assertScale(rec.scale(), peak, 'after 3 s of 1 Vp');
  });

  test.each([
    ['all-zero samples', { ch1: () => 0, freq: 1 }],
    ['no samples at all', null],
  ])('%s: a finite positive scale, no divide by zero', (what, chans) => {
    const rec = Scope().recorder();
    if (chans) record(rec, frameTimes(1, 1 / 60, 59), chans);
    const s = rec.scale();
    assert.ok(typeof s === 'number' && Number.isFinite(s) && s > 0, `${what}: scale ${s}`);
  });
});

// ── 7. CH1's source on real solves ─────────────────────────────────────────

const TYPE = 'function_generator';
const FG   = () => Parts.get(TYPE).prefix;   // the label prefix, read from the part

const wiresOf = pairs => pairs.map(([from, to], i) => ({ id: 'W' + (i + 1), from, to }));
const res = (label, holes, ohms) => ({ type: 'resistor', label, holes, values: { resistance: ohms } });

// FG1 OUT → + rail → R1 10 kΩ (a10–a14) → R2 10 kΩ (b14–b18) → − rail → COM.
// The middle (e14) reads half of OUT.
function dividerBoard(values = {}) {
  const L = FG() + '1';
  return Board.toSim({
    parts: [{ type: TYPE, label: L, values }, res('R1', ['a10', 'a14'], 10000), res('R2', ['b14', 'b18'], 10000)],
    wires: wiresOf([[`${L}.0`, 'tp_50'], [`${L}.1`, 'tn_50'], ['tp_10', 'c10'], ['c18', 'tn_18']]),
  });
}

function solveAt(board, t) {
  const result = Sim.analyze(board.components, board.wires, { dt: 1e-3, state: {}, t });
  assert.strictEqual(result.status, 'ok', `status ${result.status}: ${(result.lines || []).map(l => l.text).join(' | ')}`);
  return Readings.from(result, board);
}

const SPLIT = 20000 / 20050;   // 50 Ω inside the generator, 20 kΩ outside

describe('source(readings, board): the first function generator\'s OUT voltage now, and its frequency', () => {
  test.each([
    // t      EMF   why
    [0.25,    1,    'the peak: 0.9975 V at OUT'],
    [0.75,    -1,   'the trough: −0.9975 V'],
    [0.5,     0,    'back through 0'],
  ])('1 Vp, 1 Hz into 20 kΩ at t = %s s (%s)', (t, emf) => {
    const board = dividerBoard({ amplitude: 1, frequency: 1 });
    const got = Scope().source(solveAt(board, t), board);
    assert.ok(got, `source() finds ${FG()}1 on the board`);
    assert.strictEqual(got.label, FG() + '1');
    near(got.v, emf * SPLIT, 1e-3, `OUT at t = ${t} s`);
    near(got.freq, 1, 1e-9, 'its frequency');
  });

  test('the generator\'s own frequency, not a default: 2.5 Hz reads 2.5', () => {
    const board = dividerBoard({ amplitude: 1, frequency: 2.5 });
    near(Scope().source(solveAt(board, 0.1), board).freq, 2.5, 1e-9, 'freq');
  });

  test('two generators: CH1 is the first one\'s', () => {
    const P = FG();
    const board = Board.toSim({
      parts: [{ type: TYPE, label: P + '1', values: { amplitude: 1, frequency: 1 } },
              { type: TYPE, label: P + '2', values: { amplitude: 3, frequency: 4 } },
              res('R1', ['a10', 'a14'], 10000), res('R2', ['b14', 'b18'], 10000),
              res('R3', ['f40', 'f44'], 10000)],
      wires: wiresOf([[`${P}1.0`, 'tp_50'], [`${P}1.1`, 'tn_50'], ['tp_10', 'c10'], ['c18', 'tn_18'],
                      [`${P}2.0`, 'bp_50'], [`${P}2.1`, 'bn_50'], ['bp_40', 'j40'], ['j44', 'bn_44']]),
    });
    const got = Scope().source(solveAt(board, 0.25), board);
    assert.ok(got, 'source() finds a generator');
    assert.strictEqual(got.label, P + '1', 'the first generator on the board');
    near(got.v, SPLIT, 1e-3, `${P}1's OUT at its peak`);
    near(got.freq, 1, 1e-9, `${P}1's frequency`);
  });

  test('no function generator (a 9 V battery across 1 kΩ): null, so CH1 stays empty', () => {
    const board = Board.toSim({
      parts: [{ type: 'battery', label: 'BAT1' }, res('R1', ['a10', 'a14'], 1000)],
      wires: wiresOf([['BAT1.0', 'tp_1'], ['BAT1.1', 'tn_1'], ['tp_10', 'c10'], ['c14', 'tn_14']]),
    });
    const result = Sim.analyze(board.components, board.wires);
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(Scope().source(Readings.from(result, board), board), null);
  });
});

// ── 8. End to end in Node: the real time steps into the recorder ───────────

test('a real 1 Vp, 1 Hz run into 10 kΩ + 10 kΩ, recorded at irregular frames: CH1 1.995 Vpp at 1.0 Hz, CH2 (the middle, e14) 0.998 Vpp at 1.0 Hz', () => {
  const S = Scope();
  const board = dividerBoard({ amplitude: 1, frequency: 1 });
  const dt = 0.005;
  const rec = S.recorder();
  const r = prng(61);
  let state = {}, t = 0, next = 0, pushed = 0;
  // Each frame takes 2–5 steps (10–25 ms), as a ~60 fps page does, and
  // records the last one: what plugged:sim announces.
  while (t < 3) {
    const result = Sim.analyze(board.components, board.wires, { dt, state, t: t + dt });
    assert.strictEqual(result.status, 'ok');
    if (result.state) state = result.state;
    t += dt;
    if (t + 1e-12 < next) continue;
    next = t + dt * (2 + Math.floor(r() * 4));
    const readings = Readings.from(result, board);
    const src = S.source(readings, board);
    rec.push({ t, ch1: src ? src.v : null, ch2: readings.voltage('e14'), freq: src ? src.freq : null });
    pushed = t;
  }
  const ch1 = rec.stats(1), ch2 = rec.stats(2);
  assert.ok(ch1 && ch2, `both channels measured: ${JSON.stringify({ ch1, ch2 })}`);
  near(ch1.vpp, 2 * SPLIT, 0.02, 'CH1 Vpp (2 × 0.9975)');
  near(ch1.freq, 1, 0.02, 'CH1 frequency');
  near(ch2.vpp, SPLIT, 0.01, 'CH2 Vpp (half of CH1)');
  near(ch2.freq, 1, 0.02, 'CH2 frequency');
  // Every kept sample is in the 2 s window.
  const old = rec.samples(1).filter(s => s.t < pushed - 2 - 1e-9);
  assert.deepStrictEqual(old, [], 'CH1 samples older than 2 periods');
});
