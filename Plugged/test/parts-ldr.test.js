// The light sensor (LDR), parts/ldr.js (issue #40): a 2-lead span part with a
// saved light-level slider, copying the potentiometer's slider + scroll
// pattern. Its definition half loads in Node through
// require('circuit3d/js/parts') and in a browser-like context with no THREE or
// document; its model is checked in the browser by e2e/ldr.spec.js and
// e2e/parts.spec.js.
//
// Shapes these tests assume (the issue and its decisions comment; stated so
// the builder matches them):
// - Identity: type 'ldr', name 'Light sensor', sub 'LDR · 2 leads',
//   category 'I/O', prefix 'LDR' (labels LDR1, LDR2…).
// - pins ['1', '2']; place { kind: 'span', span { min 2, max 4, default 3 },
//   rotations ['h', 'v'] }.
// - values.r10 { unit 'Ω', default 10000, min 1000, max 100000 }: the
//   resistance at 10 lux.
// - controls.light { type 'slider', min 1, max 10000, step 1, unit 'lux',
//   default 300, saved: true }; gestures { scroll: 'light' }.
// - elements(values, controls): one R between pins 1 and 2,
//   ohms = clamp(r10 · (light / 10)^−0.7, 100, 1e6), re-made from the
//   controls on every call (never cached).
// - measure(r) → { resistance, light }: the ohms above, and r.controls.light.
// - report(r, m) → "300 lux · 925 Ω": light, then the resistance with the
//   one SI formatter (Parts.withUnit). The decision wrote "924 Ω", a hand
//   rounding of 10000 · 30^−0.7 = 924.73 Ω; either 924 or 925 is accepted.
// - ai: tool place_ldr (the default), keywords exactly ldr, light sensor,
//   photoresistor, night light, light dependent. ai.guide lays out the
//   night light at C = 2 (decision 3, one lead per hole):
//     resistor b2–b6 at 4.7 kΩ, fed by tp_3 → a2; LED anode c6, cathode c8;
//     LDR d6–d9 (pin 1 d6, pin 2 d9); a8 → tn_8 and a9 → tn_9.
// - view: { build, update } (update brightens the face with the light; only
//   its presence is checked here).
// - examples: the issue's divider (9 V → 10 kΩ → LDR → ground) at 10 lux and
//   at 1000 lux.
//
// Kept apart from parts-registry.test.js, which resets the registry before
// every test.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out

const Parts   = require('../circuit3d/js/parts');
const Sim     = require('../circuit3d/js/simulate.js');
const Ids     = require('../circuit3d/js/ids.js');
const Chat    = require('../circuit3d/js/chat.js');
const BoardIO = require('../circuit3d/js/board-io.js');
const Server  = require('../backend/server.js');
const Recipes = require('./fixtures/recipes.js');

const PARTS_DIR = path.join(__dirname, '..', 'circuit3d', 'js', 'parts');
const N    = Recipes.HIGHEST_COL;   // 63
const ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

function ldr() {
  const def = Parts.get('ldr');
  assert.ok(def, "Parts.get('ldr') is null: parts/ldr.js must exist and be listed in parts/index.js");
  return def;
}

const plain = o => JSON.parse(JSON.stringify(o));

// The hand formula, for the expected values below.
const lawOhms = (r10, light) => Math.min(1e6, Math.max(100, r10 * Math.pow(light / 10, -0.7)));

// The one R between pins 1 and 2, whichever way round it names them.
function ohmsOf(values, controls) {
  const els = ldr().elements(values, controls);
  assert.ok(Array.isArray(els), `elements() returns a list; got ${JSON.stringify(els)}`);
  assert.equal(els.length, 1, `one element; got ${JSON.stringify(els)}`);
  const e = els[0];
  assert.equal(e.kind, 'R', `an R element; got ${JSON.stringify(e)}`);
  assert.deepStrictEqual([...e.pins].sort(), ['1', '2'], 'the R joins pins 1 and 2');
  return e.ohms;
}

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

// A PartResult for the LDR, as the core hands it to measure / report.
function result({ values, controls }) {
  return { label: 'LDR1', values: Object.assign({ r10: 10000 }, values),
           controls: Object.assign({ light: 300 }, controls),
           pins: { 1: 1.48, 2: 0 }, current: {}, modes: {}, open: {} };
}

// ── The file and its identity ─────────────────────────────────────────────

test('parts/index.js lists ldr.js, and the file exists', () => {
  const src = fs.readFileSync(path.join(PARTS_DIR, 'index.js'), 'utf8');
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, 'parts/index.js must keep its FILES list');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  assert.ok(files.includes('ldr.js'), `FILES should include 'ldr.js'; got ${JSON.stringify(files)}`);
  assert.ok(fs.existsSync(path.join(PARTS_DIR, 'ldr.js')), 'circuit3d/js/parts/ldr.js must exist');
});

test('both 3D pages load js/parts/ldr.js', () => {
  for (const page of ['circuit3d/index.html', 'circuit3d/viewer.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    assert.ok(order.includes('js/parts/ldr.js'), `${page} loads js/parts/ldr.js: ${order.join(', ')}`);
  }
});

test('identity: type ldr, "Light sensor", "LDR · 2 leads", I/O, prefix LDR (labels LDR1, LDR2)', () => {
  const def = ldr();
  assert.equal(def.type, 'ldr');
  assert.equal(def.name, 'Light sensor');
  assert.equal(def.sub, 'LDR · 2 leads');
  assert.equal(def.category, 'I/O');
  assert.equal(def.prefix, 'LDR');
  assert.match(def.icon, /^<svg/);
  assert.equal(Ids.nextLabel([], 'ldr'), 'LDR1');
  assert.equal(Ids.nextLabel([{ type: 'ldr', label: 'LDR1' }], 'ldr'), 'LDR2');
});

test("pins ['1', '2']; a span part, 2–4 columns (3 by default), rotations h and v", () => {
  const def = ldr();
  assert.deepStrictEqual([...def.pins], ['1', '2']);
  assert.deepStrictEqual(plain(def.place), { kind: 'span', span: { min: 2, max: 4, default: 3 }, rotations: ['h', 'v'] });
});

test('checkPlacement on the LDR: d6→d9 ok, d6→d8 ok, d6→d7 and d6→d11 refused with "2–4", e6→f6 across the gap ok', () => {
  ldr();
  const place = (a, b) => Parts.checkPlacement('ldr',
    [{ pin: '1', ...holeRef(a) }, { pin: '2', ...holeRef(b) }], new Map(), { cols: N, bodyRows: ROWS });
  assert.deepStrictEqual(place('d6', 'd9'), { ok: true });
  assert.deepStrictEqual(place('d6', 'd8'), { ok: true });
  assert.equal(place('d6', 'd7').ok, false, 'one column apart is under the 2-column minimum');
  const far = place('d6', 'd11');
  assert.equal(far.ok, false);
  assert.ok(far.reason.includes('2–4'), far.reason);
  assert.deepStrictEqual(place('e6', 'f6'), { ok: true });
});

// ── Values and controls ───────────────────────────────────────────────────

test('values.r10: Ω, 10 kΩ by default, 1 kΩ–100 kΩ (the resistance at 10 lux)', () => {
  assert.deepStrictEqual(plain(ldr().values), {
    r10: { unit: 'Ω', default: 10000, min: 1000, max: 100000 },
  });
});

test('checkValue on the LDR: 47 kΩ ok, 500 Ω refused with the range 1 kΩ–100 kΩ', () => {
  ldr();
  assert.deepStrictEqual(Parts.checkValue('ldr', 'r10', 47000), { ok: true, value: 47000 });
  assert.deepStrictEqual(Parts.checkValue('ldr', 'r10', 500),
    { ok: false, reason: 'r10 must be 1 kΩ–100 kΩ; got 500' });
});

test('controls.light: a saved slider, 1–10000 lux, step 1, 300 by default; the scroll gesture moves it', () => {
  const def = ldr();
  assert.deepStrictEqual(plain(def.controls), {
    light: { type: 'slider', default: 300, min: 1, max: 10000, step: 1, unit: 'lux', saved: true },
  });
  assert.deepStrictEqual(plain(def.gestures), { scroll: 'light' });
});

// ── elements(): R = clamp(r10 · (light/10)^−0.7, 100, 1e6) ────────────────

test('elements() at 10 lux: R is r10 exactly (10 kΩ; 47 kΩ for r10 = 47 kΩ)', () => {
  near(ohmsOf({ r10: 10000 }, { light: 10 }), 10000, 1e-6, '10 kΩ at 10 lux');
  near(ohmsOf({ r10: 47000 }, { light: 10 }), 47000, 1e-6, '47 kΩ at 10 lux');
});

test('elements() at 1000 lux: 10 kΩ · 100^−0.7 = 398.1 Ω; at 1 lux: 10 kΩ · 10^0.7 = 50119 Ω', () => {
  near(ohmsOf({ r10: 10000 }, { light: 1000 }), 398.107, 0.01, '1000 lux');
  near(ohmsOf({ r10: 10000 }, { light: 1 }), 50118.72, 0.05, '1 lux');
});

test('elements() at the default 300 lux: 10 kΩ · 30^−0.7 = 924.7 Ω', () => {
  near(ohmsOf({ r10: 10000 }, { light: 300 }), 924.730, 0.01, '300 lux');
});

test('elements() at 10000 lux: 10 kΩ · 1000^−0.7 = 79.4 Ω is clamped up to 100 Ω', () => {
  near(ohmsOf({ r10: 10000 }, { light: 10000 }), 100, 1e-9, '10000 lux, clamped');
  near(ohmsOf({ r10: 1000 }, { light: 5000 }), 100, 1e-9, 'r10 1 kΩ at 5000 lux (12.9 Ω), clamped');
});

test('changing controls.light changes the element (nothing is cached between calls)', () => {
  const v = { r10: 10000 };
  near(ohmsOf(v, { light: 10 }), 10000, 1e-6, '10 lux');
  near(ohmsOf(v, { light: 1000 }), 398.107, 0.01, 'then 1000 lux');
  near(ohmsOf(v, { light: 10 }), 10000, 1e-6, 'then 10 lux again');
  near(ohmsOf({ r10: 20000 }, { light: 100 }), lawOhms(20000, 100), 0.01, 'r10 20 kΩ at 100 lux (3990.5 Ω)');
});

// ── measure() and report() ────────────────────────────────────────────────

test('measure(): { resistance, light } from the values and the controls', () => {
  const def = ldr();
  assert.equal(typeof def.measure, 'function', 'the LDR defines measure()');
  const m = plain(def.measure(result({ controls: { light: 300 } })));
  assert.deepStrictEqual(Object.keys(m).sort(), ['light', 'resistance']);
  assert.equal(m.light, 300);
  near(m.resistance, 924.730, 0.01, 'resistance at 300 lux');
  const dark = plain(def.measure(result({ controls: { light: 10 }, values: { r10: 47000 } })));
  assert.equal(dark.light, 10);
  near(dark.resistance, 47000, 1e-6, 'resistance at 10 lux, r10 47 kΩ');
});

test('report(): "300 lux · 925 Ω" at the default; "10 lux · 10 kΩ"; "1000 lux · 398 Ω"', () => {
  const def = ldr();
  const line = r => def.report(r, def.measure(r));
  const at300 = line(result({ controls: { light: 300 } }));
  assert.match(at300, /^300 lux · 92[45] Ω$/, `924.73 Ω at 300 lux; got "${at300}"`);
  assert.match(line(result({ controls: { light: 10 } })), /^10 lux · 10(\.0)? kΩ$/);
  assert.equal(line(result({ controls: { light: 1000 } })), '1000 lux · 398 Ω');
  assert.ok(at300.length <= 80, at300);
});

// ── The simulator: the issue's divider, 9 V → 10 kΩ → LDR → ground ─────────
// Battery on the rails; tp_10 → a10; resistor b10–b14 at 10 kΩ; LDR c14
// (pin 1) – c17 (pin 2); a17 → tn_17. The LDR's volts = 9 · R / (10000 + R):
//   10 lux:   R = 10 kΩ    → 4.500 V
//   1000 lux: R = 398.1 Ω  → 9 · 398.1 / 10398.1 = 0.345 V

function divider(light) {
  const bat = { type: 'battery', label: 'BAT1', pins: pinsOf(2), holeRefs: null, values: { voltage: 9 } };
  const r1  = { type: 'resistor', label: 'R1', pins: pinsOf(2), holeRefs: ['b10', 'b14'].map(holeRef),
                values: { resistance: 10000 } };
  const cell = { type: 'ldr', label: 'LDR1', pins: pinsOf(2), holeRefs: ['c14', 'c17'].map(holeRef),
                 values: { r10: 10000 }, controls: { light } };
  const w = (a, b) => ({ startHole: holeRef(a), endHole: holeRef(b) });
  const wires = [{ startComp: bat, startPinIdx: 0, endHole: holeRef('tp_50') },
                 { startComp: bat, startPinIdx: 1, endHole: holeRef('tn_50') },
                 w('tp_10', 'a10'), w('a17', 'tn_17')];
  return { components: [bat, r1, cell], wires, cell };
}

// The volts across the LDR (pin 1 minus pin 2) in a solved circuit.
function ldrVolts(components, wires, label = 'LDR1') {
  const r = Sim.analyze(components, wires);
  assert.equal(r.status, 'ok', `status ${r.status}: ${(r.lines || []).map(l => l.text).join(' | ')}`);
  const p = r.parts && r.parts[label];
  assert.ok(p, `analyze().parts has no ${label}; got ${JSON.stringify(Object.keys(r.parts || {}))}`);
  assert.ok(Number.isFinite(p.r.pins['1']) && Number.isFinite(p.r.pins['2']), `both LDR pins solved: ${JSON.stringify(p.r.pins)}`);
  return { volts: p.r.pins['1'] - p.r.pins['2'], m: p.m };
}

test('known answer: the divider at 10 lux puts 4.5 V across the LDR (±0.05)', () => {
  ldr();
  const c = divider(10);
  const { volts, m } = ldrVolts(c.components, c.wires);
  near(volts, 4.5, 0.05, 'divider at 10 lux');
  assert.equal(m.light, 10);
  near(m.resistance, 10000, 1e-6, 'measure().resistance at 10 lux');
});

test('known answer: the divider at 1000 lux puts 0.30–0.40 V across the LDR (hand: 0.345 V)', () => {
  ldr();
  const c = divider(1000);
  const { volts } = ldrVolts(c.components, c.wires);
  assert.ok(volts >= 0.30 && volts <= 0.40, `divider at 1000 lux: expected 0.30–0.40 V, got ${volts}`);
  near(volts, 0.3446, 0.005, 'divider at 1000 lux');
});

test('the same record re-simulated after its light changes gives the new divider volts', () => {
  ldr();
  const c = divider(10);
  near(ldrVolts(c.components, c.wires).volts, 4.5, 0.05, '10 lux');
  c.cell.controls.light = 1000;
  near(ldrVolts(c.components, c.wires).volts, 0.3446, 0.005, 'then 1000 lux');
  c.cell.controls.light = 10;
  near(ldrVolts(c.components, c.wires).volts, 4.5, 0.05, 'and back to 10 lux');
});

// ── examples: the issue's divider at 10 and 1000 lux ───────────────────────
// Each example is built into records and solved; the LDR's own volts must be
// the known answer, whatever the example's `expect` lists
// (test/parts-examples.test.js checks the `expect` itself).

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

function dividerExample(light) {
  const def = ldr();
  const ex = (def.examples || []).find(e => e.parts.some(p => p.type === 'ldr' && p.controls && p.controls.light === light)
    && e.parts.some(p => p.type === 'resistor' && p.values && p.values.resistance === 10000)
    && e.parts.some(p => p.type === 'battery'));
  assert.ok(ex, `no example with a battery, a 10 kΩ resistor and an LDR at ${light} lux: ${JSON.stringify(def.examples)}`);
  assert.ok(ex.expect && Object.keys(ex.expect).length > 0, `the ${light} lux example expects something: ${JSON.stringify(ex)}`);
  const label = ex.parts.find(p => p.type === 'ldr').label;
  const { components, wires } = exampleCircuit(ex);
  return ldrVolts(components, wires, label).volts;
}

test('examples: the divider at 10 lux is a known-answer example, and solves to 4.5 V across the LDR', () => {
  near(dividerExample(10), 4.5, 0.05, 'the 10 lux example');
});

test('examples: the divider at 1000 lux is a known-answer example, and solves to 0.30–0.40 V across the LDR', () => {
  const v = dividerExample(1000);
  assert.ok(v >= 0.30 && v <= 0.40, `the 1000 lux example: expected 0.30–0.40 V, got ${v}`);
});

// ── The night light (decision 3) through the AI apply path ──────────────────
// At C = 2, one lead per hole: tp_3 → a2; resistor b2–b6 at 4.7 kΩ; LED
// anode c6, cathode c8; LDR d6 (pin 1) – d9 (pin 2); a8 → tn_8; a9 → tn_9.
// The LED sits in parallel with the LDR, fed through 4.7 kΩ. Hand-computed
// (red LED, vf 2.0, ron 0.1; "on" needs ≥ 1 mA):
//   node volts without the LED = 9 · R / (4700 + R)
//   300 lux:  R = 924.7 Ω → 1.48 V < vf → off
//   1000 lux: R = 398.1 Ω → 0.70 V       → off
//   10 lux:   R = 10 kΩ   → Vth 6.122 V, Rth 3197.3 Ω
//             I = (6.122 − 2) / 3197.4 = 1.289 mA = (9 − 2)/4700 − 2/10000 → on
//   1 lux:    R = 50119 Ω → Vth 8.228 V, Rth 4297.0 Ω → I = 1.449 mA → on

const wire = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });
const NIGHT_LIGHT = [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  wire('BAT1.0', `tp_${N}`, 'red'),
  wire('BAT1.1', `tn_${N}`, 'black'),
  { tool: 'place_resistor', holeA: 'b2', holeB: 'b6', resistance: 4700 },
  wire('tp_3', 'a2', 'red'),
  { tool: 'place_led', holeA: 'c8', holeB: 'c6' },   // cathode c8, anode c6
  { tool: 'place_ldr', holeA: 'd6', holeB: 'd9' },   // pin 1 d6, pin 2 d9
  wire('a8', 'tn_8', 'black'),
  wire('a9', 'tn_9', 'black'),
];

// A board that keeps real records the way App leaves them (as in
// test/parts-potentiometer.test.js), so Sim.analyze can solve it.
function simBoard() {
  let parts = [], wires = [];
  const notes = [];
  const wireEnd = (e, side) => (e.hole
    ? { [side + 'Hole']: { col: e.hole.col, row: e.hole.row }, [side + 'Comp']: null, [side + 'PinIdx']: undefined }
    : { [side + 'Hole']: null, [side + 'Comp']: e.comp, [side + 'PinIdx']: e.pin });
  const valuesFor = (type, given) => {
    const def = Parts.get(type);
    const v = {};
    for (const [key, spec] of Object.entries(def.values || {})) v[key] = spec.default;
    Object.assign(v, given || {});
    for (const [key, spec] of Object.entries(def.values || {})) {
      if (spec.choices && spec.choices[v[key]]) Object.assign(v, spec.choices[v[key]]);
    }
    return v;
  };
  return {
    notes,
    note: text => notes.push(text),
    components: () => parts,
    batterySpot: () => ({ x: 15.8, z: -3.15 }),
    parseHole: s => holeRef(s),
    getHole: (col, row) => (ROWS.includes(row) || ['tp', 'tn', 'bp', 'bn'].includes(row)) && col >= 0 && col < N
      ? { col, row } : null,
    holeMap: () => BoardIO.buildHoleMap(parts, wires),
    placePart(type, where, values) {
      const def = Parts.get(type);
      const rec = {
        type, label: Ids.nextLabel(parts, type),
        pins: def.pins.map(() => ({ x: 0, y: 0, z: 0 })),
        holeRefs: Array.isArray(where) ? where.map(h => ({ col: h.col, row: h.row })) : null,
        values: valuesFor(type, values),
      };
      if (def.controls) {
        rec.controls = {};
        for (const [k, c] of Object.entries(def.controls)) rec.controls[k] = c.default;
      }
      parts.push(rec);
      return rec;
    },
    clearAll() { parts = []; wires = []; },
    addWire(from, to) {
      wires.push(Object.assign({}, wireEnd(from, 'start'), wireEnd(to, 'end')));
      return true;
    },
    batch: fn => fn(),
    solve: () => Sim.analyze(parts, wires),
  };
}

function nightLight() {
  ldr();
  const board = simBoard();
  const out = Chat.acceptBuild(NIGHT_LIGHT, board);
  assert.deepEqual(out, { applied: NIGHT_LIGHT.length, failed: 0 }, `applied, notes ${JSON.stringify(board.notes)}`);
  const cell = board.components().find(c => c.type === 'ldr');
  assert.ok(cell, 'the LDR is on the board');
  return { board, cell };
}

function ledAt(board) {
  const r = board.solve();
  assert.equal(r.status, 'ok', `status ${r.status}: ${(r.lines || []).map(l => l.text).join(' | ')}`);
  assert.ok(r.parts.LED1, `analyze().parts has no LED1; got ${JSON.stringify(Object.keys(r.parts))}`);
  return r.parts.LED1.m;
}

test('the night light places LDR1 on d6 (pin 1) and d9 (pin 2), 10 kΩ at 10 lux, at 300 lux by default; R1 is 4.7 kΩ', () => {
  const { board, cell } = nightLight();
  assert.equal(cell.label, 'LDR1');
  assert.deepStrictEqual(Parts.legsOf(cell).map(l => [l.pin, l.hole]), [['1', 'd6'], ['2', 'd9']]);
  assert.deepStrictEqual(cell.values, { r10: 10000 });
  assert.deepStrictEqual(cell.controls, { light: 300 });
  assert.equal(board.components().find(c => c.label === 'R1').values.resistance, 4700);
});

test('night light at the default 300 lux: the LED is off (the node sits at 1.48 V, under vf)', () => {
  const { board } = nightLight();
  const led = ledAt(board);
  assert.equal(led.on, false, `LED at 300 lux: ${JSON.stringify(led)}`);
});

test('night light at 1000 lux: the LED is off', () => {
  const { board, cell } = nightLight();
  cell.controls.light = 1000;
  const led = ledAt(board);
  assert.equal(led.on, false, `LED at 1000 lux: ${JSON.stringify(led)}`);
});

test('night light at 10 lux: the LED lights at 1.289 mA ((9 − 2)/4700 − 2/10000)', () => {
  const { board, cell } = nightLight();
  cell.controls.light = 10;
  const led = ledAt(board);
  assert.equal(led.on, true, `LED at 10 lux: ${JSON.stringify(led)}`);
  near(led.current, 1.2893, 0.01, 'LED mA at 10 lux');
});

test('darkening the same night light 1000 → 300 → 10 → 1 lux: off, off, on (1.29 mA), on (1.45 mA)', () => {
  const { board, cell } = nightLight();
  const seen = [1000, 300, 10, 1].map(l => { cell.controls.light = l; return ledAt(board); });
  assert.deepStrictEqual(seen.map(m => m.on), [false, false, true, true], JSON.stringify(seen));
  near(seen[3].current, 1.4494, 0.01, 'LED mA at 1 lux');
});

test('the night light uses no hole twice, passes findCircuitProblems with no problem, and finishAIReply untouched', () => {
  ldr();
  const holes = [];
  for (const a of NIGHT_LIGHT) {
    if (a.holeA) holes.push(a.holeA, a.holeB);
    if (a.tool === 'add_wire') for (const e of [a.from, a.to]) if (!/^BAT/.test(e)) holes.push(e);
  }
  assert.deepStrictEqual(holes.filter((h, i) => holes.indexOf(h) !== i), [], 'one lead per hole');
  assert.deepStrictEqual(Server.findCircuitProblems(NIGHT_LIGHT.map(a => ({ ...a }))), []);
  const out = Server.finishAIReply({ reply: 'Built it.', actions: NIGHT_LIGHT.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, NIGHT_LIGHT);
  assert.equal(out.reply, 'Built it.');
});

// ── Save and load ─────────────────────────────────────────────────────────

test('a placed LDR saves one named holeRef per pin; loaded back with light 42 it sits on the same holes and simulates at 42 lux', () => {
  ldr();
  const comp = { type: 'ldr', label: 'LDR1', values: { r10: 10000 }, controls: { light: 42 },
                 holeRefs: [holeRef('c14'), holeRef('c17')], pins: pinsOf(2) };
  const saved = BoardIO.saveHoleRefs(comp);
  assert.deepStrictEqual(saved, [{ pin: '1', col: 13, row: 'c' }, { pin: '2', col: 16, row: 'c' }]);
  const record = JSON.parse(JSON.stringify({ type: 'ldr', label: 'LDR1', values: comp.values, controls: comp.controls, holeRefs: saved }));
  const loaded = { type: 'ldr', label: 'LDR1', values: record.values, controls: record.controls, pins: pinsOf(2),
                   holeRefs: BoardIO.loadHoleRefs(record) };
  assert.deepStrictEqual(Parts.legsOf(loaded).map(l => [l.pin, l.hole]), [['1', 'c14'], ['2', 'c17']]);
  assert.deepStrictEqual(loaded.controls, { light: 42 });
  near(ohmsOf(loaded.values, loaded.controls), lawOhms(10000, 42), 0.01, 'R at 42 lux (3662 Ω)');
  const c = divider(42);
  c.components[2] = loaded;   // the loaded record in the divider, on the same holes
  const { volts, m } = ldrVolts(c.components, c.wires);
  assert.equal(m.light, 42);
  near(volts, 9 * lawOhms(10000, 42) / (10000 + lawOhms(10000, 42)), 0.01, 'divider at 42 lux');
});

// ── The server: tools, selection ──────────────────────────────────────────

const decl = name => Server.CIRCUIT_TOOLS[0].function_declarations.find(d => d.name === name);

test('the generated place_ldr tool takes holeA and holeB (both required)', () => {
  ldr();
  const t = decl('place_ldr');
  assert.ok(t, `no place_ldr tool; tools: ${Server.CIRCUIT_TOOLS[0].function_declarations.map(d => d.name).join(', ')}`);
  assert.ok(t.parameters.properties.holeA && t.parameters.properties.holeB, JSON.stringify(t.parameters));
  assert.deepStrictEqual([...t.parameters.required].sort(), ['holeA', 'holeB']);
});

test('ai: tool place_ldr, keywords ldr, light sensor, photoresistor, night light, light dependent', () => {
  const def = ldr();
  assert.equal(def.ai.tool || 'place_' + def.type, 'place_ldr');
  assert.deepStrictEqual([...def.ai.keywords].sort(),
    ['ldr', 'light dependent', 'light sensor', 'night light', 'photoresistor']);
  assert.ok(def.ai.about.length > 0);
});

test('ai.guide lays out the night light at C = 2 with its exact holes and a 4.7 kΩ resistor', () => {
  const guide = ldr().ai.guide;
  assert.equal(typeof guide, 'string', 'the LDR has an ai.guide');
  assert.ok(guide.length <= 400, `at most 400 characters; got ${guide.length}`);
  for (const h of ['tp_3', 'a2', 'b2', 'b6', 'c6', 'c8', 'd6', 'd9', 'a8', 'tn_8', 'a9', 'tn_9']) {
    assert.match(guide, new RegExp(`(^|[^a-z0-9_])${h}(?![0-9])`), `the night-light layout names ${h}: ${guide}`);
  }
  assert.match(guide, /4700|4\.7 ?k/i, `the recipe asks for a 4.7 kΩ resistor: ${guide}`);
});

test('selectTools("Build a night light that turns an LED on when it gets dark") sends place_ldr, place_led and place_resistor', () => {
  ldr();
  const got = Server.selectTools('Build a night light that turns an LED on when it gets dark', []).map(d => d.name);
  for (const n of ['place_ldr', 'place_led', 'place_resistor']) {
    assert.ok(got.includes(n), `${n} missing from ${JSON.stringify(got)}`);
  }
});

// ── The browser half ──────────────────────────────────────────────────────

test('in a browser-like page with no THREE or document, ldr.js defines itself on window.Parts', () => {
  const file = path.join(PARTS_DIR, 'ldr.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/ldr.js must exist');
  const win = vm.createContext({ TextEncoder });
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(PARTS_DIR, 'registry.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(file, 'utf8'), win);
  const def = win.Parts.get('ldr');
  assert.ok(def, 'window.Parts.get("ldr") after loading ldr.js');
  assert.equal(def.elements({ r10: 10000 }, { light: 10 }).length, 1);
});

test('parts/ldr.js draws only through ctx: a view.build and a view.update, no App, no document', () => {
  const file = path.join(PARTS_DIR, 'ldr.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/ldr.js must exist');
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /\bview\s*:/, 'a view: { build, update } section');
  assert.doesNotMatch(src, /\bApp\b/, 'the part file must not reach into App; use ctx');
  assert.doesNotMatch(src, /\bdocument\b/, 'the part file must not touch document');
  assert.equal(typeof ldr().view.build, 'function');
  assert.equal(typeof ldr().view.update, 'function', 'view.update brightens the face with the light (decision 2)');
});

// ── docs ──────────────────────────────────────────────────────────────────

test('docs/QA.md has one AI case for "Build a night light that turns an LED on when it gets dark"', () => {
  const qa = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'QA.md'), 'utf8');
  const rows = qa.split('\n').filter(l => l.startsWith('|') && l.includes('Build a night light that turns an LED on when it gets dark'));
  assert.equal(rows.length, 1, 'one QA row sends the night-light prompt');
  assert.match(rows[0], /^\| AI-\d+ \|/, 'it is an AI prompt check (AI-NN)');
});
