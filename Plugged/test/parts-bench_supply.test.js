// The bench power supply, parts/bench_supply.js (issue #34): the first
// 3-terminal off-board source. + , COM and − terminals, one set voltage that
// both rails track (±V), and a current limit that only WARNS (no
// constant-current mode). Its definition half loads in Node through
// require('circuit3d/js/parts') and in a browser-like context with no THREE
// or document; its panel and LIMIT light are checked in the browser by
// e2e/bench-supply.spec.js.
//
// Shapes these tests assume (the issue and its scope-decision comment;
// stated so the builder matches them):
// - Identity: type 'bench_supply', prefix 'PS' (labels PS1, PS2…), category
//   'Sources' (beside the battery). name / sub / icon are the builder's pick.
// - pins ['pos', 'com', 'neg', 'com2'], ref 'com' (COM is ground), place
//   offboard. com2 (CH2+) was appended by #124; its two channels and the
//   SERIES / INDEPENDENT mode are test/bench-two-channel.test.js.
// - values: voltage { V, default 12, min 0, max 30 } (both rails track),
//           limit   { A, default 0.5, min 0.001, max 3 }, plus #124's
//           voltage2 / limit2 (used only when independent).
// - elements(values) in series (the default): two V elements,
//   V(pos, com, voltage) and V(com, neg, voltage), no `limit` field on
//   either, plus #124's closed SW joining com and com2. Each V has an `id`
//   so r.current names them (e.g. 'pos' and 'neg').
// - measure(r) → { posAmps, negAmps, posOver, negOver }, nothing else.
//   posAmps / negAmps are each rail's current in mA as a POSITIVE magnitude
//   (like the battery's `current`), so a supplying rail reads + 12, not − 12.
//   posOver / negOver: that rail's mA is over limit · 1000.
// - warnings(r, m): one line per rail over its limit, + first:
//     "+ rail would current-limit: the load wants 0.12 A, limit 0.05 A"
//     "− rail would current-limit: the load wants 0.12 A, limit 0.05 A"
//   (the − may be U+2212 or a hyphen). Each ≤ 120 chars.
// - report(r, m): one line ≤ 80 chars naming the set volts and a rail's mA.
// - ai.tool place_bench_supply (the default); ai.keywords exactly
//   bench supply, power supply, lab supply, dual supply, ±12, current limit.
// - examples: the issue's known answers, +12 V across 1 kΩ (pos → com) =
//   12 mA with no warning, and +12 V, limit 0.05 A, across 100 Ω = 120 mA
//   with posOver true.
// - view: { build, update } (update lights the LIMIT light; only its
//   presence is checked here).
//
// The registry-wide checks that iterate Parts.all() pick the part up by
// themselves once parts/index.js lists it: test/parts-examples.test.js (its
// examples solve to expect), test/sidebar.test.js, test/ai-tools.test.js
// (its tool is a valid declaration), test/footprint.test.js, and
// e2e/parts.spec.js / e2e/inspector.spec.js in the browser. They pass
// today only because the part does not exist yet.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out

const Parts = require('../circuit3d/js/parts');
const Sim   = require('../circuit3d/js/simulate.js');
const Ids   = require('../circuit3d/js/ids.js');

const PARTS_DIR = path.join(__dirname, '..', 'circuit3d', 'js', 'parts');

function supply() {
  const def = Parts.get('bench_supply');
  assert.ok(def, "Parts.get('bench_supply') is null: parts/bench_supply.js must exist and be listed in parts/index.js");
  return def;
}

const plain = o => JSON.parse(JSON.stringify(o));

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

// ── A tiny circuit builder: records the way App leaves them ────────────────

function circuit() {
  const components = [], wires = [];
  const byLabel = new Map();
  const add = comp => { components.push(comp); byLabel.set(comp.label, comp); return comp; };
  // An end is a hole ("tp_50") or a pin in label form ("PS1.2", pin index).
  const end = (s, side) => {
    const m = /^([A-Z]+\d+)\.(\d+)$/.exec(s);
    if (!m) return { [side + 'Hole']: holeRef(s) };
    const comp = byLabel.get(m[1]);
    assert.ok(comp, `no ${m[1]} for wire end ${s}`);
    return { [side + 'Comp']: comp, [side + 'PinIdx']: Number(m[2]) };
  };
  return {
    components, wires,
    supply(label, values) {
      return add({ type: 'bench_supply', label, pins: pinsOf(supply().pins.length), holeRefs: null,
                   values: Object.assign({ voltage: 12, limit: 0.5 }, values) });
    },
    battery(label, voltage = 9) {
      return add({ type: 'battery', label, pins: pinsOf(2), holeRefs: null, values: { voltage } });
    },
    resistor(label, a, b, ohms) {
      return add({ type: 'resistor', label, pins: pinsOf(2), holeRefs: [holeRef(a), holeRef(b)], values: { resistance: ohms } });
    },
    // cathode first, as the LED's pins are ['cathode', 'anode'].
    led(label, cathode, anode) {
      return add({ type: 'led', label, pins: pinsOf(2), holeRefs: [holeRef(cathode), holeRef(anode)],
                   values: { color: 'red', vf: 2.0, maxCurrent: 0.02, thresholdCurrent: 0.001 } });
    },
    buzzer(label, a, b) {
      return add({ type: 'buzzer', label, pins: pinsOf(2), holeRefs: [holeRef(a), holeRef(b)], values: {} });
    },
    wire(a, b) { wires.push(Object.assign({}, end(a, 'start'), end(b, 'end'))); },
    solve() {
      supply();
      const r = Sim.analyze(components, wires);
      assert.equal(r.status, 'ok', `status ${r.status}: ${(r.lines || []).map(l => l.text).join(' | ')}`);
      return r;
    },
  };
}

// The supply's { r, m, warnings } in a solved circuit.
function supplyResult(r, label = 'PS1') {
  const p = r.parts && r.parts[label];
  assert.ok(p, `analyze().parts has no ${label}; got ${JSON.stringify(Object.keys(r.parts || {}))}`);
  return p;
}

const text = r => (r.lines || []).map(l => l.text).join(' | ');
const OVER = sign => new RegExp(`^${sign} rail would current-limit: the load wants 0\\.12 A, limit 0\\.05 A$`);
const PLUS_OVER  = OVER('\\+');
const MINUS_OVER = OVER('[−-]');

// +V across `ohms`, pos → com: tp_9 → b10, R1 a10–a14, b14 → tn_15.
function plusLoad(values, ohms) {
  const c = circuit();
  c.supply('PS1', values);
  c.wire('PS1.0', 'tp_50');
  c.wire('PS1.1', 'tn_50');
  c.resistor('R1', 'a10', 'a14', ohms);
  c.wire('tp_9', 'b10');
  c.wire('b14', 'tn_15');
  return c;
}

// ── The file and its identity ─────────────────────────────────────────────

test('parts/index.js lists bench_supply.js, and the file exists', () => {
  const src = fs.readFileSync(path.join(PARTS_DIR, 'index.js'), 'utf8');
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, 'parts/index.js must keep its FILES list');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  assert.ok(files.includes('bench_supply.js'), `FILES should include 'bench_supply.js'; got ${JSON.stringify(files)}`);
  assert.ok(fs.existsSync(path.join(PARTS_DIR, 'bench_supply.js')), 'circuit3d/js/parts/bench_supply.js must exist');
});

test('both 3D pages load js/parts/bench_supply.js', () => {
  for (const page of ['circuit3d/index.html', 'circuit3d/viewer.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    assert.ok(order.includes('js/parts/bench_supply.js'), `${page} loads js/parts/bench_supply.js: ${order.join(', ')}`);
  }
});

test("identity: type bench_supply, category Sources, prefix PS (labels PS1, PS2)", () => {
  const def = supply();
  assert.equal(def.type, 'bench_supply');
  assert.equal(def.category, 'Sources');
  assert.equal(def.prefix, 'PS');
  assert.match(def.icon, /^<svg/);
  assert.ok(def.name.length > 0 && def.name.length <= 24, def.name);
  assert.equal(Ids.nextLabel([], 'bench_supply'), 'PS1');
  assert.equal(Ids.nextLabel([{ type: 'bench_supply', label: 'PS1' }], 'bench_supply'), 'PS2');
});

test("pins ['pos', 'com', 'neg', 'com2'] (#124 appends com2), ref 'com' (COM is ground), placed off the board", () => {
  const def = supply();
  assert.deepStrictEqual([...def.pins], ['pos', 'com', 'neg', 'com2']);
  assert.equal(def.ref, 'com');
  assert.deepStrictEqual(plain(def.place), { kind: 'offboard' });
});

test('values: voltage 0–30 V (12 V default), limit 1 mA–3 A (0.5 A default), and #124\'s voltage2 / limit2', () => {
  assert.deepStrictEqual(plain(supply().values), {
    voltage:  { unit: 'V', default: 12, min: 0, max: 30 },
    limit:    { unit: 'A', default: 0.5, min: 0.001, max: 3 },
    voltage2: { unit: 'V', default: 12, min: 0, max: 30, ai: false },   // kept from the AI (#124)
    limit2:   { unit: 'A', default: 0.5, min: 0.001, max: 3, ai: false },
  });
});

test('checkValue: 0 V and 30 V ok, 31 V refused; a 0.05 A limit ok, 5 A refused', () => {
  supply();
  assert.deepStrictEqual(Parts.checkValue('bench_supply', 'voltage', 0), { ok: true, value: 0 });
  assert.deepStrictEqual(Parts.checkValue('bench_supply', 'voltage', 30), { ok: true, value: 30 });
  assert.equal(Parts.checkValue('bench_supply', 'voltage', 31).ok, false);
  assert.deepStrictEqual(Parts.checkValue('bench_supply', 'limit', 0.05), { ok: true, value: 0.05 });
  assert.equal(Parts.checkValue('bench_supply', 'limit', 5).ok, false);
});

test('elements() in series: V(pos, com, volts) and V(com, neg, volts), each with an id and no limit field', () => {
  const els = supply().elements({ voltage: 12, limit: 0.5 }, {}).filter(e => e.kind !== 'SW');   // #124's com–com2 link aside
  assert.equal(els.length, 2, `two V elements; got ${JSON.stringify(els)}`);
  for (const e of els) {
    assert.equal(e.kind, 'V', JSON.stringify(e));
    assert.equal(e.volts, 12, JSON.stringify(e));
    assert.ok(e.id !== undefined, `each V names itself with an id: ${JSON.stringify(e)}`);
    assert.ok(!('limit' in e), `no limit on a V element: ${JSON.stringify(e)}`);
  }
  assert.deepStrictEqual(els.map(e => [...e.pins]).sort(), [['com', 'neg'], ['pos', 'com']]);
  assert.notEqual(els[0].id, els[1].id, 'two different ids');
  const at5 = supply().elements({ voltage: 5, limit: 0.5 }, {}).filter(e => e.kind === 'V');
  assert.deepStrictEqual(at5.map(e => e.volts), [5, 5], 'both rails track the one voltage');
});

// ── Known answers through Sim.analyze ─────────────────────────────────────

test('known answer: +12 V across 1 kΩ, pos → com, supplies 12 mA; posOver false, no warning', () => {
  supply();
  const r = plusLoad({ voltage: 12 }, 1000).solve();
  const { m, warnings } = supplyResult(r);
  assert.deepStrictEqual(Object.keys(m).sort(), ['negAmps', 'negOver', 'posAmps', 'posOver']);
  near(m.posAmps, 12, 0.01, '+ rail mA (a positive magnitude)');
  near(m.negAmps, 0, 0.001, '− rail mA with nothing on it');
  assert.equal(m.posOver, false);
  assert.equal(m.negOver, false);
  assert.deepStrictEqual(warnings, []);
  assert.doesNotMatch(text(r), /current-limit/);
});

test('known answer: +12 V, limit 0.05 A, across 100 Ω supplies 120 mA; posOver true and the warning names 0.12 A and 0.05 A', () => {
  supply();
  const r = plusLoad({ voltage: 12, limit: 0.05 }, 100).solve();
  const { m, warnings } = supplyResult(r);
  near(m.posAmps, 120, 0.1, '+ rail mA');
  assert.equal(m.posOver, true);
  assert.equal(m.negOver, false);
  assert.equal(warnings.length, 1, JSON.stringify(warnings));
  assert.match(warnings[0], PLUS_OVER);
  assert.ok(warnings[0].length <= 120, warnings[0]);
  assert.ok(r.lines.some(l => l.text.includes('+ rail would current-limit')), `the warning is a results line: ${text(r)}`);
  assert.equal(r.shorted, false, 'a warning, not a short: no constant-current mode');
});

test('known answer: ±12 V, 1 kΩ pos → com and 1 kΩ com → neg: +12 V and −12 V at the resistor ends, 12 mA on each rail, no warning', () => {
  supply();
  const c = plusLoad({ voltage: 12 }, 1000);
  c.wire('PS1.2', 'bn_50');
  c.resistor('R2', 'f20', 'f24', 1000);
  c.wire('tn_19', 'g20');   // COM → R2
  c.wire('g24', 'bn_25');   // R2 → neg
  const r = c.solve();
  const { r: pr, m, warnings } = supplyResult(r);
  near(pr.pins.pos, 12, 1e-6, 'pos vs COM');
  near(pr.pins.com, 0, 1e-9, 'COM is ground');
  near(pr.pins.neg, -12, 1e-6, 'neg vs COM');
  near(r.voltageAt(holeRef('a10')), 12, 1e-6, 'R1 at the + end');
  near(r.voltageAt(holeRef('a14')), 0, 1e-6, 'R1 at the COM end');
  near(r.voltageAt(holeRef('f20')), 0, 1e-6, 'R2 at the COM end');
  near(r.voltageAt(holeRef('f24')), -12, 1e-6, 'R2 at the − end');
  near(m.posAmps, 12, 0.01, '+ rail mA');
  near(m.negAmps, 12, 0.01, '− rail mA (a positive magnitude, like the + rail)');
  assert.deepStrictEqual([m.posOver, m.negOver], [false, false]);
  assert.deepStrictEqual(warnings, []);
});

test('the − rail over its limit: 100 Ω com → neg at 12 V, limit 0.05 A → negOver, one "− rail would current-limit" warning', () => {
  supply();
  const c = circuit();
  c.supply('PS1', { voltage: 12, limit: 0.05 });
  c.wire('PS1.0', 'tp_50');
  c.wire('PS1.1', 'tn_50');
  c.wire('PS1.2', 'bn_50');
  c.resistor('R2', 'f20', 'f24', 100);
  c.wire('tn_19', 'g20');
  c.wire('g24', 'bn_25');
  const { m, warnings } = supplyResult(c.solve());
  near(m.negAmps, 120, 0.1, '− rail mA');
  near(m.posAmps, 0, 0.001, '+ rail mA with nothing on it');
  assert.deepStrictEqual([m.posOver, m.negOver], [false, true]);
  assert.equal(warnings.length, 1, JSON.stringify(warnings));
  assert.match(warnings[0], MINUS_OVER);
});

test('both rails over: two warnings, + first then −', () => {
  supply();
  const c = plusLoad({ voltage: 12, limit: 0.05 }, 100);
  c.wire('PS1.2', 'bn_50');
  c.resistor('R2', 'f20', 'f24', 100);
  c.wire('tn_19', 'g20');
  c.wire('g24', 'bn_25');
  const { m, warnings } = supplyResult(c.solve());
  assert.deepStrictEqual([m.posOver, m.negOver], [true, true]);
  assert.equal(warnings.length, 2, JSON.stringify(warnings));
  assert.match(warnings[0], PLUS_OVER);
  assert.match(warnings[1], MINUS_OVER);
});

test('voltage 0: solves, no current, nothing over, no warning, and report() does not throw', () => {
  const def = supply();
  const r = plusLoad({ voltage: 0 }, 1000).solve();
  const res = supplyResult(r);
  near(res.m.posAmps, 0, 1e-6, '+ rail mA at 0 V');
  near(res.m.negAmps, 0, 1e-6, '− rail mA at 0 V');
  assert.deepStrictEqual([res.m.posOver, res.m.negOver], [false, false]);
  assert.deepStrictEqual(res.warnings, []);
  const line = def.report(res.r, res.m);
  assert.equal(typeof line, 'string');
  assert.ok(line.length <= 80, line);
});

test('report(): one line ≤ 80 chars with the set volts and the + rail mA ("12 … V", "12.0 mA")', () => {
  const def = supply();
  const { r, m } = supplyResult(plusLoad({ voltage: 12 }, 1000).solve());
  const line = def.report(r, m);
  assert.ok(line.length <= 80, line);
  assert.match(line, /12(\.0+)? ?V/, `names the set volts: ${line}`);
  assert.match(line, /12\.0 mA/, `names the + rail current: ${line}`);
});

// ── Mixed circuits ────────────────────────────────────────────────────────
// ±5 V. + rail: tp_3 → a2, R1 b2–b6 330 Ω, LED anode c6 / cathode c8,
// a8 → tn_8 (COM). − rail: tn_21 → a20, R2 b20–b24 220 Ω, buzzer c24–c26
// (42 Ω), a26 → bn_26 (neg, −5 V).
//   LED:    (5 − 2) / (330 + 0.1) = 9.0882 mA   → on, posAmps 9.088
//   buzzer: 5 / (220 + 42)        = 19.084 mA   → sounding, negAmps 19.08

function mixed5() {
  const c = circuit();
  c.supply('PS1', { voltage: 5 });
  c.wire('PS1.0', 'tp_50');
  c.wire('PS1.1', 'tn_50');
  c.wire('PS1.2', 'bn_50');
  c.resistor('R1', 'b2', 'b6', 330);
  c.led('LED1', 'c8', 'c6');
  c.wire('tp_3', 'a2');
  c.wire('a8', 'tn_8');
  c.resistor('R2', 'b20', 'b24', 220);
  c.buzzer('BZ1', 'c24', 'c26');
  c.wire('tn_21', 'a20');
  c.wire('a26', 'bn_26');
  return c;
}

test('±5 V mixed: the LED on + lights at 9.09 mA and the buzzer on − sounds at 19.08 mA; the supply reads both rails', () => {
  supply();
  const r = mixed5().solve();
  const led = r.parts.LED1.m, bz = r.parts.BZ1.m;
  assert.equal(led.on, true, JSON.stringify(led));
  near(led.current, 9.0882, 0.01, 'LED mA');
  assert.equal(bz.sounding, true, JSON.stringify(bz));
  near(bz.current, 19.084, 0.01, 'buzzer mA');
  const { m, warnings } = supplyResult(r);
  near(m.posAmps, 9.0882, 0.01, '+ rail mA = the LED branch');
  near(m.negAmps, 19.084, 0.01, '− rail mA = the buzzer branch');
  assert.deepStrictEqual(warnings, []);
  near(r.voltageAt(holeRef('a26')), -5, 1e-6, 'the − rail end of the buzzer');
});

test('±5 V mixed at a 15 mA limit: only the − rail (19.08 mA) warns', () => {
  supply();
  const c = mixed5();
  c.components[0].values.limit = 0.015;
  const { m, warnings } = supplyResult(c.solve());
  assert.deepStrictEqual([m.posOver, m.negOver], [false, true]);
  assert.equal(warnings.length, 1, JSON.stringify(warnings));
  assert.match(warnings[0], /^[−-] rail would current-limit/);
});

// BAT1 (9 V, placed first) on tp/tn: R1 b2–b6 470 Ω, LED c8/c6, 14.89 mA.
// PS1 (5 V) on bp/bn, its own circuit and its own ground: R2 g20–g24 1 kΩ,
// bp_20 → j20, j24 → bn_24 → 5 mA.
test('a battery circuit and a supply circuit side by side: each has its own ground and both solve', () => {
  supply();
  const c = circuit();
  c.battery('BAT1', 9);
  c.wire('BAT1.0', 'tp_50');
  c.wire('BAT1.1', 'tn_50');
  c.resistor('R1', 'b2', 'b6', 470);
  c.led('LED1', 'c8', 'c6');
  c.wire('tp_3', 'a2');
  c.wire('a8', 'tn_8');
  c.supply('PS1', { voltage: 5 });
  c.wire('PS1.0', 'bp_50');
  c.wire('PS1.1', 'bn_50');
  c.resistor('R2', 'g20', 'g24', 1000);
  c.wire('bp_20', 'j20');
  c.wire('j24', 'bn_24');
  const r = c.solve();
  assert.equal(r.parts.LED1.m.on, true);
  near(r.parts.LED1.m.current, 14.8904, 0.01, 'LED mA on the battery');
  near(r.parts.BAT1.m.current, 14.8904, 0.01, 'battery mA');
  const { m } = supplyResult(r);
  near(m.posAmps, 5, 0.01, 'supply + rail mA');
  near(r.voltageAt(holeRef('j20')), 5, 1e-6, 'the supply circuit reads from its own COM');
  near(r.voltageAt(holeRef('b2')), 9, 1e-6, 'the battery circuit reads from BAT1.1');
});

// ── The AI summary names the supply's ground, not "the battery" ───────────

test('simulationSummary: a supply-only board says voltages are measured from PS1.1 (COM), not from a battery', () => {
  supply();
  const c = plusLoad({ voltage: 12 }, 1000);
  const out = Sim.simulationSummary(c.components, c.wires, (comps, comp) => comp.label);
  assert.match(out[0], /^Status: solved\./, out[0]);
  assert.match(out[0], /PS1\.1/, `names the ref pin in label form: ${out[0]}`);
  assert.match(out[0], /\bCOM\b/i, `says it is COM: ${out[0]}`);
  assert.doesNotMatch(out[0], /battery/i, `the supply is not a battery: ${out[0]}`);
});

test('simulationSummary (guard, passes today): a battery board keeps "BAT1.1 (the first battery\'s − terminal)" word for word', () => {
  const c = circuit();
  c.battery('BAT1', 9);
  c.wire('BAT1.0', 'tp_50');
  c.wire('BAT1.1', 'tn_50');
  c.resistor('R1', 'a10', 'a14', 1000);
  c.wire('tp_9', 'b10');
  c.wire('b14', 'tn_15');
  const out = Sim.simulationSummary(c.components, c.wires, (comps, comp) => comp.label);
  assert.equal(out[0], "Status: solved. Voltages are measured from BAT1.1 (the first battery's − terminal).");
});

// ── examples: the issue's known answers ───────────────────────────────────

function exampleCircuit(ex) {
  const byLabel = new Map();
  const components = ex.parts.map(p => {
    const def = Parts.get(p.type);
    const values = {};
    for (const [k, spec] of Object.entries(def.values || {})) {
      values[k] = spec.default;
      if (spec.choices && spec.choices[spec.default]) Object.assign(values, spec.choices[spec.default]);
    }
    Object.assign(values, p.values || {});
    const comp = { type: p.type, label: p.label, pins: pinsOf(def.pins.length),
                   holeRefs: p.holes ? p.holes.map(holeRef) : null, values };
    if (p.controls) comp.controls = Object.assign({}, p.controls);
    byLabel.set(p.label, { comp, def });
    return comp;
  });
  const end = (s, side) => {
    if (/^(?:[a-j]\d+|(?:tp|tn|bn|bp)_\d+)$/.test(s)) return { [side + 'Hole']: holeRef(s) };
    const [, label, pin] = /^([A-Za-z]+\d+)\.(\w+)$/.exec(s);
    const o = byLabel.get(label);
    const idx = /^\d+$/.test(pin) ? Number(pin) : o.def.pins.indexOf(pin);
    return { [side + 'Comp']: o.comp, [side + 'PinIdx']: idx };
  };
  return { components, wires: ex.wires.map(([a, b]) => Object.assign({}, end(a, 'start'), end(b, 'end'))) };
}

function exampleWith(test) {
  const def = supply();
  const ex = (def.examples || []).find(e => {
    const ps = e.parts.find(p => p.type === 'bench_supply');
    const rs = e.parts.filter(p => p.type === 'resistor');
    return ps && rs.length === 1 && test(Object.assign({ voltage: 12, limit: 0.5 }, ps.values), rs[0].values || {});
  });
  assert.ok(ex, `no such example among ${JSON.stringify((def.examples || []).map(e => e.name))}`);
  const label = ex.parts.find(p => p.type === 'bench_supply').label;
  const { components, wires } = exampleCircuit(ex);
  const r = Sim.analyze(components, wires);
  assert.equal(r.status, 'ok', `${ex.name}: ${text(r)}`);
  return { ex, label, res: supplyResult(r, label) };
}

test('examples: +12 V across 1 kΩ is a known-answer example, expects posAmps, and solves to 12 mA with no warning', () => {
  const { ex, label, res } = exampleWith((v, rv) => v.voltage === 12 && v.limit >= 0.012 && rv.resistance === 1000);
  assert.ok(ex.expect && ex.expect[label] && 'posAmps' in ex.expect[label], `expects ${label}.posAmps: ${JSON.stringify(ex.expect)}`);
  near(res.m.posAmps, 12, 0.01, ex.name);
  assert.deepStrictEqual(res.warnings, []);
});

test('examples: +12 V, limit 0.05 A across 100 Ω is a known-answer example, expects posOver true, and solves to 120 mA', () => {
  const { ex, label, res } = exampleWith((v, rv) => v.voltage === 12 && v.limit === 0.05 && rv.resistance === 100);
  assert.ok(ex.expect && ex.expect[label] && ex.expect[label].posOver === true, `expects ${label}.posOver true: ${JSON.stringify(ex.expect)}`);
  near(res.m.posAmps, 120, 0.1, ex.name);
  assert.equal(res.m.posOver, true);
});

// ── ai spec ───────────────────────────────────────────────────────────────

test('ai: tool place_bench_supply, keywords bench supply, power supply, lab supply, dual supply, ±12, current limit', () => {
  const def = supply();
  assert.equal(def.ai.tool || 'place_' + def.type, 'place_bench_supply');
  assert.deepStrictEqual([...def.ai.keywords].sort(),
    ['bench supply', 'current limit', 'dual supply', 'lab supply', 'power supply', '±12'].sort());
  assert.ok(def.ai.about.length > 0 && def.ai.about.length <= 200, def.ai.about);
});

test('ai.guide (≤ 400 chars) names PS1.0, PS1.1 and PS1.2, says COM is ground, and says the limit only warns', () => {
  const guide = supply().ai.guide;
  assert.equal(typeof guide, 'string', 'the supply has an ai.guide');
  assert.ok(guide.length <= 400, `at most 400 characters; got ${guide.length}`);
  for (const ref of ['PS1.0', 'PS1.1', 'PS1.2']) assert.ok(guide.includes(ref), `the guide names ${ref}: ${guide}`);
  assert.match(guide, /\bCOM\b[^.]*\bground\b|\bground\b[^.]*\bCOM\b/i, `COM is ground: ${guide}`);
  assert.match(guide, /\btn_/, `the recipe wires COM to a tn rail: ${guide}`);
  assert.match(guide, /warn/i, `the limit only warns: ${guide}`);
});

// ── The browser half ──────────────────────────────────────────────────────

test('in a browser-like page with no THREE or document, bench_supply.js defines itself on window.Parts', () => {
  const file = path.join(PARTS_DIR, 'bench_supply.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/bench_supply.js must exist');
  const win = vm.createContext({ TextEncoder });
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(PARTS_DIR, 'registry.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(file, 'utf8'), win);
  const def = win.Parts.get('bench_supply');
  assert.ok(def, 'window.Parts.get("bench_supply") after loading bench_supply.js');
  assert.equal(def.elements({ voltage: 12, limit: 0.5 }, {}).filter(e => e.kind === 'V').length, 2);
});

test('parts/bench_supply.js draws only through ctx: a view.build and a view.update (the LIMIT light), no App, no document', () => {
  const file = path.join(PARTS_DIR, 'bench_supply.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/bench_supply.js must exist');
  const src = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(src, /\bApp\b/, 'the part file must not reach into App; use ctx');
  assert.doesNotMatch(src, /\bdocument\b/, 'the part file must not touch document');
  assert.equal(typeof supply().view.build, 'function');
  assert.equal(typeof supply().view.update, 'function', 'view.update shows the readouts and lights LIMIT');
  assert.match(src, /limit-light/, "the LIMIT light is a mesh named 'limit-light' (e2e/bench-supply.spec.js finds it by name)");
});

// ── docs ──────────────────────────────────────────────────────────────────

test('docs/API-CONTRACT.md has a "Pattern: off-board multi-terminal source" section', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'API-CONTRACT.md'), 'utf8');
  assert.match(doc, /^###\s*Pattern: off-board multi-terminal source/m);
});

test('docs/QA.md has one AI case for "Power an LED from the bench supply at 5 V with a series resistor"', () => {
  const qa = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'QA.md'), 'utf8');
  const rows = qa.split('\n').filter(l => l.startsWith('|') && l.includes('Power an LED from the bench supply at 5 V with a series resistor'));
  assert.equal(rows.length, 1, 'one QA row sends the bench-supply prompt');
  assert.match(rows[0], /^\| AI-\d+ \|/, 'it is an AI prompt check (AI-NN)');
});
