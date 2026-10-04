// The thermistor (NTC 10 kΩ), parts/thermistor.js (issue #41): a 2-lead span
// part with a saved temperature slider, copying the light sensor's
// (parts/ldr.js) slider + scroll pattern. Its definition half loads in Node
// through require('circuit3d/js/parts') and in a browser-like context with no
// THREE or document; its model is checked in the browser by
// e2e/thermistor.spec.js and e2e/parts.spec.js.
//
// Shapes these tests assume (the issue and its decisions comment; stated so
// the builder matches them):
// - Identity: type 'thermistor', name 'Thermistor', sub 'NTC · 2 leads',
//   category 'I/O', prefix 'TH' (labels TH1, TH2…).
// - pins ['1', '2']; place { kind: 'span', span { min 2, max 4, default 3 },
//   rotations ['h', 'v'] }.
// - values.r25 { unit 'Ω', default 10000, min 1000, max 100000 }: the
//   resistance at 25 °C. B = 3950, a constant (not a value).
// - controls.temperature { type 'slider', min −20, max 120, step 1,
//   unit '°C', default 25, saved: true }; gestures { scroll: 'temperature' }.
// - elements(values, controls): one R between pins 1 and 2,
//   ohms = r25 · exp(3950 · (1/(T + 273.15) − 1/298.15)), re-made from the
//   controls on every call (never cached). No clamp is needed: over the
//   slider's −20–120 °C the formula stays 407 Ω–105 kΩ for r25 = 10 kΩ, and
//   these tests pin what the formula gives at both ends.
// - measure(r) → { resistance, temperature }.
// - report(r, m) → "25 °C · 10 kΩ": the temperature, then the resistance
//   with the one SI formatter (Parts.withUnit).
// - ai: tool place_thermistor (the default); keywords include the issue's
//   thermistor, ntc, temperature sensor, heat, thermometer. ai.guide lays out
//   the temperature alarm at C = 2 (decision 3, one lead per hole):
//     tp_3 → a2; thermistor b2–b5 (pin 1 b2, pin 2 b5); resistor c5–c9 at
//     3.3 kΩ; buzzer d9–d11; a11 → tn_11.
// - selectTools("Build a temperature alarm that sounds a buzzer when it gets
//   hot") must send place_thermistor. None of the issue's five keywords is in
//   that sentence ("temperature" alone, "hot"), so the part needs a keyword
//   that is (e.g. 'temperature' or 'hot').
// - view: { build, update } (update tints the bead with the temperature; only
//   its presence is checked here).
// - examples: the issue's divider (9 V → 10 kΩ → thermistor → ground) at
//   25 °C and at 50 °C.
//
// Hand-computed, R(T) = 10000 · exp(3950 · (1/(T+273.15) − 1/298.15)):
//   −20 °C → 105384.7 Ω   25 °C → 10000 Ω   32 °C → 7379.3 Ω
//    38 °C → 5749.2 Ω      39 °C → 5520.1 Ω  50 °C → 3588.2 Ω   120 °C → 407.1 Ω
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

function thermistor() {
  const def = Parts.get('thermistor');
  assert.ok(def, "Parts.get('thermistor') is null: parts/thermistor.js must exist and be listed in parts/index.js");
  return def;
}

const plain = o => JSON.parse(JSON.stringify(o));

// The hand formula (beta model, B = 3950), for the expected values below.
const lawOhms = (r25, t) => r25 * Math.exp(3950 * (1 / (t + 273.15) - 1 / 298.15));

// The one R between pins 1 and 2, whichever way round it names them.
function ohmsOf(values, controls) {
  const els = thermistor().elements(values, controls);
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

// A PartResult for the thermistor, as the core hands it to measure / report.
function result({ values, controls }) {
  return { label: 'TH1', values: Object.assign({ r25: 10000 }, values),
           controls: Object.assign({ temperature: 25 }, controls),
           pins: { 1: 4.5, 2: 0 }, current: {}, modes: {}, open: {} };
}

// ── The file and its identity ─────────────────────────────────────────────

test('parts/index.js lists thermistor.js, and the file exists', () => {
  const src = fs.readFileSync(path.join(PARTS_DIR, 'index.js'), 'utf8');
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, 'parts/index.js must keep its FILES list');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  assert.ok(files.includes('thermistor.js'), `FILES should include 'thermistor.js'; got ${JSON.stringify(files)}`);
  assert.ok(fs.existsSync(path.join(PARTS_DIR, 'thermistor.js')), 'circuit3d/js/parts/thermistor.js must exist');
});

test('both 3D pages load js/parts/thermistor.js', () => {
  for (const page of ['circuit3d/index.html', 'circuit3d/viewer.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    assert.ok(order.includes('js/parts/thermistor.js'), `${page} loads js/parts/thermistor.js: ${order.join(', ')}`);
  }
});

test('identity: type thermistor, "Thermistor", "NTC · 2 leads", I/O, prefix TH (labels TH1, TH2)', () => {
  const def = thermistor();
  assert.equal(def.type, 'thermistor');
  assert.equal(def.name, 'Thermistor');
  assert.equal(def.sub, 'NTC · 2 leads');
  assert.equal(def.category, 'I/O');
  assert.equal(def.prefix, 'TH');
  assert.match(def.icon, /^<svg/);
  assert.equal(Ids.nextLabel([], 'thermistor'), 'TH1');
  assert.equal(Ids.nextLabel([{ type: 'thermistor', label: 'TH1' }], 'thermistor'), 'TH2');
});

test("pins ['1', '2']; a span part, 2–4 columns (3 by default), rotations h and v", () => {
  const def = thermistor();
  assert.deepStrictEqual([...def.pins], ['1', '2']);
  assert.deepStrictEqual(plain(def.place), { kind: 'span', span: { min: 2, max: 4, default: 3 }, rotations: ['h', 'v'] });
});

test('checkPlacement on the thermistor: b2→b5 ok, b2→b4 ok, b2→b3 and b2→b7 refused with "2–4", e6→f6 across the gap ok', () => {
  thermistor();
  const place = (a, b) => Parts.checkPlacement('thermistor',
    [{ pin: '1', ...holeRef(a) }, { pin: '2', ...holeRef(b) }], new Map(), { cols: N, bodyRows: ROWS });
  assert.deepStrictEqual(place('b2', 'b5'), { ok: true });
  assert.deepStrictEqual(place('b2', 'b4'), { ok: true });
  assert.equal(place('b2', 'b3').ok, false, 'one column apart is under the 2-column minimum');
  const far = place('b2', 'b7');
  assert.equal(far.ok, false);
  assert.ok(far.reason.includes('2–4'), far.reason);
  assert.deepStrictEqual(place('e6', 'f6'), { ok: true });
});

// ── Values and controls ───────────────────────────────────────────────────

test('values.r25: Ω, 10 kΩ by default, 1 kΩ–100 kΩ (the resistance at 25 °C); B is not a value', () => {
  assert.deepStrictEqual(plain(thermistor().values), {
    r25: { unit: 'Ω', default: 10000, min: 1000, max: 100000 },
  });
});

test('checkValue on the thermistor: 47 kΩ ok, 500 Ω refused with the range 1 kΩ–100 kΩ', () => {
  thermistor();
  assert.deepStrictEqual(Parts.checkValue('thermistor', 'r25', 47000), { ok: true, value: 47000 });
  assert.deepStrictEqual(Parts.checkValue('thermistor', 'r25', 500),
    { ok: false, reason: 'r25 must be 1 kΩ–100 kΩ; got 500' });
});

test('controls.temperature: a saved slider, −20–120 °C, step 1, 25 by default; the scroll gesture moves it', () => {
  const def = thermistor();
  assert.deepStrictEqual(plain(def.controls), {
    temperature: { type: 'slider', default: 25, min: -20, max: 120, step: 1, unit: '°C', saved: true },
  });
  assert.deepStrictEqual(plain(def.gestures), { scroll: 'temperature' });
});

// ── elements(): R = r25 · exp(3950 · (1/(T+273.15) − 1/298.15)) ─────────────

test('elements() at 25 °C: R is r25 exactly (10 kΩ; 47 kΩ for r25 = 47 kΩ)', () => {
  near(ohmsOf({ r25: 10000 }, { temperature: 25 }), 10000, 1e-6, '10 kΩ at 25 °C');
  near(ohmsOf({ r25: 47000 }, { temperature: 25 }), 47000, 1e-6, '47 kΩ at 25 °C');
});

test('elements() at 50 °C: 3.5–3.7 kΩ (hand: 3588.2 Ω); at 38 °C: 5749.2 Ω', () => {
  const r50 = ohmsOf({ r25: 10000 }, { temperature: 50 });
  assert.ok(r50 >= 3500 && r50 <= 3700, `the issue's known answer at 50 °C is 3.5–3.7 kΩ; got ${r50}`);
  near(r50, 3588.18, 0.5, '50 °C');
  near(ohmsOf({ r25: 10000 }, { temperature: 38 }), 5749.21, 0.5, '38 °C');
});

test('elements() at the slider ends, with no clamp: −20 °C → 105.4 kΩ, 120 °C → 407.1 Ω', () => {
  near(ohmsOf({ r25: 10000 }, { temperature: -20 }), 105384.7, 5, '−20 °C');
  near(ohmsOf({ r25: 10000 }, { temperature: 120 }), 407.09, 0.1, '120 °C');
});

test('NTC: hotter is always lower resistance across the slider', () => {
  let last = Infinity;
  for (let t = -20; t <= 120; t += 7) {
    const r = ohmsOf({ r25: 10000 }, { temperature: t });
    assert.ok(r < last, `R(${t} °C) = ${r} should be below R(${t - 7} °C) = ${last}`);
    last = r;
  }
});

test('changing controls.temperature changes the element (nothing is cached between calls)', () => {
  const v = { r25: 10000 };
  near(ohmsOf(v, { temperature: 25 }), 10000, 1e-6, '25 °C');
  near(ohmsOf(v, { temperature: 50 }), 3588.18, 0.5, 'then 50 °C');
  near(ohmsOf(v, { temperature: 25 }), 10000, 1e-6, 'then 25 °C again');
  near(ohmsOf({ r25: 20000 }, { temperature: 0 }), lawOhms(20000, 0), 1, 'r25 20 kΩ at 0 °C');
});

// ── measure() and report() ────────────────────────────────────────────────

test('measure(): { resistance, temperature } from the values and the controls', () => {
  const def = thermistor();
  assert.equal(typeof def.measure, 'function', 'the thermistor defines measure()');
  const m = plain(def.measure(result({ controls: { temperature: 25 } })));
  assert.deepStrictEqual(Object.keys(m).sort(), ['resistance', 'temperature']);
  assert.equal(m.temperature, 25);
  near(m.resistance, 10000, 1e-6, 'resistance at 25 °C');
  const hot = plain(def.measure(result({ controls: { temperature: 50 }, values: { r25: 47000 } })));
  assert.equal(hot.temperature, 50);
  near(hot.resistance, lawOhms(47000, 50), 1, 'resistance at 50 °C, r25 47 kΩ');
});

test('report(): "25 °C · 10 kΩ" at the default; "50 °C · 3.59 kΩ"', () => {
  const def = thermistor();
  const line = r => def.report(r, def.measure(r));
  const at25 = line(result({ controls: { temperature: 25 } }));
  assert.match(at25, /^25 °C · 10(\.0)? kΩ$/, `got "${at25}"`);
  assert.equal(line(result({ controls: { temperature: 50 } })), '50 °C · 3.59 kΩ');
  assert.ok(at25.length <= 80, at25);
});

// ── The simulator: the issue's divider, 9 V → 10 kΩ → thermistor → ground ──
// Battery on the rails; tp_10 → a10; resistor b10–b14 at 10 kΩ; thermistor
// c14 (pin 1) – c17 (pin 2); a17 → tn_17. Its volts = 9 · R / (10000 + R):
//   25 °C: R = 10 kΩ     → 4.500 V
//   50 °C: R = 3588.2 Ω  → 9 · 3588.2 / 13588.2 = 2.377 V

function divider(temperature) {
  const bat = { type: 'battery', label: 'BAT1', pins: pinsOf(2), holeRefs: null, values: { voltage: 9 } };
  const r1  = { type: 'resistor', label: 'R1', pins: pinsOf(2), holeRefs: ['b10', 'b14'].map(holeRef),
                values: { resistance: 10000 } };
  const cell = { type: 'thermistor', label: 'TH1', pins: pinsOf(2), holeRefs: ['c14', 'c17'].map(holeRef),
                 values: { r25: 10000 }, controls: { temperature } };
  const w = (a, b) => ({ startHole: holeRef(a), endHole: holeRef(b) });
  const wires = [{ startComp: bat, startPinIdx: 0, endHole: holeRef('tp_50') },
                 { startComp: bat, startPinIdx: 1, endHole: holeRef('tn_50') },
                 w('tp_10', 'a10'), w('a17', 'tn_17')];
  return { components: [bat, r1, cell], wires, cell };
}

// The volts across the thermistor (pin 1 minus pin 2) in a solved circuit.
function thVolts(components, wires, label = 'TH1') {
  const r = Sim.analyze(components, wires);
  assert.equal(r.status, 'ok', `status ${r.status}: ${(r.lines || []).map(l => l.text).join(' | ')}`);
  const p = r.parts && r.parts[label];
  assert.ok(p, `analyze().parts has no ${label}; got ${JSON.stringify(Object.keys(r.parts || {}))}`);
  assert.ok(Number.isFinite(p.r.pins['1']) && Number.isFinite(p.r.pins['2']), `both thermistor pins solved: ${JSON.stringify(p.r.pins)}`);
  return { volts: p.r.pins['1'] - p.r.pins['2'], m: p.m };
}

test('known answer: the divider at 25 °C puts 4.5 V across the thermistor (±0.05)', () => {
  thermistor();
  const c = divider(25);
  const { volts, m } = thVolts(c.components, c.wires);
  near(volts, 4.5, 0.05, 'divider at 25 °C');
  assert.equal(m.temperature, 25);
  near(m.resistance, 10000, 1e-6, 'measure().resistance at 25 °C');
});

test('known answer: the divider at 50 °C puts 2.3–2.45 V across the thermistor (hand: 2.377 V)', () => {
  thermistor();
  const c = divider(50);
  const { volts } = thVolts(c.components, c.wires);
  assert.ok(volts >= 2.3 && volts <= 2.45, `divider at 50 °C: expected 2.3–2.45 V, got ${volts}`);
  near(volts, 2.3766, 0.005, 'divider at 50 °C');
});

test('the same record re-simulated after its temperature changes gives the new divider volts', () => {
  thermistor();
  const c = divider(25);
  near(thVolts(c.components, c.wires).volts, 4.5, 0.05, '25 °C');
  c.cell.controls.temperature = 50;
  near(thVolts(c.components, c.wires).volts, 2.3766, 0.005, 'then 50 °C');
  c.cell.controls.temperature = 25;
  near(thVolts(c.components, c.wires).volts, 4.5, 0.05, 'and back to 25 °C');
});

// ── examples: the issue's divider at 25 and 50 °C ─────────────────────────
// Each example is built into records and solved; the thermistor's own volts
// must be the known answer, whatever the example's `expect` lists
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

function dividerExample(temperature) {
  const def = thermistor();
  const ex = (def.examples || []).find(e => e.parts.some(p => p.type === 'thermistor' && p.controls && p.controls.temperature === temperature)
    && e.parts.some(p => p.type === 'resistor' && p.values && p.values.resistance === 10000)
    && e.parts.some(p => p.type === 'battery'));
  assert.ok(ex, `no example with a battery, a 10 kΩ resistor and a thermistor at ${temperature} °C: ${JSON.stringify(def.examples)}`);
  assert.ok(ex.expect && Object.keys(ex.expect).length > 0, `the ${temperature} °C example expects something: ${JSON.stringify(ex)}`);
  const label = ex.parts.find(p => p.type === 'thermistor').label;
  const { components, wires } = exampleCircuit(ex);
  return thVolts(components, wires, label).volts;
}

test('examples: the divider at 25 °C is a known-answer example, and solves to 4.5 V across the thermistor', () => {
  near(dividerExample(25), 4.5, 0.05, 'the 25 °C example');
});

test('examples: the divider at 50 °C is a known-answer example, and solves to 2.3–2.45 V across the thermistor', () => {
  const v = dividerExample(50);
  assert.ok(v >= 2.3 && v <= 2.45, `the 50 °C example: expected 2.3–2.45 V, got ${v}`);
});

// ── The temperature alarm (decision 3) through the AI apply path ────────────
// At C = 2, one lead per hole: tp_3 → a2; thermistor b2 (pin 1) – b5 (pin 2);
// resistor c5–c9 at 3.3 kΩ; buzzer d9–d11; a11 → tn_11. One series loop:
// I = 9 / (R_th + 3300 + 42), and the buzzer sounds from 1 mA.
//   25 °C: 9 / 13342    = 0.6746 mA → silent
//   32 °C: 9 / 10721.3  = 0.8395 mA → silent
//   38 °C: 9 / 9091.2   = 0.9900 mA → silent (the trip is ~38.2 °C)
//   39 °C: 9 / 8862.1   = 1.0156 mA → sounding
//   50 °C: 9 / 6930.2   = 1.2987 mA → sounding

const wire = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });
const ALARM = [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  wire('BAT1.0', `tp_${N}`, 'red'),
  wire('BAT1.1', `tn_${N}`, 'black'),
  wire('tp_3', 'a2', 'red'),
  { tool: 'place_thermistor', holeA: 'b2', holeB: 'b5' },   // pin 1 b2, pin 2 b5
  { tool: 'place_resistor', holeA: 'c5', holeB: 'c9', resistance: 3300 },
  { tool: 'place_buzzer', holeA: 'd9', holeB: 'd11' },
  wire('a11', 'tn_11', 'black'),
];

// A board that keeps real records the way App leaves them (as in
// test/parts-ldr.test.js), so Sim.analyze can solve it.
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

function alarm() {
  thermistor();
  const board = simBoard();
  const out = Chat.acceptBuild(ALARM, board);
  assert.deepEqual(out, { applied: ALARM.length, failed: 0 }, `applied, notes ${JSON.stringify(board.notes)}`);
  const cell = board.components().find(c => c.type === 'thermistor');
  assert.ok(cell, 'the thermistor is on the board');
  return { board, cell };
}

function buzzerAt(board) {
  const r = board.solve();
  assert.equal(r.status, 'ok', `status ${r.status}: ${(r.lines || []).map(l => l.text).join(' | ')}`);
  assert.ok(r.parts.BZ1, `analyze().parts has no BZ1; got ${JSON.stringify(Object.keys(r.parts))}`);
  return r.parts.BZ1.m;
}

test('the alarm places TH1 on b2 (pin 1) and b5 (pin 2), 10 kΩ at 25 °C by default; R1 is 3.3 kΩ; BZ1 on d9–d11', () => {
  const { board, cell } = alarm();
  assert.equal(cell.label, 'TH1');
  assert.deepStrictEqual(Parts.legsOf(cell).map(l => [l.pin, l.hole]), [['1', 'b2'], ['2', 'b5']]);
  assert.deepStrictEqual(cell.values, { r25: 10000 });
  assert.deepStrictEqual(cell.controls, { temperature: 25 });
  assert.equal(board.components().find(c => c.label === 'R1').values.resistance, 3300);
  assert.deepStrictEqual(Parts.legsOf(board.components().find(c => c.label === 'BZ1')).map(l => l.hole), ['d9', 'd11']);
});

test('alarm at the default 25 °C: silent, 0.6746 mA (9 / (10000 + 3300 + 42))', () => {
  const { board } = alarm();
  const bz = buzzerAt(board);
  assert.equal(bz.sounding, false, `buzzer at 25 °C: ${JSON.stringify(bz)}`);
  near(bz.current, 0.6746, 0.005, 'buzzer mA at 25 °C');
});

test('alarm at 50 °C: sounding, 1.2987 mA (9 / (3588.2 + 3342))', () => {
  const { board, cell } = alarm();
  cell.controls.temperature = 50;
  const bz = buzzerAt(board);
  assert.equal(bz.sounding, true, `buzzer at 50 °C: ${JSON.stringify(bz)}`);
  near(bz.current, 1.2987, 0.005, 'buzzer mA at 50 °C');
});

test('warming the same alarm 25 → 32 → 38 → 39 → 50 °C: silent, silent, silent, sounding, sounding (trip ~38.2 °C)', () => {
  const { board, cell } = alarm();
  const seen = [25, 32, 38, 39, 50].map(t => { cell.controls.temperature = t; return buzzerAt(board); });
  assert.deepStrictEqual(seen.map(m => m.sounding), [false, false, false, true, true], JSON.stringify(seen));
  near(seen[3].current, 1.0156, 0.005, 'buzzer mA at 39 °C');
});

test('the alarm uses no hole twice, passes findCircuitProblems with no problem, and finishAIReply untouched', () => {
  thermistor();
  const holes = [];
  for (const a of ALARM) {
    if (a.holeA) holes.push(a.holeA, a.holeB);
    if (a.tool === 'add_wire') for (const e of [a.from, a.to]) if (!/^BAT/.test(e)) holes.push(e);
  }
  assert.deepStrictEqual(holes.filter((h, i) => holes.indexOf(h) !== i), [], 'one lead per hole');
  assert.deepStrictEqual(Server.findCircuitProblems(ALARM.map(a => ({ ...a }))), []);
  const out = Server.finishAIReply({ reply: 'Built it.', actions: ALARM.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, ALARM);
  assert.equal(out.reply, 'Built it.');
});

// ── Save and load ─────────────────────────────────────────────────────────

test('a placed thermistor saves one named holeRef per pin; loaded back at 42 °C it sits on the same holes and simulates at 42 °C', () => {
  thermistor();
  const comp = { type: 'thermistor', label: 'TH1', values: { r25: 10000 }, controls: { temperature: 42 },
                 holeRefs: [holeRef('c14'), holeRef('c17')], pins: pinsOf(2) };
  const saved = BoardIO.saveHoleRefs(comp);
  assert.deepStrictEqual(saved, [{ pin: '1', col: 13, row: 'c' }, { pin: '2', col: 16, row: 'c' }]);
  const record = JSON.parse(JSON.stringify({ type: 'thermistor', label: 'TH1', values: comp.values, controls: comp.controls, holeRefs: saved }));
  const loaded = { type: 'thermistor', label: 'TH1', values: record.values, controls: record.controls, pins: pinsOf(2),
                   holeRefs: BoardIO.loadHoleRefs(record) };
  assert.deepStrictEqual(Parts.legsOf(loaded).map(l => [l.pin, l.hole]), [['1', 'c14'], ['2', 'c17']]);
  assert.deepStrictEqual(loaded.controls, { temperature: 42 });
  near(ohmsOf(loaded.values, loaded.controls), lawOhms(10000, 42), 0.5, 'R at 42 °C');
  const c = divider(42);
  c.components[2] = loaded;   // the loaded record in the divider, on the same holes
  const { volts, m } = thVolts(c.components, c.wires);
  assert.equal(m.temperature, 42);
  near(volts, 9 * lawOhms(10000, 42) / (10000 + lawOhms(10000, 42)), 0.01, 'divider at 42 °C');
});

// ── The server: tools, selection ──────────────────────────────────────────

const decl = name => Server.CIRCUIT_TOOLS[0].function_declarations.find(d => d.name === name);

test('the generated place_thermistor tool takes holeA and holeB (both required)', () => {
  thermistor();
  const t = decl('place_thermistor');
  assert.ok(t, `no place_thermistor tool; tools: ${Server.CIRCUIT_TOOLS[0].function_declarations.map(d => d.name).join(', ')}`);
  assert.ok(t.parameters.properties.holeA && t.parameters.properties.holeB, JSON.stringify(t.parameters));
  assert.deepStrictEqual([...t.parameters.required].sort(), ['holeA', 'holeB']);
});

test("ai: tool place_thermistor; keywords include the issue's thermistor, ntc, temperature sensor, heat, thermometer", () => {
  const def = thermistor();
  assert.equal(def.ai.tool || 'place_' + def.type, 'place_thermistor');
  for (const k of ['thermistor', 'ntc', 'temperature sensor', 'heat', 'thermometer']) {
    assert.ok(def.ai.keywords.includes(k), `keyword "${k}" missing from ${JSON.stringify(def.ai.keywords)}`);
  }
  assert.ok(def.ai.about.length > 0);
});

test('ai.guide lays out the temperature alarm at C = 2 with its exact holes and a 3.3 kΩ resistor', () => {
  const guide = thermistor().ai.guide;
  assert.equal(typeof guide, 'string', 'the thermistor has an ai.guide');
  assert.ok(guide.length <= 400, `at most 400 characters; got ${guide.length}`);
  for (const h of ['tp_3', 'a2', 'b2', 'b5', 'c5', 'c9', 'd9', 'd11', 'a11', 'tn_11']) {
    assert.match(guide, new RegExp(`(^|[^a-z0-9_])${h}(?![0-9])`), `the alarm layout names ${h}: ${guide}`);
  }
  assert.match(guide, /3300|3\.3 ?k/i, `the recipe asks for a 3.3 kΩ resistor: ${guide}`);
});

test('selectTools("Build a temperature alarm that sounds a buzzer when it gets hot") sends place_thermistor, place_buzzer and place_resistor', () => {
  thermistor();
  const got = Server.selectTools('Build a temperature alarm that sounds a buzzer when it gets hot', []).map(d => d.name);
  for (const n of ['place_thermistor', 'place_buzzer', 'place_resistor']) {
    assert.ok(got.includes(n), `${n} missing from ${JSON.stringify(got)}`);
  }
});

// ── The browser half ──────────────────────────────────────────────────────

test('in a browser-like page with no THREE or document, thermistor.js defines itself on window.Parts', () => {
  const file = path.join(PARTS_DIR, 'thermistor.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/thermistor.js must exist');
  const win = vm.createContext({ TextEncoder });
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(PARTS_DIR, 'registry.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(file, 'utf8'), win);
  const def = win.Parts.get('thermistor');
  assert.ok(def, 'window.Parts.get("thermistor") after loading thermistor.js');
  assert.equal(def.elements({ r25: 10000 }, { temperature: 25 }).length, 1);
});

test('parts/thermistor.js draws only through ctx: a view.build and a view.update, no App, no document', () => {
  const file = path.join(PARTS_DIR, 'thermistor.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/thermistor.js must exist');
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /\bview\s*:/, 'a view: { build, update } section');
  assert.doesNotMatch(src, /\bApp\b/, 'the part file must not reach into App; use ctx');
  assert.doesNotMatch(src, /\bdocument\b/, 'the part file must not touch document');
  assert.equal(typeof thermistor().view.build, 'function');
  assert.equal(typeof thermistor().view.update, 'function', 'view.update tints the bead with the temperature (decision 2)');
});

// ── docs ──────────────────────────────────────────────────────────────────

test('docs/QA.md has one AI case for "Build a temperature alarm that sounds a buzzer when it gets hot"', () => {
  const qa = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'QA.md'), 'utf8');
  const rows = qa.split('\n').filter(l => l.startsWith('|') && l.includes('Build a temperature alarm that sounds a buzzer when it gets hot'));
  assert.equal(rows.length, 1, 'one QA row sends the temperature-alarm prompt');
  assert.match(rows[0], /^\| AI-\d+ \|/, 'it is an AI prompt check (AI-NN)');
});
