// The DC motor, parts/motor.js (issue #37): a small motor that spins faster
// with more current, turns the other way when the current reverses, and
// warns when it draws more than a 9 V battery should give (0.5 A). It is the
// resistor (#23) with a measure(), warnings(), a results line and a spinning
// view.update. Its definition half loads in Node through
// require('circuit3d/js/parts'); placing it by hand, Run and the shaft
// turning in the page are checked by e2e/motor.spec.js and e2e/parts.spec.js.
// Its worked build for the AI (ai.recipe, ai.guide) is
// test/motor-recipe.test.js.
//
// Shapes these tests assume (the issue, plus choices stated here so the
// builder matches them):
// - Identity: type 'motor'; the name says motor, the icon is an <svg>, not a
//   source. The prefix is unique (taken: R, RV, BAT, PS, D, ZD, LED, DS, BZ,
//   LDR, SW, S, SS (slide switch), TH; the bulb, #36, takes LP or BL); 'M' is
//   proposed. Labels are prefix + 1, prefix + 2.
// - pins ['1', '2']; place { kind: 'span', span { min 3, max 5, default 4 },
//   rotations ['h', 'v'] } (the resistor's).
// - values: resistance { unit 'Ω', default 10, min 1, max 100 },
//   startCurrent { unit 'A', default 0.05, min 0.001, max 2 }.
// - elements(v): one R, pins ['1', '2'], ohms = v.resistance.
// - measure(r) → { spinning, speed, direction, current }:
//     current   mA through the R (r.current, in mA), a positive magnitude
//     spinning  current ≥ startCurrent (in mA: startCurrent × 1000)
//     speed     while spinning, current / (5 × startCurrent), capped at 1
//               (not checked while not spinning)
//     direction 1 when the current runs pin 1 → pin 2, −1 the other way
//               (checked while spinning)
//   Flat and JSON-safe.
// - warnings(r, m): one line (≤ 120 chars) naming the 0.5 A limit ("0.5 A"
//   or "500 mA") when the current is over 500 mA; none otherwise.
// - line(r, m): the results-panel line, naming the motor (/motor/i): while
//   spinning it says "spinning" with the current ("300.0 mA" or "300 mA");
//   while stalled it says "not spinning" (or "stalled").
// - report(r, m): one line ≤ 80 chars, the same words: "spinning" and the
//   mA, or "not spinning" / "stalled".
// - view: { build, update }, drawing only through ctx; update spins the
//   shaft (userData.motorShaft) from m, with no setInterval (the turning is
//   checked in the page, e2e/motor.spec.js).
// - ai: tool place_motor (the default); keywords include motor, dc motor,
//   fan, spin. Not `everyday`.
// - examples: at least the known answer, 300 mA spinning and 30 mA not.
//
// Hand-computed (ideal battery; the motor is a plain 10 Ω resistor; start
// 50 mA; full speed from 5 × 50 = 250 mA):
//   3 V across it:          300 mA, spinning, speed 1 (300 / 250, capped)
//   1 V across it:          100 mA, spinning, speed 0.4
//   3 V through 90 Ω:       3 / 100 = 30 mA (0.3 V across it), not spinning
//   9 V across it:          900 mA → over 0.5 A, warns
//   490 mA no warning; 510 mA warns
//   3 V, battery reversed:  −300 mA → direction −1, still spinning at speed 1
//   two in series on 3 V:   3 / 20 = 150 mA through both, speed 0.6 each
//   two in parallel on 3 V: 300 mA each, 600 mA from the battery, no warning
//   9 V → 20 Ω → motor:     9 / 30 = 300 mA, spinning, speed 1, no warning
//   startCurrent 0.5 A at 3 V: 300 < 500 mA, not spinning
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

const QA_PROMPT    = 'Make a motor spin with a switch';
const DEMO_PROMPT  = 'Build a single LED circuit with a current-limiting resistor.';
const BENCH_PROMPT = 'Power an LED from the bench supply at 5 V with a series resistor.';

const TAKEN = ['R', 'RV', 'BAT', 'PS', 'D', 'ZD', 'LED', 'DS', 'BZ', 'LDR', 'SW', 'S', 'SS', 'TH', 'LP', 'BL'];

function motor() {
  const def = Parts.get('motor');
  assert.ok(def, "Parts.get('motor') is null: parts/motor.js must exist and be listed in parts/index.js");
  return def;
}
const label = (n = 1) => motor().prefix + n;

const plain = o => JSON.parse(JSON.stringify(o));
function near(got, want, tol, what) {
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want} (±${tol}), got ${got}`);
}
const text = r => (r.lines || []).map(l => l.text).join(' | ');

function valuesFor(def, given) {
  const v = {};
  for (const [key, spec] of Object.entries(def.values || {})) v[key] = spec.default;
  Object.assign(v, given || {});
  for (const [key, spec] of Object.entries(def.values || {})) {
    if (spec.choices && spec.choices[v[key]]) Object.assign(v, spec.choices[v[key]]);
  }
  return v;
}

// The one R element and its key in PartResult (id, or index).
function rOf(values) {
  const els = motor().elements(valuesFor(motor(), values), {});
  assert.ok(Array.isArray(els), `elements() returns a list; got ${JSON.stringify(els)}`);
  const k = els.findIndex(e => e.kind === 'R');
  assert.ok(k >= 0, `elements() should hold one R; got ${JSON.stringify(els)}`);
  return { el: els[k], id: els[k].id !== undefined ? els[k].id : k, els };
}

// A PartResult for the motor carrying `mA` from pin 1 to pin 2 (negative:
// the other way), as the core hands it over, with pin voltages that agree.
function result(mA, values) {
  const v = valuesFor(motor(), values);
  const { id } = rOf(v);
  const volts = mA / 1000 * v.resistance;
  return { label: label(), values: v, controls: {}, pins: { 1: Math.max(volts, 0), 2: Math.max(-volts, 0) },
           current: { [id]: mA }, modes: {}, open: {} };
}
const measureAt = (mA, values) => { const r = result(mA, values); return { r, m: motor().measure(r) }; };

function holeRef(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  assert.ok(m, 'not a hole: ' + s);
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}
const pinsOf = n => Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));

// ── Builds as AI actions, applied to a board that keeps real records ──────

const wire = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });

// The battery at `volts` (null: the default 9 V) on the rails at the highest
// column; `reversed` wires it the wrong way round (+ to tn, − to tp).
const battery = (volts, { reversed = false } = {}) => [
  { tool: 'delete_all' },
  Object.assign({ tool: 'place_battery' }, volts == null ? {} : { voltage: volts }),
  wire('BAT1.0', `${reversed ? 'tn' : 'tp'}_${N}`, 'red'),
  wire('BAT1.1', `${reversed ? 'tp' : 'tn'}_${N}`, 'black'),
];

// The known answer: the battery at `volts` straight across the motor on
// b2–b6 (pin 1 b2, pin 2 b6): tp_2 → a2, a6 → tn_6. `reversed` swaps its pins.
function knownAnswer(volts = 3, { reversed = false, battery: bat = {}, values } = {}) {
  return battery(volts, bat).concat([
    Object.assign({ tool: 'place_motor', holeA: reversed ? 'b6' : 'b2', holeB: reversed ? 'b2' : 'b6' }, values || {}),
    wire('tp_2', 'a2', 'red'),
    wire('a6', 'tn_6', 'black'),
  ]);
}

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

function solveBuild(actions) {
  motor();
  const board = simBoard();
  const out = Chat.acceptBuild(actions.map(a => ({ ...a })), board);
  assert.deepEqual(out, { applied: actions.length, failed: 0 }, `every action applies; notes ${JSON.stringify(board.notes)}`);
  const r = board.solve();
  assert.equal(r.status, 'ok', `status ${r.status}: ${text(r)}`);
  assert.equal(r.shorted, false, `shorted: ${text(r)}`);
  return { board, r };
}

function part(r, lbl = label()) {
  const p = r.parts && r.parts[lbl];
  assert.ok(p, `analyze().parts has no ${lbl}; got ${JSON.stringify(Object.keys(r.parts || {}))}`);
  return p;
}
const warnedOf = r => Object.entries(r.parts).filter(([, q]) => q.warnings && q.warnings.length)
  .map(([l, q]) => `${l}: ${q.warnings.join('; ')}`);
const motorLines = r => (r.lines || []).filter(l => /motor/i.test(l.text)).map(l => l.text);

// A spinning motor's readings: current (±tol), speed, direction.
function spins(m, { mA, speed, direction = 1 }, what) {
  assert.strictEqual(m.spinning, true, `${what}: spinning; ${JSON.stringify(m)}`);
  near(m.current, mA, 0.05, `${what}: mA`);
  near(m.speed, speed, 0.001, `${what}: speed`);
  assert.strictEqual(m.direction, direction, `${what}: direction; ${JSON.stringify(m)}`);
}

// ── The file and its identity ─────────────────────────────────────────────

test('parts/index.js lists motor.js, and the file exists', () => {
  const src = fs.readFileSync(path.join(PARTS_DIR, 'index.js'), 'utf8');
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, 'parts/index.js must keep its FILES list');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  assert.ok(files.includes('motor.js'), `FILES should include 'motor.js'; got ${JSON.stringify(files)}`);
  assert.ok(fs.existsSync(path.join(PARTS_DIR, 'motor.js')), 'circuit3d/js/parts/motor.js must exist');
});

test('both 3D pages load js/parts/motor.js, after registry.js and before components.js', () => {
  for (const page of ['circuit3d/index.html', 'circuit3d/viewer.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    const at = order.indexOf('js/parts/motor.js');
    assert.ok(at >= 0, `${page} loads js/parts/motor.js: ${order.join(', ')}`);
    assert.ok(at > order.indexOf('js/parts/registry.js'), `${page}: motor.js comes after registry.js`);
    const comps = order.indexOf('js/components.js');
    if (comps >= 0) assert.ok(at < comps, `${page}: motor.js comes before components.js`);
  }
});

test("identity: type 'motor', named as a motor, an <svg> icon, not a source, a prefix no other part uses (M proposed)", () => {
  const def = motor();
  assert.equal(def.type, 'motor');
  assert.match(def.name, /motor/i, `name: ${def.name}`);
  assert.ok(def.name.length <= 24, def.name);
  assert.ok(typeof def.sub === 'string' && def.sub.length > 0 && def.sub.length <= 32, def.sub);
  assert.match(def.icon, /^<svg/);
  assert.equal(def.ref, undefined, 'a motor is not a source');
  assert.match(def.prefix, /^[A-Z]{1,3}$/);
  assert.ok(!TAKEN.includes(def.prefix), `prefix ${def.prefix} is one of the taken ${JSON.stringify(TAKEN)}`);
  const others = Parts.all().filter(d => d.type !== 'motor').map(d => d.prefix);
  assert.ok(!others.includes(def.prefix), `prefix ${def.prefix} is already used: ${JSON.stringify(others)}`);
});

test("labels: the motor is prefix + 1, prefix + 2; other parts on the board never count toward them, nor the motor's toward theirs", () => {
  const p = motor().prefix;
  assert.equal(Ids.nextLabel([], 'motor'), p + '1');
  assert.equal(Ids.nextLabel([{ type: 'motor', label: p + '1' }], 'motor'), p + '2');
  const board = [{ type: 'resistor', label: 'R1' }, { type: 'toggle_switch', label: 'S1' }, { type: 'button', label: 'SW1' }];
  assert.equal(Ids.nextLabel(board, 'motor'), p + '1', 'other parts do not bump the motor number');
  board.push({ type: 'motor', label: p + '1' }, { type: 'motor', label: p + '2' });
  assert.equal(Ids.nextLabel(board, 'resistor'), 'R2', 'motors do not bump the resistor number');
  assert.equal(Ids.nextLabel(board, 'toggle_switch'), 'S2', 'motors do not bump the switch number');
  assert.equal(Ids.nextLabel(board, 'motor'), p + '3');
  assert.equal(Ids.findByLabel(board, p + '2').type, 'motor');
  assert.deepStrictEqual(Ids.parsePinRef(p + '1.1'), { label: p + '1', pin: 1 });
});

test("pins ['1', '2']; a span part, 3–5 columns (4 by default), rotations h and v", () => {
  const def = motor();
  assert.deepStrictEqual([...def.pins], ['1', '2']);
  assert.deepStrictEqual(plain(def.place), { kind: 'span', span: { min: 3, max: 5, default: 4 }, rotations: ['h', 'v'] });
});

test('values: resistance 10 Ω (1–100) and startCurrent 0.05 A (0.001–2)', () => {
  const v = plain(motor().values);
  assert.deepStrictEqual(Object.keys(v).sort(), ['resistance', 'startCurrent']);
  assert.deepStrictEqual({ unit: v.resistance.unit, default: v.resistance.default, min: v.resistance.min, max: v.resistance.max },
    { unit: 'Ω', default: 10, min: 1, max: 100 });
  assert.deepStrictEqual({ unit: v.startCurrent.unit, default: v.startCurrent.default, min: v.startCurrent.min, max: v.startCurrent.max },
    { unit: 'A', default: 0.05, min: 0.001, max: 2 });
});

test('checkValue: resistance 47 and startCurrent 0.2 ok; resistance 0.5 or 150 and startCurrent 3 refused', () => {
  motor();
  assert.equal(Parts.checkValue('motor', 'resistance', 47).ok, true);
  assert.equal(Parts.checkValue('motor', 'startCurrent', 0.2).ok, true);
  assert.equal(Parts.checkValue('motor', 'resistance', 0.5).ok, false);
  assert.equal(Parts.checkValue('motor', 'resistance', 150).ok, false);
  assert.equal(Parts.checkValue('motor', 'startCurrent', 3).ok, false);
});

// ── elements() ────────────────────────────────────────────────────────────

test("elements(): one R between pins '1' and '2' of the motor's resistance (10 Ω by default, 47 Ω when set)", () => {
  for (const ohms of [10, 47]) {
    const { el, els } = rOf({ resistance: ohms });
    assert.equal(els.length, 1, `one element; got ${JSON.stringify(els)}`);
    assert.deepStrictEqual([...el.pins].sort(), ['1', '2']);
    assert.equal(el.ohms, ohms);
  }
});

// ── measure(), warnings(), line(), report() ───────────────────────────────

test('measure(): 300 mA spins at speed 1 (capped), 200 mA at 0.8, 100 mA at 0.4, all direction 1', () => {
  spins(measureAt(300).m, { mA: 300, speed: 1 }, '300 mA');
  spins(measureAt(200).m, { mA: 200, speed: 0.8 }, '200 mA');
  spins(measureAt(100).m, { mA: 100, speed: 0.4 }, '100 mA');
});

test('measure(): the current reversed (−300 mA) still spins at speed 1 with direction −1; current is a positive magnitude', () => {
  spins(measureAt(-300).m, { mA: 300, speed: 1, direction: -1 }, '−300 mA');
  spins(measureAt(-100).m, { mA: 100, speed: 0.4, direction: -1 }, '−100 mA');
});

test('measure(): 30 mA and 49.9 mA are not spinning (under the 50 mA start); 50.1 mA spins at 0.2', () => {
  for (const mA of [30, 49.9, -30]) {
    const m = measureAt(mA).m;
    assert.strictEqual(m.spinning, false, `${mA} mA: ${JSON.stringify(m)}`);
    near(m.current, Math.abs(mA), 0.001, `${mA} mA current`);
  }
  spins(measureAt(50.1).m, { mA: 50.1, speed: 50.1 / 250 }, '50.1 mA');
});

test('measure(): follows startCurrent: at 0.2 A start, 300 mA spins at 0.3 (300 / 1000), 150 mA does not', () => {
  spins(measureAt(300, { startCurrent: 0.2 }).m, { mA: 300, speed: 0.3 }, '300 mA, 0.2 A start');
  assert.strictEqual(measureAt(150, { startCurrent: 0.2 }).m.spinning, false, '150 mA is under a 200 mA start');
});

test('measure(): no current (floating, pins null) is not spinning, current 0, finite and JSON-safe', () => {
  const r = result(0);
  r.pins = { 1: null, 2: null };
  const m = motor().measure(r);
  assert.strictEqual(m.spinning, false, JSON.stringify(m));
  assert.strictEqual(m.current, 0, JSON.stringify(m));
  for (const [k, x] of Object.entries(m)) {
    assert.ok(typeof x !== 'number' || Number.isFinite(x), `${k} is finite: ${x}`);
  }
  assert.deepStrictEqual(plain(m), m, 'flat and JSON-safe');
});

test('warnings(): 900 mA (9 V straight across) is one line naming the 0.5 A limit; 510 mA and −510 mA warn too', () => {
  const def = motor();
  assert.equal(typeof def.warnings, 'function', 'the motor defines warnings()');
  for (const mA of [900, 510, -510]) {
    const { r, m } = measureAt(mA);
    const w = def.warnings(r, m);
    assert.equal(w.length, 1, `${mA} mA: ${JSON.stringify(w)}`);
    assert.match(w[0], /0\.5 ?A|500 ?mA/, w[0]);
    assert.ok(w[0].length <= 120, w[0]);
  }
});

test('warnings(): none at 490 mA, 300 mA, 30 mA or 0', () => {
  const def = motor();
  for (const mA of [490, 300, 30, 0, -490]) {
    const { r, m } = measureAt(mA);
    assert.deepStrictEqual(def.warnings(r, m), [], `${mA} mA`);
  }
});

test('line(): a results line naming the motor: "spinning" with 300 mA at 300 mA; "not spinning" (or stalled) at 30 mA', () => {
  const def = motor();
  assert.equal(typeof def.line, 'function', 'the motor defines line(r, m) for the results panel');
  const at = mA => { const { r, m } = measureAt(mA); return def.line(r, m); };
  const on = at(300);
  assert.ok(on && typeof on.text === 'string', JSON.stringify(on));
  assert.match(on.text, /motor/i, on.text);
  assert.match(on.text, /spinning/i, on.text);
  assert.doesNotMatch(on.text, /not spinning|stalled/i, on.text);
  assert.match(on.text, /\b300(\.0)? ?mA\b/, on.text);
  const off = at(30);
  assert.ok(off && typeof off.text === 'string', `a line while stalled too, so the student sees why: ${JSON.stringify(off)}`);
  assert.match(off.text, /motor/i, off.text);
  assert.match(off.text, /not spinning|stalled/i, off.text);
});

test('report(): one line of at most 80 characters: "spinning" and 300 mA; "not spinning" (or stalled) at 30 mA', () => {
  const def = motor();
  const at = mA => { const { r, m } = measureAt(mA); return def.report(r, m); };
  const on = at(300);
  assert.ok(typeof on === 'string' && on.length <= 80 && !on.includes('\n'), on);
  assert.match(on, /spinning/i, on);
  assert.doesNotMatch(on, /not spinning|stalled/i, on);
  assert.match(on, /\b300(\.0)? ?mA\b/, on);
  assert.match(at(30), /not spinning|stalled/i);
});

// ── Known answer through the simulator ────────────────────────────────────

test('known answer: a 3 V battery straight across the motor draws 300 mA; it spins at full speed, direction 1, a spinning line, no warnings', () => {
  const { r } = solveBuild(knownAnswer(3));
  const mo = part(r);
  near(r.parts.BAT1.m.current, 300, 0.05, 'battery mA (3 / 10)');
  spins(mo.m, { mA: 300, speed: 1 }, 'motor');
  assert.deepStrictEqual(mo.warnings, []);
  assert.ok(motorLines(r).some(t => /spinning/i.test(t) && !/not spinning|stalled/i.test(t)), `a spinning motor line: ${text(r)}`);
  assert.doesNotMatch(text(r), /Circuit open|No output components/, text(r));
});

test('known answer: 0.3 V across the motor (3 V through 90 Ω) is 30 mA, not spinning, a "not spinning" line, no warnings', () => {
  // tp_2 → a2; R1 b2–b6 90 Ω; motor c6–c10; a10 → tn_10.
  const { r } = solveBuild(battery(3).concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6', resistance: 90 },
    { tool: 'place_motor', holeA: 'c6', holeB: 'c10' },
    wire('a10', 'tn_10', 'black'),
  ]));
  const mo = part(r);
  near(mo.m.current, 30, 0.01, 'motor mA (3 / 100)');
  assert.strictEqual(mo.m.spinning, false, JSON.stringify(mo.m));
  assert.deepStrictEqual(warnedOf(r), []);
  assert.ok(motorLines(r).some(t => /not spinning|stalled/i.test(t)), `a not-spinning motor line: ${text(r)}`);
});

test('1 V straight across: 100 mA, spinning at speed 0.4', () => {
  spins(part(solveBuild(knownAnswer(1)).r).m, { mA: 100, speed: 0.4 }, '1 V');
});

test('over 0.5 A: the default 9 V battery straight across the motor draws 900 mA, spins, and warns about 0.5 A in a results line too', () => {
  const { r } = solveBuild(knownAnswer(null));
  const mo = part(r);
  near(r.parts.BAT1.m.current, 900, 0.1, 'battery mA (9 / 10)');
  spins(mo.m, { mA: 900, speed: 1 }, 'motor');
  assert.equal(mo.warnings.length, 1, JSON.stringify(mo.warnings));
  assert.match(mo.warnings[0], /0\.5 ?A|500 ?mA/);
  assert.ok(r.lines.some(l => /0\.5 ?A|500 ?mA/.test(l.text) && l.cls !== 'sim-on'), text(r));
});

test('the motor has no polarity: placed with its pins swapped it still spins at 300 mA, direction −1', () => {
  spins(part(solveBuild(knownAnswer(3, { reversed: true })).r).m, { mA: 300, speed: 1, direction: -1 }, 'reversed motor');
});

test('reversing the battery (+ to tn, − to tp) flips the direction to −1; it still spins at 300 mA, no warnings', () => {
  const { r } = solveBuild(knownAnswer(3, { battery: { reversed: true } }));
  spins(part(r).m, { mA: 300, speed: 1, direction: -1 }, 'battery reversed');
  assert.deepStrictEqual(warnedOf(r), []);
});

test('set_value on the motor (the AI\'s way): startCurrent 0.5 at 3 V stops it; resistance 20 slows it to 150 mA, speed 0.6', () => {
  const { board } = solveBuild(knownAnswer(3));
  assert.deepStrictEqual(Chat.applyActions([{ tool: 'set_value', part: label(), startCurrent: 0.5 }], board), { applied: 1, failed: 0 });
  const stalled = part(board.solve()).m;
  assert.strictEqual(stalled.spinning, false, `300 mA is under a 500 mA start: ${JSON.stringify(stalled)}`);
  Chat.applyActions([{ tool: 'set_value', part: label(), startCurrent: 0.05, resistance: 20 }], board);
  spins(part(board.solve()).m, { mA: 150, speed: 0.6 }, '20 Ω at 3 V');
});

// ── Complex circuits ──────────────────────────────────────────────────────

test('two motors in series on 3 V share 150 mA (3 / 20): both spin at speed 0.6, the same direction, no warnings', () => {
  // tp_2 → a2; M1 b2–b6; M2 c6–c10; a10 → tn_10.
  const { r } = solveBuild(battery(3).concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_motor', holeA: 'b2', holeB: 'b6' },
    { tool: 'place_motor', holeA: 'c6', holeB: 'c10' },
    wire('a10', 'tn_10', 'black'),
  ]));
  near(r.parts.BAT1.m.current, 150, 0.05, 'battery mA');
  for (const n of [1, 2]) spins(part(r, label(n)).m, { mA: 150, speed: 0.6 }, label(n));
  assert.deepStrictEqual(warnedOf(r), []);
});

test('two motors in series, one set to a 0.2 A start, on 3 V: 150 mA through both; the default one spins, the other does not', () => {
  const { r } = solveBuild(battery(3).concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_motor', holeA: 'b2', holeB: 'b6' },
    { tool: 'place_motor', holeA: 'c6', holeB: 'c10', startCurrent: 0.2 },
    wire('a10', 'tn_10', 'black'),
  ]));
  spins(part(r, label(1)).m, { mA: 150, speed: 0.6 }, label(1));
  assert.strictEqual(part(r, label(2)).m.spinning, false, JSON.stringify(part(r, label(2)).m));
  near(part(r, label(2)).m.current, 150, 0.05, `${label(2)} mA`);
});

test('two motors in parallel on 3 V: 300 mA each (600 mA from the battery), both spinning, no warning on either', () => {
  // Both across columns 2 and 6: b2–b6 and c2–c6; tp_2 → a2, a6 → tn_6.
  const { r } = solveBuild(battery(3).concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_motor', holeA: 'b2', holeB: 'b6' },
    { tool: 'place_motor', holeA: 'c2', holeB: 'c6' },
    wire('a6', 'tn_6', 'black'),
  ]));
  near(r.parts.BAT1.m.current, 600, 0.1, 'battery mA');
  for (const n of [1, 2]) spins(part(r, label(n)).m, { mA: 300, speed: 1 }, label(n));
  assert.deepStrictEqual(warnedOf(r), []);
});

test('two motors in parallel, the second placed backwards: both spin at 300 mA, in opposite directions', () => {
  const { r } = solveBuild(battery(3).concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_motor', holeA: 'b2', holeB: 'b6' },
    { tool: 'place_motor', holeA: 'c6', holeB: 'c2' },
    wire('a6', 'tn_6', 'black'),
  ]));
  spins(part(r, label(1)).m, { mA: 300, speed: 1, direction: 1 }, label(1));
  spins(part(r, label(2)).m, { mA: 300, speed: 1, direction: -1 }, label(2));
});

test('9 V through a 20 Ω resistor into the motor: 300 mA (9 / 30), spinning at full speed, no warning', () => {
  // tp_2 → a2; R1 b2–b6 20 Ω; motor c6–c10; a10 → tn_10.
  const { r } = solveBuild(battery(null).concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6', resistance: 20 },
    { tool: 'place_motor', holeA: 'c6', holeB: 'c10' },
    wire('a10', 'tn_10', 'black'),
  ]));
  near(r.parts.R1.m.current, 300, 0.05, 'R1 mA');
  spins(part(r).m, { mA: 300, speed: 1 }, 'motor');
  assert.deepStrictEqual(warnedOf(r), []);
});

test('a motor behind a toggle switch on 3 V: open, 0 mA and not spinning; set_control closed: 300 mA, spinning', () => {
  // tp_2 → a2; S1 b2–b4; motor c4–c8; a8 → tn_8.
  const { board, r } = solveBuild(battery(3).concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_toggle_switch', holeA: 'b2', holeB: 'b4' },
    { tool: 'place_motor', holeA: 'c4', holeB: 'c8' },
    wire('a8', 'tn_8', 'black'),
  ]));
  const open = part(r).m;
  assert.strictEqual(open.spinning, false, JSON.stringify(open));
  assert.ok(Math.abs(open.current) < 1e-6, `open: ${open.current} mA`);
  const sw = Ids.nextLabel([], 'toggle_switch');
  assert.deepStrictEqual(Chat.applyActions([{ tool: 'set_control', part: sw, closed: true }], board), { applied: 1, failed: 0 });
  const r2 = board.solve();
  spins(part(r2).m, { mA: 299.97, speed: 1 }, 'closed');
  assert.deepStrictEqual(warnedOf(r2), []);
});

test('a motor and a red LED (470 Ω) in parallel on 3 V: the motor at 300 mA, spinning; the LED on at 2.1 mA ((3 − 2) / 470.1)', () => {
  // Motor branch: tp_2 → a2, motor b2–b6, a6 → tn_6. LED branch: tp_10 → a10,
  // R1 b10–b14, LED anode c14, cathode c16, a16 → tn_16.
  const { r } = solveBuild(battery(3).concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_motor', holeA: 'b2', holeB: 'b6' },
    wire('a6', 'tn_6', 'black'),
    wire('tp_10', 'a10', 'red'),
    { tool: 'place_resistor', holeA: 'b10', holeB: 'b14', resistance: 470 },
    { tool: 'place_led', holeA: 'c16', holeB: 'c14', color: 'red' },
    wire('a16', 'tn_16', 'black'),
  ]));
  spins(part(r).m, { mA: 300, speed: 1 }, 'motor');
  assert.equal(r.parts.LED1.m.on, true, JSON.stringify(r.parts.LED1.m));
  near(r.parts.LED1.m.current, 1 / 470.1 * 1000, 0.02, 'LED mA');
  assert.deepStrictEqual(warnedOf(r), []);
});

// ── examples ──────────────────────────────────────────────────────────────

const motorExamples = () => (motor().examples || []).map(ex => ({ ex, mo: ex.parts.find(p => p.type === 'motor') }))
  .filter(({ ex, mo }) => mo && ex.expect && ex.expect[mo.label]);
const holds = (want, x, lo, hi) => Array.isArray(want) && want[0] <= x && want[1] >= x && want[0] >= lo && want[1] <= hi;

test('examples: the known answer 300 mA spinning, and 30 mA not spinning, each checking the motor\'s current', () => {
  const all = motorExamples();
  const dump = JSON.stringify((motor().examples || []).map(e => [e.name, e.expect]));
  const on = all.find(({ ex, mo }) => ex.expect[mo.label].spinning === true && holds(ex.expect[mo.label].current, 300, 290, 310));
  assert.ok(on, `an example expecting the motor spinning at ~300 mA (current a range holding 300, within 290–310); got ${dump}`);
  const off = all.find(({ ex, mo }) => ex.expect[mo.label].spinning === false && holds(ex.expect[mo.label].current, 30, 25, 35));
  assert.ok(off, `an example expecting the motor not spinning at ~30 mA (current a range holding 30, within 25–35); got ${dump}`);
  // test/parts-examples.test.js solves every example against its expect.
});

// ── Placement ─────────────────────────────────────────────────────────────

const leg = (pin, s) => ({ pin, col: +s.slice(1) - 1, row: s[0] });
const placeMotor = (a, b, map) => Parts.checkPlacement('motor', [leg('1', a), leg('2', b)], map || new Map(), BOARD);

test('checkPlacement: 3, 4 and 5 columns apart ok, either way round; e10→f10 across the gap ok', () => {
  motor();
  for (const [a, b] of [['b2', 'b5'], ['b2', 'b6'], ['b2', 'b7'], ['b6', 'b2'], ['e10', 'f10']]) {
    assert.deepStrictEqual(placeMotor(a, b), { ok: true }, `${a}/${b}`);
  }
});

test('checkPlacement: 2 or 6 columns apart is refused with the 3–5 range; vertical inside one half is refused', () => {
  motor();
  for (const b of ['b4', 'b8']) {
    const out = placeMotor('b2', b);
    assert.equal(out.ok, false, `b2 → ${b}`);
    assert.ok(out.reason.includes('3–5'), out.reason);
  }
  assert.equal(placeMotor('a10', 'c10').ok, false, 'both legs in one column of one half are one node');
});

test("checkPlacement: a leg on a hole that holds S1's pin is refused, naming it", () => {
  motor();
  const out = placeMotor('b2', 'b6', new Map([['b6', { label: 'S1', pin: '2' }]]));
  assert.equal(out.ok, false);
  assert.ok(out.reason.includes("b6 already holds S1's pin 2"), out.reason);
});

test('the AI places it through chat.js: place_motor 6 columns apart is refused with a note giving the 3–5 range', () => {
  motor();
  const board = simBoard();
  const out = Chat.applyActions([{ tool: 'place_motor', holeA: 'b2', holeB: 'b8' }], board);
  assert.equal(board.components().length, 0, 'nothing placed');
  assert.ok(out.failed >= 1, JSON.stringify(out));
  assert.ok(board.notes.some(n => n.includes('3–5')), `a note with the range: ${JSON.stringify(board.notes)}`);
});

// ── Hole map and round trip ───────────────────────────────────────────────

test("hole map: a motor on b2 / b6 holds each hole by label and pin name ('1', '2'), and nothing between", () => {
  const def = motor();
  const comp = { type: 'motor', label: label(), values: valuesFor(def), holeRefs: [holeRef('b2'), holeRef('b6')], pins: pinsOf(2) };
  const map = BoardIO.buildHoleMap([comp], []);
  assert.deepStrictEqual(map.get('b2'), { label: comp.label, pin: '1' });
  assert.deepStrictEqual(map.get('b6'), { label: comp.label, pin: '2' });
  assert.equal(map.size, 2);
});

test('round trip: a 20 Ω / 0.1 A-start motor saves one named holeRef per pin and both values; loaded back it sits on b2 / b6 and on 3 V reads 150 mA, speed 0.3', () => {
  const def = motor();
  const { board } = solveBuild(knownAnswer(3, { values: { resistance: 20, startCurrent: 0.1 } }));
  const mo = board.components().find(c => c.type === 'motor');
  const saved = BoardIO.saveHoleRefs(mo);
  assert.deepStrictEqual(saved, [{ pin: '1', col: 1, row: 'b' }, { pin: '2', col: 5, row: 'b' }]);
  const record = JSON.parse(JSON.stringify({ type: 'motor', label: mo.label, values: mo.values, holeRefs: saved }));
  assert.deepStrictEqual([record.values.resistance, record.values.startCurrent], [20, 0.1]);

  const loaded = { type: 'motor', label: record.label, values: valuesFor(def, record.values),
                   pins: pinsOf(2), holeRefs: BoardIO.loadHoleRefs(record) };
  assert.deepStrictEqual(Parts.legsOf(loaded).map(l => [l.pin, l.hole]), [['1', 'b2'], ['2', 'b6']]);
  board.components()[board.components().indexOf(mo)] = loaded;
  spins(part(board.solve()).m, { mA: 150, speed: 0.3 }, 'reloaded (150 / (5 × 100))');
});

// ── The AI side ───────────────────────────────────────────────────────────

const decl = name => Server.CIRCUIT_TOOLS[0].function_declarations.find(d => d.name === name);
const toolNames = message => Server.selectTools(message, []).map(d => d.name);

test('the generated place_motor tool takes holeA and holeB (both required), and optional resistance and startCurrent', () => {
  const def = motor();
  assert.equal(def.ai.tool || 'place_' + def.type, 'place_motor');
  const t = decl('place_motor');
  assert.ok(t, `no place_motor tool; tools: ${Server.CIRCUIT_TOOLS[0].function_declarations.map(d => d.name).join(', ')}`);
  const props = t.parameters && t.parameters.properties;
  assert.ok(props && props.holeA && props.holeB, JSON.stringify(t.parameters));
  assert.deepStrictEqual([...t.parameters.required].sort(), ['holeA', 'holeB']);
  assert.ok(props.resistance && props.startCurrent, `the AI can set both values: ${JSON.stringify(props)}`);
});

test('ai: keywords include motor, dc motor, fan, spin (at most 8, lower case); about ≤ 200 chars; not everyday', () => {
  const { ai } = motor();
  for (const k of ['motor', 'dc motor', 'fan', 'spin']) {
    assert.ok(ai.keywords.includes(k), `keyword "${k}" in ${JSON.stringify(ai.keywords)}`);
  }
  assert.ok(ai.keywords.length <= 8, `${ai.keywords.length} keywords`);
  assert.ok(ai.keywords.every(k => k === k.toLowerCase()), JSON.stringify(ai.keywords));
  assert.ok(typeof ai.about === 'string' && ai.about.length > 0 && ai.about.length <= 200, ai.about);
  assert.ok(!ai.everyday, 'not in the everyday set, so the demo prompt stays as it is');
});

for (const message of [
  QA_PROMPT,
  'Add a fan to my circuit',
  'Build a DC motor circuit',
  'Make something spin',
]) {
  test(`selectTools("${message}") sends place_motor`, () => {
    motor();
    const got = toolNames(message);
    assert.ok(got.includes('place_motor'), `place_motor missing from ${JSON.stringify(got)}`);
    assert.ok(got.length <= 12, `${got.length} tools`);
  });
}

test('selectTools for the QA prompt also sends place_toggle_switch, place_battery and set_control', () => {
  motor();
  const got = toolNames(QA_PROMPT);
  for (const n of ['place_motor', 'place_toggle_switch', 'place_battery', 'set_control']) {
    assert.ok(got.includes(n), `${n} missing from ${JSON.stringify(got)}`);
  }
});

// Pin: the motor's keywords must not drag place_motor into other prompts,
// above all the demo's.
for (const message of [
  DEMO_PROMPT,
  BENCH_PROMPT,
  'Add an on/off switch to an LED circuit',
  'Build 3 LEDs, each with its own resistor.',
  'Build a temperature alarm that sounds a buzzer when it gets hot',
]) {
  test(`pin: selectTools("${message}") does not send place_motor`, () => {
    motor();
    assert.ok(!toolNames(message).includes('place_motor'), JSON.stringify(toolNames(message)));
  });
}

test('the known answer at 3 V has no circuit problems and passes finishAIReply untouched', () => {
  motor();
  const build = knownAnswer(3);
  assert.deepStrictEqual(Server.findCircuitProblems(build.map(a => ({ ...a }))), []);
  const out = Server.finishAIReply({ reply: 'Built it.', actions: build.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, build);
  assert.equal(out.reply, 'Built it.');
});

// ── The sidebar ───────────────────────────────────────────────────────────

const found = q => Sidebar.groups(Parts.all(), q).flatMap(g => g.parts.map(p => p.type));

test('sidebar search: "motor", "fan" and "Spin" find only the motor; "led" (the LED and, since #42, the RGB LED) and "switch" find what they did', () => {
  motor();
  assert.deepStrictEqual(found('motor'), ['motor']);
  assert.deepStrictEqual(found('fan'), ['motor']);
  assert.deepStrictEqual(found('Spin'), ['motor']);
  assert.deepStrictEqual(found('led').sort(), ['led', 'rgb_led']);
  assert.deepStrictEqual(found('switch').sort(), ['button', 'slide_switch', 'toggle_switch']);
});

// ── The browser half ──────────────────────────────────────────────────────

test('in a browser-like page with no THREE or document, motor.js defines itself on window.Parts', () => {
  const file = path.join(PARTS_DIR, 'motor.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/motor.js must exist');
  const win = vm.createContext({ TextEncoder });
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(PARTS_DIR, 'registry.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(file, 'utf8'), win);
  const def = win.Parts.get('motor');
  assert.ok(def, 'window.Parts.get("motor") after loading motor.js');
  assert.equal(def.elements({ resistance: 10, startCurrent: 0.05 }, {})[0].ohms, 10);
});

test('parts/motor.js draws only through ctx: a view.build and a view.update, no App, no document, no setInterval', () => {
  const file = path.join(PARTS_DIR, 'motor.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/motor.js must exist');
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /\bview\s*:/, 'a view: { build, update } section');
  assert.doesNotMatch(src, /\bApp\b/, 'the part file must not reach into App; use ctx');
  assert.doesNotMatch(src, /\bdocument\b/, 'the part file must not touch document');
  assert.doesNotMatch(src, /\bsetInterval\b/, 'the shaft turns from view.update, not a timer of its own');
  assert.match(src, /motorShaft/, 'build marks the turning shaft userData.motorShaft');
  assert.equal(typeof motor().view.build, 'function');
  assert.equal(typeof motor().view.update, 'function', 'view.update spins the shaft at the measured speed');
});

// ── docs ──────────────────────────────────────────────────────────────────

test(`docs/QA.md has one AI case for "${QA_PROMPT}"`, () => {
  const qa = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'QA.md'), 'utf8');
  const rows = qa.split('\n').filter(l => l.startsWith('|') && l.includes(QA_PROMPT));
  assert.equal(rows.length, 1, 'one QA row sends the motor prompt');
  assert.match(rows[0], /^\| AI-\d+ \|/, 'it is an AI prompt check (AI-NN)');
});
