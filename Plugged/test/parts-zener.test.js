// The Zener diode, parts/zener.js (issue #35): a diode that, reversed, holds
// a set voltage (its breakdown vz): the textbook voltage regulator. The
// simulator's D element already has breakdown (docs/API-CONTRACT.md →
// Element D, vz), so this is a part file on top of it. Its definition half
// loads in Node through require('circuit3d/js/parts'); its model is checked
// in the browser by e2e/zener.spec.js and e2e/parts.spec.js.
//
// Shapes these tests assume (the issue, plus choices stated here so the
// builder matches them):
// - Identity: type 'zener', prefix 'ZD' (D is the diode, DS the 7-segment
//   display), a name with "zener" in it, an <svg> icon. Labels ZD1, ZD2,
//   and they never collide with the diode's D1, D2.
// - pins ['cathode', 'anode'] (the diode's order: holeA = cathode, holeB = anode).
// - place { kind: 'span', span { min 3, max 5, default 4 }, rotations ['h', 'v'] }.
// - values.model { choices { '3.3V': { vz: 3.3 }, '5.1V': { vz: 5.1 },
//   '12V': { vz: 12 } }, default '5.1V' }. maxPower 0.5 W is a constant in
//   the file, not a value (W is not in the unit list).
// - elements(v): one D, pins [anode, cathode], vf 0.7, vz = v.vz, and ron =
//   the diode's 0.1 Ω (the same in forward and in breakdown).
// - measure(r) → { mode, voltage, current } (extra fields allowed):
//     mode     the D's mode as the simulator settled it: 'off' | 'on' | 'breakdown';
//     voltage  V(cathode) − V(anode), a number (0 V for a floating pin), so
//              a regulating Zener reads +5.1 V and a forward one about −0.7 V;
//     current  mA from cathode to anode (pin 0 → pin 1, the app's rule), so
//              the regulating (reverse) current is positive and a forward
//              one negative. It is −(the D element's anode → cathode current).
// - warnings(r, m): one line when |voltage × current| is over 0.5 W, naming
//   "0.5 W" and the power it is at. Forward conduction (mode 'on') at a
//   normal current and a Zener that is off are NOT warnings.
// - line(r, m): the results-panel line (measure() has no `on`, so without
//   it the panel says nothing about the Zener). In breakdown it returns
//   { text, cls } naming the Zener with its held voltage and current, e.g.
//   "  ZENER regulating at 5.10 V (6.9 mA)". Other modes: the builder's pick.
// - ai: tool place_zener (the default), holeA = cathode, holeB = anode, the
//   model an optional param; keywords include zener, regulator, voltage
//   reference, 5.1v and NOT "diode" (the diode and the LED have it).
// - examples: at least the known answer, 12 V (bench supply) → 1 kΩ → the
//   Zener's cathode, anode to ground: expect { <label>: { mode: 'breakdown',
//   voltage: [≥ 5.0, ≤ 5.2], current: [≥ 6.6, ≤ 7.2] } }.
//
// Hand-computed (ideal sources; the Zener is vz in series with 0.1 Ω in
// breakdown, vf 0.7 V in series with 0.1 Ω forward):
//   12 V → 1 kΩ → 5.1 V:            I = 6.9 / 1000.1   = 6.8993 mA, V = 5.10069
//   … with 10 kΩ across the Zener:  V = 51.012 / 10.0011 = 5.10064, Iz = 6.389 mA,
//                                   load 0.5101 mA
//   … with 470 Ω across it:         divider 12 × 470 / 1470 = 3.837 V < 5.1: off
//   12 V → 47 Ω → 5.1 V:            I = 6.9 / 47.1 = 146.50 mA, V = 5.11465,
//                                   P = 0.7493 W (over 0.5 W)
//   12 V → 100 Ω → 5.1 V:           I = 68.93 mA, P = 0.352 W (under)
//   forward, 12 V → 1 kΩ → anode:   I = 11.3 / 1000.1 = 11.2989 mA, V = −0.70113
//   3.3 V model, 12 V → 1 kΩ:       I = 8.7 / 1000.1  = 8.6991 mA, V = 3.30087
//   12 V model on the 9 V battery:  off, about 9 V across, no current
//   5.1 V + 3.3 V in series, 1 kΩ:  I = 3.6 / 1000.2  = 3.5993 mA, 5.10036 V and 3.30036 V
//   5.1 V and 3.3 V in parallel:    the 3.3 V one clamps (8.6991 mA, 3.30087 V), the 5.1 V is off
//   1N4148 → 1 kΩ → 5.1 V Zener:    I = 6.25 / 1000.2 = 6.2488 mA, V = 5.10062
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
const Sidebar = require('../circuit3d/js/sidebar.js');
const Recipes = require('./fixtures/recipes.js');

const N         = Recipes.HIGHEST_COL;   // 63
const PARTS_DIR = path.join(__dirname, '..', 'circuit3d', 'js', 'parts');
const ROWS      = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
const BOARD     = { cols: N, bodyRows: ROWS };
const RON       = 0.1;   // the diode's on resistance, reused

const QA_PROMPT   = 'Build a 5.1 V Zener regulator from a 12 V supply';
const DEMO_PROMPT = 'Build a single LED circuit with a current-limiting resistor.';

function zener() {
  const def = Parts.get('zener');
  assert.ok(def, "Parts.get('zener') is null: parts/zener.js must exist and be listed in parts/index.js");
  return def;
}
const label = (n = 1) => zener().prefix + n;

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
  const els = zener().elements(values, {});
  assert.ok(Array.isArray(els), `elements() returns a list; got ${JSON.stringify(els)}`);
  const k = els.findIndex(e => e.kind === 'D');
  assert.ok(k >= 0, `elements() should hold one D; got ${JSON.stringify(els)}`);
  return { el: els[k], id: els[k].id !== undefined ? els[k].id : k, els };
}

// A PartResult for the Zener. `current` is the D element's, in mA, + from
// anode to cathode (so negative in breakdown), as the simulator gives it.
function result({ mode, current = 0, anode = 0, cathode = 0, model = '5.1V' }) {
  const values = valuesFor(zener(), { model });
  const { id } = dOf(values);
  return { label: label(), values, controls: {}, pins: { cathode, anode },
           current: { [id]: current }, modes: { [id]: mode }, open: { [id]: 0 } };
}
const warningsOf = r => (zener().warnings ? zener().warnings(r, zener().measure(r)) : []);

// "a2" → { col: 1, row: 'a' }; "tp_50" → { col: 49, row: 'tp' }.
function holeRef(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  assert.ok(m, 'not a hole: ' + s);
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}
const pinsOf = n => Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));

// ── Builds as AI actions, applied to a board that keeps real records ──────

const wire = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });

// The bench supply at `volts` on the rails at the far end.
const supply = (volts = 12) => [
  { tool: 'delete_all' },
  { tool: 'place_bench_supply', voltage: volts },
  wire('PS1.0', `tp_${N}`, 'red'),
  wire('PS1.1', `tn_${N}`, 'black'),
];

// The 9 V battery on the rails at the far end.
const battery = () => [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  wire('BAT1.0', `tp_${N}`, 'red'),
  wire('BAT1.1', `tn_${N}`, 'black'),
];

// The Zener, cathode in holeA, anode in holeB.
const placeZener = (cathode, anode, model) => Object.assign({ tool: 'place_zener', holeA: cathode, holeB: anode }, model ? { model } : {});

// The regulator: tp_2 → a2; R b2–b6; Zener cathode c6, anode c10 (reversed
// to the supply, as regulation needs); a10 → tn_10. `flipped` puts the
// anode on c6 (forward). `load` adds R2 d6–d10, across the Zener.
function regulator({ ohms = 1000, model, flipped = false, load, source = supply() } = {}) {
  return source.concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6', resistance: ohms },
    flipped ? placeZener('c10', 'c6', model) : placeZener('c6', 'c10', model),
    ...(load ? [{ tool: 'place_resistor', holeA: 'd6', holeB: 'd10', resistance: load }] : []),
    wire('a10', 'tn_10', 'black'),
  ]);
}

// A board that keeps real records the way App leaves them (as in
// test/parts-diode.test.js), so Sim.analyze can solve it.
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
  zener();
  const board = simBoard();
  const out = Chat.acceptBuild(actions.map(a => ({ ...a })), board);
  assert.deepEqual(out, { applied: actions.length, failed: 0 }, `every action applies; notes ${JSON.stringify(board.notes)}`);
  const r = board.solve();
  assert.equal(r.status, 'ok', `status ${r.status}: ${text(r)}`);
  return { board, r };
}

// A part's { r, m, warnings } in a solved circuit.
function part(r, lbl = label()) {
  const p = r.parts && r.parts[lbl];
  assert.ok(p, `analyze().parts has no ${lbl}; got ${JSON.stringify(Object.keys(r.parts || {}))}`);
  return p;
}

// ── The file and its identity ─────────────────────────────────────────────

test('parts/index.js lists zener.js, and the file exists', () => {
  const src = fs.readFileSync(path.join(PARTS_DIR, 'index.js'), 'utf8');
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, 'parts/index.js must keep its FILES list');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  assert.ok(files.includes('zener.js'), `FILES should include 'zener.js'; got ${JSON.stringify(files)}`);
  assert.ok(fs.existsSync(path.join(PARTS_DIR, 'zener.js')), 'circuit3d/js/parts/zener.js must exist');
});

test('both 3D pages load js/parts/zener.js, after registry.js and before components.js', () => {
  for (const page of ['circuit3d/index.html', 'circuit3d/viewer.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    const at = order.indexOf('js/parts/zener.js');
    assert.ok(at >= 0, `${page} loads js/parts/zener.js: ${order.join(', ')}`);
    assert.ok(at > order.indexOf('js/parts/registry.js'), `${page}: zener.js comes after registry.js`);
    const comps = order.indexOf('js/components.js');
    if (comps >= 0) assert.ok(at < comps, `${page}: zener.js comes before components.js`);
  }
});

test("identity: type 'zener', prefix 'ZD' (used by no other part), a name with \"zener\" in it, an <svg> icon, not a source", () => {
  const def = zener();
  assert.equal(def.type, 'zener');
  assert.match(def.name, /zener/i, `name: ${def.name}`);
  assert.equal(typeof def.sub, 'string');
  assert.ok(def.sub.length > 0 && def.sub.length <= 32, def.sub);
  assert.match(def.icon, /^<svg/);
  assert.equal(def.ref, undefined, 'a Zener is not a source');
  assert.equal(def.prefix, 'ZD');
  const others = Parts.all().filter(d => d.type !== 'zener').map(d => d.prefix);
  assert.ok(!others.includes(def.prefix), `prefix ${def.prefix} is already used: ${JSON.stringify(others)}`);
});

test('labels ZD1, ZD2 never collide with the diode\'s D1, D2 (nextLabel and findByLabel)', () => {
  zener();
  assert.equal(Ids.nextLabel([], 'zener'), 'ZD1');
  assert.equal(Ids.nextLabel([{ type: 'zener', label: 'ZD1' }], 'zener'), 'ZD2');
  const board = [{ type: 'zener', label: 'ZD1' }, { type: 'zener', label: 'ZD2' }];
  assert.equal(Ids.nextLabel(board, 'diode'), 'D1', 'ZD1 and ZD2 do not count as diodes');
  assert.equal(Ids.nextLabel([...board, { type: 'diode', label: 'D1' }], 'diode'), 'D2');
  assert.equal(Ids.nextLabel([{ type: 'diode', label: 'D1' }, { type: 'diode', label: 'D2' }], 'zener'), 'ZD1');
  assert.equal(Ids.findByLabel(board, 'D1'), null, 'D1 is not ZD1');
});

test("pins ['cathode', 'anode'] (the diode's order); a span part, 3–5 columns (4 by default), rotations h and v; flippable", () => {
  const def = zener();
  assert.deepStrictEqual([...def.pins], ['cathode', 'anode']);
  assert.deepStrictEqual(plain(def.place), { kind: 'span', span: { min: 3, max: 5, default: 4 }, rotations: ['h', 'v'] });
  assert.equal(Parts.isFlippable(def), true);
});

// ── Values: the model ─────────────────────────────────────────────────────

test("values.model: 3.3V, 5.1V and 12V (vz), 5.1V by default; no maxPower value (a constant)", () => {
  const spec = zener().values && zener().values.model;
  assert.ok(spec && spec.choices, `values.model must be a choices ValueSpec; got ${JSON.stringify(spec)}`);
  assert.deepStrictEqual(plain(spec.choices), { '3.3V': { vz: 3.3 }, '5.1V': { vz: 5.1 }, '12V': { vz: 12 } });
  assert.equal(spec.default, '5.1V');
  assert.deepStrictEqual(Object.keys(zener().values), ['model'], 'model is the only value');
  const v = valuesFor(zener());
  assert.deepStrictEqual([v.model, v.vz], ['5.1V', 5.1]);
});

test('checkValue on the Zener: model 12V ok, 6.2V refused naming the three models', () => {
  zener();
  assert.deepStrictEqual(Parts.checkValue('zener', 'model', '12V'), { ok: true, value: '12V' });
  const bad = Parts.checkValue('zener', 'model', '6.2V');
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'model must be one of 3.3V, 5.1V, 12V');
});

// ── elements(): one D with breakdown ──────────────────────────────────────

test('elements(): one D from anode to cathode, vf 0.7, ron 0.1 Ω, vz from the model (3.3 / 5.1 / 12)', () => {
  for (const [model, vz] of [['3.3V', 3.3], ['5.1V', 5.1], ['12V', 12]]) {
    const { el, els } = dOf(valuesFor(zener(), { model }));
    assert.equal(els.length, 1, `${model}: one element; got ${JSON.stringify(els)}`);
    assert.equal(el.kind, 'D');
    assert.deepStrictEqual([...el.pins], ['anode', 'cathode'], 'D pins are [anode, cathode]');
    assert.equal(el.vf, 0.7, `${model}: D vf ${el.vf}`);
    assert.equal(el.ron, RON, `${model}: D ron ${el.ron}`);
    assert.equal(el.vz, vz, `${model}: D vz ${el.vz}`);
  }
});

// ── measure(): { mode, voltage, current } ─────────────────────────────────

test("measure(): regulating is { mode: 'breakdown', voltage: +5.1007 (cathode − anode), current: +6.899 mA (cathode → anode) }", () => {
  const m = zener().measure(result({ mode: 'breakdown', current: -6.8993, cathode: 5.10069, anode: 0 }));
  assert.equal(m.mode, 'breakdown', JSON.stringify(m));
  near(m.voltage, 5.10069, 0.0001, 'voltage = V(cathode) − V(anode)');
  near(m.current, 6.8993, 0.0001, 'current (mA), + from cathode to anode');
});

test("measure(): forward is { mode: 'on', voltage: −0.701, current: −11.299 mA }", () => {
  const m = zener().measure(result({ mode: 'on', current: 11.2989, cathode: 0, anode: 0.70113 }));
  assert.equal(m.mode, 'on', JSON.stringify(m));
  near(m.voltage, -0.70113, 0.0001, 'voltage');
  near(m.current, -11.2989, 0.0001, 'current');
});

test("measure(): a floating Zener (pins null) is 'off' with finite, JSON-safe numbers", () => {
  const m = zener().measure(result({ mode: 'off', current: 0, anode: null, cathode: null }));
  assert.equal(m.mode, 'off');
  assert.ok(Number.isFinite(m.voltage), `voltage: ${m.voltage}`);
  assert.ok(Number.isFinite(m.current), `current: ${m.current}`);
  assert.deepEqual(plain(m), m, 'flat and JSON-safe');   // loose: −0 and 0 are the same reading
});

// ── warnings(): over 0.5 W only ───────────────────────────────────────────

test('warnings(): 5.115 V at 146.5 mA is 0.749 W, over 0.5 W: one line naming 0.5 W and the power', () => {
  const w = warningsOf(result({ mode: 'breakdown', current: -146.497, cathode: 5.11465, anode: 0 }));
  assert.equal(w.length, 1, JSON.stringify(w));
  assert.match(w[0], /\b0\.5 ?W\b|\b500 ?mW\b/, `names the 0.5 W rating: ${w[0]}`);
  assert.match(w[0], /\b0\.7[45]\d* ?W\b|\b749(\.\d+)? ?mW\b/, `gives the power, 0.75 W: ${w[0]}`);
  assert.ok(w[0].length <= 120, w[0]);
});

test('warnings(): none at or under 0.5 W (0.352 W at 100 Ω; 6.9 mA regulating), when off, or forward at 11.3 mA', () => {
  assert.deepStrictEqual(warningsOf(result({ mode: 'breakdown', current: -68.931, cathode: 5.10689 })), []);
  assert.deepStrictEqual(warningsOf(result({ mode: 'breakdown', current: -6.8993, cathode: 5.10069 })), []);
  assert.deepStrictEqual(warningsOf(result({ mode: 'off', current: 0, cathode: 3.837 })), []);
  assert.deepStrictEqual(warningsOf(result({ mode: 'off', current: 0, anode: null, cathode: null })), []);
  assert.deepStrictEqual(warningsOf(result({ mode: 'on', current: 11.2989, anode: 0.70113 })), []);
});

test('report(): one line of at most 80 characters with the voltage (5.10 V) and the current in mA', () => {
  const r = result({ mode: 'breakdown', current: -6.8993, cathode: 5.10069 });
  const line = zener().report(r, zener().measure(r));
  assert.equal(typeof line, 'string');
  assert.ok(line.length > 0 && line.length <= 80, line);
  assert.match(line, /\b5\.1\d* ?V\b/, line);
  assert.match(line, /\b6\.9\d* ?mA\b/, line);
});

test('line(): in breakdown, a results line naming the Zener with its held voltage (5.10 V) and current (6.9 mA)', () => {
  const def = zener();
  assert.equal(typeof def.line, 'function', 'zener needs a line(r, m) for the results panel');
  const r = result({ mode: 'breakdown', current: -6.8993, cathode: 5.10069 });
  const out = def.line(r, def.measure(r));
  assert.ok(out && typeof out.text === 'string' && typeof out.cls === 'string', JSON.stringify(out));
  assert.match(out.text, /zener/i, out.text);
  assert.match(out.text, /\b5\.1\d* ?V\b/, out.text);
  assert.match(out.text, /\b6\.9\d* ?mA\b/, out.text);
  assert.ok(out.text.length <= 80, out.text);
});

// ── Known answer through the simulator ────────────────────────────────────

test('known answer: 12 V bench supply → 1 kΩ → 5.1 V Zener (cathode to the resistor, anode to ground) breaks down: 5.0–5.2 V, 6.6–7.2 mA (hand 5.1007 V, 6.899 mA), no warning', () => {
  const { r } = solveBuild(regulator());
  const { m, warnings } = part(r);
  assert.equal(m.mode, 'breakdown', JSON.stringify(m));
  assert.ok(m.voltage >= 5.0 && m.voltage <= 5.2, `voltage expected 5.0–5.2 V, got ${m.voltage}`);
  assert.ok(m.current >= 6.6 && m.current <= 7.2, `current expected 6.6–7.2 mA, got ${m.current}`);
  near(m.voltage, 5.10069, 0.001, 'hand: 5.1 + 0.1 Ω × 6.899 mA');
  near(m.current, 6.8993, 0.01, 'hand: (12 − 5.1) / 1000.1');
  assert.deepStrictEqual(warnings, []);
  near(r.parts.PS1.m.posAmps, 6.8993, 0.01, 'the supply gives the Zener current');
  assert.ok(r.lines.some(l => /zener/i.test(l.text) && /\b5\.1\d* ?V\b/.test(l.text)),
    `a results line gives the Zener's 5.1 V: ${text(r)}`);
  assert.doesNotMatch(text(r), /⚠|backwards/i, `no warning line: ${text(r)}`);
});

test("forward-biased (anode toward +): the Zener conducts like a diode, mode 'on', −0.701 V, −11.30 mA, and it is NOT a warning", () => {
  const { r } = solveBuild(regulator({ flipped: true }));
  const { m, warnings } = part(r);
  assert.equal(m.mode, 'on', JSON.stringify(m));
  near(m.voltage, -0.70113, 0.002, 'hand: −(0.7 + 0.1 Ω × 11.299 mA)');
  near(m.current, -11.2989, 0.01, 'hand: −(12 − 0.7) / 1000.1');
  assert.deepStrictEqual(warnings, []);
  assert.doesNotMatch(text(r), /backwards/i, `no results line calls it backwards: ${text(r)}`);
});

test('the model sets the held voltage: 3.3V holds 3.3009 V at 8.699 mA (placed so, or changed by set_value)', () => {
  const placed = part(solveBuild(regulator({ model: '3.3V' })).r).m;
  assert.equal(placed.mode, 'breakdown');
  near(placed.voltage, 3.30087, 0.001, 'placed as 3.3V: voltage');
  near(placed.current, 8.6991, 0.01, 'placed as 3.3V: current');
  const changed = solveBuild(regulator().concat([{ tool: 'set_value', part: label(), model: '3.3V' }]));
  const z = changed.board.components().find(c => c.type === 'zener');
  assert.deepStrictEqual([z.values.model, z.values.vz], ['3.3V', 3.3]);
  const m = part(changed.r).m;
  near(m.voltage, 3.30087, 0.001, 'changed to 3.3V: voltage');
  near(m.current, 8.6991, 0.01, 'changed to 3.3V: current');
});

test('a 12V Zener on the 9 V battery never reaches breakdown: off, about 9 V across it, under 0.01 mA, no warning', () => {
  const { r } = solveBuild(regulator({ model: '12V', source: battery() }));
  const { m, warnings } = part(r);
  assert.equal(m.mode, 'off', JSON.stringify(m));
  near(m.voltage, 9, 0.05, 'the whole 9 V, through the idle resistor');
  assert.ok(Math.abs(m.current) < 0.01, `current expected under 0.01 mA, got ${m.current}`);
  assert.deepStrictEqual(warnings, []);
});

test('the 5.1 V Zener on the 9 V battery through 1 kΩ still regulates: 5.1004 V at 3.8996 mA', () => {
  const { m } = part(solveBuild(regulator({ source: battery() })).r);
  assert.equal(m.mode, 'breakdown', JSON.stringify(m));
  near(m.current, 3.8996, 0.01, 'hand: (9 − 5.1) / 1000.1');
  near(m.voltage, 5.1 + 0.1 * 3.8996 / 1000, 0.001, 'voltage');
});

// ── Complex circuits ──────────────────────────────────────────────────────

test('regulator with a 10 kΩ load across the Zener: the node holds 5.1006 V, the Zener takes 6.389 mA, the load 0.510 mA', () => {
  const { r } = solveBuild(regulator({ load: 10000 }));
  const z = part(r, 'ZD1');
  assert.equal(z.m.mode, 'breakdown', JSON.stringify(z.m));
  near(z.m.voltage, 5.10064, 0.001, 'node volts: 51.012 / 10.0011');
  near(z.m.current, 6.3893, 0.01, 'Zener mA: (V − 5.1) / 0.1 Ω');
  near(Math.abs(r.parts.R2.m.current), 0.51006, 0.005, 'load mA: V / 10 kΩ');
  near(r.parts.PS1.m.posAmps, 6.8994, 0.01, 'supply mA: (12 − V) / 1 kΩ');
  assert.deepStrictEqual(z.warnings, []);
});

test('a 470 Ω load pulls the node below 5.1 V: the divider gives 3.837 V, the Zener drops out (off, under 0.01 mA), the load takes 8.163 mA', () => {
  const { r } = solveBuild(regulator({ load: 470 }));
  const z = part(r, 'ZD1');
  assert.equal(z.m.mode, 'off', JSON.stringify(z.m));
  near(z.m.voltage, 3.83673, 0.002, 'hand: 12 × 470 / 1470');
  assert.ok(Math.abs(z.m.current) < 0.01, `Zener current expected under 0.01 mA, got ${z.m.current}`);
  near(Math.abs(r.parts.R2.m.current), 8.1633, 0.01, 'load mA: 12 / 1470');
  assert.deepStrictEqual(z.warnings, [], 'out of regulation is not a warning');
});

test('over 0.5 W in the simulator: 12 V → 47 Ω → 5.1 V Zener takes 146.5 mA at 5.115 V (0.749 W) and warns (a results line too); 100 Ω (0.352 W) does not', () => {
  const small = solveBuild(regulator({ ohms: 47 })).r;
  const p = part(small);
  assert.equal(p.m.mode, 'breakdown');
  near(p.m.current, 146.497, 0.2, '(12 − 5.1) / 47.1');
  near(p.m.voltage, 5.11465, 0.002, '5.1 + 0.1 Ω × 146.5 mA');
  assert.equal(p.warnings.length, 1, JSON.stringify(p.warnings));
  assert.match(p.warnings[0], /\b0\.5 ?W\b|\b500 ?mW\b/, p.warnings[0]);
  assert.ok(small.lines.some(l => l.text.includes(p.warnings[0])), `the warning is a results line: ${text(small)}`);
  const big = part(solveBuild(regulator({ ohms: 100 })).r);
  near(big.m.current, 68.931, 0.1, '(12 − 5.1) / 100.1');
  assert.deepStrictEqual(big.warnings, []);
});

test('two Zeners in series (5.1V then 3.3V) behind 1 kΩ: 3.599 mA through both, holding 5.1004 V and 3.3004 V', () => {
  // tp_2 → a2; R b2–b6 1 kΩ; ZD1 cathode c6, anode c10; ZD2 cathode d10, anode d14; a14 → tn_14.
  const { r } = solveBuild(supply().concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6', resistance: 1000 },
    placeZener('c6', 'c10'),
    placeZener('d10', 'd14', '3.3V'),
    wire('a14', 'tn_14', 'black'),
  ]));
  const z1 = part(r, 'ZD1'), z2 = part(r, 'ZD2');
  assert.deepStrictEqual([z1.m.mode, z2.m.mode], ['breakdown', 'breakdown']);
  near(z1.m.current, 3.5993, 0.01, 'ZD1 mA: (12 − 8.4) / 1000.2');
  near(z2.m.current, 3.5993, 0.01, 'ZD2 mA');
  near(z1.m.voltage, 5.10036, 0.001, 'ZD1 V');
  near(z2.m.voltage, 3.30036, 0.001, 'ZD2 V');
  assert.deepStrictEqual([z1.warnings, z2.warnings], [[], []]);
});

test('two Zeners in parallel (5.1V and 3.3V) on one node: the 3.3V clamps it at 3.3009 V and takes all 8.699 mA; the 5.1V stays off', () => {
  // ZD1 5.1V cathode c6, anode c10; ZD2 3.3V cathode d6, anode d10; a10 → tn_10.
  const { r } = solveBuild(regulator().concat([placeZener('d6', 'd10', '3.3V')]));
  const z1 = part(r, 'ZD1'), z2 = part(r, 'ZD2');
  assert.equal(z1.m.mode, 'off', `ZD1 ${JSON.stringify(z1.m)}`);
  assert.ok(Math.abs(z1.m.current) < 0.01, `ZD1 mA ${z1.m.current}`);
  near(z1.m.voltage, 3.30087, 0.001, 'ZD1 sees the clamped node');
  assert.equal(z2.m.mode, 'breakdown', `ZD2 ${JSON.stringify(z2.m)}`);
  near(z2.m.current, 8.6991, 0.01, 'ZD2 mA: (12 − 3.3) / 1000.1');
  near(z2.m.voltage, 3.30087, 0.001, 'ZD2 V');
});

test('a 1N4148 diode (D1) in front of the regulator (ZD1): both labels solve apart, 6.249 mA through both, ZD1 holds 5.1006 V', () => {
  // tp_2 → a2; D1 anode b2, cathode b6; R1 c6–c10 1 kΩ; ZD1 cathode d10, anode d14; a14 → tn_14.
  const { board, r } = solveBuild(supply().concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_diode', holeA: 'b6', holeB: 'b2' },
    { tool: 'place_resistor', holeA: 'c6', holeB: 'c10', resistance: 1000 },
    placeZener('d10', 'd14'),
    wire('a14', 'tn_14', 'black'),
  ]));
  assert.deepStrictEqual(board.components().map(c => c.label).sort(), ['D1', 'PS1', 'R1', 'ZD1']);
  const d = part(r, 'D1'), z = part(r, 'ZD1');
  assert.equal(d.m.on, true, JSON.stringify(d.m));
  near(d.m.current, 6.2488, 0.01, 'D1 mA: (12 − 0.65 − 5.1) / 1000.2');
  assert.equal(z.m.mode, 'breakdown', JSON.stringify(z.m));
  near(z.m.current, 6.2488, 0.01, 'ZD1 mA');
  near(z.m.voltage, 5.10062, 0.001, 'ZD1 V');
  assert.deepStrictEqual([d.warnings, z.warnings], [[], []]);
});

// ── examples ──────────────────────────────────────────────────────────────

test('examples: the known answer (12 V bench supply, 1 kΩ, 5.1V Zener reversed) expects breakdown, voltage within 5.0–5.2 V and current within 6.6–7.2 mA', () => {
  const def = zener();
  const ex = (def.examples || []).find(e => {
    const z = e.parts.find(p => p.type === 'zener');
    const want = z && e.expect && e.expect[z.label];
    return want && Array.isArray(want.voltage) && Array.isArray(want.current);
  });
  assert.ok(ex, `an example expecting { voltage: [lo, hi], current: [lo, hi] }; got ${JSON.stringify((def.examples || []).map(e => [e.name, e.expect]))}`);
  const z = ex.parts.find(p => p.type === 'zener');
  const want = ex.expect[z.label];
  assert.equal(want.mode, 'breakdown', `expects mode 'breakdown': ${JSON.stringify(want)}`);
  assert.ok(want.voltage[0] >= 5.0 && want.voltage[1] <= 5.2, `voltage range inside 5.0–5.2: ${JSON.stringify(want.voltage)}`);
  assert.ok(want.current[0] >= 6.6 && want.current[1] <= 7.2, `current range inside 6.6–7.2: ${JSON.stringify(want.current)}`);
  assert.ok(want.voltage[0] <= 5.10069 && want.voltage[1] >= 5.10069 && want.current[0] <= 6.8993 && want.current[1] >= 6.8993,
    `the ranges hold the hand answer 5.1007 V, 6.899 mA: ${JSON.stringify(want)}`);
  assert.ok(!(z.values && z.values.model) || z.values.model === '5.1V', 'the example uses the 5.1V model');
  const ps = ex.parts.find(p => p.type === 'bench_supply');
  assert.ok(ps, 'the example is powered by the bench supply (the battery is fixed at 9 V)');
  assert.equal((ps.values && ps.values.voltage) || Parts.get('bench_supply').values.voltage.default, 12, 'the supply is at 12 V');
  const r = ex.parts.find(p => p.type === 'resistor');
  assert.equal(r && r.values && r.values.resistance, 1000, 'the example uses a 1 kΩ resistor');
  // test/parts-examples.test.js solves every example against its expect.
});

// ── Placement ─────────────────────────────────────────────────────────────

const leg = (pin, s) => ({ pin, col: +s.slice(1) - 1, row: s[0] });
const placeLegs = (cathode, anode, map) =>
  Parts.checkPlacement('zener', [leg('cathode', cathode), leg('anode', anode)], map || new Map(), BOARD);

test('checkPlacement on the Zener: 3–5 columns apart ok either way round, across the gap ok; 2 or 6 apart refused with the 3–5 range', () => {
  zener();
  for (const [c, a] of [['c9', 'c6'], ['c10', 'c6'], ['c11', 'c6'], ['c6', 'c10'], ['e6', 'f6']]) {
    assert.deepStrictEqual(placeLegs(c, a), { ok: true }, `${c}/${a}`);
  }
  for (const [c, a] of [['c8', 'c6'], ['c12', 'c6']]) {
    const out = placeLegs(c, a);
    assert.equal(out.ok, false, `${c}/${a}`);
    assert.ok(out.reason.includes('3–5'), out.reason);
  }
});

test("checkPlacement on the Zener: a leg on a hole that holds R1's lead is refused, naming it", () => {
  zener();
  const out = placeLegs('b10', 'b6', new Map([['b6', { label: 'R1', pin: 'lead2' }]]));
  assert.equal(out.ok, false);
  assert.ok(out.reason.includes("b6 already holds R1's pin lead2"), out.reason);
});

// ── Hole map and round trip ───────────────────────────────────────────────

test('hole map: a Zener on c6 (cathode) / c10 (anode) holds each hole by label and pin name', () => {
  const def = zener();
  const comp = { type: 'zener', label: 'ZD1', values: valuesFor(def), holeRefs: [holeRef('c6'), holeRef('c10')], pins: pinsOf(2) };
  const map = BoardIO.buildHoleMap([comp], []);
  assert.deepStrictEqual(map.get('c6'), { label: 'ZD1', pin: 'cathode' });
  assert.deepStrictEqual(map.get('c10'), { label: 'ZD1', pin: 'anode' });
  assert.equal(map.size, 2);
});

test('round trip: a 3.3V Zener saves one named holeRef per pin and its model; loaded back it sits on the same holes and holds 3.3 V', () => {
  const def = zener();
  const comp = { type: 'zener', label: 'ZD1', values: valuesFor(def, { model: '3.3V' }),
                 holeRefs: [holeRef('c6'), holeRef('c10')], pins: pinsOf(2) };
  const saved = BoardIO.saveHoleRefs(comp);
  assert.deepStrictEqual(saved, [{ pin: 'cathode', col: 5, row: 'c' }, { pin: 'anode', col: 9, row: 'c' }]);
  const record = JSON.parse(JSON.stringify({ type: 'zener', label: comp.label, values: comp.values, holeRefs: saved }));
  const loaded = { type: 'zener', label: comp.label, values: record.values, pins: pinsOf(2), holeRefs: BoardIO.loadHoleRefs(record) };
  assert.deepStrictEqual(Parts.legsOf(loaded).map(l => [l.pin, l.hole]), [['cathode', 'c6'], ['anode', 'c10']]);
  assert.equal(loaded.values.model, '3.3V');

  const board = simBoard();
  const rest = regulator().filter(a => a.tool !== 'place_zener');
  assert.deepEqual(Chat.acceptBuild(rest.map(a => ({ ...a })), board), { applied: rest.length, failed: 0 });
  board.components().push(loaded);
  const m = part(board.solve()).m;
  assert.equal(m.mode, 'breakdown');
  near(m.voltage, 3.30087, 0.001, 'loaded 3.3V voltage');
  near(m.current, 8.6991, 0.01, 'loaded 3.3V current');
});

// ── The AI side ───────────────────────────────────────────────────────────

const decl = name => Server.CIRCUIT_TOOLS[0].function_declarations.find(d => d.name === name);
const toolNames = message => Server.selectTools(message, []).map(d => d.name);

test('the generated place_zener tool takes holeA and holeB (both required) and an optional model of 3.3V / 5.1V / 12V', () => {
  const def = zener();
  assert.equal(def.ai.tool || 'place_' + def.type, 'place_zener');
  const t = decl('place_zener');
  assert.ok(t, `no place_zener tool; tools: ${Server.CIRCUIT_TOOLS[0].function_declarations.map(d => d.name).join(', ')}`);
  const props = t.parameters && t.parameters.properties;
  assert.ok(props && props.holeA && props.holeB, JSON.stringify(t.parameters));
  assert.deepStrictEqual([...t.parameters.required].sort(), ['holeA', 'holeB']);
  assert.ok(props.model, `the AI can pick the model: ${JSON.stringify(props)}`);
  assert.deepStrictEqual([...props.model.enum].sort(), ['12V', '3.3V', '5.1V']);
});

test('ai: keywords include zener, regulator, voltage reference, 5.1v, and not "diode" (at most 8, lower case); about names cathode and anode', () => {
  const { ai } = zener();
  for (const k of ['zener', 'regulator', 'voltage reference', '5.1v']) {
    assert.ok(ai.keywords.includes(k), `keyword "${k}" in ${JSON.stringify(ai.keywords)}`);
  }
  assert.ok(!ai.keywords.includes('diode'), 'the diode and the LED already answer to "diode"');
  assert.ok(ai.keywords.length <= 8, `${ai.keywords.length} keywords`);
  assert.ok(ai.keywords.every(k => k === k.toLowerCase()), JSON.stringify(ai.keywords));
  assert.ok(ai.about.length > 0 && ai.about.length <= 200, ai.about);
  assert.match(ai.about, /cathode/i, ai.about);
  assert.match(ai.about, /anode/i, ai.about);
});

for (const message of [
  QA_PROMPT,
  'add a zener diode as a voltage reference',
  'Use a 5.1v zener to clamp the signal',
]) {
  test(`selectTools("${message}") sends place_zener`, () => {
    zener();
    const got = toolNames(message);
    assert.ok(got.includes('place_zener'), `place_zener missing from ${JSON.stringify(got)}`);
    assert.ok(got.length <= 12, `${got.length} tools`);
  });
}

// The recipe is powered by the bench supply at 12 V through a resistor, so
// the QA request must hand the model those tools too, not only place_zener
// (otherwise it has to find them with use_parts first).
test('selectTools for the QA prompt also sends place_resistor and place_bench_supply', () => {
  zener();
  const got = toolNames(QA_PROMPT);
  for (const n of ['place_zener', 'place_resistor', 'place_bench_supply']) assert.ok(got.includes(n), `${n} missing from ${JSON.stringify(got)}`);
});

test('pin: the demo prompt and the diode\'s QA prompt do not send place_zener', () => {
  zener();
  for (const m of [DEMO_PROMPT, 'Add a diode for reverse-polarity protection to an LED circuit']) {
    assert.ok(!toolNames(m).includes('place_zener'), `"${m}" sends place_zener: ${JSON.stringify(toolNames(m))}`);
  }
});

test('a correct regulator build has no circuit problems and passes finishAIReply untouched', () => {
  zener();
  const build = regulator();
  assert.deepStrictEqual(Server.findCircuitProblems(build.map(a => ({ ...a }))), []);
  const out = Server.finishAIReply({ reply: 'Built it.', actions: build.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, build);
  assert.equal(out.reply, 'Built it.');
});

test('the AI places it through chat.js: place_zener 2 columns apart is refused with a note giving the 3–5 range', () => {
  zener();
  const board = simBoard();
  const out = Chat.applyActions([{ tool: 'place_zener', holeA: 'c6', holeB: 'c8' }], board);
  assert.equal(board.components().length, 0, 'nothing placed');
  assert.ok(out.failed >= 1, JSON.stringify(out));
  assert.ok(board.notes.some(n => n.includes('3–5')), `a note with the range: ${JSON.stringify(board.notes)}`);
});

// ── The sidebar ───────────────────────────────────────────────────────────

test('sidebar search: "zener" and "regulator" find only the Zener, in Semiconductors', () => {
  zener();
  for (const q of ['zener', 'Regulator']) {
    const gs = Sidebar.groups(Parts.all(), q);
    assert.deepStrictEqual(gs.map(g => g.category), ['Semiconductors'], `"${q}": ${JSON.stringify(gs.map(g => g.category))}`);
    assert.deepStrictEqual(gs.flatMap(g => g.parts.map(p => p.type)), ['zener'], `"${q}"`);
  }
});

// ── The browser half ──────────────────────────────────────────────────────

test('in a browser-like page with no THREE or document, zener.js defines itself on window.Parts', () => {
  const file = path.join(PARTS_DIR, 'zener.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/zener.js must exist');
  const win = vm.createContext({ TextEncoder });
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(PARTS_DIR, 'registry.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(file, 'utf8'), win);
  const def = win.Parts.get('zener');
  assert.ok(def, 'window.Parts.get("zener") after loading zener.js');
  assert.equal(def.elements({ model: '5.1V', vz: 5.1 }, {})[0].vz, 5.1);
});

test('parts/zener.js draws only through ctx: a view.build, no App, no document, no light', () => {
  const file = path.join(PARTS_DIR, 'zener.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/zener.js must exist');
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /\bview\s*:/, 'a view: { build } section');
  assert.doesNotMatch(src, /\bApp\b/, 'the part file must not reach into App; use ctx');
  assert.doesNotMatch(src, /\bdocument\b/, 'the part file must not touch document');
  assert.doesNotMatch(src, /PointLight/, 'no light');
  assert.equal(typeof zener().view.build, 'function');
});

// ── docs ──────────────────────────────────────────────────────────────────

test(`docs/QA.md has one AI case for "${QA_PROMPT}"`, () => {
  const qa = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'QA.md'), 'utf8');
  const rows = qa.split('\n').filter(l => l.startsWith('|') && l.includes(QA_PROMPT));
  assert.equal(rows.length, 1, 'one QA row sends the Zener prompt');
  assert.match(rows[0], /^\| AI-\d+ \|/, 'it is an AI prompt check (AI-NN)');
});
