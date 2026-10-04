// The incandescent bulb, parts/bulb.js (issue #36): a small bulb whose glow
// follows the power it takes: dim at low voltage, full at its rating, and a
// warning when it would burn out. It is the resistor (#23) with a measure(),
// warnings() and a glowing view.update. Its definition half loads in Node
// through require('circuit3d/js/parts'); placing it by hand, Run and the
// glow in the page are checked by e2e/bulb.spec.js and e2e/parts.spec.js. Its
// worked build for the AI (ai.recipe, ai.guide) is test/bulb-recipe.test.js.
//
// Shapes these tests assume (the issue, plus choices stated here so the
// builder matches them):
// - Identity: type 'bulb'. name / sub / category / icon are the builder's
//   pick: the name says bulb or lamp, the icon is an <svg>, not a source.
//   The prefix is unique (taken: R, RV, BAT, PS, D, ZD, LED, DS, BZ, LDR,
//   SW, S, TH); 'LP' is proposed. Labels are prefix + 1, prefix + 2, and an
//   LED's LED1 never counts toward them (nor the other way round).
// - pins ['1', '2']; place { kind: 'span', span { min 2, max 4, default 3 },
//   rotations ['h', 'v'] } (like the resistor).
// - values: resistance { unit 'Ω', default 60, min 5, max 1000 },
//   ratedVoltage { unit 'V', default 6, min 1.5, max 24 }.
// - elements(v): one R, pins ['1', '2'], ohms = v.resistance.
// - measure(r) → { power, brightness, ... }: power in WATTS, from the
//   current through the R (r.current, in mA) or the pin voltages;
//   brightness = min(1, power / (ratedVoltage² / resistance)). Extra fields
//   are allowed. A floating bulb (pins null, no current) is 0 / 0.
// - warnings(r, m): one line containing "would burn out" when power is over
//   1.5 × the rated power (ratedVoltage² / resistance); none otherwise.
// - line(r, m): the results-panel line, naming the bulb (/bulb/i) with its
//   power ("0.60 W") and brightness as a percent ("100%").
// - report(r, m): one line of at most 80 characters with the power ("0.60 W")
//   and brightness ("100%").
// - view: { build, update }, drawing only through ctx. build marks the glass
//   mesh userData.bulbGlass; update({ group }, m) sets that glass's
//   material.emissiveIntensity from m.brightness, rising with it, and puts it
//   back to the dark value on {} (Stop) or brightness 0.
// - ai: tool place_bulb (the default); keywords include bulb, lamp,
//   light bulb, incandescent. Not `everyday`, so the demo prompt doesn't
//   send it.
// - examples: at least the known answer, 6 V across the 60 Ω / 6 V bulb
//   (brightness 1.0), and the same at 3 V (brightness 0.25).
//
// Hand-computed (ideal battery; the bulb is a plain 60 Ω resistor; rated
// power = 6² / 60 = 0.6 W):
//   6 V across it:  I = 6 / 60  = 100 mA, P = 0.6 W,   brightness 1.0
//   3 V across it:  I = 3 / 60  =  50 mA, P = 0.15 W,  brightness 0.25
//   9 V across it:  I = 9 / 60  = 150 mA, P = 1.35 W = 2.25 × rated → "would burn out"
//   7.3 V: P = 0.888 W = 1.48 × (no warning); 7.4 V: P = 0.913 W = 1.52 × (warns)
//   two in series on 12 V: I = 12 / 120 = 100 mA, each 0.6 W, brightness 1.0
//   two in parallel on 6 V: 100 mA each, 200 mA from the battery, each 1.0
//   60 Ω/6 V then 120 Ω/6 V in series on 9 V: I = 9 / 180 = 50 mA;
//     the 60 Ω one 0.15 W / 0.6 W = 0.25, the 120 Ω one 0.3 W / 0.3 W = 1.0
//   one bulb then two in parallel on 9 V: 60 + 30 = 90 Ω, I = 100 mA;
//     the first 0.6 W (1.0), each parallel one 50 mA, 0.15 W (0.25)
//   9 V → 30 Ω → bulb: 90 Ω, 100 mA, bulb 1.0, resistor 0.3 W
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

const QA_PROMPT    = 'Light a 6 V bulb from a battery';
const DEMO_PROMPT  = 'Build a single LED circuit with a current-limiting resistor.';
const BENCH_PROMPT = 'Power an LED from the bench supply at 5 V with a series resistor.';

const TAKEN = ['R', 'RV', 'BAT', 'PS', 'D', 'ZD', 'LED', 'DS', 'BZ', 'LDR', 'SW', 'S', 'TH'];

function bulb() {
  const def = Parts.get('bulb');
  assert.ok(def, "Parts.get('bulb') is null: parts/bulb.js must exist and be listed in parts/index.js");
  return def;
}
const label = (n = 1) => bulb().prefix + n;

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
  const els = bulb().elements(valuesFor(bulb(), values), {});
  assert.ok(Array.isArray(els), `elements() returns a list; got ${JSON.stringify(els)}`);
  const k = els.findIndex(e => e.kind === 'R');
  assert.ok(k >= 0, `elements() should hold one R; got ${JSON.stringify(els)}`);
  return { el: els[k], id: els[k].id !== undefined ? els[k].id : k, els };
}

// A PartResult for the bulb with `volts` across it (pin 1 high), as the core
// hands it over: current in mA from pin 1 to pin 2, pin voltages that agree.
function result(volts, values) {
  const v = valuesFor(bulb(), values);
  const { id } = rOf(v);
  const mA = volts / v.resistance * 1000;
  return { label: label(), values: v, controls: {}, pins: { 1: volts, 2: 0 },
           current: { [id]: mA }, modes: {}, open: {} };
}
const measureAt = (volts, values) => { const r = result(volts, values); return { r, m: bulb().measure(r) }; };

function holeRef(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  assert.ok(m, 'not a hole: ' + s);
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}
const pinsOf = n => Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));

// ── Builds as AI actions, applied to a board that keeps real records ──────

const wire = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });

const battery = volts => [
  { tool: 'delete_all' },
  Object.assign({ tool: 'place_battery' }, volts == null ? {} : { voltage: volts }),   // null: the default 9 V
  wire('BAT1.0', `tp_${N}`, 'red'),
  wire('BAT1.1', `tn_${N}`, 'black'),
];

// The known answer: a battery at `volts` straight across the bulb on b2–b5
// (pin 1 b2, pin 2 b5): tp_2 → a2, a5 → tn_5. `reversed` swaps its pins.
function knownAnswer(volts = 6, { reversed = false, values } = {}) {
  return battery(volts).concat([
    Object.assign({ tool: 'place_bulb', holeA: reversed ? 'b5' : 'b2', holeB: reversed ? 'b2' : 'b5' }, values || {}),
    wire('tp_2', 'a2', 'red'),
    wire('a5', 'tn_5', 'black'),
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
  bulb();
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

// ── The file and its identity ─────────────────────────────────────────────

test('parts/index.js lists bulb.js, and the file exists', () => {
  const src = fs.readFileSync(path.join(PARTS_DIR, 'index.js'), 'utf8');
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, 'parts/index.js must keep its FILES list');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  assert.ok(files.includes('bulb.js'), `FILES should include 'bulb.js'; got ${JSON.stringify(files)}`);
  assert.ok(fs.existsSync(path.join(PARTS_DIR, 'bulb.js')), 'circuit3d/js/parts/bulb.js must exist');
});

test('both 3D pages load js/parts/bulb.js, after registry.js and before components.js', () => {
  for (const page of ['circuit3d/index.html', 'circuit3d/viewer.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    const at = order.indexOf('js/parts/bulb.js');
    assert.ok(at >= 0, `${page} loads js/parts/bulb.js: ${order.join(', ')}`);
    assert.ok(at > order.indexOf('js/parts/registry.js'), `${page}: bulb.js comes after registry.js`);
    const comps = order.indexOf('js/components.js');
    if (comps >= 0) assert.ok(at < comps, `${page}: bulb.js comes before components.js`);
  }
});

test("identity: type 'bulb', named as a bulb or lamp, an <svg> icon, not a source, a prefix no other part uses", () => {
  const def = bulb();
  assert.equal(def.type, 'bulb');
  assert.match(def.name, /bulb|lamp/i, `name: ${def.name}`);
  assert.ok(def.name.length <= 24, def.name);
  assert.ok(typeof def.sub === 'string' && def.sub.length > 0 && def.sub.length <= 32, def.sub);
  assert.match(def.icon, /^<svg/);
  assert.equal(def.ref, undefined, 'a bulb is not a source');
  assert.match(def.prefix, /^[A-Z]{1,3}$/);
  assert.ok(!TAKEN.includes(def.prefix), `prefix ${def.prefix} is one of the taken ${JSON.stringify(TAKEN)}`);
  const others = Parts.all().filter(d => d.type !== 'bulb').map(d => d.prefix);
  assert.ok(!others.includes(def.prefix), `prefix ${def.prefix} is already used: ${JSON.stringify(others)}`);
});

test("labels: the bulb is prefix + 1, prefix + 2; an LED's LED1 / LED2 never count toward them, nor the bulb's toward the LED's", () => {
  const p = bulb().prefix;
  assert.equal(Ids.nextLabel([], 'bulb'), p + '1');
  assert.equal(Ids.nextLabel([{ type: 'bulb', label: p + '1' }], 'bulb'), p + '2');
  const board = [{ type: 'led', label: 'LED1' }, { type: 'led', label: 'LED2' }];
  assert.equal(Ids.nextLabel(board, 'bulb'), p + '1', 'LEDs on the board do not bump the bulb number');
  board.push({ type: 'bulb', label: p + '1' }, { type: 'bulb', label: p + '2' }, { type: 'bulb', label: p + '3' });
  assert.equal(Ids.nextLabel(board, 'led'), 'LED3', 'bulbs on the board do not bump the LED number');
  assert.equal(Ids.nextLabel(board, 'bulb'), p + '4');
  assert.equal(Ids.findByLabel(board, p + '1').type, 'bulb');
  assert.equal(Ids.findByLabel(board, 'LED1').type, 'led');
  assert.deepStrictEqual(Ids.parsePinRef(p + '1.1'), { label: p + '1', pin: 1 });
});

test("pins ['1', '2']; a span part, 2–4 columns (3 by default), rotations h and v", () => {
  const def = bulb();
  assert.deepStrictEqual([...def.pins], ['1', '2']);
  assert.deepStrictEqual(plain(def.place), { kind: 'span', span: { min: 2, max: 4, default: 3 }, rotations: ['h', 'v'] });
});

test('values: resistance 60 Ω (5–1000) and ratedVoltage 6 V (1.5–24)', () => {
  const v = plain(bulb().values);
  assert.deepStrictEqual(Object.keys(v).sort(), ['ratedVoltage', 'resistance']);
  assert.deepStrictEqual({ unit: v.resistance.unit, default: v.resistance.default, min: v.resistance.min, max: v.resistance.max },
    { unit: 'Ω', default: 60, min: 5, max: 1000 });
  assert.deepStrictEqual({ unit: v.ratedVoltage.unit, default: v.ratedVoltage.default, min: v.ratedVoltage.min, max: v.ratedVoltage.max },
    { unit: 'V', default: 6, min: 1.5, max: 24 });
});

test('checkValue: resistance 120 and ratedVoltage 12 ok; resistance 2 and ratedVoltage 30 refused', () => {
  bulb();
  assert.equal(Parts.checkValue('bulb', 'resistance', 120).ok, true);
  assert.equal(Parts.checkValue('bulb', 'ratedVoltage', 12).ok, true);
  assert.equal(Parts.checkValue('bulb', 'resistance', 2).ok, false);
  assert.equal(Parts.checkValue('bulb', 'ratedVoltage', 30).ok, false);
});

// ── elements() ────────────────────────────────────────────────────────────

test("elements(): one R between pins '1' and '2' of the bulb's resistance (60 Ω by default, 120 Ω when set)", () => {
  for (const ohms of [60, 120]) {
    const { el, els } = rOf({ resistance: ohms });
    assert.equal(els.length, 1, `one element; got ${JSON.stringify(els)}`);
    assert.deepStrictEqual([...el.pins].sort(), ['1', '2']);
    assert.equal(el.ohms, ohms);
  }
});

// ── measure(), warnings(), line(), report() ───────────────────────────────

test('measure(): 6 V across 60 Ω / 6 V is 0.6 W at brightness 1.0; 3 V is 0.15 W at brightness 0.25', () => {
  const full = measureAt(6).m;
  near(full.power, 0.6, 1e-6, 'power at 6 V (W)');
  near(full.brightness, 1.0, 1e-6, 'brightness at 6 V');
  const quarter = measureAt(3).m;
  near(quarter.power, 0.15, 1e-6, 'power at 3 V (W)');
  near(quarter.brightness, 0.25, 1e-6, 'brightness at 3 V');
});

test('measure(): brightness is capped at 1 (9 V: 1.35 W, brightness 1), has no direction, and follows the ratings (120 Ω / 12 V at 6 V: 0.3 W of 1.2 W = 0.25)', () => {
  const over = measureAt(9).m;
  near(over.power, 1.35, 1e-6, 'power at 9 V (W)');
  assert.strictEqual(over.brightness, 1, `brightness is min(1, …): ${JSON.stringify(over)}`);
  const back = measureAt(-6).m;
  near(back.power, 0.6, 1e-6, 'power with the pins swapped');
  near(back.brightness, 1.0, 1e-6, 'brightness with the pins swapped');
  const big = measureAt(6, { resistance: 120, ratedVoltage: 12 }).m;
  near(big.power, 0.3, 1e-6, '120 Ω at 6 V (W)');
  near(big.brightness, 0.25, 1e-6, '120 Ω / 12 V bulb at 6 V');
});

test('measure(): a floating bulb (pins null, no current) is power 0, brightness 0, finite and JSON-safe', () => {
  const r = result(0);
  r.pins = { 1: null, 2: null };
  const m = bulb().measure(r);
  assert.strictEqual(m.power, 0, JSON.stringify(m));
  assert.strictEqual(m.brightness, 0, JSON.stringify(m));
  assert.deepStrictEqual(plain(m), m, 'flat and JSON-safe');
});

test('warnings(): 9 V across the 6 V bulb (1.35 W, 2.25 × rated) is one line saying it "would burn out"', () => {
  const def = bulb();
  assert.equal(typeof def.warnings, 'function', 'the bulb defines warnings()');
  const { r, m } = measureAt(9);
  const w = def.warnings(r, m);
  assert.equal(w.length, 1, JSON.stringify(w));
  assert.match(w[0], /would burn out/i, w[0]);
  assert.ok(w[0].length <= 120, w[0]);
});

test('warnings(): none at 6 V, 3 V, 0 V, or 7.3 V (1.48 × rated); 7.4 V (1.52 ×) warns', () => {
  const def = bulb();
  for (const V of [6, 3, 0, 7.3]) {
    const { r, m } = measureAt(V);
    assert.deepStrictEqual(def.warnings(r, m), [], `${V} V`);
  }
  const { r, m } = measureAt(7.4);
  assert.equal(def.warnings(r, m).length, 1, '7.4 V is over 1.5 × the rated 0.6 W');
});

test('line(): a results line naming the bulb with its power and brightness: "0.60 W", "100%" at 6 V; "0.15 W", "25%" at 3 V', () => {
  const def = bulb();
  assert.equal(typeof def.line, 'function', 'the bulb defines line(r, m) for the results panel');
  const at = V => { const { r, m } = measureAt(V); return def.line(r, m); };
  const full = at(6);
  assert.ok(full && typeof full.text === 'string', JSON.stringify(full));
  assert.match(full.text, /bulb/i, full.text);
  assert.match(full.text, /\b0\.60 ?W\b/, full.text);
  assert.match(full.text, /\b100 ?%/, full.text);
  const quarter = at(3);
  assert.match(quarter.text, /\b0\.15 ?W\b/, quarter.text);
  assert.match(quarter.text, /\b25 ?%/, quarter.text);
});

test('report(): one line of at most 80 characters with the power (0.60 W) and brightness (100%)', () => {
  const { r, m } = measureAt(6);
  const s = bulb().report(r, m);
  assert.ok(typeof s === 'string' && s.length <= 80 && !s.includes('\n'), s);
  assert.match(s, /\b0\.60 ?W\b/, s);
  assert.match(s, /\b100 ?%/, s);
});

// ── Known answer through the simulator ────────────────────────────────────

test('known answer: a 6 V battery straight across the 60 Ω / 6 V bulb draws 100 mA; the bulb takes 0.6 W at brightness 1.0, a results line, no warnings', () => {
  const { r } = solveBuild(knownAnswer(6));
  const b = part(r);
  near(r.parts.BAT1.m.current, 100, 0.05, 'battery mA (6 / 60)');
  near(b.m.power, 0.6, 0.001, 'bulb W');
  near(b.m.brightness, 1.0, 0.001, 'brightness');
  assert.deepStrictEqual(b.warnings, []);
  assert.ok(r.lines.some(l => /bulb/i.test(l.text) && /100 ?%/.test(l.text)), `a bulb line at 100%: ${text(r)}`);
  assert.doesNotMatch(text(r), /Circuit open|No output components/, text(r));
});

test('known answer at 3 V: 50 mA, 0.15 W, brightness 0.25, no warnings', () => {
  const { r } = solveBuild(knownAnswer(3));
  const b = part(r);
  near(r.parts.BAT1.m.current, 50, 0.05, 'battery mA (3 / 60)');
  near(b.m.power, 0.15, 0.001, 'bulb W');
  near(b.m.brightness, 0.25, 0.001, 'brightness');
  assert.deepStrictEqual(b.warnings, []);
});

test('burn-out: the default 9 V battery straight across the 6 V bulb (1.35 W, 2.25 × rated) warns "would burn out", in a results line too', () => {
  const { r } = solveBuild(knownAnswer(null));
  const b = part(r);
  near(r.parts.BAT1.m.current, 150, 0.05, 'battery mA (9 / 60)');
  near(b.m.power, 1.35, 0.002, 'bulb W');
  assert.strictEqual(b.m.brightness, 1);
  assert.equal(b.warnings.length, 1, JSON.stringify(b.warnings));
  assert.match(b.warnings[0], /would burn out/i);
  assert.ok(r.lines.some(l => /would burn out/i.test(l.text)), text(r));
});

test('the bulb has no polarity: placed with its pins swapped it reads the same, 0.6 W at brightness 1.0', () => {
  const b = part(solveBuild(knownAnswer(6, { reversed: true })).r);
  near(b.m.power, 0.6, 0.001, 'reversed W');
  near(b.m.brightness, 1.0, 0.001, 'reversed brightness');
});

test('set_value on the bulb (ratedVoltage 12, the AI\'s way) re-rates it: at 6 V the same 0.6 W is now brightness 0.25 of 2.4 W', () => {
  const { board } = solveBuild(knownAnswer(6));
  assert.deepStrictEqual(Chat.applyActions([{ tool: 'set_value', part: label(), ratedVoltage: 12 }], board), { applied: 1, failed: 0 });
  const b = part(board.solve());
  near(b.m.power, 0.6, 0.001, 'still 0.6 W');
  near(b.m.brightness, 0.25, 0.001, '0.6 / (12² / 60 = 2.4)');
});

// ── Complex circuits ──────────────────────────────────────────────────────

test('two bulbs in series on 12 V: 100 mA through both (12 / 120), each 0.6 W at brightness 1.0, no warnings', () => {
  // tp_2 → a2; bulb 1 b2–b5; bulb 2 c5–c8; a8 → tn_8.
  const { r } = solveBuild(battery(12).concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_bulb', holeA: 'b2', holeB: 'b5' },
    { tool: 'place_bulb', holeA: 'c5', holeB: 'c8' },
    wire('a8', 'tn_8', 'black'),
  ]));
  near(r.parts.BAT1.m.current, 100, 0.05, 'battery mA');
  for (const n of [1, 2]) {
    near(part(r, label(n)).m.power, 0.6, 0.001, `${label(n)} W`);
    near(part(r, label(n)).m.brightness, 1.0, 0.001, `${label(n)} brightness`);
  }
  assert.deepStrictEqual(warnedOf(r), []);
});

test('two bulbs in parallel on 6 V: 200 mA from the battery, 100 mA and brightness 1.0 each, no warnings', () => {
  // Both across columns 2 and 5: b2–b5 and c2–c5; tp_2 → a2 feeds column 2, a5 → tn_5.
  const { r } = solveBuild(battery(6).concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_bulb', holeA: 'b2', holeB: 'b5' },
    { tool: 'place_bulb', holeA: 'c2', holeB: 'c5' },
    wire('a5', 'tn_5', 'black'),
  ]));
  near(r.parts.BAT1.m.current, 200, 0.1, 'battery mA');
  for (const n of [1, 2]) {
    near(part(r, label(n)).m.power, 0.6, 0.001, `${label(n)} W`);
    near(part(r, label(n)).m.brightness, 1.0, 0.001, `${label(n)} brightness`);
  }
  assert.deepStrictEqual(warnedOf(r), []);
});

test('two different bulbs in series on 9 V (60 Ω / 6 V then 120 Ω / 6 V): 50 mA; the 60 Ω one 0.15 W (0.25), the 120 Ω one 0.3 W (1.0)', () => {
  const { r } = solveBuild(battery(9).concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_bulb', holeA: 'b2', holeB: 'b5' },
    { tool: 'place_bulb', holeA: 'c5', holeB: 'c8', resistance: 120 },
    wire('a8', 'tn_8', 'black'),
  ]));
  near(r.parts.BAT1.m.current, 50, 0.05, 'battery mA (9 / 180)');
  near(part(r, label(1)).m.power, 0.15, 0.001, `${label(1)} W`);
  near(part(r, label(1)).m.brightness, 0.25, 0.001, `${label(1)} brightness`);
  near(part(r, label(2)).m.power, 0.3, 0.001, `${label(2)} W`);
  near(part(r, label(2)).m.brightness, 1.0, 0.001, `${label(2)} brightness (0.3 / (36 / 120))`);
  assert.deepStrictEqual(warnedOf(r), []);
});

test('one bulb feeding two in parallel on 9 V: 100 mA (9 / 90); the first 0.6 W at 1.0, the parallel pair 50 mA, 0.15 W, 0.25 each', () => {
  // tp_2 → a2; LP1 b2–b5; LP2 c5–c8 and LP3 d5–d8 in parallel; a8 → tn_8.
  const { r } = solveBuild(battery(9).concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_bulb', holeA: 'b2', holeB: 'b5' },
    { tool: 'place_bulb', holeA: 'c5', holeB: 'c8' },
    { tool: 'place_bulb', holeA: 'd5', holeB: 'd8' },
    wire('a8', 'tn_8', 'black'),
  ]));
  near(r.parts.BAT1.m.current, 100, 0.05, 'battery mA');
  near(part(r, label(1)).m.brightness, 1.0, 0.001, `${label(1)} brightness`);
  for (const n of [2, 3]) {
    near(part(r, label(n)).m.power, 0.15, 0.001, `${label(n)} W`);
    near(part(r, label(n)).m.brightness, 0.25, 0.001, `${label(n)} brightness`);
  }
  assert.deepStrictEqual(warnedOf(r), []);
});

test('9 V through a 30 Ω resistor into the bulb: 100 mA, the bulb at brightness 1.0, no warning on either (the resistor takes 0.3 W)', () => {
  // tp_2 → a2; R1 b2–b6 30 Ω; bulb c6–c9; a9 → tn_9.
  const { r } = solveBuild(battery(9).concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6', resistance: 30 },
    { tool: 'place_bulb', holeA: 'c6', holeB: 'c9' },
    wire('a9', 'tn_9', 'black'),
  ]));
  near(r.parts.R1.m.current, 100, 0.05, 'R1 mA');
  near(part(r).m.brightness, 1.0, 0.001, 'bulb brightness');
  assert.deepStrictEqual(warnedOf(r), []);
});

test('a bulb and a red LED (470 Ω) in parallel on 6 V: the bulb at 100 mA, brightness 1.0; the LED on at 8.5 mA ((6 − 2) / 470.1)', () => {
  // Bulb branch: tp_2 → a2, bulb b2–b5, a5 → tn_5. LED branch: tp_10 → a10,
  // R1 b10–b14, LED anode c14, cathode c16, a16 → tn_16.
  const { r } = solveBuild(battery(6).concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_bulb', holeA: 'b2', holeB: 'b5' },
    wire('a5', 'tn_5', 'black'),
    wire('tp_10', 'a10', 'red'),
    { tool: 'place_resistor', holeA: 'b10', holeB: 'b14', resistance: 470 },
    { tool: 'place_led', holeA: 'c16', holeB: 'c14', color: 'red' },
    wire('a16', 'tn_16', 'black'),
  ]));
  near(part(r).m.brightness, 1.0, 0.001, 'bulb brightness');
  assert.equal(r.parts.LED1.m.on, true, JSON.stringify(r.parts.LED1.m));
  near(r.parts.LED1.m.current, 4 / 470.1 * 1000, 0.02, 'LED mA');
  near(r.parts.BAT1.m.current, 100 + 4 / 470.1 * 1000, 0.1, 'battery mA');
  assert.deepStrictEqual(warnedOf(r), []);
});

// ── examples ──────────────────────────────────────────────────────────────

// The bulb's brightness expectation in an example whose battery is at `volts`.
function exampleAt(volts) {
  const def = bulb();
  return (def.examples || []).map(ex => {
    const bat = ex.parts.find(p => p.type === 'battery');
    const b = ex.parts.find(p => p.type === 'bulb');
    const v = bat && ((bat.values && bat.values.voltage) || 9);
    return { ex, b, v, want: b && ex.expect[b.label] };
  }).find(({ b, v, want }) => b && v === volts && want && want.brightness !== undefined);
}

test('examples: the known answer at 6 V expects brightness around 1.0; the same at 3 V around 0.25', () => {
  for (const [V, want] of [[6, 1.0], [3, 0.25]]) {
    const found = exampleAt(V);
    assert.ok(found, `an example with the battery at ${V} V that checks the bulb's brightness; got ${JSON.stringify((bulb().examples || []).map(e => [e.name, e.parts, e.expect]))}`);
    const b = found.want.brightness;
    const holds = Array.isArray(b) ? b[0] <= want && b[1] >= want && b[1] - b[0] <= 0.05 : Math.abs(b - want) < 1e-6;
    assert.ok(holds, `${V} V: brightness ${JSON.stringify(b)} holds ${want}`);
  }
  // test/parts-examples.test.js solves every example against its expect.
});

// ── Placement ─────────────────────────────────────────────────────────────

const leg = (pin, s) => ({ pin, col: +s.slice(1) - 1, row: s[0] });
const placeBulb = (a, b, map) => Parts.checkPlacement('bulb', [leg('1', a), leg('2', b)], map || new Map(), BOARD);

test('checkPlacement: 2, 3 and 4 columns apart ok, either way round; e10→f10 across the gap ok', () => {
  bulb();
  for (const [a, b] of [['b2', 'b4'], ['b2', 'b5'], ['b2', 'b6'], ['b6', 'b2'], ['e10', 'f10']]) {
    assert.deepStrictEqual(placeBulb(a, b), { ok: true }, `${a}/${b}`);
  }
});

test('checkPlacement: 1 or 5 columns apart is refused with the 2–4 range; vertical inside one half is refused', () => {
  bulb();
  for (const b of ['b3', 'b7']) {
    const out = placeBulb('b2', b);
    assert.equal(out.ok, false, `b2 → ${b}`);
    assert.ok(out.reason.includes('2–4'), out.reason);
  }
  assert.equal(placeBulb('a10', 'c10').ok, false, 'both legs in one column of one half are one node');
});

test("checkPlacement: a leg on a hole that holds R1's lead is refused, naming it", () => {
  bulb();
  const out = placeBulb('b2', 'b5', new Map([['b5', { label: 'R1', pin: 'lead1' }]]));
  assert.equal(out.ok, false);
  assert.ok(out.reason.includes("b5 already holds R1's pin lead1"), out.reason);
});

test('the AI places it through chat.js: place_bulb 5 columns apart is refused with a note giving the 2–4 range', () => {
  bulb();
  const board = simBoard();
  const out = Chat.applyActions([{ tool: 'place_bulb', holeA: 'b2', holeB: 'b7' }], board);
  assert.equal(board.components().length, 0, 'nothing placed');
  assert.ok(out.failed >= 1, JSON.stringify(out));
  assert.ok(board.notes.some(n => n.includes('2–4')), `a note with the range: ${JSON.stringify(board.notes)}`);
});

// ── Hole map and round trip ───────────────────────────────────────────────

test("hole map: a bulb on b2 / b5 holds each hole by label and pin name ('1', '2'), and nothing between", () => {
  const def = bulb();
  const comp = { type: 'bulb', label: label(), values: valuesFor(def), holeRefs: [holeRef('b2'), holeRef('b5')], pins: pinsOf(2) };
  const map = BoardIO.buildHoleMap([comp], []);
  assert.deepStrictEqual(map.get('b2'), { label: comp.label, pin: '1' });
  assert.deepStrictEqual(map.get('b5'), { label: comp.label, pin: '2' });
  assert.equal(map.size, 2);
});

test('round trip: a 120 Ω / 12 V bulb saves one named holeRef per pin and both values; loaded back it sits on b2 / b5 and on 12 V reads 1.2 W, brightness 1.0', () => {
  const def = bulb();
  const { board } = solveBuild(knownAnswer(12, { values: { resistance: 120, ratedVoltage: 12 } }));
  const b = board.components().find(c => c.type === 'bulb');
  const saved = BoardIO.saveHoleRefs(b);
  assert.deepStrictEqual(saved, [{ pin: '1', col: 1, row: 'b' }, { pin: '2', col: 4, row: 'b' }]);
  const record = JSON.parse(JSON.stringify({ type: 'bulb', label: b.label, values: b.values, holeRefs: saved }));
  assert.deepStrictEqual([record.values.resistance, record.values.ratedVoltage], [120, 12]);

  const loaded = { type: 'bulb', label: record.label, values: valuesFor(def, record.values),
                   pins: pinsOf(2), holeRefs: BoardIO.loadHoleRefs(record) };
  assert.deepStrictEqual(Parts.legsOf(loaded).map(l => [l.pin, l.hole]), [['1', 'b2'], ['2', 'b5']]);
  board.components()[board.components().indexOf(b)] = loaded;
  const m = part(board.solve()).m;
  near(m.power, 1.2, 0.002, 'reloaded W (144 / 120)');
  near(m.brightness, 1.0, 0.001, 'reloaded brightness');
});

// ── The AI side ───────────────────────────────────────────────────────────

const decl = name => Server.CIRCUIT_TOOLS[0].function_declarations.find(d => d.name === name);
const toolNames = message => Server.selectTools(message, []).map(d => d.name);

test('the generated place_bulb tool takes holeA and holeB (both required), and optional resistance and ratedVoltage', () => {
  const def = bulb();
  assert.equal(def.ai.tool || 'place_' + def.type, 'place_bulb');
  const t = decl('place_bulb');
  assert.ok(t, `no place_bulb tool; tools: ${Server.CIRCUIT_TOOLS[0].function_declarations.map(d => d.name).join(', ')}`);
  const props = t.parameters && t.parameters.properties;
  assert.ok(props && props.holeA && props.holeB, JSON.stringify(t.parameters));
  assert.deepStrictEqual([...t.parameters.required].sort(), ['holeA', 'holeB']);
  assert.ok(props.resistance && props.ratedVoltage, `the AI can set both values: ${JSON.stringify(props)}`);
});

test('ai: keywords include bulb, lamp, light bulb, incandescent (at most 8, lower case), not bare "light"; about ≤ 200 chars; not everyday', () => {
  const { ai } = bulb();
  for (const k of ['bulb', 'lamp', 'light bulb', 'incandescent']) {
    assert.ok(ai.keywords.includes(k), `keyword "${k}" in ${JSON.stringify(ai.keywords)}`);
  }
  assert.ok(!ai.keywords.includes('light'), 'bare "light" is the LED\'s keyword (and would catch "light sensor", "night light")');
  assert.ok(ai.keywords.length <= 8, `${ai.keywords.length} keywords`);
  assert.ok(ai.keywords.every(k => k === k.toLowerCase()), JSON.stringify(ai.keywords));
  assert.ok(typeof ai.about === 'string' && ai.about.length > 0 && ai.about.length <= 200, ai.about);
  assert.ok(!ai.everyday, 'not in the everyday set, so the demo prompt stays as it is');
});

for (const message of [
  QA_PROMPT,
  'Add a lamp to my circuit',
  'Build an incandescent light bulb circuit',
]) {
  test(`selectTools("${message}") sends place_bulb`, () => {
    bulb();
    const got = toolNames(message);
    assert.ok(got.includes('place_bulb'), `place_bulb missing from ${JSON.stringify(got)}`);
    assert.ok(got.length <= 12, `${got.length} tools`);
  });
}

// Pin: "light" and "lamp" are also the LED's keywords; the bulb's must not
// drag place_bulb into the LED prompts, above all the demo's.
for (const message of [
  DEMO_PROMPT,
  BENCH_PROMPT,
  'Build 3 LEDs, each with its own resistor.',
  'Build a night light that turns an LED on when it gets dark.',
  'Make the LED light up brighter',
]) {
  test(`pin: selectTools("${message}") does not send place_bulb`, () => {
    bulb();
    assert.ok(!toolNames(message).includes('place_bulb'), JSON.stringify(toolNames(message)));
  });
}

test('the known answer at 6 V has no circuit problems and passes finishAIReply untouched', () => {
  bulb();
  const build = knownAnswer(6);
  assert.deepStrictEqual(Server.findCircuitProblems(build.map(a => ({ ...a }))), []);
  const out = Server.finishAIReply({ reply: 'Built it.', actions: build.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, build);
  assert.equal(out.reply, 'Built it.');
});

// ── The sidebar ───────────────────────────────────────────────────────────

const found = q => Sidebar.groups(Parts.all(), q).flatMap(g => g.parts.map(p => p.type));

test('sidebar search: "bulb" and "incandescent" find only the bulb; "lamp" finds the LED and the bulb; "led" still only the LED', () => {
  bulb();
  assert.deepStrictEqual(found('bulb'), ['bulb']);
  assert.deepStrictEqual(found('Incandescent'), ['bulb']);
  assert.deepStrictEqual(found('lamp').sort(), ['bulb', 'led']);
  assert.deepStrictEqual(found('led'), ['led']);
});

// ── The browser half ──────────────────────────────────────────────────────

test('in a browser-like page with no THREE or document, bulb.js defines itself on window.Parts', () => {
  const file = path.join(PARTS_DIR, 'bulb.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/bulb.js must exist');
  const win = vm.createContext({ TextEncoder });
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(PARTS_DIR, 'registry.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(file, 'utf8'), win);
  const def = win.Parts.get('bulb');
  assert.ok(def, 'window.Parts.get("bulb") after loading bulb.js');
  assert.equal(def.elements({ resistance: 60, ratedVoltage: 6 }, {})[0].ohms, 60);
});

test('parts/bulb.js draws only through ctx: a view.build and a view.update, no App, no document', () => {
  const file = path.join(PARTS_DIR, 'bulb.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/bulb.js must exist');
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /\bview\s*:/, 'a view: { build, update } section');
  assert.doesNotMatch(src, /\bApp\b/, 'the part file must not reach into App; use ctx');
  assert.doesNotMatch(src, /\bdocument\b/, 'the part file must not touch document');
  assert.equal(typeof bulb().view.build, 'function');
  assert.equal(typeof bulb().view.update, 'function', 'view.update makes the glass glow with brightness');
});

// A stand-in for the bulb's group: its glass, as build() marks it
// (userData.bulbGlass), found through group.traverse, as the LED's dome is.
function glowAt(m) {
  const glass = { userData: { bulbGlass: true }, material: { emissiveIntensity: 0, opacity: 0.5 } };
  bulb().view.update({ group: { traverse: fn => [glass].forEach(fn) } }, m);
  return glass.material.emissiveIntensity;
}

test('glow: the glass (userData.bulbGlass) glows with brightness: 0 < 0.25 < 0.5 < 1.0, and {} (Stop) or brightness 0 is the dark value', () => {
  const dark = glowAt({});
  assert.equal(glowAt({ brightness: 0, power: 0 }), dark, 'brightness 0 is dark, as on Stop');
  const order = [0.25, 0.5, 1].map(b => glowAt({ brightness: b, power: b * 0.6 }));
  assert.ok(order[0] > dark, `a quarter-bright bulb glows above dark: ${dark} → ${JSON.stringify(order)}`);
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `glow rises with brightness: ${JSON.stringify(order)}`);
  assert.equal(glowAt({}), dark, 'back to dark after Stop');
});

// ── docs ──────────────────────────────────────────────────────────────────

test(`docs/QA.md has one AI case for "${QA_PROMPT}"`, () => {
  const qa = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'QA.md'), 'utf8');
  const rows = qa.split('\n').filter(l => l.startsWith('|') && l.includes(QA_PROMPT));
  assert.equal(rows.length, 1, 'one QA row sends the bulb prompt');
  assert.match(rows[0], /^\| AI-\d+ \|/, 'it is an AI prompt check (AI-NN)');
});
