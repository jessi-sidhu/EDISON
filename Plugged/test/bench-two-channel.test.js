// The bench supply as a real 2-channel supply (issue #124): a SERIES /
// INDEPENDENT mode and a CH2 ground post. Everything here runs on the real
// simulator (Sim.analyze) and the real part; the page half (the 3D mode
// button, the panel, undo, an LED on CH2) is e2e/bench-supply-two-channel.spec.js.
//
// Shapes these tests assume (Aarmen's decisions comment on #124, stated so
// the builder matches them):
// - pins ['pos', 'com', 'neg', 'com2']: indices 0–2 unchanged, com2 (CH2+)
//   appended at 3. CH1 = pos (+) / com (−); CH2 = com2 (+) / neg (−).
// - controls.mode: 'series' (the default, saved) | 'independent'.
// - values: voltage, limit (as today); voltage2 { V, 12, 0–30 } and
//   limit2 { A, 0.5, 0.001–3 }, used only when independent.
// - elements:
//     series:      V(pos, com) = voltage, V(com, neg) = voltage, and a
//                  closed SW joining com and com2;
//     independent: V(pos, com) = voltage, V(com2, neg) = voltage2 with
//                  ref 'neg' (the source names its own reference), no link.
// - Grounding: a CH2 circuit separate from CH1's is grounded at neg; once the
//   circuits are joined (by wires, or to another source's circuit), the
//   earliest source's ref stays the reference (CH1's com, or a battery
//   placed before the supply).
// - Warnings are per channel: in independent mode CH1 is checked against
//   `limit` and CH2 against `limit2`, and a warning names its channel
//   ("CH1" / "CH2"). Series keeps today's "+ rail" / "− rail" lines.
// - headline(r, m) shows the mode (SERIES / INDEP…) and, independent, each
//   channel's mA.
// - The AI never sees voltage2, limit2 or mode: the two values carry a
//   per-value `ai: false` and the mode control a per-control `ai: false`,
//   which the server leaves out of its tools and prompt lines, so the prompt
//   goldens (test/fixtures/prompts/) don't move.
//
// Lab 1 (an old save with only pins 0–2 wired) still reading I(R1) 4.31 mA is
// pinned by test/lab1-circuit.test.js, which already loads lab1.sparky the
// way the page does; it is not repeated here.
//
// Hand-computed (ideal sources, 1 kΩ / 100 Ω resistors):
//   CH1 5 V into 1 kΩ  = 5.000 mA      CH2 9 V into 1 kΩ  = 9.000 mA
//   12 V into 1 kΩ     = 12.000 mA     12 V into 100 Ω    = 120 mA (0.12 A)

const assert = require('node:assert');
process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out

const Parts  = require('../circuit3d/js/parts');
const Sim    = require('../circuit3d/js/simulate.js');
const IO     = require('../circuit3d/js/board-io.js');
const Server = require('../backend/server.js');

const supply = () => {
  const def = Parts.get('bench_supply');
  assert.ok(def, "Parts.get('bench_supply')");
  return def;
};
const PIN = name => {
  const k = supply().pins.indexOf(name);
  assert.ok(k >= 0, `bench_supply has no pin '${name}'; pins ${JSON.stringify(supply().pins)}`);
  return k;
};

function near(got, want, tol, what) {
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want} (±${tol}), got ${got}`);
}

// "a2" → { col: 1, row: 'a' }; "tp_50" → { col: 49, row: 'tp' }.
function holeRef(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  assert.ok(m, 'not a hole: ' + s);
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}
const pinsOf = n => Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));
const text = r => (r.lines || []).map(l => l.text).join(' | ');

// ── A tiny circuit builder: records the way App leaves them ────────────────
// A supply pin end is "PS1.com2" (by name, so the test reads as the design).

function circuit() {
  const components = [], wires = [];
  const byLabel = new Map();
  const add = comp => { components.push(comp); byLabel.set(comp.label, comp); return comp; };
  const end = (s, side) => {
    const m = /^([A-Z]+\d+)\.(\w+)$/.exec(s);
    if (!m) return { [side + 'Hole']: holeRef(s) };
    const comp = byLabel.get(m[1]);
    assert.ok(comp, `no ${m[1]} for wire end ${s}`);
    const idx = /^\d+$/.test(m[2]) ? Number(m[2]) : PIN(m[2]);
    return { [side + 'Comp']: comp, [side + 'PinIdx']: idx };
  };
  return {
    components, wires,
    supply(label, values, mode) {
      const comp = { type: 'bench_supply', label, pins: pinsOf(supply().pins.length), holeRefs: null,
                     values: Object.assign({ voltage: 12, limit: 0.5, voltage2: 12, limit2: 0.5 }, values) };
      if (mode) comp.controls = { mode };
      return add(comp);
    },
    battery(label, voltage = 9) {
      return add({ type: 'battery', label, pins: pinsOf(2), holeRefs: null, values: { voltage } });
    },
    resistor(label, a, b, ohms) {
      return add({ type: 'resistor', label, pins: pinsOf(2), holeRefs: [holeRef(a), holeRef(b)], values: { resistance: ohms } });
    },
    wire(a, b) { wires.push(Object.assign({}, end(a, 'start'), end(b, 'end'))); },
    solve() {
      const r = Sim.analyze(components, wires);
      assert.equal(r.status, 'ok', `status ${r.status}: ${text(r)}`);
      return r;
    },
  };
}

// CH1 on the top rails: pos → tp, com → tn, R1 1 kΩ (or `ohms1`) a10–a14.
function ch1Load(c, ohms = 1000) {
  c.wire('PS1.pos', 'tp_63');
  c.wire('PS1.com', 'tn_63');
  c.resistor('R1', 'a10', 'a14', ohms);
  c.wire('tp_9', 'b10');
  c.wire('b14', 'tn_15');
}
// CH2 on the bottom rails: com2 → bp, neg → bn, R2 g20–g24.
function ch2Load(c, ohms = 1000) {
  c.wire('PS1.com2', 'bp_63');
  c.wire('PS1.neg', 'bn_63');
  c.resistor('R2', 'g20', 'g24', ohms);
  c.wire('bp_20', 'j20');
  c.wire('j24', 'bn_25');
}

// Nothing in this solved circuit is floating: every pin of every part reads.
function noneFloating(r) {
  for (const [label, p] of Object.entries(r.parts || {})) {
    for (const [pin, v] of Object.entries(p.r.pins)) {
      assert.ok(typeof v === 'number', `${label}.${pin} is floating (reads ${v}); lines: ${text(r)}`);
    }
  }
  assert.doesNotMatch(text(r), /floating|not connected|no battery/i);
}

// ── The definition ────────────────────────────────────────────────────────

test("pins ['pos', 'com', 'neg', 'com2']: indices 0–2 unchanged, com2 (CH2+) appended at 3", () => {
  assert.deepStrictEqual([...supply().pins], ['pos', 'com', 'neg', 'com2']);
  assert.equal(supply().ref, 'com', 'CH1 − (COM) is still the part ref');
});

test("controls.mode: 'series' by default, saved with the circuit", () => {
  const spec = supply().controls && supply().controls.mode;
  assert.ok(spec, `a mode control; controls ${JSON.stringify(supply().controls)}`);
  assert.equal(spec.default, 'series');
  assert.equal(spec.saved, true, 'the mode is saved with the circuit');
});

test('values voltage2 (0–30 V, 12 V default) and limit2 (1 mA–3 A, 0.5 A default); checkValue bounds them', () => {
  const v = supply().values;
  assert.deepStrictEqual(JSON.parse(JSON.stringify({ voltage2: v.voltage2, limit2: v.limit2 })), {
    voltage2: { unit: 'V', default: 12, min: 0, max: 30, ai: false, activeWhen: { mode: 'independent', note: 'tracks CH1' } },
    limit2:   { unit: 'A', default: 0.5, min: 0.001, max: 3, ai: false, activeWhen: { mode: 'independent', note: 'tracks CH1' } },
  });
  assert.deepStrictEqual(Parts.checkValue('bench_supply', 'voltage2', 30), { ok: true, value: 30 });
  assert.equal(Parts.checkValue('bench_supply', 'voltage2', 31).ok, false);
  assert.equal(Parts.checkValue('bench_supply', 'limit2', 5).ok, false);
});

test('elements: series (default and named) is the two V elements plus a closed SW joining com and com2; independent is V(pos, com) and V(com2, neg) with ref neg, no link', () => {
  const values = { voltage: 5, limit: 0.5, voltage2: 9, limit2: 0.5 };
  for (const controls of [{}, { mode: 'series' }]) {
    const els = supply().elements(values, controls);
    const vs = els.filter(e => e.kind === 'V');
    assert.deepStrictEqual(vs.map(e => [[...e.pins], e.volts]).sort(), [[['com', 'neg'], 5], [['pos', 'com'], 5]],
      `series: both rails track voltage, ${JSON.stringify(els)}`);
    const links = els.filter(e => e.kind === 'SW');
    assert.equal(links.length, 1, `series: one SW link; ${JSON.stringify(els)}`);
    assert.deepStrictEqual([...links[0].pins].sort(), ['com', 'com2']);
    assert.equal(links[0].closed, true);
  }
  const ind = supply().elements(values, { mode: 'independent' });
  assert.deepStrictEqual(ind.map(e => e.kind).sort(), ['V', 'V'], `independent: two V elements, no link; ${JSON.stringify(ind)}`);
  const ch1 = ind.find(e => e.pins[0] === 'pos'), ch2 = ind.find(e => e.pins[0] === 'com2');
  assert.ok(ch1 && ch2, JSON.stringify(ind));
  assert.deepStrictEqual([[...ch1.pins], ch1.volts], [['pos', 'com'], 5]);
  assert.deepStrictEqual([[...ch2.pins], ch2.volts, ch2.ref], [['com2', 'neg'], 9, 'neg'],
    'CH2 is voltage2, from com2 to neg, and names neg as its own reference');
  assert.notEqual(ch1.id, ch2.id);
});

// ── Series: today's ± supply, with com2 riding on com ─────────────────────

test('series by default: ±12 V across 1 kΩ + → COM and 1 kΩ COM → −, 12 mA per rail, and com2 reads the same as com', () => {
  const c = circuit();
  c.supply('PS1', { voltage: 12 });                 // no mode: series
  ch1Load(c);
  c.wire('PS1.neg', 'bn_63');
  c.resistor('R2', 'f20', 'f24', 1000);
  c.wire('tn_19', 'g20');
  c.wire('g24', 'bn_25');
  const r = c.solve();
  const { r: pr, m, warnings } = r.parts.PS1;
  near(pr.pins.pos, 12, 1e-6, 'pos');
  near(pr.pins.com, 0, 1e-9, 'com (ground)');
  near(pr.pins.neg, -12, 1e-6, 'neg');
  near(pr.pins.com2, 0, 1e-3, 'com2 is joined to com inside the supply');
  near(m.posAmps, 12, 0.01, '+ rail mA');
  near(m.negAmps, 12, 0.01, '− rail mA');
  assert.deepStrictEqual(warnings, []);
});

test('series: a load on the CH2 posts (com2 → 1 kΩ → neg) is the − rail: 12 mA, com2 at 0 V, neg at −12 V', () => {
  const c = circuit();
  c.supply('PS1', { voltage: 12, voltage2: 5 }, 'series');   // voltage2 is ignored in series
  ch2Load(c);
  const r = c.solve();
  noneFloating(r);
  near(r.parts.R2.m.current, 12, 0.01, 'R2 mA (both channels track voltage)');
  near(r.parts.PS1.r.pins.com2, 0, 1e-3, 'com2');
  near(r.parts.PS1.r.pins.neg, -12, 1e-6, 'neg');
});

// ── Independent: two channels, each its own ground ────────────────────────

test('independent: CH1 5 V into 1 kΩ is 5.00 mA and CH2 9 V into 1 kΩ (a separate circuit) is 9.00 mA; V(com2) − V(neg) = 9, nothing floating', () => {
  const c = circuit();
  c.supply('PS1', { voltage: 5, voltage2: 9 }, 'independent');
  ch1Load(c);
  ch2Load(c);
  const r = c.solve();
  noneFloating(r);
  near(r.parts.R1.m.current, 5, 0.01, 'R1 mA (CH1)');
  near(r.parts.R2.m.current, 9, 0.01, 'R2 mA (CH2)');
  const pins = r.parts.PS1.r.pins;
  near(pins.pos - pins.com, 5, 1e-6, 'V(pos) − V(com)');
  near(pins.com2 - pins.neg, 9, 1e-6, 'V(com2) − V(neg)');
  near(pins.com, 0, 1e-9, 'CH1 is grounded at com');
  near(pins.neg, 0, 1e-9, 'CH2, a separate circuit, is grounded at its own − (neg)');
  near(r.voltageAt(holeRef('j20')), 9, 1e-6, 'R2 at the CH2 + end');
  near(r.voltageAt(holeRef('j24')), 0, 1e-6, 'R2 at the CH2 − end');
  assert.deepStrictEqual(r.parts.PS1.warnings, []);
});

test('independent, CH2 alone (CH1 unwired): CH2 9 V into 1 kΩ still reads 9.00 mA from its own ground', () => {
  const c = circuit();
  c.supply('PS1', { voltage: 5, voltage2: 9 }, 'independent');
  ch2Load(c);
  const r = c.solve();
  near(r.parts.R2.m.current, 9, 0.01, 'R2 mA');
  near(r.voltageAt(holeRef('j20')), 9, 1e-6, 'R2 at the CH2 + end');
  near(r.voltageAt(holeRef('j24')), 0, 1e-6, 'R2 at neg, CH2\'s ground');
});

// CH1− (com) wired to CH2+ (com2) outside the supply: today's ± supply,
// built by hand. Equal voltages give exactly the series answer; unequal
// ones give an asymmetric supply.
test.each([
  { v1: 12, v2: 12, neg: -12, i2: 12 },
  { v1: 12, v2: 5,  neg: -5,  i2: 5 },
])('independent with CH1− wired to CH2+ externally ($v1 V / $v2 V): +$v1 V and $neg V about com, like series', ({ v1, v2, neg, i2 }) => {
  const c = circuit();
  c.supply('PS1', { voltage: v1, voltage2: v2 }, 'independent');
  ch1Load(c);
  c.wire('PS1.com2', 'tn_60');            // the external link, com2 → the COM rail
  c.wire('PS1.neg', 'bn_63');
  c.resistor('R2', 'f20', 'f24', 1000);
  c.wire('tn_19', 'g20');
  c.wire('g24', 'bn_25');
  const r = c.solve();
  noneFloating(r);
  const pins = r.parts.PS1.r.pins;
  near(pins.pos, v1, 1e-6, 'pos');
  near(pins.com, 0, 1e-9, 'com stays the reference');
  near(pins.com2, 0, 1e-6, 'com2 (wired to com)');
  near(pins.neg, neg, 1e-6, 'neg');
  near(r.voltageAt(holeRef('f24')), neg, 1e-6, 'R2 at the − end');
  near(r.parts.R1.m.current, v1, 0.01, 'R1 mA');
  near(r.parts.R2.m.current, i2, 0.01, 'R2 mA');
});

// The circuits joined the other way: CH2+ (com2) wired to CH1+ (pos). One
// circuit, so CH1's com (the earliest source's ref) stays 0 V and neg sits
// at 5 − 9 = −4 V, not at its own 0 V.
test('independent, CH2+ wired to CH1+: one circuit, com stays the reference, neg reads 5 − 9 = −4 V', () => {
  const c = circuit();
  c.supply('PS1', { voltage: 5, voltage2: 9 }, 'independent');
  ch1Load(c);
  c.wire('PS1.com2', 'tp_60');
  c.wire('PS1.neg', 'bn_63');
  c.resistor('R2', 'f20', 'f24', 1000);
  c.wire('tp_19', 'g20');
  c.wire('g24', 'bn_25');
  const r = c.solve();
  noneFloating(r);
  const pins = r.parts.PS1.r.pins;
  near(pins.com, 0, 1e-9, 'com');
  near(pins.pos, 5, 1e-6, 'pos');
  near(pins.com2, 5, 1e-6, 'com2 (wired to pos)');
  near(pins.neg, -4, 1e-6, 'neg');
  near(r.parts.R1.m.current, 5, 0.01, 'R1 mA');
  near(r.parts.R2.m.current, 9, 0.01, 'R2 mA');
});

// A battery placed first, and CH2's − wired to the battery's +: CH2's circuit
// is the battery's, so BAT1's − stays the reference and neg reads +9 V.
test('independent, CH2 joined to an earlier battery\'s circuit: the battery\'s − stays the reference (neg at +9 V, com2 at +14 V)', () => {
  const c = circuit();
  c.battery('BAT1', 9);
  c.wire('BAT1.0', 'tp_63');
  c.wire('BAT1.1', 'tn_63');
  c.supply('PS1', { voltage: 12, voltage2: 5 }, 'independent');
  c.wire('PS1.neg', 'tp_60');
  c.wire('PS1.com2', 'bp_63');
  c.resistor('R2', 'g20', 'g24', 1000);
  c.wire('bp_20', 'j20');
  c.wire('j24', 'tp_24');
  const r = c.solve();
  near(r.parts.PS1.r.pins.neg, 9, 1e-6, 'neg (on the battery +)');
  near(r.parts.PS1.r.pins.com2, 14, 1e-6, 'com2');
  near(r.parts.R2.m.current, 5, 0.01, 'R2 mA');
});

// ── Per-channel limits ────────────────────────────────────────────────────
// 12 V into 100 Ω = 120 mA on whichever channel carries it.

function overload({ on, limit, limit2 }) {
  const c = circuit();
  c.supply('PS1', { voltage: 12, voltage2: 12, limit, limit2 }, 'independent');
  if (on === 'CH1') ch1Load(c, 100); else ch2Load(c, 100);
  return c.solve();
}

test('independent: CH2 at 120 mA over limit2 0.05 A warns for CH2 only (CH1\'s 3 A limit is not used)', () => {
  const r = overload({ on: 'CH2', limit: 3, limit2: 0.05 });
  const { warnings } = r.parts.PS1;
  assert.equal(warnings.length, 1, JSON.stringify(warnings));
  assert.match(warnings[0], /CH2/, warnings[0]);
  assert.doesNotMatch(warnings[0], /CH1/, warnings[0]);
  assert.match(warnings[0], /0\.12 A/, `the load: ${warnings[0]}`);
  assert.match(warnings[0], /0\.05 A/, `CH2's limit: ${warnings[0]}`);
  assert.ok(warnings[0].length <= 120, warnings[0]);
  assert.ok(r.lines.some(l => l.text.trim() === warnings[0]), `the warning is a results line: ${text(r)}`);
});

test('independent: CH2 at 120 mA under its own 3 A limit2 does not warn, even with CH1\'s limit at 0.05 A', () => {
  const r = overload({ on: 'CH2', limit: 0.05, limit2: 3 });
  assert.deepStrictEqual(r.parts.PS1.warnings, []);
  assert.doesNotMatch(text(r), /current-limit/);
});

test('independent: CH1 at 120 mA over limit 0.05 A warns for CH1 only', () => {
  const r = overload({ on: 'CH1', limit: 0.05, limit2: 3 });
  const { warnings } = r.parts.PS1;
  assert.equal(warnings.length, 1, JSON.stringify(warnings));
  assert.match(warnings[0], /CH1/, warnings[0]);
  assert.doesNotMatch(warnings[0], /CH2/, warnings[0]);
  assert.match(warnings[0], /0\.05 A/, warnings[0]);
});

test('guard: series ignores limit2: a 120 mA − rail load at limit 3 A and limit2 0.001 A does not warn', () => {
  const c = circuit();
  c.supply('PS1', { voltage: 12, limit: 3, limit2: 0.001 }, 'series');
  ch2Load(c, 100);
  const r = c.solve();
  near(r.parts.R2.m.current, 120, 0.1, 'R2 mA');
  assert.deepStrictEqual(r.parts.PS1.warnings, []);
});

// ── The headline shows the mode ───────────────────────────────────────────

test('headline: SERIES in series; INDEP in independent, with each channel\'s mA (5.0 and 9.0)', () => {
  const c = circuit();
  c.supply('PS1', { voltage: 5, voltage2: 9 }, 'independent');
  ch1Load(c);
  ch2Load(c);
  const ind = c.solve().parts.PS1;
  const indText = supply().headline(ind.r, ind.m).text;
  assert.match(indText, /indep/i, indText);
  assert.match(indText, /\b5\.0 mA/, `CH1's mA: ${indText}`);
  assert.match(indText, /\b9\.0 mA/, `CH2's mA: ${indText}`);

  const s = circuit();
  s.supply('PS1', { voltage: 12 });
  ch1Load(s);
  const ser = s.solve().parts.PS1;
  const serText = supply().headline(ser.r, ser.m).text;
  assert.match(serText, /series/i, serText);
  assert.match(serText, /±12 ?V/, `series still reads as a ± supply: ${serText}`);
});

// ── Save and load ─────────────────────────────────────────────────────────
// Saved the way app.js's serializeBoard writes a record (values, saved
// controls by the ControlSpec `saved` rule, wire ends by pin name through
// IO.wireRecord), through JSON, then rebuilt the way rebuildBoard reads it.

test('save → load keeps the mode, voltage2 and limit2, and the wire on com2; the reloaded board solves independent (CH2 9.00 mA from its own ground)', () => {
  const c = circuit();
  c.supply('PS1', { voltage: 5, voltage2: 9, limit2: 0.25 }, 'independent');
  ch1Load(c);
  ch2Load(c);
  const savedControls = comp => {
    const out = {};
    for (const [k, spec] of Object.entries(Parts.get(comp.type).controls || {})) {
      if (spec.saved && comp.controls && Object.hasOwn(comp.controls, k)) out[k] = comp.controls[k];
    }
    return Object.keys(out).length ? out : undefined;
  };
  const file = JSON.parse(JSON.stringify({
    components: c.components.map(comp => ({ type: comp.type, label: comp.label, values: comp.values,
                                            holeRefs: IO.saveHoleRefs(comp), controls: savedControls(comp) })),
    wires: c.wires.map(w => IO.wireRecord(w, c.components)),
  }));
  const ps = file.components.find(x => x.label === 'PS1');
  assert.deepStrictEqual(ps.controls, { mode: 'independent' }, `the saved record: ${JSON.stringify(ps)}`);
  assert.equal(ps.values.voltage2, 9);
  assert.equal(ps.values.limit2, 0.25);
  assert.ok(file.wires.some(w => w.startPin === 'com2'), `the com2 wire end is saved by name: ${JSON.stringify(file.wires)}`);

  const components = IO.rebuildComponents(file.components, rec => {
    const def = Parts.get(rec.type);
    const comp = { type: rec.type, label: rec.label, values: rec.values || {},
                   holeRefs: def.place.kind === 'offboard' ? null : IO.loadHoleRefs(rec), pins: pinsOf(def.pins.length) };
    if (rec.controls) comp.controls = Object.assign({}, rec.controls);
    return comp;
  }, t => !!Parts.get(t));
  const end = (hole, ci, name, pi) => {
    const comp = !hole && ci >= 0 ? components[ci] : null;
    return { hole: hole || null, comp, idx: comp ? IO.pinIndex(comp, name, pi) : -1 };
  };
  const wires = file.wires.map(w => {
    const a = end(w.startHole, w.startCompIdx, w.startPin, w.startPinIdx);
    const b = end(w.endHole, w.endCompIdx, w.endPin, w.endPinIdx);
    return { startHole: a.hole, endHole: b.hole, startComp: a.comp, startPinIdx: a.idx, endComp: b.comp, endPinIdx: b.idx };
  });
  assert.equal(components.find(x => x.label === 'PS1').controls.mode, 'independent');
  const r = Sim.analyze(components, wires);
  assert.equal(r.status, 'ok', text(r));
  near(r.parts.R1.m.current, 5, 0.01, 'R1 mA after reload');
  near(r.parts.R2.m.current, 9, 0.01, 'R2 mA after reload');
  near(r.voltageAt(holeRef('j24')), 0, 1e-6, 'neg is CH2\'s ground after reload');
});

// ── The inspector edits what the AI doesn't see ───────────────────────────
// voltage2 / limit2 / mode are ai: false; that hides them from the AI
// only, never from the person setting CH2.

test('the inspector has rows for voltage, limit, voltage2, limit2 and the mode', () => {
  const Inspector = require('../circuit3d/js/inspector.js');
  const comp = { type: 'bench_supply', label: 'PS1', values: { voltage: 5, limit: 0.5, voltage2: 9, limit2: 0.25 },
                 controls: { mode: 'independent' } };
  const rows = Inspector.rows(supply(), comp);
  const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
  for (const key of ['voltage', 'limit', 'voltage2', 'limit2', 'mode']) {
    assert.ok(byKey[key], `an inspector row for ${key}; rows ${JSON.stringify(rows.map(r => r.key))}`);
  }
  assert.equal(byKey.voltage2.value, 9);
  assert.equal(byKey.mode.value, 'independent');
});

// ── The AI never sees the new fields ──────────────────────────────────────

// What #124 hides: the values voltage2 / limit2 (never in place_bench_supply
// or set_value) and the mode control (never in place_bench_supply or
// set_control). set_value may still take `mode`: it is the multimeter's
// value (#123), a different key in a different tool. set_control's params
// don't say which part owns them, so the guard is that no AI part shows a
// `mode` control at all, and set_control has no `mode`.
test('guard (passes today): the AI never sees CH2 or the mode control: no voltage2 / limit2 in place_bench_supply or set_value, no mode in place_bench_supply or set_control, no prompt line for any', () => {
  const keys = d => Object.keys((d && d.parameters && d.parameters.properties) || {});
  const all = Server.CIRCUIT_TOOLS[0].function_declarations;
  const sent = Server.selectTools('Power an LED from the bench supply at 5 V with a series resistor.', ['bench_supply']);
  const place = all.find(d => d.name === 'place_bench_supply');
  assert.deepStrictEqual(keys(place).sort(), ['limit', 'voltage'], 'place_bench_supply takes only voltage and limit');
  // sanity: the bench supply is the only part with a mode control, so a mode
  // key in set_control could only be its own.
  assert.deepStrictEqual(Parts.all().filter(d => d.controls && d.controls.mode).map(d => d.type), ['bench_supply'],
    'the parts with a mode control');
  const HIDDEN = { place_bench_supply: ['voltage2', 'limit2', 'mode'], set_value: ['voltage2', 'limit2'], set_control: ['mode'] };
  for (const [where, list] of [['every tool', all], ['the tools sent for a bench-supply request', sent]]) {
    for (const [name, hidden] of Object.entries(HIDDEN)) {
      const d = list.find(x => x.name === name);
      assert.ok(d, `${name} in ${where}`);
      for (const key of hidden) {
        assert.ok(!keys(d).includes(key), `${name} (${where}) must not take ${key}: ${JSON.stringify(keys(d))}`);
      }
    }
  }
  assert.doesNotMatch(Server.SYSTEM_PROMPT, /voltage2|limit2/);
  // The prompt's lines about the bench supply (its PART VALUES, guide and
  // control lines all start "- place_bench_supply") never name the mode, and
  // no recipe step sets it.
  const supplyLines = Server.SYSTEM_PROMPT.split('\n').filter(l => l.startsWith('- place_bench_supply'));
  assert.ok(supplyLines.length >= 1, 'sanity: the prompt has bench-supply lines');
  assert.deepStrictEqual(supplyLines.filter(l => /\bmode\b/i.test(l)), [], 'bench-supply prompt lines naming the mode');
  assert.doesNotMatch(Server.SYSTEM_PROMPT, /set_control: part=PS\d+[^\n]*\bmode=/);
  assert.deepStrictEqual([...(supply().ai.values || ['voltage', 'limit'])].sort(), ['limit', 'voltage']);
});
