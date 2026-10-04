// The slide switch (SPDT), parts/slide_switch.js (issue #39): three legs in a
// row, the middle one (common) joined to one side or the other, to pick
// between two circuits. It copies the potentiometer's footprint (#31) and the
// toggle switch's saved `toggle` control with a click gesture (#32). Its
// definition half loads in Node through require('circuit3d/js/parts'); its
// model, the click that flips it and Accept on an AI build are checked in the
// browser by e2e/slide-switch.spec.js (and e2e/parts.spec.js). Its worked
// build for the AI (ai.recipe, ai.guide) is test/slide-switch-recipe.test.js.
//
// Shapes these tests assume (the issue, plus choices stated here so the
// builder matches them):
// - Identity: type 'slide_switch', category 'I/O' (beside the button and the
//   toggle switch). The name says slide switch, the icon is an <svg>, and the
//   prefix is 'SS' (the button has SW, the toggle switch S). Labels are SS1,
//   SS2, and S1 / SW1 never count toward them, nor SS1 toward theirs.
// - pins ['a', 'common', 'b']: common is the MIDDLE leg.
// - place { kind: 'footprint', legs [[0,0],[1,0],[2,0]], rotations [0, 180] }.
//   Horizontal only (decision on #39): facing down or up would put two or
//   three legs in one column of a half, one node, so the switch could never
//   pick a side. The AI's direction 'up' / 'down' is refused by chat.js.
// - controls { toB: { type: 'toggle', default: false, saved: true } };
//   gestures { click: 'toB' }.
// - elements(v, c): SW(common, a) closed = !toB and SW(common, b) closed = toB.
// - measure(r) → { side: 'a' | 'b' }, from r.controls.toB. (Other fields,
//   e.g. a current, are allowed; these tests read only `side`.)
// - report(r, m): a string of at most 80 characters naming the side, "a" or
//   "b" as a word (e.g. "common → a"); different for the two sides.
// - ai: tool place_slide_switch (the default, { hole, direction }); keywords
//   include slide switch, spdt, selector, two-way switch. Not `everyday`.
// - examples: the known answer both ways (as placed, and flipped with
//   controls: { toB: true }), each checking the switch's side and both LEDs.
//
// Hand-computed (ideal 9 V battery; a closed SW is 1 mΩ; an open SW carries
// nothing; a red LED is 2.0 V, a green LED 2.2 V, each in series with 0.1 Ω
// when on):
//   common → a → 470 Ω → red LED:    (9 − 2.0) / (470 + 0.1 + 0.001) = 14.8904 mA
//   common → b → 470 Ω → green LED:  (9 − 2.2) / (470 + 0.1 + 0.001) = 14.4650 mA
//   the other side: 0 mA, its LED off
//   two switches as a 2-way (staircase) pair, red LED: (9 − 2.0) / 470.102 = 14.8904 mA
//   when both throws match, 0 mA when they differ.
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

const QA_PROMPT   = 'Use a slide switch to choose between a red and a green LED';
const DEMO_PROMPT = 'Build a single LED circuit with a current-limiting resistor.';

const RED_MA   = (9 - 2.0) / (470 + 0.1 + 0.001) * 1000;   // 14.8904 mA
const GREEN_MA = (9 - 2.2) / (470 + 0.1 + 0.001) * 1000;   // 14.4650 mA
const PAIR_MA  = (9 - 2.0) / (470 + 0.1 + 0.002) * 1000;   // 14.8904 mA

function slide() {
  const def = Parts.get('slide_switch');
  assert.ok(def, "Parts.get('slide_switch') is null: parts/slide_switch.js must exist and be listed in parts/index.js");
  return def;
}
const label = (n = 1) => slide().prefix + n;

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

// The two SW elements, found by the pins they join: { toA, toB, els }.
function throwsOf(controls) {
  const els = slide().elements(valuesFor(slide()), controls);
  assert.ok(Array.isArray(els), `elements() returns a list; got ${JSON.stringify(els)}`);
  const joining = side => els.find(e => e.kind === 'SW' && [...e.pins].sort().join(',') === ['common', side].sort().join(','));
  return { toA: joining('a'), toB: joining('b'), els };
}

// A PartResult for the switch, as the core hands it over.
function result(controls) {
  return { label: label(), values: valuesFor(slide()), controls, pins: { a: 9, common: 9, b: 0 },
           current: {}, modes: {}, open: {} };
}

// "a2" → { col: 1, row: 'a' }; "tp_50" → { col: 49, row: 'tp' }.
function holeRef(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  assert.ok(m, 'not a hole: ' + s);
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}
const pinsOf = n => Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));

// ── Builds as AI actions, applied to a board that keeps real records ──────

const wire = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });
const flip = (part, toB = true) => ({ tool: 'set_control', part, toB });

const battery = () => [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  wire('BAT1.0', `tp_${N}`, 'red'),
  wire('BAT1.1', `tn_${N}`, 'black'),
];

// The known answer: the switch at c8 facing right (a c8, common c9, b c10);
// tp_9 → a9 (+ into common); a: 470 Ω b4–b8, red LED anode d4, cathode d2,
// a2 → tn_2; b: 470 Ω b10–b14, green LED anode d14, cathode d16, a16 → tn_16.
// `toB` adds the set_control that flips it.
function knownAnswer({ toB = false } = {}) {
  const build = battery().concat([
    { tool: 'place_slide_switch', hole: 'c8', direction: 'right' },
    wire('tp_9', 'a9', 'red'),
    { tool: 'place_resistor', holeA: 'b4', holeB: 'b8', resistance: 470 },
    { tool: 'place_led', holeA: 'd2', holeB: 'd4', color: 'red' },       // LED1: cathode d2, anode d4
    wire('a2', 'tn_2', 'black'),
    { tool: 'place_resistor', holeA: 'b10', holeB: 'b14', resistance: 470 },
    { tool: 'place_led', holeA: 'd16', holeB: 'd14', color: 'green' },   // LED2: cathode d16, anode d14
    wire('a16', 'tn_16', 'black'),
  ]);
  return toB ? build.concat([flip(label())]) : build;
}

// A board that keeps real records the way App leaves them (as in
// test/parts-toggle_switch.test.js), so Sim.analyze can solve it.
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
  slide();
  const board = simBoard();
  const out = Chat.acceptBuild(actions.map(a => ({ ...a })), board);
  assert.deepEqual(out, { applied: actions.length, failed: 0 }, `every action applies; notes ${JSON.stringify(board.notes)}`);
  const r = board.solve();
  assert.equal(r.status, 'ok', `status ${r.status}: ${text(r)}`);
  assert.equal(r.shorted, false, `shorted: ${text(r)}`);
  return { board, r };
}

// A part's { r, m, warnings } in a solved circuit.
function part(r, lbl = label()) {
  const p = r.parts && r.parts[lbl];
  assert.ok(p, `analyze().parts has no ${lbl}; got ${JSON.stringify(Object.keys(r.parts || {}))}`);
  return p;
}

const byLabel = (board, lbl) => board.components().find(c => c.label === lbl);
const dark = (m, what) => {
  assert.equal(m.on, false, `${what} is off: ${JSON.stringify(m)}`);
  assert.ok(Math.abs(m.current) < 1e-6, `${what} carries nothing: ${m.current} mA`);
};

// ── The file and its identity ─────────────────────────────────────────────

test('parts/index.js lists slide_switch.js, and the file exists', () => {
  const src = fs.readFileSync(path.join(PARTS_DIR, 'index.js'), 'utf8');
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, 'parts/index.js must keep its FILES list');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  assert.ok(files.includes('slide_switch.js'), `FILES should include 'slide_switch.js'; got ${JSON.stringify(files)}`);
  assert.ok(fs.existsSync(path.join(PARTS_DIR, 'slide_switch.js')), 'circuit3d/js/parts/slide_switch.js must exist');
});

test('both 3D pages load js/parts/slide_switch.js, after registry.js and before components.js', () => {
  for (const page of ['circuit3d/index.html', 'circuit3d/viewer.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    const at = order.indexOf('js/parts/slide_switch.js');
    assert.ok(at >= 0, `${page} loads js/parts/slide_switch.js: ${order.join(', ')}`);
    assert.ok(at > order.indexOf('js/parts/registry.js'), `${page}: slide_switch.js comes after registry.js`);
    const comps = order.indexOf('js/components.js');
    if (comps >= 0) assert.ok(at < comps, `${page}: slide_switch.js comes before components.js`);
  }
});

test("identity: type 'slide_switch', an I/O part named as a slide switch, an <svg> icon, prefix 'SS' that no other part uses", () => {
  const def = slide();
  assert.equal(def.type, 'slide_switch');
  assert.equal(def.category, 'I/O');
  assert.match(def.name, /slide/i, `name: ${def.name}`);
  assert.match(def.name, /switch/i, `name: ${def.name}`);
  assert.ok(def.name.length <= 24, def.name);
  assert.ok(typeof def.sub === 'string' && def.sub.length > 0 && def.sub.length <= 32, def.sub);
  assert.match(def.icon, /^<svg/);
  assert.equal(def.ref, undefined, 'a switch is not a source');
  assert.equal(def.prefix, 'SS', "the proposed prefix: SS (the button is SW, the toggle switch S)");
  const others = Parts.all().filter(d => d.type !== 'slide_switch').map(d => d.prefix);
  assert.ok(!others.includes(def.prefix), `prefix ${def.prefix} is already used: ${JSON.stringify(others)}`);
});

test('labels: SS1, SS2; S1 (toggle) and SW1 (button) never count toward them, nor SS1 toward theirs', () => {
  const p = slide().prefix;
  assert.equal(Ids.nextLabel([], 'slide_switch'), p + '1');
  assert.equal(Ids.nextLabel([{ type: 'slide_switch', label: p + '1' }], 'slide_switch'), p + '2');
  const board = [{ type: 'button', label: 'SW1' }, { type: 'button', label: 'SW2' },
                 { type: 'toggle_switch', label: 'S1' }, { type: 'toggle_switch', label: 'S2' }, { type: 'toggle_switch', label: 'S3' }];
  assert.equal(Ids.nextLabel(board, 'slide_switch'), p + '1', 'buttons and toggle switches do not bump the slide switch number');
  board.push({ type: 'slide_switch', label: p + '1' }, { type: 'slide_switch', label: p + '2' },
             { type: 'slide_switch', label: p + '3' }, { type: 'slide_switch', label: p + '4' });
  assert.equal(Ids.nextLabel(board, 'button'), 'SW3', 'slide switches do not bump the button number');
  assert.equal(Ids.nextLabel(board, 'toggle_switch'), 'S4', 'slide switches do not bump the toggle switch number');
  assert.equal(Ids.nextLabel(board, 'slide_switch'), p + '5');
  assert.equal(Ids.findByLabel(board, p + '1').type, 'slide_switch');
  assert.equal(Ids.findByLabel(board, 'S1').type, 'toggle_switch');
  assert.deepStrictEqual(Ids.parsePinRef(p + '1.common'), { label: p + '1', pin: 'common' });
});

test("pins ['a', 'common', 'b'] (common in the middle); a footprint part, legs [0,0] [1,0] [2,0], rotations 0 and 180 only", () => {
  const def = slide();
  assert.deepStrictEqual([...def.pins], ['a', 'common', 'b']);
  assert.deepStrictEqual(plain(def.place), { kind: 'footprint', legs: [[0, 0], [1, 0], [2, 0]], rotations: [0, 180] });
});

// ── Controls and gestures: a saved toggle ────────────────────────────────

test('controls.toB is a toggle (default false, saved: true), and a click flips it', () => {
  const def = slide();
  assert.deepStrictEqual(plain(def.controls), { toB: { type: 'toggle', default: false, saved: true } });
  assert.deepStrictEqual(plain(def.gestures), { click: 'toB' });
});

// ── elements(): two SW, never both closed ────────────────────────────────

test('elements(): SW(common, a) closed exactly while toB is false, SW(common, b) exactly while it is true; nothing else', () => {
  for (const toB of [false, true]) {
    const { toA, toB: sb, els } = throwsOf({ toB });
    assert.equal(els.length, 2, `two elements; got ${JSON.stringify(els)}`);
    assert.ok(toA && sb, `one SW joins common to a and one joins common to b; got ${JSON.stringify(els)}`);
    assert.strictEqual(toA.closed, !toB, `toB ${toB}: SW(common, a) closed ${toA.closed}`);
    assert.strictEqual(sb.closed, toB, `toB ${toB}: SW(common, b) closed ${sb.closed}`);
  }
});

test('elements() with no controls at all is the default: common joined to a', () => {
  const { toA, toB } = throwsOf(undefined);
  assert.deepStrictEqual([toA && toA.closed, toB && toB.closed], [true, false]);
});

test('changing controls.toB changes the elements (nothing is cached between calls)', () => {
  const closedPair = toB => { const t = throwsOf({ toB }); return [t.toA.closed, t.toB.closed]; };
  assert.deepStrictEqual(closedPair(true), [false, true]);
  assert.deepStrictEqual(closedPair(false), [true, false]);
  assert.deepStrictEqual(closedPair(true), [false, true]);
});

// ── measure() and report() ────────────────────────────────────────────────

test("measure(): side 'a' while toB is false (and by default), 'b' while it is true; flat and JSON-safe", () => {
  const def = slide();
  assert.equal(typeof def.measure, 'function', 'the switch defines measure()');
  const a = def.measure(result({ toB: false }));
  const b = def.measure(result({ toB: true }));
  assert.strictEqual(a.side, 'a', JSON.stringify(a));
  assert.strictEqual(b.side, 'b', JSON.stringify(b));
  assert.strictEqual(def.measure(result({})).side, 'a', 'no toB yet reads as the default, a');
  assert.deepStrictEqual(plain(a), a, 'flat and JSON-safe');
});

test('report(): at most 80 characters, naming the side as a word ("a" or "b"), different for the two sides', () => {
  const def = slide();
  const ra = result({ toB: false }), rb = result({ toB: true });
  const a = def.report(ra, def.measure(ra)), b = def.report(rb, def.measure(rb));
  for (const s of [a, b]) assert.ok(typeof s === 'string' && s.length > 0 && s.length <= 80, JSON.stringify(s));
  assert.match(a, /(^|[^a-z])a([^a-z]|$)/i, `side a: ${a}`);
  assert.match(b, /(^|[^a-z])b([^a-z]|$)/i, `side b: ${b}`);
  assert.notEqual(a, b);
});

// ── Known answer through the simulator ────────────────────────────────────

test('known answer as placed (toB false): common → a → 470 Ω lights the RED LED at 14.89 mA (hand: 7 / 470.101); the green LED is dark; side a; no warnings', () => {
  const { board, r } = solveBuild(knownAnswer());
  assert.strictEqual(byLabel(board, label()).controls.toB, false, 'a placed switch starts on a');
  assert.strictEqual(part(r).m.side, 'a', JSON.stringify(part(r).m));
  const red = part(r, 'LED1').m;
  assert.equal(red.on, true, `red LED on: ${JSON.stringify(red)}`);
  near(red.current, RED_MA, 0.01, 'red LED mA');
  dark(part(r, 'LED2').m, 'the green LED');
  near(part(r, 'BAT1').m.current, RED_MA, 0.01, 'battery mA');
  assert.ok(r.lines.some(l => l.text === '  💡 LED ON  (14.9 mA)'), text(r));
  assert.doesNotMatch(text(r), /14\.5 mA/, text(r));
  assert.deepStrictEqual(Object.entries(r.parts).filter(([, q]) => q.warnings && q.warnings.length).map(([k]) => k), [], 'no warnings');
});

test('known answer flipped (set_control toB: true): common → b → 470 Ω lights the GREEN LED at 14.47 mA (hand: 6.8 / 470.101); the red LED is dark; side b', () => {
  const { r } = solveBuild(knownAnswer({ toB: true }));
  assert.strictEqual(part(r).m.side, 'b', JSON.stringify(part(r).m));
  const green = part(r, 'LED2').m;
  assert.equal(green.on, true, `green LED on: ${JSON.stringify(green)}`);
  near(green.current, GREEN_MA, 0.01, 'green LED mA');
  dark(part(r, 'LED1').m, 'the red LED');
  near(part(r, 'BAT1').m.current, GREEN_MA, 0.01, 'battery mA');
  assert.ok(r.lines.some(l => l.text === '  💡 LED ON  (14.5 mA)'), text(r));
  assert.doesNotMatch(text(r), /14\.9 mA/, text(r));
});

test('flipping the same record a → b → a re-simulates each time: red, then green, then red (what a click does)', () => {
  const { board } = solveBuild(knownAnswer());
  const sw = byLabel(board, label());
  const got = [];
  for (const toB of [true, false, true, false]) {
    board.setControls(sw, { toB });
    const r = board.solve();
    got.push([r.parts[label()].m.side, r.parts.LED1.m.on, r.parts.LED2.m.on]);
  }
  assert.deepStrictEqual(got, [['b', false, true], ['a', true, false], ['b', false, true], ['a', true, false]]);
});

// ── set_control through chat.js (the AI's way of flipping it) ─────────────

test('set_control { part: SS1, toB: true } flips it; toB: "yes" and closed: true are refused with a note, changing nothing', () => {
  const { board } = solveBuild(knownAnswer());
  const sw = byLabel(board, label());
  const bad1 = Chat.applyActions([{ tool: 'set_control', part: label(), toB: 'yes' }], board);
  assert.equal(bad1.failed, 1, JSON.stringify(bad1));
  const bad2 = Chat.applyActions([{ tool: 'set_control', part: label(), closed: true }], board);
  assert.equal(bad2.failed, 1, 'the slide switch has no "closed" control (that is the toggle switch)');
  assert.ok(board.notes.some(n => n.includes('closed')), JSON.stringify(board.notes));
  assert.strictEqual(sw.controls.toB, false, 'the refusals changed nothing');
  assert.deepStrictEqual(Chat.applyActions([flip(label())], board), { applied: 1, failed: 0 });
  assert.strictEqual(sw.controls.toB, true);
  const r = board.solve();
  near(r.parts.LED2.m.current, GREEN_MA, 0.01, 'green after set_control');
  dark(r.parts.LED1.m, 'red after set_control');
});

// ── Complex circuits ──────────────────────────────────────────────────────

// Two slide switches as a 2-way (staircase) pair: + into SS1's common; SS1's
// a and b run to SS2's a and b (two travellers); SS2's common feeds 470 Ω and
// a red LED. The LED lights when both throws match, and either switch flips
// it. Layout: SS1 c8 right (a c8, common c9, b c10), tp_9 → a9; SS2 c20
// right (a c20, common c21, b c22); travellers b8 → b20 and d10 → d22;
// 470 Ω e21–e25; red LED anode d25, cathode d27; a27 → tn_27.
function staircase() {
  return battery().concat([
    { tool: 'place_slide_switch', hole: 'c8', direction: 'right' },
    { tool: 'place_slide_switch', hole: 'c20', direction: 'right' },
    wire('tp_9', 'a9', 'red'),
    wire('b8', 'b20', 'yellow'),
    wire('d10', 'd22', 'blue'),
    { tool: 'place_resistor', holeA: 'e21', holeB: 'e25', resistance: 470 },
    { tool: 'place_led', holeA: 'd27', holeB: 'd25', color: 'red' },   // cathode d27, anode d25
    wire('a27', 'tn_27', 'black'),
  ]);
}

for (const [one, two] of [[false, false], [true, false], [false, true], [true, true]]) {
  const lit = one === two;
  test(`2-way pair (staircase), SS1 on ${one ? 'b' : 'a'} + SS2 on ${two ? 'b' : 'a'}:the LED is ${lit ? 'on at 14.89 mA (hand: 7 / 470.102)' : 'off, 0 mA'}`, () => {
    const { r } = solveBuild(staircase().concat([flip(label(1), one), flip(label(2), two)]));
    assert.deepStrictEqual([part(r, label(1)).m.side, part(r, label(2)).m.side], [one ? 'b' : 'a', two ? 'b' : 'a']);
    const led = r.parts.LED1.m;
    if (lit) {
      assert.equal(led.on, true, JSON.stringify(led));
      near(led.current, PAIR_MA, 0.01, 'LED mA');
    } else {
      dark(led, 'the LED');
      assert.ok(Math.abs(r.parts.BAT1.m.current) < 1e-6, `battery current ${r.parts.BAT1.m.current}`);
    }
  });
}

test('2-way pair: from either end, one flip always toggles the LED (a, a → b, a → b, b → a, b)', () => {
  const { board } = solveBuild(staircase());
  const on = () => board.solve().parts.LED1.m.on;
  const seq = [on()];
  for (const [n, toB] of [[1, true], [2, true], [1, false]]) {
    board.setControls(byLabel(board, label(n)), { toB });
    seq.push(on());
  }
  assert.deepStrictEqual(seq, [true, false, true, false]);
});

// Break before make: a to +, b to ground, common through 470 Ω to a red LED.
// If both throws were ever closed together this would short the battery. On
// a the LED lights at 14.89 mA; on b common sits at ground: no short, the
// LED is dark and the battery carries nothing. Layout: SS1 c8 right; tp_8 →
// a8 (a to +); a10 → tn_10 (b to ground); 470 Ω d9–d13; red LED anode e13,
// cathode e15; a15 → tn_15.
function selectorToRails() {
  return battery().concat([
    { tool: 'place_slide_switch', hole: 'c8', direction: 'right' },
    wire('tp_8', 'a8', 'red'),
    wire('a10', 'tn_10', 'black'),
    { tool: 'place_resistor', holeA: 'd9', holeB: 'd13', resistance: 470 },
    { tool: 'place_led', holeA: 'e15', holeB: 'e13', color: 'red' },
    wire('a15', 'tn_15', 'black'),
  ]);
}

test('break before make: a to +, b to ground; on a the LED lights at 14.89 mA, on b nothing shorts and nothing flows', () => {
  const onA = solveBuild(selectorToRails()).r;
  near(onA.parts.LED1.m.current, RED_MA, 0.01, 'on a');
  const onB = solveBuild(selectorToRails().concat([flip(label())])).r;   // solveBuild checks shorted === false
  assert.strictEqual(part(onB).m.side, 'b');
  dark(onB.parts.LED1.m, 'the LED on b');
  assert.ok(Math.abs(onB.parts.BAT1.m.current) < 1e-6, `battery current on b: ${onB.parts.BAT1.m.current}`);
});

test('turned around (direction left from c10: a c10, common c9, b c8) it is the same switch: + on common, a still picks its own side', () => {
  // + into c9 (common); a (c10) → 470 Ω b10–b14 → red LED d14/d16; b (c8) → 470 Ω b4–b8 → green LED d4/d2.
  const build = battery().concat([
    { tool: 'place_slide_switch', hole: 'c10', direction: 'left' },
    wire('tp_9', 'a9', 'red'),
    { tool: 'place_resistor', holeA: 'b10', holeB: 'b14', resistance: 470 },
    { tool: 'place_led', holeA: 'd16', holeB: 'd14', color: 'red' },     // LED1 on side a
    wire('a16', 'tn_16', 'black'),
    { tool: 'place_resistor', holeA: 'b4', holeB: 'b8', resistance: 470 },
    { tool: 'place_led', holeA: 'd2', holeB: 'd4', color: 'green' },     // LED2 on side b
    wire('a2', 'tn_2', 'black'),
  ]);
  const { board, r } = solveBuild(build);
  assert.deepStrictEqual(Parts.legsOf(byLabel(board, label())).map(l => [l.pin, l.hole]), [['a', 'c10'], ['common', 'c9'], ['b', 'c8']]);
  near(r.parts.LED1.m.current, RED_MA, 0.01, 'a: red');
  dark(r.parts.LED2.m, 'green while on a');
  board.setControls(byLabel(board, label()), { toB: true });
  const f = board.solve();
  near(f.parts.LED2.m.current, GREEN_MA, 0.01, 'b: green');
  dark(f.parts.LED1.m, 'red while on b');
});

// ── examples ──────────────────────────────────────────────────────────────

const swExamples = () => (slide().examples || []).map(ex => ({ ex, sw: ex.parts.find(p => p.type === 'slide_switch') }))
  .filter(({ ex, sw }) => sw && ex.expect && ex.expect[sw.label]);
const ledsIn = ex => ex.parts.filter(p => p.type === 'led');
const colourOf = p => (p.values && p.values.color) || 'red';

function checkKnownAnswerExample(toB) {
  const found = swExamples().find(({ sw }) => !!(sw.controls && sw.controls.toB) === toB);
  assert.ok(found, `an example with toB ${toB} that checks the switch; got ${JSON.stringify((slide().examples || []).map(e => [e.name, e.parts, e.expect]))}`);
  const { ex, sw } = found;
  assert.strictEqual(ex.expect[sw.label].side, toB ? 'b' : 'a', JSON.stringify(ex.expect));
  const leds = ledsIn(ex);
  const red = leds.find(p => colourOf(p) === 'red'), green = leds.find(p => colourOf(p) === 'green');
  assert.ok(red && green, `a red LED and a green LED: ${JSON.stringify(leds)}`);
  assert.deepStrictEqual([ex.expect[red.label] && ex.expect[red.label].on, ex.expect[green.label] && ex.expect[green.label].on],
    [!toB, toB], `toB ${toB}: red ${!toB ? 'on' : 'off'}, green ${toB ? 'on' : 'off'}: ${JSON.stringify(ex.expect)}`);
  const rs = ex.parts.filter(p => p.type === 'resistor');
  assert.ok(rs.length === 2 && rs.every(p => p.values && p.values.resistance === 470), `two 470 Ω resistors: ${JSON.stringify(rs)}`);
  // test/parts-examples.test.js solves every example against its expect.
}

test('examples: the known answer as placed (toB false) expects side a, the red LED on and the green LED off', () => {
  checkKnownAnswerExample(false);
});

test('examples: the known answer flipped (controls: { toB: true }) expects side b, the green LED on and the red LED off', () => {
  checkKnownAnswerExample(true);
});

// ── Placement ─────────────────────────────────────────────────────────────

const place = (anchor, rotation, map) => {
  const legs = Parts.footprintLegs('slide_switch', anchor, rotation);
  assert.ok(legs, `footprintLegs('slide_switch', ${anchor}, ${rotation}) is null`);
  return { legs: legs.map(l => [l.pin, l.hole]), check: Parts.checkPlacement('slide_switch', legs, map || new Map(), BOARD) };
};

test('footprintLegs: facing right (0) or left (180) puts a, common, b along one row, common in the middle, and each fits', () => {
  slide();
  const cases = [
    ['c8', 0,    [['a', 'c8'], ['common', 'c9'], ['b', 'c10']]],
    ['h40', 0,   [['a', 'h40'], ['common', 'h41'], ['b', 'h42']]],   // the bottom half too
    ['c10', 180, [['a', 'c10'], ['common', 'c9'], ['b', 'c8']]],
    ['j3', 180,  [['a', 'j3'], ['common', 'j2'], ['b', 'j1']]],
  ];
  for (const [anchor, rot, want] of cases) {
    const { legs, check } = place(anchor, rot);
    assert.deepStrictEqual(legs, want, `${anchor} at ${rot}°`);
    assert.deepStrictEqual(check, { ok: true }, `${anchor} at ${rot}°: ${JSON.stringify(check)}`);
  }
});

test('footprintLegs: facing down (90) or up (270) is not a slide-switch rotation, so there are no legs (null)', () => {
  slide();
  for (const [anchor, rot] of [['a2', 90], ['e30', 90], ['e2', 270], ['j40', 270]]) {
    assert.strictEqual(Parts.footprintLegs('slide_switch', anchor, rot), null, `${anchor} at ${rot}°`);
  }
});

test('placement limits: past column 63 or column 1 are refused with the reason', () => {
  slide();
  const cases = [
    ['c62', 0,   /would run past column 63/],
    ['c2', 180,  /would run past column 1/],
  ];
  for (const [anchor, rot, why] of cases) {
    const { check } = place(anchor, rot);
    assert.equal(check.ok, false, `${anchor} at ${rot}° should be refused`);
    assert.match(check.reason, why, check.reason);
    assert.match(check.reason, /slide switch/i, `the reason names the part: ${check.reason}`);
  }
  assert.deepStrictEqual(place('c61', 0).check, { ok: true }, 'c61 c62 c63 is the last fit');
});

test("placement: a leg on a hole that holds R1's lead is refused, naming it", () => {
  slide();
  const { check } = place('c8', 0, new Map([['c9', { label: 'R1', pin: 'lead1' }]]));
  assert.equal(check.ok, false);
  assert.ok(check.reason.includes("c9 already holds R1's pin lead1"), check.reason);
});

test('the AI places it through chat.js: place_slide_switch off the board is refused with a note; direction "right" at c8 lands on c8 c9 c10', () => {
  slide();
  const board = simBoard();
  const out = Chat.applyActions([{ tool: 'place_slide_switch', hole: 'c62', direction: 'right' }], board);
  assert.equal(board.components().length, 0, 'nothing placed');
  assert.ok(out.failed >= 1, JSON.stringify(out));
  assert.ok(board.notes.some(n => /column 63/.test(n)), `a note with the edge: ${JSON.stringify(board.notes)}`);
  Chat.applyActions([{ tool: 'place_slide_switch', hole: 'c8', direction: 'right' }], board);
  const sw = board.components()[0];
  assert.ok(sw, `placed: ${JSON.stringify(board.notes)}`);
  assert.deepStrictEqual(Parts.legsOf(sw).map(l => [l.pin, l.hole]), [['a', 'c8'], ['common', 'c9'], ['b', 'c10']]);
  assert.deepStrictEqual(sw.controls, { toB: false });
});

test("the AI can't place it facing down or up: chat.js refuses with \"SS1 not placed: the slide switch can't face <dir>; use right or left.\" and places nothing", () => {
  slide();
  for (const direction of ['down', 'up']) {
    const board = simBoard();
    const out = Chat.applyActions([{ tool: 'place_slide_switch', hole: 'c8', direction }], board);
    assert.equal(board.components().length, 0, `${direction}: nothing placed`);
    assert.ok(out.failed >= 1, JSON.stringify(out));
    const want = new RegExp(`^${label()} not placed: the slide switch.* can't face ${direction}; use right or left\\.$`);
    assert.ok(board.notes.some(n => want.test(n)), `${direction}: ${JSON.stringify(board.notes)}`);
  }
});

// ── Hole map and round trip ───────────────────────────────────────────────

test("hole map: a switch on c8 / c9 / c10 holds each hole by label and pin name ('a', 'common', 'b')", () => {
  const def = slide();
  const comp = { type: 'slide_switch', label: label(), values: valuesFor(def), controls: { toB: false },
                 holeRefs: ['c8', 'c9', 'c10'].map(holeRef), pins: pinsOf(3) };
  const map = BoardIO.buildHoleMap([comp], []);
  assert.deepStrictEqual(map.get('c8'), { label: comp.label, pin: 'a' });
  assert.deepStrictEqual(map.get('c9'), { label: comp.label, pin: 'common' });
  assert.deepStrictEqual(map.get('c10'), { label: comp.label, pin: 'b' });
  assert.equal(map.size, 3);
});

// The page's save writes a part's `controls` with only the saved ones, and
// loading reads only those back (app.js; checked in the browser for the
// toggle switch by e2e/toggle-switch.spec.js). Here: the record that save
// writes, with the switch on b, loads back onto the same holes and still
// lights the green LED.
test('round trip: a switch flipped to b saves one named holeRef per pin and controls { toB: true }; loaded back it sits on c8 / c9 / c10 and still lights green, not red', () => {
  const def = slide();
  const { board } = solveBuild(knownAnswer({ toB: true }));
  const sw = byLabel(board, label());
  const saved = BoardIO.saveHoleRefs(sw);
  assert.deepStrictEqual(saved, [{ pin: 'a', col: 7, row: 'c' }, { pin: 'common', col: 8, row: 'c' }, { pin: 'b', col: 9, row: 'c' }]);
  const kept = Object.fromEntries(Object.entries(def.controls).filter(([, s]) => s.saved).map(([k]) => [k, sw.controls[k]]));
  assert.deepStrictEqual(kept, { toB: true }, 'toB is a saved control, so the file keeps it');
  const record = JSON.parse(JSON.stringify({ type: 'slide_switch', label: sw.label, values: sw.values, controls: kept, holeRefs: saved }));

  const loaded = { type: 'slide_switch', label: record.label, values: record.values, controls: record.controls,
                   pins: pinsOf(3), holeRefs: BoardIO.loadHoleRefs(record) };
  assert.deepStrictEqual(Parts.legsOf(loaded).map(l => [l.pin, l.hole]), [['a', 'c8'], ['common', 'c9'], ['b', 'c10']]);
  const i = board.components().indexOf(sw);
  board.components()[i] = loaded;
  const r = board.solve();
  near(r.parts.LED2.m.current, GREEN_MA, 0.01, 'the reloaded switch is still on b: green');
  dark(r.parts.LED1.m, 'red after reload');
});

// ── The AI side ───────────────────────────────────────────────────────────

const decl = name => Server.CIRCUIT_TOOLS[0].function_declarations.find(d => d.name === name);
const toolNames = message => Server.selectTools(message, []).map(d => d.name);

test('the generated place_slide_switch tool takes hole and direction, both required', () => {
  const def = slide();
  assert.equal(def.ai.tool || 'place_' + def.type, 'place_slide_switch');
  const t = decl('place_slide_switch');
  assert.ok(t, `no place_slide_switch tool; tools: ${Server.CIRCUIT_TOOLS[0].function_declarations.map(d => d.name).join(', ')}`);
  const props = t.parameters && t.parameters.properties;
  assert.ok(props && props.hole && props.direction, JSON.stringify(t.parameters));
  assert.deepStrictEqual([...t.parameters.required].sort(), ['direction', 'hole']);
});

test('set_control offers toB as a BOOLEAN, so the AI can flip the switch', () => {
  slide();
  const t = decl('set_control');
  assert.ok(t && t.parameters.properties.toB, `set_control has no "toB" param: ${JSON.stringify(t && t.parameters.properties)}`);
  assert.equal(t.parameters.properties.toB.type, 'BOOLEAN');
});

test('ai: keywords include slide switch, spdt, selector, two-way switch (at most 8, lower case); about ≤ 200 chars; not everyday', () => {
  const { ai } = slide();
  for (const k of ['slide switch', 'spdt', 'selector', 'two-way switch']) {
    assert.ok(ai.keywords.includes(k), `keyword "${k}" in ${JSON.stringify(ai.keywords)}`);
  }
  assert.ok(ai.keywords.length <= 8, `${ai.keywords.length} keywords`);
  assert.ok(ai.keywords.every(k => k === k.toLowerCase()), JSON.stringify(ai.keywords));
  assert.ok(typeof ai.about === 'string' && ai.about.length > 0 && ai.about.length <= 200, ai.about);
  assert.ok(!ai.everyday, 'not in the everyday set, so the demo prompt stays as it is');
});

for (const message of [
  QA_PROMPT,
  'Add an SPDT switch that picks between the buzzer and the LED',
  'use a selector to choose which LED lights',
  'wire a two-way switch to two LEDs',
]) {
  test(`selectTools("${message}") sends place_slide_switch (at most 12 part tools)`, () => {
    slide();
    const got = toolNames(message);
    assert.ok(got.includes('place_slide_switch'), `place_slide_switch missing from ${JSON.stringify(got)}`);
    // #76: the 7 always-sent tools don't count toward the 12.
    const ALWAYS_SENT = ['delete_all', 'add_wire', 'place_battery', 'use_parts', 'set_value', 'set_control', 'delete_part'];
    const parts = got.filter(n => !ALWAYS_SENT.includes(n));
    assert.ok(parts.length <= 12, `${parts.length} part tools: ${JSON.stringify(got)}`);
  });
}

test('selectTools for the QA prompt also sends place_led, place_resistor and set_control', () => {
  slide();
  const got = toolNames(QA_PROMPT);
  for (const n of ['place_slide_switch', 'place_led', 'place_resistor', 'set_control']) {
    assert.ok(got.includes(n), `${n} missing from ${JSON.stringify(got)}`);
  }
});

test('pin: the demo prompt does not send place_slide_switch', () => {
  slide();
  assert.ok(!toolNames(DEMO_PROMPT).includes('place_slide_switch'), JSON.stringify(toolNames(DEMO_PROMPT)));
});

test('the known answer, and the known answer flipped with set_control, have no circuit problems and pass finishAIReply untouched', () => {
  slide();
  for (const build of [knownAnswer(), knownAnswer({ toB: true })]) {
    assert.deepStrictEqual(Server.findCircuitProblems(build.map(a => ({ ...a }))), []);
    const out = Server.finishAIReply({ reply: 'Built it.', actions: build.map(a => ({ ...a })) });
    assert.deepStrictEqual(out.actions, build);
    assert.equal(out.reply, 'Built it.');
  }
});

// ── The browser half ──────────────────────────────────────────────────────

test('in a browser-like page with no THREE or document, slide_switch.js defines itself on window.Parts', () => {
  const file = path.join(PARTS_DIR, 'slide_switch.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/slide_switch.js must exist');
  const win = vm.createContext({ TextEncoder });
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(PARTS_DIR, 'registry.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(file, 'utf8'), win);
  const def = win.Parts.get('slide_switch');
  assert.ok(def, 'window.Parts.get("slide_switch") after loading slide_switch.js');
  assert.equal(def.elements({}, { toB: true }).filter(e => e.closed).length, 1, 'one throw closed');
});

test('parts/slide_switch.js draws only through ctx: a view.build and a view.update, no App, no document', () => {
  const file = path.join(PARTS_DIR, 'slide_switch.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/slide_switch.js must exist');
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /\bview\s*:/, 'a view: { build, update } section');
  assert.doesNotMatch(src, /\bApp\b/, 'the part file must not reach into App; use ctx');
  assert.doesNotMatch(src, /\bdocument\b/, 'the part file must not touch document');
  assert.equal(typeof slide().view.build, 'function');
  assert.equal(typeof slide().view.update, 'function', 'view.update moves the slider to a or b');
});

// ── docs ──────────────────────────────────────────────────────────────────

test(`docs/QA.md has one AI case for "${QA_PROMPT}"`, () => {
  const qa = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'QA.md'), 'utf8');
  const rows = qa.split('\n').filter(l => l.startsWith('|') && l.includes(QA_PROMPT));
  assert.equal(rows.length, 1, 'one QA row sends the slide-switch prompt');
  assert.match(rows[0], /^\| AI-\d+ \|/, 'it is an AI prompt check (AI-NN)');
});
