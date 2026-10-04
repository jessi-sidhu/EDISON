// The diode (1N4148 / 1N4001), parts/diode.js (issue #33): a standard
// diode that conducts one way with a 0.65–0.7 V drop and blocks current when
// backwards. It is the LED without the light: the same one D element, other
// values and another view. Its definition half loads in Node through
// require('circuit3d/js/parts'); its model is checked in the browser by
// e2e/diode.spec.js and e2e/parts.spec.js.
//
// Shapes these tests assume (the issue, plus choices stated here so the
// builder matches them):
// - Identity: type 'diode'. name / sub / category / prefix / icon are the
//   builder's pick: name mentions "diode", the prefix is unique, the icon is
//   an <svg>. Labels are prefix + 1, prefix + 2.
// - pins ['cathode', 'anode'] (the LED's order: holeA = cathode, holeB = anode).
// - place { kind: 'span', span { min 3, max 5, default 4 }, rotations ['h', 'v'] }.
// - values.model { choices { '1N4148': { vf 0.65, maxCurrent 0.2 },
//   '1N4001': { vf 0.7, maxCurrent 1 } }, default '1N4148' }.
// - elements(v): one D, pins [anode, cathode], vf = v.vf, ron = the LED's 0.1 Ω.
// - measure(r) → { on, current, drop } (extra fields allowed):
//     current  mA through the D, + from anode to cathode;
//     on       true when the D is 'on' and carries current;
//     drop     V(anode) − V(cathode), a number (0 V for a floating pin, as
//              the LED reads it), so a reversed diode reads about −9 V.
// - warnings(r, m): one line when the current is over the model's
//   maxCurrent, naming the rating (e.g. "200 mA") and the current in mA.
//   A backwards (blocking) diode is NOT a warning.
// - ai: tool place_diode (the default), holeA = cathode, holeB = anode, the
//   model an optional param; keywords include diode, rectifier, 1n4148,
//   1n4001, reverse protection.
// - examples: at least the known answer, 9 V → 1 kΩ → 1N4148 forward →
//   ground: expect { <label>: { drop: [0.60, 0.75], current: [8.0, 8.6] } }.
//
// Hand-computed (ideal 9 V battery, D = vf in series with 0.1 Ω when on):
//   1 kΩ + 1N4148:            (9 − 0.65) / 1000.1 = 8.349 mA, drop 0.6508 V
//   1 kΩ + 1N4001:            (9 − 0.70) / 1000.1 = 8.299 mA, drop 0.7008 V
//   22 Ω + 1N4148:            (9 − 0.65) / 22.1   = 377.8 mA (over 200 mA)
//   22 Ω + 1N4001:            (9 − 0.70) / 22.1   = 375.6 mA (under 1 A)
//   1N4148 → 470 Ω → red LED: (9 − 0.65 − 2.0) / 470.2 = 13.505 mA
//   1N4148 + 1N4001 + 1 kΩ:   (9 − 0.65 − 0.70) / 1000.2 = 7.648 mA
//
// Kept apart from parts-registry.test.js, which resets the registry before
// every test.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out

const Parts   = require('../circuit3d/js/parts');
const Server  = require('../backend/server.js');
const Chat    = require('../circuit3d/js/chat.js');
const BoardIO = require('../circuit3d/js/board-io.js');
const Sim     = require('../circuit3d/js/simulate.js');
const Ids     = require('../circuit3d/js/ids.js');
const Recipes = require('./fixtures/recipes.js');

const N         = Recipes.HIGHEST_COL;   // 63
const PARTS_DIR = path.join(__dirname, '..', 'circuit3d', 'js', 'parts');
const ROWS      = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
const BOARD     = { cols: N, bodyRows: ROWS };
const RON       = 0.1;   // the LED's on resistance, reused

const QA_PROMPT = 'Add a diode for reverse-polarity protection to an LED circuit';

function diode() {
  const def = Parts.get('diode');
  assert.ok(def, "Parts.get('diode') is null: parts/diode.js must exist and be listed in parts/index.js");
  return def;
}
const label = (n = 1) => diode().prefix + n;

const plain = o => JSON.parse(JSON.stringify(o));
function near(got, want, tol, what) {
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want} (±${tol}), got ${got}`);
}
const text = r => (r.lines || []).map(l => l.text).join(' | ');

// A registry part's values as the core hands them over: defaults, the given
// ones, then each choice's overrides.
function valuesFor(def, given) {
  const v = {};
  for (const [key, spec] of Object.entries(def.values || {})) v[key] = spec.default;
  Object.assign(v, given || {});
  for (const [key, spec] of Object.entries(def.values || {})) {
    if (spec.choices && spec.choices[v[key]]) Object.assign(v, spec.choices[v[key]]);
  }
  return v;
}

// The one D element and its key in PartResult (id, or index).
function dOf(values) {
  const els = diode().elements(values, {});
  assert.ok(Array.isArray(els), `elements() returns a list; got ${JSON.stringify(els)}`);
  const k = els.findIndex(e => e.kind === 'D');
  assert.ok(k >= 0, `elements() should hold one D; got ${JSON.stringify(els)}`);
  return { el: els[k], id: els[k].id !== undefined ? els[k].id : k, els };
}

// A PartResult for the diode: mode, current in mA (+ anode → cathode), pin volts.
function result({ mode, current = 0, anode = 0, cathode = 0, model = '1N4148', open = 9 }) {
  const values = valuesFor(diode(), { model });
  const { id } = dOf(values);
  return { label: label(), values, controls: {}, pins: { cathode, anode },
           current: { [id]: current }, modes: { [id]: mode }, open: { [id]: open } };
}
const warningsOf = r => (diode().warnings ? diode().warnings(r, diode().measure(r)) : []);

// "a2" → { col: 1, row: 'a' }; "tp_50" → { col: 49, row: 'tp' }.
function holeRef(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  assert.ok(m, 'not a hole: ' + s);
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}
const pinsOf = n => Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));

// ── Builds as AI actions, applied to a board that keeps real records ──────

const wire = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });

// The battery on the rails at the far end; `reversed` swaps its two wires.
const battery = ({ reversed = false } = {}) => [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  wire('BAT1.0', reversed ? `tn_${N}` : `tp_${N}`, 'red'),
  wire('BAT1.1', reversed ? `tp_${N}` : `tn_${N}`, 'black'),
];

// The known answer: tp_2 → a2; R b2–b6; diode at c6/c10; a10 → tn_10.
// Forward: anode c6 (after the resistor), cathode c10 (to ground).
// Reversed: cathode c6, anode c10.
function knownAnswer({ reversed = false, ohms = 1000, model } = {}) {
  const d = { tool: 'place_diode', holeA: reversed ? 'c6' : 'c10', holeB: reversed ? 'c10' : 'c6' };
  if (model) d.model = model;
  return battery().concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6', resistance: ohms },
    d,
    wire('a10', 'tn_10', 'black'),
  ]);
}

// Reverse-polarity protection in front of an LED: tp_2 → a2; diode anode b2,
// cathode b6; R c6–c10 470 Ω; red LED anode d10, cathode d12; a12 → tn_12.
function protection({ reversed = false, model } = {}) {
  const d = { tool: 'place_diode', holeA: 'b6', holeB: 'b2' };
  if (model) d.model = model;
  return battery({ reversed }).concat([
    wire('tp_2', 'a2', 'red'),
    d,
    { tool: 'place_resistor', holeA: 'c6', holeB: 'c10', resistance: 470 },
    { tool: 'place_led', holeA: 'd12', holeB: 'd10' },
    wire('a12', 'tn_12', 'black'),
  ]);
}

// A board that keeps real records the way App leaves them (as in
// test/parts-seven_segment.test.js), so Sim.analyze can solve it. setValues
// works as App.setValues does: the record's values, the change, then the
// choice's overrides.
function simBoard() {
  let parts = [], wires = [];
  const notes = [];
  const wireEnd = (e, side) => (e.hole
    ? { [side + 'Hole']: { col: e.hole.col, row: e.hole.row }, [side + 'Comp']: null, [side + 'PinIdx']: undefined }
    : { [side + 'Hole']: null, [side + 'Comp']: e.comp, [side + 'PinIdx']: e.pin });
  return {
    notes,
    note: t => notes.push(t),
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
        values: valuesFor(def, values),
      };
      if (def.controls) {
        rec.controls = {};
        for (const [k, c] of Object.entries(def.controls)) rec.controls[k] = c.default;
      }
      parts.push(rec);
      return rec;
    },
    setValues(comp, v) { comp.values = valuesFor(Parts.get(comp.type), Object.assign({}, comp.values, v)); },
    setControls(comp, c) { comp.controls = Object.assign({}, comp.controls, c); },
    deletePart(comp) { parts = parts.filter(p => p !== comp); },
    clearAll() { parts = []; wires = []; },
    addWire(from, to) {
      wires.push(Object.assign({}, wireEnd(from, 'start'), wireEnd(to, 'end')));
      return true;
    },
    batch: fn => fn(),
    solve: () => Sim.analyze(parts, wires),
  };
}

// Applies the actions (every one must apply) and solves.
function solveBuild(actions) {
  diode();
  const board = simBoard();
  const out = Chat.acceptBuild(actions.map(a => ({ ...a })), board);
  assert.deepEqual(out, { applied: actions.length, failed: 0 }, `every action applies; notes ${JSON.stringify(board.notes)}`);
  const r = board.solve();
  assert.equal(r.status, 'ok', `status ${r.status}: ${text(r)}`);
  return { board, r };
}

// A diode's { r, m, warnings } in a solved circuit.
function part(r, lbl = label()) {
  const p = r.parts && r.parts[lbl];
  assert.ok(p, `analyze().parts has no ${lbl}; got ${JSON.stringify(Object.keys(r.parts || {}))}`);
  return p;
}

// ── The file and its identity ─────────────────────────────────────────────

test('parts/index.js lists diode.js, and the file exists', () => {
  const src = fs.readFileSync(path.join(PARTS_DIR, 'index.js'), 'utf8');
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, 'parts/index.js must keep its FILES list');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  assert.ok(files.includes('diode.js'), `FILES should include 'diode.js'; got ${JSON.stringify(files)}`);
  assert.ok(fs.existsSync(path.join(PARTS_DIR, 'diode.js')), 'circuit3d/js/parts/diode.js must exist');
});

test('both 3D pages load js/parts/diode.js, after registry.js and before components.js', () => {
  for (const page of ['circuit3d/index.html', 'circuit3d/viewer.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    const at = order.indexOf('js/parts/diode.js');
    assert.ok(at >= 0, `${page} loads js/parts/diode.js: ${order.join(', ')}`);
    assert.ok(at > order.indexOf('js/parts/registry.js'), `${page}: diode.js comes after registry.js`);
    const comps = order.indexOf('js/components.js');
    if (comps >= 0) assert.ok(at < comps, `${page}: diode.js comes before components.js`);
  }
});

test("identity: type 'diode', a name with \"diode\" in it, an <svg> icon, a prefix no other part uses; labels prefix + 1, 2", () => {
  const def = diode();
  assert.equal(def.type, 'diode');
  assert.match(def.name, /diode/i, `name: ${def.name}`);
  assert.equal(typeof def.sub, 'string');
  assert.ok(def.sub.length > 0 && def.sub.length <= 32, def.sub);
  assert.match(def.icon, /^<svg/);
  assert.equal(def.ref, undefined, 'a diode is not a source');
  const others = Parts.all().filter(d => d.type !== 'diode').map(d => d.prefix);
  assert.ok(!others.includes(def.prefix), `prefix ${def.prefix} is already used: ${JSON.stringify(others)}`);
  assert.equal(Ids.nextLabel([], 'diode'), def.prefix + '1');
  assert.equal(Ids.nextLabel([{ type: 'diode', label: def.prefix + '1' }], 'diode'), def.prefix + '2');
});

test("pins ['cathode', 'anode'] (the LED's order); a span part, 3–5 columns (4 by default), rotations h and v", () => {
  const def = diode();
  assert.deepStrictEqual([...def.pins], ['cathode', 'anode']);
  assert.deepStrictEqual(plain(def.place), { kind: 'span', span: { min: 3, max: 5, default: 4 }, rotations: ['h', 'v'] });
});

test('flippable by hand like the LED (F swaps its two holes): an anode/cathode span part', () => {
  assert.equal(Parts.isFlippable(diode()), true);
});

// ── Values: the model ─────────────────────────────────────────────────────

test("values.model: 1N4148 (0.65 V, 200 mA) and 1N4001 (0.7 V, 1 A), 1N4148 by default", () => {
  const spec = diode().values && diode().values.model;
  assert.ok(spec && spec.choices, `values.model must be a choices ValueSpec; got ${JSON.stringify(spec)}`);
  assert.deepStrictEqual(plain(spec.choices), { '1N4148': { vf: 0.65, maxCurrent: 0.2 }, '1N4001': { vf: 0.7, maxCurrent: 1 } });
  assert.equal(spec.default, '1N4148');
  const v = valuesFor(diode());
  assert.deepStrictEqual([v.model, v.vf, v.maxCurrent], ['1N4148', 0.65, 0.2]);
});

test('checkValue on the diode: model 1N4001 ok, 1N5819 refused naming the two models', () => {
  diode();
  assert.deepStrictEqual(Parts.checkValue('diode', 'model', '1N4001'), { ok: true, value: '1N4001' });
  const bad = Parts.checkValue('diode', 'model', '1N5819');
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'model must be one of 1N4148, 1N4001');
});

// ── elements(): one D, as the LED's ───────────────────────────────────────

test("elements(): one D from anode to cathode, vf from the model (0.65 / 0.7), ron 0.1 Ω (the LED's)", () => {
  for (const [model, vf] of [['1N4148', 0.65], ['1N4001', 0.7]]) {
    const { el, els } = dOf(valuesFor(diode(), { model }));
    assert.equal(els.length, 1, `${model}: one element; got ${JSON.stringify(els)}`);
    assert.equal(el.kind, 'D');
    assert.deepStrictEqual([...el.pins], ['anode', 'cathode'], 'D pins are [anode, cathode]');
    assert.equal(el.vf, vf, `${model}: D vf ${el.vf}`);
    assert.equal(el.ron, RON, `${model}: D ron ${el.ron}`);
    assert.equal(el.vz, undefined, 'no breakdown: blocking is all a backwards diode does');
  }
});

// ── measure(): { on, current, drop } ──────────────────────────────────────

test('measure(): conducting at 8.35 mA is { on: true, current: 8.35, drop: 0.651 }', () => {
  const m = diode().measure(result({ mode: 'on', current: 8.349, anode: 0.6508, cathode: 0 }));
  assert.equal(m.on, true, JSON.stringify(m));
  near(m.current, 8.349, 0.001, 'current (mA)');
  near(m.drop, 0.6508, 0.001, 'drop = V(anode) − V(cathode)');
});

test('measure(): blocking (off, cathode at 9 V) is not on, carries no current, and drops −9 V', () => {
  const m = diode().measure(result({ mode: 'off', current: 0, anode: 0, cathode: 9, open: -9 }));
  assert.equal(m.on, false, JSON.stringify(m));
  near(m.current, 0, 0.0001, 'current (mA)');
  near(m.drop, -9, 0.001, 'drop');
});

test('measure(): a floating diode (pins null) is off with a finite, JSON-safe drop', () => {
  const m = diode().measure(result({ mode: 'off', current: 0, anode: null, cathode: null, open: 0 }));
  assert.equal(m.on, false);
  assert.ok(Number.isFinite(m.drop), `drop: ${m.drop}`);
  assert.deepStrictEqual(plain(m), m, 'flat and JSON-safe');
});

// ── warnings(): over maxCurrent only ──────────────────────────────────────

test('warnings(): a 1N4148 at 377.8 mA is over its 200 mA rating: one line naming the rating and the current', () => {
  const w = warningsOf(result({ mode: 'on', current: 377.83, anode: 0.688, cathode: 0 }));
  assert.equal(w.length, 1, JSON.stringify(w));
  assert.match(w[0], /\b200 ?mA\b/, `names the 200 mA rating: ${w[0]}`);
  assert.match(w[0], /\b377(\.\d+)? ?mA\b|\b378 ?mA\b/, `gives the current: ${w[0]}`);
  assert.ok(w[0].length <= 120, w[0]);
});

test('warnings(): none at or under the rating (1N4148 at 199 mA and 8.35 mA; 1N4001 at 375.6 mA, under its 1 A)', () => {
  assert.deepStrictEqual(warningsOf(result({ mode: 'on', current: 199, anode: 0.67 })), []);
  assert.deepStrictEqual(warningsOf(result({ mode: 'on', current: 8.349, anode: 0.6508 })), []);
  assert.deepStrictEqual(warningsOf(result({ mode: 'on', current: 375.57, anode: 0.738, model: '1N4001' })), []);
});

test('warnings(): a 1N4001 over 1 A warns, naming 1 A (or 1000 mA)', () => {
  const w = warningsOf(result({ mode: 'on', current: 1500, anode: 0.85, model: '1N4001' }));
  assert.equal(w.length, 1, JSON.stringify(w));
  assert.match(w[0], /\b1 ?A\b|\b1000 ?mA\b/, w[0]);
});

test('warnings(): a backwards (blocking) diode is NOT a warning, nor a floating one', () => {
  assert.deepStrictEqual(warningsOf(result({ mode: 'off', current: 0, anode: 0, cathode: 9, open: -9 })), []);
  assert.deepStrictEqual(warningsOf(result({ mode: 'off', current: 0, anode: null, cathode: null, open: 0 })), []);
});

test('report(): one line of at most 80 characters, with the current in mA', () => {
  const r = result({ mode: 'on', current: 8.349, anode: 0.6508 });
  const line = diode().report(r, diode().measure(r));
  assert.equal(typeof line, 'string');
  assert.ok(line.length > 0 && line.length <= 80, line);
  assert.match(line, /8\.3\d* ?mA/, line);
});

// ── Known answer through the simulator ────────────────────────────────────

test('known answer: 9 V → 1 kΩ → 1N4148 forward → ground drops 0.60–0.75 V at 8.0–8.6 mA (hand: 0.651 V, 8.349 mA), no warning', () => {
  const { r } = solveBuild(knownAnswer());
  const { m, warnings } = part(r);
  assert.equal(m.on, true, JSON.stringify(m));
  assert.ok(m.drop >= 0.60 && m.drop <= 0.75, `drop expected 0.60–0.75 V, got ${m.drop}`);
  assert.ok(m.current >= 8.0 && m.current <= 8.6, `current expected 8.0–8.6 mA, got ${m.current}`);
  near(m.current, 8.349, 0.01, 'hand: (9 − 0.65) / 1000.1');
  near(m.drop, 0.6508, 0.002, 'hand: 0.65 + 8.349 mA × 0.1 Ω');
  assert.deepStrictEqual(warnings, []);
  near(r.parts.BAT1.m.current, 8.349, 0.01, 'the battery supplies the diode current');
});

test('known answer reversed: the diode blocks, under 0.01 mA, not on, about −9 V across it, and NO warning or "backwards" line', () => {
  const { r } = solveBuild(knownAnswer({ reversed: true }));
  const { m, warnings } = part(r);
  assert.equal(m.on, false, JSON.stringify(m));
  assert.ok(Math.abs(m.current) < 0.01, `current expected below 0.01 mA, got ${m.current}`);
  near(m.drop, -9, 0.05, 'drop: anode on ground, cathode at 9 V through the idle resistor');
  assert.deepStrictEqual(warnings, [], 'blocking is a normal use of a diode');
  assert.doesNotMatch(text(r), /backwards/i, `no results line calls it backwards: ${text(r)}`);
});

test('switching the model to 1N4001 raises vf: the known answer drops 0.70 V at 8.30 mA (placed so, or changed by set_value)', () => {
  const placed = part(solveBuild(knownAnswer({ model: '1N4001' })).r).m;
  near(placed.drop, 0.7008, 0.002, 'placed as 1N4001: drop');
  near(placed.current, 8.299, 0.01, 'placed as 1N4001: current');
  const changed = solveBuild(knownAnswer().concat([{ tool: 'set_value', part: label(), model: '1N4001' }]));
  const d = changed.board.components().find(c => c.type === 'diode');
  assert.deepStrictEqual([d.values.model, d.values.vf, d.values.maxCurrent], ['1N4001', 0.7, 1]);
  const m = part(changed.r).m;
  near(m.drop, 0.7008, 0.002, 'changed to 1N4001: drop');
  near(m.current, 8.299, 0.01, 'changed to 1N4001: current');
});

test('over the rating in the simulator: 22 Ω with a 1N4148 draws 377.8 mA and warns (a results line too); a 1N4001 at 375.6 mA does not', () => {
  const small = solveBuild(knownAnswer({ ohms: 22 })).r;
  const p = part(small);
  near(p.m.current, 377.83, 0.2, '(9 − 0.65) / 22.1');
  assert.equal(p.warnings.length, 1, JSON.stringify(p.warnings));
  assert.match(p.warnings[0], /\b200 ?mA\b/, p.warnings[0]);
  assert.ok(small.lines.some(l => l.text.includes(p.warnings[0])), `the warning is a results line: ${text(small)}`);
  const big = part(solveBuild(knownAnswer({ ohms: 22, model: '1N4001' })).r);
  near(big.m.current, 375.57, 0.2, '(9 − 0.7) / 22.1');
  assert.deepStrictEqual(big.warnings, []);
});

// ── Complex circuits ──────────────────────────────────────────────────────

test('reverse-polarity protection: 1N4148 → 470 Ω → red LED lights the LED at 13.5 mA (hand: 6.35 / 470.2), both on, no warnings', () => {
  const { r } = solveBuild(protection());
  const d = part(r);
  assert.equal(d.m.on, true, JSON.stringify(d.m));
  near(d.m.current, 13.505, 0.02, 'diode mA');
  near(d.m.drop, 0.6514, 0.002, 'diode drop');
  assert.deepStrictEqual(d.warnings, []);
  assert.equal(r.parts.LED1.m.on, true, JSON.stringify(r.parts.LED1.m));
  near(r.parts.LED1.m.current, 13.505, 0.02, 'LED mA, the same series current');
  assert.deepStrictEqual(r.parts.LED1.warnings, []);
  near(r.parts.BAT1.m.current, 13.505, 0.02, 'battery mA');
});

test('reverse-polarity protection with the battery reversed: nothing conducts (diode and LED under 0.01 mA), and the diode gives no warning', () => {
  const { r } = solveBuild(protection({ reversed: true }));
  const d = part(r);
  assert.equal(d.m.on, false, JSON.stringify(d.m));
  assert.ok(Math.abs(d.m.current) < 0.01, `diode current ${d.m.current}`);
  assert.deepStrictEqual(d.warnings, [], 'the protection diode doing its job is not a warning');
  assert.equal(r.parts.LED1.m.on, false);
  assert.ok(Math.abs(r.parts.LED1.m.current) < 0.01, `LED current ${r.parts.LED1.m.current}`);
  assert.ok(Math.abs(r.parts.BAT1.m.current) < 0.01, `battery current ${r.parts.BAT1.m.current}`);
});

test('the same protection with a 1N4001: the LED current falls to 13.40 mA (hand: 6.3 / 470.2)', () => {
  const { r } = solveBuild(protection({ model: '1N4001' }));
  near(part(r).m.current, 13.398, 0.02, 'diode mA');
  near(part(r).m.drop, 0.7013, 0.002, 'diode drop');
  near(r.parts.LED1.m.current, 13.398, 0.02, 'LED mA');
});

test('two diodes in series (1N4148 then 1N4001) behind 1 kΩ: 7.648 mA through both, drops 0.651 and 0.701 V', () => {
  // tp_2 → a2; R b2–b6 1 kΩ; D1 anode c6, cathode c10; D2 anode d10, cathode d14; a14 → tn_14.
  const { r } = solveBuild(battery().concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6', resistance: 1000 },
    { tool: 'place_diode', holeA: 'c10', holeB: 'c6' },
    { tool: 'place_diode', holeA: 'd14', holeB: 'd10', model: '1N4001' },
    wire('a14', 'tn_14', 'black'),
  ]));
  const d1 = part(r, label(1)), d2 = part(r, label(2));
  near(d1.m.current, 7.6485, 0.01, `${label(1)} mA`);
  near(d2.m.current, 7.6485, 0.01, `${label(2)} mA`);
  near(d1.m.drop, 0.6508, 0.002, `${label(1)} drop (1N4148)`);
  near(d2.m.drop, 0.7008, 0.002, `${label(2)} drop (1N4001)`);
  assert.deepStrictEqual([d1.warnings, d2.warnings], [[], []]);
});

test('two branches in parallel on one battery, one diode forward and one backwards: 8.349 mA and ~0, the battery gives only the forward branch, no warnings', () => {
  // Branch 1: the known answer (cols 2–10). Branch 2: tp_20 → a20; R b20–b24
  // 1 kΩ; diode cathode c24 (toward +), anode c28; a28 → tn_28.
  const { r } = solveBuild(knownAnswer().concat([
    wire('tp_20', 'a20', 'red'),
    { tool: 'place_resistor', holeA: 'b20', holeB: 'b24', resistance: 1000 },
    { tool: 'place_diode', holeA: 'c24', holeB: 'c28' },
    wire('a28', 'tn_28', 'black'),
  ]));
  const fwd = part(r, label(1)), rev = part(r, label(2));
  assert.equal(fwd.m.on, true);
  near(fwd.m.current, 8.349, 0.01, 'forward branch mA');
  assert.equal(rev.m.on, false);
  assert.ok(Math.abs(rev.m.current) < 0.01, `backwards branch mA: ${rev.m.current}`);
  near(rev.m.drop, -9, 0.05, 'backwards branch drop');
  assert.deepStrictEqual([fwd.warnings, rev.warnings], [[], []]);
  near(r.parts.BAT1.m.current, 8.349, 0.01, 'battery mA');
});

// ── examples ──────────────────────────────────────────────────────────────

test('examples: the known answer (1 kΩ, 1N4148 forward) expects drop within 0.60–0.75 V and current within 8.0–8.6 mA', () => {
  const def = diode();
  const ex = (def.examples || []).find(e => {
    const d = e.parts.find(p => p.type === 'diode');
    const want = d && e.expect && e.expect[d.label];
    return want && Array.isArray(want.drop) && Array.isArray(want.current);
  });
  assert.ok(ex, `an example expecting { drop: [lo, hi], current: [lo, hi] }; got ${JSON.stringify((def.examples || []).map(e => [e.name, e.expect]))}`);
  const d = ex.parts.find(p => p.type === 'diode');
  const want = ex.expect[d.label];
  assert.ok(want.drop[0] >= 0.60 && want.drop[1] <= 0.75, `drop range inside 0.60–0.75: ${JSON.stringify(want.drop)}`);
  assert.ok(want.current[0] >= 8.0 && want.current[1] <= 8.6, `current range inside 8.0–8.6: ${JSON.stringify(want.current)}`);
  assert.ok(want.drop[0] <= 0.6508 && want.drop[1] >= 0.6508 && want.current[0] <= 8.349 && want.current[1] >= 8.349,
    `the ranges hold the hand answer 0.651 V, 8.349 mA: ${JSON.stringify(want)}`);
  const r = ex.parts.find(p => p.type === 'resistor');
  assert.equal(r && r.values && r.values.resistance, 1000, 'the example uses a 1 kΩ resistor');
  // test/parts-examples.test.js solves every example against its expect.
});

// ── Placement ─────────────────────────────────────────────────────────────

// "c8" → { pin, col: 7, row: 'c' }
const leg = (pin, s) => ({ pin, col: +s.slice(1) - 1, row: s[0] });
const placeDiode = (cathode, anode, map) =>
  Parts.checkPlacement('diode', [leg('cathode', cathode), leg('anode', anode)], map || new Map(), BOARD);

test('checkPlacement on the diode: 3, 4 and 5 columns apart are ok, either way round; e6→f6 across the gap ok', () => {
  diode();
  assert.deepStrictEqual(placeDiode('c9', 'c6'), { ok: true });
  assert.deepStrictEqual(placeDiode('c10', 'c6'), { ok: true });
  assert.deepStrictEqual(placeDiode('c11', 'c6'), { ok: true });
  assert.deepStrictEqual(placeDiode('c6', 'c10'), { ok: true });
  assert.deepStrictEqual(placeDiode('e6', 'f6'), { ok: true });
});

test('checkPlacement on the diode: 2 or 6 columns apart is refused with the 3–5 range; vertical inside one half is refused', () => {
  diode();
  const short = placeDiode('c8', 'c6');
  assert.equal(short.ok, false);
  assert.ok(short.reason.includes('3–5'), short.reason);
  const far = placeDiode('c12', 'c6');
  assert.equal(far.ok, false);
  assert.ok(far.reason.includes('3–5'), far.reason);
  assert.ok(/\b6\b/.test(far.reason), `names the 6 it is: ${far.reason}`);
  assert.equal(placeDiode('a6', 'c6').ok, false);
});

test("checkPlacement on the diode: a leg on a hole that holds R1's lead is refused, naming it", () => {
  diode();
  const out = placeDiode('b10', 'b6', new Map([['b6', { label: 'R1', pin: 'lead2' }]]));
  assert.equal(out.ok, false);
  assert.ok(out.reason.includes("b6 already holds R1's pin lead2"), out.reason);
});

// ── Hole map and round trip ───────────────────────────────────────────────

test('hole map: a diode on c10 (cathode) / c6 (anode) holds each hole by label and pin name', () => {
  const def = diode();
  const comp = { type: 'diode', label: def.prefix + '1', values: valuesFor(def), holeRefs: [holeRef('c10'), holeRef('c6')], pins: pinsOf(2) };
  const map = BoardIO.buildHoleMap([comp], []);
  assert.deepStrictEqual(map.get('c10'), { label: comp.label, pin: 'cathode' });
  assert.deepStrictEqual(map.get('c6'), { label: comp.label, pin: 'anode' });
  assert.equal(map.size, 2);
});

test('round trip: a 1N4001 saves one named holeRef per pin and its model; loaded back it sits on the same holes and simulates as a 1N4001', () => {
  const def = diode();
  const comp = { type: 'diode', label: def.prefix + '1', values: valuesFor(def, { model: '1N4001' }),
                 holeRefs: [holeRef('c10'), holeRef('c6')], pins: pinsOf(2) };
  const saved = BoardIO.saveHoleRefs(comp);
  assert.deepStrictEqual(saved, [{ pin: 'cathode', col: 9, row: 'c' }, { pin: 'anode', col: 5, row: 'c' }]);
  const record = JSON.parse(JSON.stringify({ type: 'diode', label: comp.label, values: comp.values, holeRefs: saved }));
  const loaded = { type: 'diode', label: comp.label, values: record.values, pins: pinsOf(2), holeRefs: BoardIO.loadHoleRefs(record) };
  assert.deepStrictEqual(Parts.legsOf(loaded).map(l => [l.pin, l.hole]), [['cathode', 'c10'], ['anode', 'c6']]);
  assert.equal(loaded.values.model, '1N4001');

  // The loaded record in the known answer, the rest built as usual.
  const board = simBoard();
  const rest = knownAnswer().filter(a => a.tool !== 'place_diode');
  assert.deepEqual(Chat.acceptBuild(rest.map(a => ({ ...a })), board), { applied: rest.length, failed: 0 });
  board.components().push(loaded);
  const m = part(board.solve()).m;
  near(m.drop, 0.7008, 0.002, 'loaded 1N4001 drop');
  near(m.current, 8.299, 0.01, 'loaded 1N4001 current');
});

// ── The AI side ───────────────────────────────────────────────────────────

const decl = name => Server.CIRCUIT_TOOLS[0].function_declarations.find(d => d.name === name);
const toolNames = message => Server.selectTools(message, []).map(d => d.name);

test('the generated place_diode tool takes holeA and holeB (both required) and an optional model of 1N4148 / 1N4001', () => {
  const def = diode();
  assert.equal(def.ai.tool || 'place_' + def.type, 'place_diode');
  const t = decl('place_diode');
  assert.ok(t, `no place_diode tool; tools: ${Server.CIRCUIT_TOOLS[0].function_declarations.map(d => d.name).join(', ')}`);
  const props = t.parameters && t.parameters.properties;
  assert.ok(props && props.holeA && props.holeB, JSON.stringify(t.parameters));
  assert.deepStrictEqual([...t.parameters.required].sort(), ['holeA', 'holeB']);
  assert.ok(props.model, `the AI can pick the model: ${JSON.stringify(props)}`);
  assert.deepStrictEqual([...props.model.enum].sort(), ['1N4001', '1N4148']);
});

test("ai: keywords include diode, rectifier, 1n4148, 1n4001, reverse protection (at most 8, lower case); about names cathode and anode", () => {
  const { ai } = diode();
  for (const k of ['diode', 'rectifier', '1n4148', '1n4001', 'reverse protection']) {
    assert.ok(ai.keywords.includes(k), `keyword "${k}" in ${JSON.stringify(ai.keywords)}`);
  }
  assert.ok(ai.keywords.length <= 8, `${ai.keywords.length} keywords`);
  assert.ok(ai.keywords.every(k => k === k.toLowerCase()), JSON.stringify(ai.keywords));
  assert.ok(ai.about.length > 0 && ai.about.length <= 200, ai.about);
  assert.match(ai.about, /cathode/i, ai.about);
  assert.match(ai.about, /anode/i, ai.about);
});

for (const message of [
  QA_PROMPT,
  'Put a 1N4001 rectifier diode in front of the buzzer',
  'add a 1n4148 to my circuit',
]) {
  test(`selectTools("${message}") sends place_diode`, () => {
    diode();
    const got = toolNames(message);
    assert.ok(got.includes('place_diode'), `place_diode missing from ${JSON.stringify(got)}`);
    assert.ok(got.length <= 12, `${got.length} tools`);
  });
}

test(`selectTools for the QA prompt also sends place_led and place_resistor`, () => {
  diode();
  const got = toolNames(QA_PROMPT);
  for (const n of ['place_diode', 'place_led', 'place_resistor']) assert.ok(got.includes(n), `${n} missing from ${JSON.stringify(got)}`);
});

test('pin: the demo prompt does not send place_diode', () => {
  diode();
  assert.ok(!toolNames('Build a single LED circuit with a current-limiting resistor.').includes('place_diode'));
});

test('a correct protection build has no circuit problems and passes finishAIReply untouched', () => {
  diode();
  const build = protection();
  assert.deepStrictEqual(Server.findCircuitProblems(build.map(a => ({ ...a }))), []);
  const out = Server.finishAIReply({ reply: 'Built it.', actions: build.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, build);
  assert.equal(out.reply, 'Built it.');
});

test('the AI places it through chat.js: place_diode 2 columns apart is refused with a note giving the 3–5 range', () => {
  diode();
  const board = simBoard();
  const out = Chat.applyActions([{ tool: 'place_diode', holeA: 'c8', holeB: 'c6' }], board);
  assert.equal(board.components().length, 0, 'nothing placed');
  assert.ok(out.failed >= 1, JSON.stringify(out));
  assert.ok(board.notes.some(n => n.includes('3–5')), `a note with the range: ${JSON.stringify(board.notes)}`);
});

// ── The browser half ──────────────────────────────────────────────────────

test('in a browser-like page with no THREE or document, diode.js defines itself on window.Parts', () => {
  const file = path.join(PARTS_DIR, 'diode.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/diode.js must exist');
  const win = vm.createContext({ TextEncoder });
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(PARTS_DIR, 'registry.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(file, 'utf8'), win);
  const def = win.Parts.get('diode');
  assert.ok(def, 'window.Parts.get("diode") after loading diode.js');
  assert.equal(def.elements({ model: '1N4148', vf: 0.65, maxCurrent: 0.2 }, {})[0].vf, 0.65);
});

test('parts/diode.js draws only through ctx: a view.build and a view.update, no App, no document, no light', () => {
  const file = path.join(PARTS_DIR, 'diode.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/diode.js must exist');
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /\bview\s*:/, 'a view: { build, update } section');
  assert.doesNotMatch(src, /\bApp\b/, 'the part file must not reach into App; use ctx');
  assert.doesNotMatch(src, /\bdocument\b/, 'the part file must not touch document');
  assert.doesNotMatch(src, /PointLight/, 'the LED without the light');
  assert.equal(typeof diode().view.build, 'function');
});

// ── docs ──────────────────────────────────────────────────────────────────

test(`docs/QA.md has one AI case for "${QA_PROMPT}"`, () => {
  const qa = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'QA.md'), 'utf8');
  const rows = qa.split('\n').filter(l => l.startsWith('|') && l.includes(QA_PROMPT));
  assert.equal(rows.length, 1, 'one QA row sends the diode prompt');
  assert.match(rows[0], /^\| AI-\d+ \|/, 'it is an AI prompt check (AI-NN)');
});
