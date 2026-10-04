// The ideal current source, parts/current_source.js (issue #38): a textbook
// source for ENSC 220 nodal analysis. It pushes a set current whatever the
// voltage across it. Its definition half loads in Node through
// require('circuit3d/js/parts'); the I element's stamp in the solver, the
// complex circuits (current division, superposition with a battery, two
// sources, an LED driven at 10 mA) and the open circuit ("no path for the
// current") are in test/simulate.test.js. Placing it by hand, Run and an
// Accepted AI build in the page are e2e/current-source.spec.js and
// e2e/parts.spec.js. Its worked build for the AI (ai.recipe, ai.guide) is
// test/current-source-recipe.test.js.
//
// Shapes these tests assume (the issue, plus choices stated here so the
// builder matches them):
// - Identity: type 'current_source', category 'Sources', a source (ref
//   'from'). name says current source; sub ≤ 32; icon an <svg>. The prefix
//   is unique (taken: R, RV, BAT, PS, D, ZD, LED, DS, BZ, LDR, SW, S, SS, TH,
//   LP, and M for the motor, #37) and is not a lone row letter a–j: "I1"
//   would read as hole i1 to the AI and to the hole parser. 'IS' is proposed.
// - pins ['from', 'to'], ref 'from': current flows from `from` through the
//   source and out of `to`, so outside it leaves `to` and comes back into
//   `from`, which is the ground side. On the board (not off-board):
//   place { kind: 'span', span { min 2, max 5, default 3 } }, rotations
//   include 'h'.
// - values: current { unit 'A', default 0.01, min 0.0001, max 1 }.
// - elements(v): one I, pins ['from', 'to'] in that order, amps = v.current.
// - measure(r) → { current, voltage }: current in mA (the set current, as
//   every other part's current), voltage in V = V(to) − V(from), the voltage
//   across it. A floating source (pins null) is finite or null, never NaN.
// - report(r, m): "10 mA · 10.0 V across" for 10 mA with 10 V across.
// - line(r, m): its results-panel line, with the current and "10.0 V
//   across". (With no line of its own, a circuit whose only source is this
//   one would also print "Circuit open — no complete path.", since that
//   check reads only V sources.)
// - view: { build, update }, drawn through ctx only: a round body with an
//   arrow.
// - ai: tool place_current_source (the default); keywords include current
//   source, ideal source, constant current, nodal; not everyday.
// - examples: at least the known answer, 10 mA, `to` → 1 kΩ → `from`: 10.0 V.
//
// Hand-computed: 10 mA through 1 kΩ is 10 V (5 mA: 5 V; 1 mA: 1 V).
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

const QA_PROMPT    = 'Build a nodal analysis circuit with a 10 mA current source and two resistors';
const DEMO_PROMPT  = 'Build a single LED circuit with a current-limiting resistor.';
const BENCH_PROMPT = 'Power an LED from the bench supply at 5 V with a series resistor.';

const TAKEN = ['R', 'RV', 'BAT', 'PS', 'D', 'ZD', 'LED', 'DS', 'BZ', 'LDR', 'SW', 'S', 'SS', 'TH', 'LP', 'M'];

function isrc() {
  const def = Parts.get('current_source');
  assert.ok(def, "Parts.get('current_source') is null: parts/current_source.js must exist and be listed in parts/index.js");
  return def;
}
const label = (n = 1) => isrc().prefix + n;

const plain = o => JSON.parse(JSON.stringify(o));
function near(got, want, tol, what) {
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want} (±${tol}), got ${got}`);
}
const text = r => (r.lines || []).map(l => l.text).join(' | ');

function valuesFor(def, given) {
  const v = {};
  for (const [key, spec] of Object.entries(def.values || {})) v[key] = spec.default;
  return Object.assign(v, given || {});
}

// The one I element and its key in PartResult (id, or index).
function iOf(values) {
  const els = isrc().elements(valuesFor(isrc(), values), {});
  assert.ok(Array.isArray(els), `elements() returns a list; got ${JSON.stringify(els)}`);
  const k = els.findIndex(e => e.kind === 'I');
  assert.ok(k >= 0, `elements() should hold one I; got ${JSON.stringify(els)}`);
  return { el: els[k], id: els[k].id !== undefined ? els[k].id : k, els };
}

// A PartResult for the source as the core hands it over: `from` at vFrom,
// `to` at vTo, the set current in mA from `from` to `to`.
function result(vFrom, vTo, values) {
  const v = valuesFor(isrc(), values);
  const { id } = iOf(v);
  return { label: label(), values: v, controls: {}, pins: { from: vFrom, to: vTo },
           current: { [id]: v.current * 1000 }, modes: {}, open: {} };
}
const measureAt = (vFrom, vTo, values) => { const r = result(vFrom, vTo, values); return { r, m: isrc().measure(r) }; };

function holeRef(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  assert.ok(m, 'not a hole: ' + s);
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}
const pinsOf = n => Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));

// ── Builds as AI actions, applied to a board that keeps real records ──────

const wire = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });

// The known answer: the source on b2 (from) – b5 (to), column 2 wired to the
// ground rail; R1 (1 kΩ) c5–c9, column 9 to the ground rail. No battery.
function knownAnswer({ values } = {}) {
  return [
    { tool: 'delete_all' },
    Object.assign({ tool: 'place_current_source', holeA: 'b2', holeB: 'b5' }, values || {}),
    { tool: 'place_resistor', holeA: 'c5', holeB: 'c9', resistance: 1000 },
    wire('a2', 'tn_2', 'black'),
    wire('a9', 'tn_9', 'black'),
  ];
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
  isrc();
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

// ── The file and its identity ─────────────────────────────────────────────

test('parts/index.js lists current_source.js, and the file exists', () => {
  const src = fs.readFileSync(path.join(PARTS_DIR, 'index.js'), 'utf8');
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, 'parts/index.js must keep its FILES list');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  assert.ok(files.includes('current_source.js'), `FILES should include 'current_source.js'; got ${JSON.stringify(files)}`);
  assert.ok(fs.existsSync(path.join(PARTS_DIR, 'current_source.js')), 'circuit3d/js/parts/current_source.js must exist');
});

test('both 3D pages load js/parts/current_source.js, after registry.js and before components.js', () => {
  for (const page of ['circuit3d/index.html', 'circuit3d/viewer.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    const at = order.indexOf('js/parts/current_source.js');
    assert.ok(at >= 0, `${page} loads js/parts/current_source.js: ${order.join(', ')}`);
    assert.ok(at > order.indexOf('js/parts/registry.js'), `${page}: current_source.js comes after registry.js`);
    const comps = order.indexOf('js/components.js');
    if (comps >= 0) assert.ok(at < comps, `${page}: current_source.js comes before components.js`);
  }
});

test("identity: type 'current_source', a Sources part named as a current source, an <svg> icon, a source with ref 'from'", () => {
  const def = isrc();
  assert.equal(def.type, 'current_source');
  assert.match(def.name, /current source/i, `name: ${def.name}`);
  assert.ok(def.name.length <= 24, def.name);
  assert.ok(typeof def.sub === 'string' && def.sub.length > 0 && def.sub.length <= 32, def.sub);
  assert.equal(def.category, 'Sources');
  assert.match(def.icon, /^<svg/);
  assert.equal(def.ref, 'from', 'the `from` pin is the ground side (0 V) of a circuit it is the earliest source of');
  assert.notEqual(def.place.kind, 'offboard', 'it sits on the board, wired through its holes');
});

test('prefix: unique, not one of the taken ones, and not a lone row letter a–j ("I1" would read as hole i1)', () => {
  const p = isrc().prefix;
  assert.match(p, /^[A-Z]{1,3}$/);
  assert.ok(!TAKEN.includes(p), `prefix ${p} is one of the taken ${JSON.stringify(TAKEN)}`);
  const others = Parts.all().filter(d => d.type !== 'current_source').map(d => d.prefix);
  assert.ok(!others.includes(p), `prefix ${p} is already used: ${JSON.stringify(others)}`);
  assert.doesNotMatch(p, /^[A-J]$/, `prefix ${p}: ${p}1 is also a hole name (${p.toLowerCase()}1)`);
});

test('labels: prefix + 1, prefix + 2; the resistors and batteries on the board never count toward them', () => {
  const p = isrc().prefix;
  assert.equal(Ids.nextLabel([], 'current_source'), p + '1');
  const board = [{ type: 'battery', label: 'BAT1' }, { type: 'resistor', label: 'R1' }, { type: 'current_source', label: p + '1' }];
  assert.equal(Ids.nextLabel(board, 'current_source'), p + '2');
  assert.equal(Ids.nextLabel(board, 'battery'), 'BAT2');
  assert.equal(Ids.findByLabel(board, p + '1').type, 'current_source');
});

test("pins ['from', 'to']; a span part, 2–5 columns (3 by default), placed along a row", () => {
  const def = isrc();
  assert.deepStrictEqual([...def.pins], ['from', 'to']);
  assert.equal(def.place.kind, 'span');
  assert.deepStrictEqual(plain(def.place.span), { min: 2, max: 5, default: 3 });
  assert.ok(def.place.rotations.includes('h'), JSON.stringify(def.place.rotations));
});

test('values: current, 10 mA by default, 0.1 mA–1 A, in amps', () => {
  const v = plain(isrc().values);
  assert.deepStrictEqual(Object.keys(v), ['current']);
  assert.deepStrictEqual({ unit: v.current.unit, default: v.current.default, min: v.current.min, max: v.current.max },
    { unit: 'A', default: 0.01, min: 0.0001, max: 1 });
});

test('checkValue: current 0.001 and 1 ok; 0.00005 and 2 refused', () => {
  isrc();
  assert.equal(Parts.checkValue('current_source', 'current', 0.001).ok, true);
  assert.equal(Parts.checkValue('current_source', 'current', 1).ok, true);
  assert.equal(Parts.checkValue('current_source', 'current', 0.00005).ok, false);
  assert.equal(Parts.checkValue('current_source', 'current', 2).ok, false);
});

// ── elements() ────────────────────────────────────────────────────────────

test("elements(): one I from 'from' to 'to' (in that order) of the set current (0.01 A by default, 0.002 A when set)", () => {
  for (const amps of [0.01, 0.002]) {
    const { el, els } = iOf({ current: amps });
    assert.equal(els.length, 1, `one element; got ${JSON.stringify(els)}`);
    assert.deepStrictEqual([...el.pins], ['from', 'to'], 'the order is the direction: out of `to`, back into `from`');
    assert.equal(el.amps, amps);
  }
});

// ── measure(), report(), line() ───────────────────────────────────────────

test('measure(): 10 mA with `from` 0 V, `to` 10 V is current 10 (mA) and voltage 10 (V(to) − V(from)); with `from` at 2 V and `to` at 7 V, 5 V across', () => {
  const { m } = measureAt(0, 10);
  near(m.current, 10, 1e-9, 'current (mA)');
  near(m.voltage, 10, 1e-9, 'voltage across (V)');
  near(measureAt(2, 7).m.voltage, 5, 1e-9, 'the voltage across it, not at `to`');
  near(measureAt(3, -1, { current: 0.002 }).m.voltage, -4, 1e-9, 'negative when `to` sits below `from`');
  near(measureAt(3, -1, { current: 0.002 }).m.current, 2, 1e-9, '2 mA');
});

test('measure(): a floating source (pins null) is finite or null, JSON-safe, never NaN', () => {
  const r = result(null, null);
  const m = isrc().measure(r);
  for (const [k, v] of Object.entries(m)) {
    assert.ok(v === null || (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean', `m.${k} = ${v}`);
  }
  assert.deepStrictEqual(plain(m), m, 'flat and JSON-safe');
});

test('report(): "10 mA · 10.0 V across" for the known answer; at most 80 characters; a floating source reads no NaN / null / undefined', () => {
  const def = isrc();
  const { r, m } = measureAt(0, 10);
  assert.equal(def.report(r, m), '10 mA · 10.0 V across');
  const two = measureAt(0, 4.7, { current: 0.002 });
  const s = def.report(two.r, two.m);
  assert.ok(s.length <= 80 && !s.includes('\n'), s);
  assert.match(s, /\b2 mA\b/, s);
  assert.match(s, /\b4\.7 V across\b/, s);
  const fr = result(null, null);
  assert.doesNotMatch(def.report(fr, def.measure(fr)), /NaN|null|undefined|Infinity/, 'floating');
});

test('line(): the results-panel line has the current and the voltage across it, "10 mA" and "10.0 V across"', () => {
  const def = isrc();
  assert.equal(typeof def.line, 'function', 'the source defines line(r, m) for the results panel');
  const { r, m } = measureAt(0, 10);
  const l = def.line(r, m);
  assert.ok(l && typeof l.text === 'string', JSON.stringify(l));
  assert.match(l.text, /\b10 mA\b/, l.text);
  assert.match(l.text, /\b10\.0 V across\b/, l.text);
});

// ── Known answer through the AI path and the simulator ────────────────────

test('known answer: 10 mA, `to` → 1 kΩ → `from` (on the ground rail): 10.0 V across R1 and the source, 10 mA through R1, its line in the panel, no open-circuit line', () => {
  const { r } = solveBuild(knownAnswer());
  const s = part(r);
  near(s.m.voltage, 10, 0.001, 'V across the source');
  near(s.m.current, 10, 1e-6, 'source mA');
  near(r.parts.R1.m.current, 10, 0.001, 'R1 mA');
  near(s.r.pins.from, 0, 1e-9, '`from` is ground');
  assert.deepStrictEqual(s.warnings, []);
  assert.ok(r.lines.some(l => /10\.0 V across/.test(l.text)), `a results line with "10.0 V across": ${text(r)}`);
  assert.doesNotMatch(text(r), /Circuit open|no path|No battery|Battery terminals|⚠/i, text(r));
});

test("set_value on the source (current 0.005, the AI's way) moves it: 5.0 V across 1 kΩ", () => {
  const { board } = solveBuild(knownAnswer());
  assert.deepStrictEqual(Chat.applyActions([{ tool: 'set_value', part: label(), current: 0.005 }], board), { applied: 1, failed: 0 });
  near(part(board.solve()).m.voltage, 5, 0.001, '5 mA × 1 kΩ');
});

// ── examples ──────────────────────────────────────────────────────────────

test('examples: the known answer (10 mA, a 1 kΩ from `to` back to `from`) expects about 10.0 V across the source', () => {
  const def = isrc();
  const found = (def.examples || []).find(ex => {
    const s = ex.parts.find(p => p.type === 'current_source');
    const r = ex.parts.find(p => p.type === 'resistor' && p.values && p.values.resistance === 1000);
    const want = s && ex.expect[s.label] && ex.expect[s.label].voltage;
    const amps = s && ((s.values && s.values.current) || def.values.current.default);
    return r && amps === 0.01 && Array.isArray(want) && want[0] <= 10 && want[1] >= 10 && want[1] - want[0] <= 0.1;
  });
  assert.ok(found, `an example with 10 mA into 1 kΩ that checks the source's voltage around 10.0 V; got ${JSON.stringify((def.examples || []).map(e => [e.name, e.parts, e.expect]))}`);
  // test/parts-examples.test.js solves every example against its expect.
});

// ── Placement ─────────────────────────────────────────────────────────────

const leg = (pin, s) => ({ pin, col: +s.slice(1) - 1, row: s[0] });
const placeSrc = (a, b, map) => Parts.checkPlacement('current_source', [leg('from', a), leg('to', b)], map || new Map(), BOARD);

test('checkPlacement: 2, 3 and 5 columns apart ok, either way round', () => {
  isrc();
  for (const [a, b] of [['b2', 'b4'], ['b2', 'b5'], ['b2', 'b7'], ['b7', 'b2']]) {
    assert.deepStrictEqual(placeSrc(a, b), { ok: true }, `${a}/${b}`);
  }
});

test('checkPlacement: 1 or 6 columns apart is refused with the 2–5 range; vertical inside one half is refused', () => {
  isrc();
  for (const b of ['b3', 'b8']) {
    const out = placeSrc('b2', b);
    assert.equal(out.ok, false, `b2 → ${b}`);
    assert.ok(out.reason.includes('2–5'), out.reason);
  }
  assert.equal(placeSrc('a10', 'c10').ok, false, 'both legs in one column of one half are one node');
});

test('the AI places it through chat.js: place_current_source 6 columns apart is refused with a note giving the 2–5 range', () => {
  isrc();
  const board = simBoard();
  const out = Chat.applyActions([{ tool: 'place_current_source', holeA: 'b2', holeB: 'b8' }], board);
  assert.equal(board.components().length, 0, 'nothing placed');
  assert.ok(out.failed >= 1, JSON.stringify(out));
  assert.ok(board.notes.some(n => n.includes('2–5')), `a note with the range: ${JSON.stringify(board.notes)}`);
});

// ── Hole map and round trip ───────────────────────────────────────────────

test("hole map: a source on b2 / b5 holds each hole by label and pin name ('from', 'to'), and nothing between", () => {
  const def = isrc();
  const comp = { type: 'current_source', label: label(), values: valuesFor(def), holeRefs: [holeRef('b2'), holeRef('b5')], pins: pinsOf(2) };
  const map = BoardIO.buildHoleMap([comp], []);
  assert.deepStrictEqual(map.get('b2'), { label: comp.label, pin: 'from' });
  assert.deepStrictEqual(map.get('b5'), { label: comp.label, pin: 'to' });
  assert.equal(map.size, 2);
});

test('round trip: a 1 mA source saves one named holeRef per pin and its current; loaded back it sits on b2 / b5 and reads 1.0 V across 1 kΩ', () => {
  const def = isrc();
  const { board } = solveBuild(knownAnswer({ values: { current: 0.001 } }));
  const s = board.components().find(c => c.type === 'current_source');
  const saved = BoardIO.saveHoleRefs(s);
  assert.deepStrictEqual(saved, [{ pin: 'from', col: 1, row: 'b' }, { pin: 'to', col: 4, row: 'b' }]);
  const record = JSON.parse(JSON.stringify({ type: 'current_source', label: s.label, values: s.values, holeRefs: saved }));
  assert.equal(record.values.current, 0.001);

  const loaded = { type: 'current_source', label: record.label, values: valuesFor(def, record.values),
                   pins: pinsOf(2), holeRefs: BoardIO.loadHoleRefs(record) };
  assert.deepStrictEqual(Parts.legsOf(loaded).map(l => [l.pin, l.hole]), [['from', 'b2'], ['to', 'b5']]);
  board.components()[board.components().indexOf(s)] = loaded;
  near(part(board.solve()).m.voltage, 1, 0.001, 'reloaded: 1 mA × 1 kΩ');
});

// ── The AI side ───────────────────────────────────────────────────────────

const decl = name => Server.CIRCUIT_TOOLS[0].function_declarations.find(d => d.name === name);
const toolNames = message => Server.selectTools(message, []).map(d => d.name);

test('the generated place_current_source tool takes holeA (from) and holeB (to), both required, and an optional current', () => {
  const def = isrc();
  assert.equal(def.ai.tool || 'place_' + def.type, 'place_current_source');
  const t = decl('place_current_source');
  assert.ok(t, `no place_current_source tool; tools: ${Server.CIRCUIT_TOOLS[0].function_declarations.map(d => d.name).join(', ')}`);
  const props = t.parameters && t.parameters.properties;
  assert.ok(props && props.holeA && props.holeB, JSON.stringify(t.parameters));
  assert.match(props.holeA.description, /\bfrom\b/, props.holeA.description);
  assert.match(props.holeB.description, /\bto\b/, props.holeB.description);
  assert.deepStrictEqual([...t.parameters.required].sort(), ['holeA', 'holeB']);
  assert.ok(props.current, `the AI can set the current: ${JSON.stringify(props)}`);
});

test('ai: keywords include current source, ideal source, constant current, nodal (at most 8, lower case), not bare "current"; about ≤ 200 chars; not everyday', () => {
  const { ai } = isrc();
  for (const k of ['current source', 'ideal source', 'constant current', 'nodal']) {
    assert.ok(ai.keywords.includes(k), `keyword "${k}" in ${JSON.stringify(ai.keywords)}`);
  }
  assert.ok(!ai.keywords.includes('current'), 'bare "current" is in "current-limiting resistor", the demo prompt');
  assert.ok(ai.keywords.length <= 8, `${ai.keywords.length} keywords`);
  assert.ok(ai.keywords.every(k => k === k.toLowerCase()), JSON.stringify(ai.keywords));
  assert.ok(typeof ai.about === 'string' && ai.about.length > 0 && ai.about.length <= 200, ai.about);
  assert.ok(!ai.everyday, 'not in the everyday set, so the demo prompt stays as it is');
});

for (const message of [
  QA_PROMPT,
  'Add a constant current source to my circuit',
  'Set up a nodal analysis problem',
  'Use an ideal source of 2 mA',
]) {
  test(`selectTools("${message}") sends place_current_source`, () => {
    isrc();
    const got = toolNames(message);
    assert.ok(got.includes('place_current_source'), `place_current_source missing from ${JSON.stringify(got)}`);
    assert.ok(got.length <= 12, `${got.length} tools`);
  });
}

// Pin: "current" is everywhere in LED prompts; the source's keywords must not
// drag place_current_source into them, above all the demo's.
for (const message of [
  DEMO_PROMPT,
  BENCH_PROMPT,
  'What current flows through the LED?',
  'Build 3 LEDs, each with its own resistor.',
]) {
  test(`pin: selectTools("${message}") does not send place_current_source`, () => {
    isrc();
    assert.ok(!toolNames(message).includes('place_current_source'), JSON.stringify(toolNames(message)));
  });
}

// findCircuitProblems builds its power / ground sides from V elements only,
// so today a correct build whose only source is this I source reads "not
// connected between power and ground" for every part. The server must treat
// an I element as a terminal pair too: `to` the + side, `from` the − side.
test('findCircuitProblems: the known answer (no battery, the current source alone) has no problems and passes finishAIReply untouched', () => {
  isrc();
  const build = knownAnswer();
  assert.deepStrictEqual(Server.findCircuitProblems(build.map(a => ({ ...a }))), []);
  const out = Server.finishAIReply({ reply: 'Built it.', actions: build.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, build);
  assert.equal(out.reply, 'Built it.');
});

test('findCircuitProblems: two sources, nodal (10 mA and 5 mA into two nodes, three 1 kΩ) has no problems', () => {
  isrc();
  const build = [
    { tool: 'delete_all' },
    { tool: 'place_current_source', holeA: 'd6', holeB: 'd10' },
    { tool: 'place_resistor', holeA: 'b10', holeB: 'b13', resistance: 1000 },
    { tool: 'place_resistor', holeA: 'c10', holeB: 'c15', resistance: 1000 },
    { tool: 'place_resistor', holeA: 'b20', holeB: 'b24', resistance: 1000 },
    { tool: 'place_current_source', holeA: 'd16', holeB: 'd20', current: 0.005 },
    wire('a6', 'tn_6', 'black'), wire('a13', 'tn_13', 'black'), wire('a15', 'a20'),
    wire('a24', 'tn_24', 'black'), wire('a16', 'tn_16', 'black'),
  ];
  assert.deepStrictEqual(Server.findCircuitProblems(build.map(a => ({ ...a }))), []);
});

test('findCircuitProblems: `to` into a 1 kΩ whose far end goes nowhere names the resistor as not connected', () => {
  isrc();
  const build = [
    { tool: 'delete_all' },
    { tool: 'place_current_source', holeA: 'b2', holeB: 'b5' },
    { tool: 'place_resistor', holeA: 'c5', holeB: 'c9', resistance: 1000 },
    wire('a2', 'tn_2', 'black'),
  ];
  const problems = Server.findCircuitProblems(build.map(a => ({ ...a })));
  assert.ok(problems.some(p => /resistor at c5\/c9 is not connected/.test(p)), JSON.stringify(problems));
});

test('findCircuitProblems: `from` left unwired (to → 1 kΩ → ground rail) is a problem too', () => {
  isrc();
  const build = [
    { tool: 'delete_all' },
    { tool: 'place_current_source', holeA: 'b2', holeB: 'b5' },
    { tool: 'place_resistor', holeA: 'c5', holeB: 'c9', resistance: 1000 },
    wire('a9', 'tn_9', 'black'),
  ];
  assert.ok(Server.findCircuitProblems(build.map(a => ({ ...a }))).length > 0, 'no return path into `from`');
});

// Pin (passes today): with a battery on the board the V pair already makes
// every node reachable; the I terminal pair must not break that.
test('pin: findCircuitProblems on a battery + 1 kΩ divider with a 1 mA source into its middle has no problems', () => {
  isrc();
  const build = [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    wire('BAT1.0', `tp_${N}`, 'red'), wire('BAT1.1', `tn_${N}`, 'black'),
    { tool: 'place_resistor', holeA: 'b5', holeB: 'b9', resistance: 1000 },
    { tool: 'place_resistor', holeA: 'c9', holeB: 'c13', resistance: 1000 },
    { tool: 'place_current_source', holeA: 'e13', holeB: 'e9', current: 0.001 },
    wire('tp_4', 'a5', 'red'), wire('a13', 'tn_13', 'black'),
  ];
  assert.deepStrictEqual(Server.findCircuitProblems(build.map(a => ({ ...a }))), []);
  const { r } = solveBuild(build);
  near(r.parts.R2.m.current, 5, 0.001, 'R2 mA (superposition: 4.5 mA + 0.5 mA)');
});

// A battery's pair grows its + and − sides through forward diodes as well
// as R / SW / wires, so an LED chain between them reads as on a forward
// path. The current source's pair must grow the same way: `to` is its +,
// `from` its −. Otherwise a correct LED chain driven by it gets a false
// "has no forward path from + to −" Heads-up (reviewer, #38).
const ledsOnSource = withResistor => [
  { tool: 'delete_all' },
  { tool: 'place_current_source', holeA: 'b2', holeB: 'b5' },
  ...(withResistor
    // to (col 5) → R1 c5–c9 → LED1 anode d9, cathode d11 → LED2 anode e11, cathode e13 → tn
    ? [{ tool: 'place_resistor', holeA: 'c5', holeB: 'c9', resistance: 1000 },
       { tool: 'place_led', holeA: 'd11', holeB: 'd9' },
       { tool: 'place_led', holeA: 'e13', holeB: 'e11' },
       wire('a2', 'tn_2', 'black'), wire('a13', 'tn_13', 'black')]
    // to (col 5) → LED1 anode c5, cathode c7 → LED2 anode d7, cathode d9 → tn
    : [{ tool: 'place_led', holeA: 'c7', holeB: 'c5' },
       { tool: 'place_led', holeA: 'd9', holeB: 'd7' },
       wire('a2', 'tn_2', 'black'), wire('a9', 'tn_9', 'black')]),
];

test('findCircuitProblems: two LEDs in series straight on the current source (`to` → LED1 → LED2 → ground) have no problems; both lit at 10.0 mA', () => {
  isrc();
  const build = ledsOnSource(false);
  assert.deepStrictEqual(Server.findCircuitProblems(build.map(a => ({ ...a }))), []);
  const { r } = solveBuild(build);
  for (const L of ['LED1', 'LED2']) {
    assert.equal(r.parts[L].m.on, true, `${L}: ${JSON.stringify(r.parts[L].m)}`);
    near(r.parts[L].m.current, 10, 0.001, `${L} mA`);
  }
});

test('findCircuitProblems: the source through a 1 kΩ into two LEDs in series has no problems; both lit at 10.0 mA', () => {
  isrc();
  const build = ledsOnSource(true);
  assert.deepStrictEqual(Server.findCircuitProblems(build.map(a => ({ ...a }))), []);
  const { r } = solveBuild(build);
  for (const L of ['LED1', 'LED2']) {
    assert.equal(r.parts[L].m.on, true, `${L}: ${JSON.stringify(r.parts[L].m)}`);
    near(r.parts[L].m.current, 10, 0.001, `${L} mA`);
  }
  near(r.parts.R1.m.current, 10, 0.001, 'R1 mA');
});

// Pin: a genuinely backwards LED on a current-source-only loop keeps its
// Heads-up once the pair grows through forward diodes.
test('pin: findCircuitProblems still flags an LED reversed on a current-source-only loop (cathode c5 at `to`, anode c7 to ground)', () => {
  isrc();
  const build = [
    { tool: 'delete_all' },
    { tool: 'place_current_source', holeA: 'b2', holeB: 'b5' },
    { tool: 'place_led', holeA: 'c5', holeB: 'c7' },
    wire('a2', 'tn_2', 'black'), wire('a7', 'tn_7', 'black'),
  ];
  const problems = Server.findCircuitProblems(build.map(a => ({ ...a })));
  assert.ok(problems.some(p => /LED at c5\/c7 (is backwards|has no forward path)/.test(p)), JSON.stringify(problems));
});

// ── The sidebar ───────────────────────────────────────────────────────────

const found = q => Sidebar.groups(Parts.all(), q).flatMap(g => g.parts.map(p => p.type));

test('sidebar search: "current source" and "nodal" find the current source, under Sources', () => {
  isrc();
  assert.ok(found('current source').includes('current_source'), JSON.stringify(found('current source')));
  assert.deepStrictEqual(found('nodal'), ['current_source']);
  const g = Sidebar.groups(Parts.all(), 'nodal');
  assert.equal(g[0] && g[0].category, 'Sources');
});

// ── The browser half ──────────────────────────────────────────────────────

test('in a browser-like page with no THREE or document, current_source.js defines itself on window.Parts', () => {
  const file = path.join(PARTS_DIR, 'current_source.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/current_source.js must exist');
  const win = vm.createContext({ TextEncoder });
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(PARTS_DIR, 'registry.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(file, 'utf8'), win);
  const def = win.Parts.get('current_source');
  assert.ok(def, 'window.Parts.get("current_source") after loading current_source.js');
  assert.equal(def.elements({ current: 0.01 }, {})[0].amps, 0.01);
});

test('parts/current_source.js draws only through ctx: a view.build, no App, no document', () => {
  const file = path.join(PARTS_DIR, 'current_source.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/current_source.js must exist');
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /\bview\s*:/, 'a view: { build } section');
  assert.doesNotMatch(src, /\bApp\b/, 'the part file must not reach into App; use ctx');
  assert.doesNotMatch(src, /\bdocument\b/, 'the part file must not touch document');
  assert.equal(typeof isrc().view.build, 'function');
});

// ── docs ──────────────────────────────────────────────────────────────────

test(`docs/QA.md has one AI case for "${QA_PROMPT}"`, () => {
  const qa = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'QA.md'), 'utf8');
  const rows = qa.split('\n').filter(l => l.startsWith('|') && l.includes(QA_PROMPT));
  assert.equal(rows.length, 1, 'one QA row sends the current source prompt');
  assert.match(rows[0], /^\| AI-\d+ \|/, 'it is an AI prompt check (AI-NN)');
});
