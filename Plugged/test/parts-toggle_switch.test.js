// The toggle switch (SPST), parts/toggle_switch.js (issue #32): an on/off
// switch you click to flip. It stays where you leave it, and its state is
// saved with the circuit. It is the push button (#26) with a `toggle`
// control that is saved, instead of a `momentary` one. Its definition half
// loads in Node through require('circuit3d/js/parts'); its model, the click
// that flips it, and save → reopen in the page are checked in the browser by
// e2e/toggle-switch.spec.js and e2e/parts.spec.js. Its worked build for the
// AI (ai.recipe, ai.guide) is test/toggle-switch-recipe.test.js.
//
// Shapes these tests assume (the issue, plus choices stated here so the
// builder matches them):
// - Identity: type 'toggle_switch', category 'I/O'. name / sub / prefix /
//   icon are the builder's pick: the name says switch or toggle, the icon is
//   an <svg>, and the prefix is unique. The button already has 'SW', so the
//   switch gets another (e.g. 'S'); labels are prefix + 1, prefix + 2, and a
//   button's SW1 never counts toward them (nor the other way round).
// - pins ['1', '2']; place { kind: 'span', span { 2, 2, 2 }, rotations ['h', 'v'] }.
// - controls { closed: { type: 'toggle', default: false, saved: true } };
//   gestures { click: 'closed' }.
// - elements(v, c): one SW, pins ['1', '2'], closed = !!c.closed.
// - measure(r) → { closed, current }: closed from r.controls, current the
//   mA through the SW as a positive magnitude.
// - report(r, m): "ON · 14.9 mA" closed, "OFF" open.
// - ai: tool place_toggle_switch (the default); keywords include switch,
//   toggle, on/off, spst. Not `everyday`, so the demo prompt doesn't send it.
// - examples: the known answer both ways, closed (controls: { closed: true })
//   and open, each expecting the switch's current and the LED.
//
// Hand-computed (ideal 9 V battery; a closed SW is 1 mΩ; a red LED is 2.0 V
// in series with 0.1 Ω when on):
//   one switch closed, 470 Ω, red LED:   (9 − 2.0) / (470 + 0.1 + 0.001) = 14.8904 mA
//   two switches in series, both closed: (9 − 2.0) / (470 + 0.1 + 0.002) = 14.8904 mA
//   two switches in parallel, both closed: 14.8904 mA shared, 7.4452 mA each
//   anything open in the path:           0 mA, LED off
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

const QA_PROMPT   = 'Add an on/off switch to an LED circuit';
const DEMO_PROMPT = 'Build a single LED circuit with a current-limiting resistor.';

const LED_MA  = (9 - 2.0) / (470 + 0.1 + 0.001) * 1000;   // 14.8904 mA
const HALF_MA = LED_MA / 2;                                // 7.4452 mA

function toggle() {
  const def = Parts.get('toggle_switch');
  assert.ok(def, "Parts.get('toggle_switch') is null: parts/toggle_switch.js must exist and be listed in parts/index.js");
  return def;
}
const label = (n = 1) => toggle().prefix + n;

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

// The one SW element and its key in PartResult (id, or index).
function swOf(controls) {
  const els = toggle().elements(valuesFor(toggle()), controls);
  assert.ok(Array.isArray(els), `elements() returns a list; got ${JSON.stringify(els)}`);
  const k = els.findIndex(e => e.kind === 'SW');
  assert.ok(k >= 0, `elements() should hold one SW; got ${JSON.stringify(els)}`);
  return { el: els[k], id: els[k].id !== undefined ? els[k].id : k, els };
}

// A PartResult for the switch, as the core hands it over.
function result({ closed, current = 0, p1 = 9, p2 = 9 }) {
  const controls = { closed };
  const { id } = swOf(controls);
  return { label: label(), values: valuesFor(toggle()), controls, pins: { 1: p1, 2: p2 },
           current: { [id]: current }, modes: {}, open: {} };
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
const closeIt = (part, closed = true) => ({ tool: 'set_control', part, closed });

const battery = () => [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  wire('BAT1.0', `tp_${N}`, 'red'),
  wire('BAT1.1', `tn_${N}`, 'black'),
];

// The known answer: tp_2 → a2; switch b2–b4; 470 Ω c4–c8; red LED anode d8,
// cathode d10; a10 → tn_10. `closed` adds the set_control that closes it.
// `reversed` places the switch with its pins swapped (b4, b2).
function knownAnswer({ closed = false, reversed = false } = {}) {
  const build = battery().concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_toggle_switch', holeA: reversed ? 'b4' : 'b2', holeB: reversed ? 'b2' : 'b4' },
    { tool: 'place_resistor', holeA: 'c4', holeB: 'c8', resistance: 470 },
    { tool: 'place_led', holeA: 'd10', holeB: 'd8', color: 'red' },
    wire('a10', 'tn_10', 'black'),
  ]);
  return closed ? build.concat([closeIt(label())]) : build;
}

// A board that keeps real records the way App leaves them (as in
// test/parts-diode.test.js), so Sim.analyze can solve it. setControls works
// as App.setControls does.
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
  toggle();
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

// ── The file and its identity ─────────────────────────────────────────────

test('parts/index.js lists toggle_switch.js, and the file exists', () => {
  const src = fs.readFileSync(path.join(PARTS_DIR, 'index.js'), 'utf8');
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, 'parts/index.js must keep its FILES list');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  assert.ok(files.includes('toggle_switch.js'), `FILES should include 'toggle_switch.js'; got ${JSON.stringify(files)}`);
  assert.ok(fs.existsSync(path.join(PARTS_DIR, 'toggle_switch.js')), 'circuit3d/js/parts/toggle_switch.js must exist');
});

test('both 3D pages load js/parts/toggle_switch.js, after registry.js and before components.js', () => {
  for (const page of ['circuit3d/index.html', 'circuit3d/viewer.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    const at = order.indexOf('js/parts/toggle_switch.js');
    assert.ok(at >= 0, `${page} loads js/parts/toggle_switch.js: ${order.join(', ')}`);
    assert.ok(at > order.indexOf('js/parts/registry.js'), `${page}: toggle_switch.js comes after registry.js`);
    const comps = order.indexOf('js/components.js');
    if (comps >= 0) assert.ok(at < comps, `${page}: toggle_switch.js comes before components.js`);
  }
});

test("identity: type 'toggle_switch', an I/O part named as a switch, an <svg> icon, a prefix no other part uses (not the button's SW)", () => {
  const def = toggle();
  assert.equal(def.type, 'toggle_switch');
  assert.equal(def.category, 'I/O');
  assert.match(def.name, /switch|toggle/i, `name: ${def.name}`);
  assert.ok(def.name.length <= 24, def.name);
  assert.ok(typeof def.sub === 'string' && def.sub.length > 0 && def.sub.length <= 32, def.sub);
  assert.match(def.icon, /^<svg/);
  assert.equal(def.ref, undefined, 'a switch is not a source');
  assert.match(def.prefix, /^[A-Z]{1,3}$/);
  assert.notEqual(def.prefix, 'SW', "SW is the push button's prefix");
  const others = Parts.all().filter(d => d.type !== 'toggle_switch').map(d => d.prefix);
  assert.ok(!others.includes(def.prefix), `prefix ${def.prefix} is already used: ${JSON.stringify(others)}`);
});

test("labels: the switch is prefix + 1, prefix + 2; a button's SW1 / SW2 never count toward them, nor the switch's toward the button's", () => {
  const p = toggle().prefix;
  assert.equal(Ids.nextLabel([], 'toggle_switch'), p + '1');
  assert.equal(Ids.nextLabel([{ type: 'toggle_switch', label: p + '1' }], 'toggle_switch'), p + '2');
  const board = [{ type: 'button', label: 'SW1' }, { type: 'button', label: 'SW2' }];
  assert.equal(Ids.nextLabel(board, 'toggle_switch'), p + '1', 'buttons on the board do not bump the switch number');
  board.push({ type: 'toggle_switch', label: p + '1' }, { type: 'toggle_switch', label: p + '2' }, { type: 'toggle_switch', label: p + '3' });
  assert.equal(Ids.nextLabel(board, 'button'), 'SW3', 'switches on the board do not bump the button number');
  assert.equal(Ids.nextLabel(board, 'toggle_switch'), p + '4');
  assert.equal(Ids.findByLabel(board, p + '1').type, 'toggle_switch');
  assert.equal(Ids.findByLabel(board, 'SW1').type, 'button');
  assert.deepStrictEqual(Ids.parsePinRef(p + '1.2'), { label: p + '1', pin: 2 });
});

test("pins ['1', '2']; a span part, exactly 2 columns (min = max = default = 2), rotations h and v", () => {
  const def = toggle();
  assert.deepStrictEqual([...def.pins], ['1', '2']);
  assert.deepStrictEqual(plain(def.place), { kind: 'span', span: { min: 2, max: 2, default: 2 }, rotations: ['h', 'v'] });
});

// ── Controls and gestures: a saved toggle, not the button's momentary ─────

test('controls.closed is a toggle (default false, saved: true), and a click flips it', () => {
  const def = toggle();
  assert.deepStrictEqual(plain(def.controls), { closed: { type: 'toggle', default: false, saved: true } });
  assert.deepStrictEqual(plain(def.gestures), { click: 'closed' });
});

// Pin (passes today): the button stays momentary and unsaved.
test('pin: the button keeps controls.pressed momentary, default false, NOT saved', () => {
  assert.deepStrictEqual(plain(Parts.get('button').controls), { pressed: { type: 'momentary', default: false, saved: false } });
});

// ── elements(): one SW ────────────────────────────────────────────────────

test("elements(): one SW between pins '1' and '2', closed exactly while controls.closed", () => {
  for (const closed of [false, true]) {
    const { el, els } = swOf({ closed });
    assert.equal(els.length, 1, `one element; got ${JSON.stringify(els)}`);
    assert.deepStrictEqual([...el.pins].sort(), ['1', '2']);
    assert.strictEqual(el.closed, closed, `closed ${closed}: SW closed ${el.closed}`);
  }
});

test('changing controls.closed changes the elements (nothing is cached between calls)', () => {
  assert.strictEqual(swOf({ closed: true }).el.closed, true);
  assert.strictEqual(swOf({ closed: false }).el.closed, false);
  assert.strictEqual(swOf({ closed: true }).el.closed, true);
});

// ── measure() and report() ────────────────────────────────────────────────

test('measure(): { closed, current } — closed from the control, current a positive magnitude in mA', () => {
  const def = toggle();
  assert.equal(typeof def.measure, 'function', 'the switch defines measure()');
  for (const I of [14.8904, -14.8904]) {
    const m = def.measure(result({ closed: true, current: I }));
    assert.strictEqual(m.closed, true, JSON.stringify(m));
    near(m.current, 14.8904, 0.0001, `${I} mA measures 14.8904`);
  }
  const off = def.measure(result({ closed: false, current: 0, p2: 0 }));
  assert.strictEqual(off.closed, false, JSON.stringify(off));
  assert.strictEqual(off.current, 0);
  assert.deepStrictEqual(plain(off), off, 'flat and JSON-safe');
});

test('report(): "ON · 14.9 mA" closed, "OFF" open', () => {
  const def = toggle();
  const on = result({ closed: true, current: 14.8904 });
  assert.equal(def.report(on, def.measure(on)), 'ON · 14.9 mA');
  const off = result({ closed: false, current: 0, p2: 0 });
  assert.equal(def.report(off, def.measure(off)), 'OFF');
});

// ── Known answer through the simulator ────────────────────────────────────

test('known answer: 9 V → switch closed → 470 Ω → red LED → ground lights the LED at 14.89 mA (hand: 7 / 470.101), switch reads ON, no warnings', () => {
  const { r } = solveBuild(knownAnswer({ closed: true }));
  const sw = part(r);
  assert.strictEqual(sw.m.closed, true, JSON.stringify(sw.m));
  near(sw.m.current, LED_MA, 0.01, 'switch mA');
  assert.equal(toggle().report(sw.r, sw.m), 'ON · 14.9 mA');
  assert.equal(r.parts.LED1.m.on, true, JSON.stringify(r.parts.LED1.m));
  near(r.parts.LED1.m.current, LED_MA, 0.01, 'LED mA');
  near(r.parts.BAT1.m.current, LED_MA, 0.01, 'battery mA');
  assert.ok(r.lines.some(l => l.text === '  💡 LED ON  (14.9 mA)'), text(r));
  assert.deepStrictEqual([sw.warnings, r.parts.LED1.warnings], [[], []]);
});

test('known answer open (as placed, the default): the LED is off, current 0 everywhere, the switch reads OFF, the circuit is open', () => {
  const { board, r } = solveBuild(knownAnswer());
  assert.strictEqual(byLabel(board, label()).controls.closed, false, 'a placed switch starts open');
  const sw = part(r);
  assert.strictEqual(sw.m.closed, false, JSON.stringify(sw.m));
  assert.strictEqual(sw.m.current, 0);
  assert.equal(toggle().report(sw.r, sw.m), 'OFF');
  assert.equal(r.parts.LED1.m.on, false, JSON.stringify(r.parts.LED1.m));
  assert.ok(Math.abs(r.parts.LED1.m.current) < 1e-6, `LED current ${r.parts.LED1.m.current}`);
  assert.ok(Math.abs(r.parts.BAT1.m.current) < 1e-6, `battery current ${r.parts.BAT1.m.current}`);
  assert.match(text(r), /Circuit open/, text(r));
  assert.doesNotMatch(text(r), /LED ON/, text(r));
});

test('flipping the same record closed → open → closed re-simulates each time: 14.89, 0, 14.89 mA (what a click does)', () => {
  const { board } = solveBuild(knownAnswer());
  const sw = byLabel(board, label());
  const got = [];
  for (const closed of [true, false, true]) {
    board.setControls(sw, { closed });
    got.push(board.solve().parts.LED1.m.current);
  }
  near(got[0], LED_MA, 0.01, 'closed');
  assert.ok(Math.abs(got[1]) < 1e-6, `open: ${got[1]}`);
  near(got[2], LED_MA, 0.01, 'closed again');
});

test('the switch has no direction: placed with its pins swapped it behaves the same (14.89 mA closed, 0 open)', () => {
  near(part(solveBuild(knownAnswer({ closed: true, reversed: true })).r).m.current, LED_MA, 0.01, 'reversed, closed');
  assert.strictEqual(part(solveBuild(knownAnswer({ reversed: true })).r).m.current, 0, 'reversed, open');
});

// ── set_control through chat.js (the AI's way of flipping it) ─────────────

test('set_control { part: <label>, closed: true } closes the switch; closed: "yes" and pressed: true are refused with a note', () => {
  const { board } = solveBuild(knownAnswer());
  const sw = byLabel(board, label());
  const bad1 = Chat.applyActions([{ tool: 'set_control', part: label(), closed: 'yes' }], board);
  assert.equal(bad1.failed, 1, JSON.stringify(bad1));
  const bad2 = Chat.applyActions([{ tool: 'set_control', part: label(), pressed: true }], board);
  assert.equal(bad2.failed, 1, 'the switch has no "pressed" control');
  assert.ok(board.notes.some(n => n.includes('pressed')), JSON.stringify(board.notes));
  assert.strictEqual(sw.controls.closed, false, 'the refusals changed nothing');
  assert.deepStrictEqual(Chat.applyActions([closeIt(label())], board), { applied: 1, failed: 0 });
  assert.strictEqual(sw.controls.closed, true);
  near(board.solve().parts.LED1.m.current, LED_MA, 0.01, 'LED after set_control');
});

// ── Complex circuits ──────────────────────────────────────────────────────

// Two switches in series (AND): tp_2 → a2; S1 b2–b4; S2 c4–c6; 470 Ω d6–d10;
// red LED anode e10, cathode e12; a12 → tn_12.
function andGate() {
  return battery().concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_toggle_switch', holeA: 'b2', holeB: 'b4' },
    { tool: 'place_toggle_switch', holeA: 'c4', holeB: 'c6' },
    { tool: 'place_resistor', holeA: 'd6', holeB: 'd10', resistance: 470 },
    { tool: 'place_led', holeA: 'e12', holeB: 'e10', color: 'red' },
    wire('a12', 'tn_12', 'black'),
  ]);
}

// Two switches in parallel (OR): both across columns 2 and 4 (b2–b4, c2–c4);
// 470 Ω d4–d8; red LED anode e8, cathode e10; a10 → tn_10.
function orGate() {
  return battery().concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_toggle_switch', holeA: 'b2', holeB: 'b4' },
    { tool: 'place_toggle_switch', holeA: 'c2', holeB: 'c4' },
    { tool: 'place_resistor', holeA: 'd4', holeB: 'd8', resistance: 470 },
    { tool: 'place_led', holeA: 'e10', holeB: 'e8', color: 'red' },
    wire('a10', 'tn_10', 'black'),
  ]);
}

const COMBOS = [[false, false], [true, false], [false, true], [true, true]];

for (const [a, b] of COMBOS) {
  test(`two switches in series (AND), ${a ? 'closed' : 'open'} + ${b ? 'closed' : 'open'}: the LED is ${a && b ? 'on at 14.89 mA through both' : 'off, 0 mA'}`, () => {
    const { r } = solveBuild(andGate().concat([closeIt(label(1), a), closeIt(label(2), b)]));
    const led = r.parts.LED1.m;
    if (a && b) {
      assert.equal(led.on, true, JSON.stringify(led));
      near(led.current, LED_MA, 0.01, 'LED mA');
      near(part(r, label(1)).m.current, LED_MA, 0.01, `${label(1)} mA`);
      near(part(r, label(2)).m.current, LED_MA, 0.01, `${label(2)} mA`);
    } else {
      assert.equal(led.on, false, JSON.stringify(led));
      assert.ok(Math.abs(led.current) < 1e-6, `LED current ${led.current}`);
      for (const n of [1, 2]) {
        const mA = part(r, label(n)).m.current;
        assert.ok(Math.abs(mA) < 1e-6, `${label(n)} carries nothing: ${mA} mA`);
      }
    }
    assert.deepStrictEqual([part(r, label(1)).m.closed, part(r, label(2)).m.closed], [a, b]);
  });
}

for (const [a, b] of COMBOS) {
  test(`two switches in parallel (OR), ${a ? 'closed' : 'open'} + ${b ? 'closed' : 'open'}: the LED is ${a || b ? 'on at 14.89 mA' : 'off'}${a && b ? ', 7.45 mA through each switch' : ''}`, () => {
    const { r } = solveBuild(orGate().concat([closeIt(label(1), a), closeIt(label(2), b)]));
    const led = r.parts.LED1.m;
    if (!a && !b) {
      assert.equal(led.on, false, JSON.stringify(led));
      assert.ok(Math.abs(led.current) < 1e-6, `LED current ${led.current}`);
      return;
    }
    assert.equal(led.on, true, JSON.stringify(led));
    near(led.current, LED_MA, 0.01, 'LED mA');
    const s1 = part(r, label(1)).m.current, s2 = part(r, label(2)).m.current;
    if (a && b) {
      near(s1, HALF_MA, 0.01, `${label(1)} carries half`);
      near(s2, HALF_MA, 0.01, `${label(2)} carries half`);
    } else {
      near(a ? s1 : s2, LED_MA, 0.01, 'the closed switch carries it all');
      assert.strictEqual(a ? s2 : s1, 0, 'the open switch carries nothing');
    }
  });
}

test('a toggle switch in series with a push button: the LED lights only when the switch is closed AND SW1 is pressed; labels SW1 and the switch\'s never mix', () => {
  // tp_2 → a2; switch b2–b4; button SW1 c4–c7; 470 Ω d7–d11; red LED anode
  // e11, cathode e13; a13 → tn_13.
  const build = battery().concat([
    wire('tp_2', 'a2', 'red'),
    { tool: 'place_toggle_switch', holeA: 'b2', holeB: 'b4' },
    { tool: 'place_button', holeA: 'c4', holeB: 'c7' },
    { tool: 'place_resistor', holeA: 'd7', holeB: 'd11', resistance: 470 },
    { tool: 'place_led', holeA: 'e13', holeB: 'e11', color: 'red' },
    wire('a13', 'tn_13', 'black'),
  ]);
  const { board } = solveBuild(build);
  assert.deepStrictEqual(board.components().map(c => c.label), ['BAT1', label(), 'SW1', 'R1', 'LED1']);
  const lit = () => board.solve().parts.LED1.m;
  assert.equal(lit().on, false, 'both open');
  Chat.applyActions([{ tool: 'set_control', part: 'SW1', pressed: true }], board);
  assert.equal(lit().on, false, 'button pressed, switch open');
  assert.strictEqual(byLabel(board, label()).controls.closed, false, 'pressing SW1 did not touch the switch');
  Chat.applyActions([closeIt(label())], board);
  near(lit().current, 14.8904, 0.01, 'both closed');
  assert.strictEqual(byLabel(board, 'SW1').controls.pressed, true);
  Chat.applyActions([{ tool: 'set_control', part: 'SW1', pressed: false }], board);
  assert.equal(lit().on, false, 'button released, switch closed');
});

// ── examples ──────────────────────────────────────────────────────────────

const swExamples = () => (toggle().examples || []).map(ex => ({ ex, sw: ex.parts.find(p => p.type === 'toggle_switch') }))
  .filter(({ ex, sw }) => sw && ex.expect && ex.expect[sw.label]);
const ledIn = ex => ex.parts.find(p => p.type === 'led');

test('examples: the known answer closed (controls: { closed: true }) expects the LED on and ~14.9 mA through the switch', () => {
  const found = swExamples().find(({ sw }) => sw.controls && sw.controls.closed === true);
  assert.ok(found, `an example with the switch closed that checks it; got ${JSON.stringify((toggle().examples || []).map(e => [e.name, e.parts, e.expect]))}`);
  const { ex, sw } = found;
  const want = ex.expect[sw.label];
  assert.ok(Array.isArray(want.current) && want.current[0] <= LED_MA && want.current[1] >= LED_MA && want.current[0] >= 14.0 && want.current[1] <= 15.8,
    `${sw.label}.current is a range holding 14.89 mA: ${JSON.stringify(want)}`);
  const led = ledIn(ex);
  assert.ok(led && ex.expect[led.label] && ex.expect[led.label].on === true, `the LED is expected on: ${JSON.stringify(ex.expect)}`);
  const r = ex.parts.find(p => p.type === 'resistor');
  assert.equal(r && r.values && r.values.resistance, 470, 'the example uses 470 Ω');
  // test/parts-examples.test.js solves every example against its expect.
});

test('examples: the known answer open expects current 0 through the switch and the LED off', () => {
  const found = swExamples().find(({ sw }) => !(sw.controls && sw.controls.closed));
  assert.ok(found, `an example with the switch open that checks it; got ${JSON.stringify((toggle().examples || []).map(e => [e.name, e.expect]))}`);
  const { ex, sw } = found;
  assert.strictEqual(ex.expect[sw.label].current, 0, JSON.stringify(ex.expect));
  const led = ledIn(ex);
  assert.ok(led && ex.expect[led.label] && ex.expect[led.label].on === false, `the LED is expected off: ${JSON.stringify(ex.expect)}`);
});

// ── Placement ─────────────────────────────────────────────────────────────

const leg = (pin, s) => ({ pin, col: +s.slice(1) - 1, row: s[0] });
const placeSw = (a, b, map) => Parts.checkPlacement('toggle_switch', [leg('1', a), leg('2', b)], map || new Map(), BOARD);

test('checkPlacement: exactly 2 columns apart is ok, either way round; e10→f10 across the gap ok', () => {
  toggle();
  assert.deepStrictEqual(placeSw('b2', 'b4'), { ok: true });
  assert.deepStrictEqual(placeSw('b4', 'b2'), { ok: true });
  assert.deepStrictEqual(placeSw('e10', 'f10'), { ok: true });
});

test('checkPlacement: 1 or 3 columns apart is refused with "must be 2 columns apart"; vertical inside one half is refused', () => {
  toggle();
  for (const b of ['b3', 'b5']) {
    const out = placeSw('b2', b);
    assert.equal(out.ok, false, `b2 → ${b}`);
    assert.ok(out.reason.includes('must be 2 columns apart'), out.reason);
  }
  assert.equal(placeSw('a10', 'c10').ok, false, 'both legs in one column of one half are one node');
});

test("checkPlacement: a leg on a hole that holds R1's lead is refused, naming it", () => {
  toggle();
  const out = placeSw('b2', 'b4', new Map([['b4', { label: 'R1', pin: 'lead1' }]]));
  assert.equal(out.ok, false);
  assert.ok(out.reason.includes("b4 already holds R1's pin lead1"), out.reason);
});

test('the AI places it through chat.js: place_toggle_switch 3 columns apart is refused with a note saying 2 columns', () => {
  toggle();
  const board = simBoard();
  const out = Chat.applyActions([{ tool: 'place_toggle_switch', holeA: 'b2', holeB: 'b5' }], board);
  assert.equal(board.components().length, 0, 'nothing placed');
  assert.ok(out.failed >= 1, JSON.stringify(out));
  assert.ok(board.notes.some(n => n.includes('2 columns apart')), `a note with the span: ${JSON.stringify(board.notes)}`);
});

// ── Hole map and round trip ───────────────────────────────────────────────

test("hole map: a switch on b2 / b4 holds each hole by label and pin name ('1', '2'), and nothing between", () => {
  const def = toggle();
  const comp = { type: 'toggle_switch', label: label(), values: valuesFor(def), controls: { closed: false },
                 holeRefs: [holeRef('b2'), holeRef('b4')], pins: pinsOf(2) };
  const map = BoardIO.buildHoleMap([comp], []);
  assert.deepStrictEqual(map.get('b2'), { label: comp.label, pin: '1' });
  assert.deepStrictEqual(map.get('b4'), { label: comp.label, pin: '2' });
  assert.equal(map.size, 2);
});

// The page's save (App.saveCircuit / autosave / undo) writes a part's
// `controls` with only the saved ones, and loading reads only those back
// (app.js savedControls / rebuildBoard, checked in the browser by
// e2e/toggle-switch.spec.js). Here: the record that save writes, with the
// switch closed, loads back onto the same holes and simulates closed.
test('round trip: a closed switch saves one named holeRef per pin and controls { closed: true }; loaded back it sits on b2 / b4 and still lights the LED', () => {
  const def = toggle();
  const { board } = solveBuild(knownAnswer({ closed: true }));
  const sw = byLabel(board, label());
  const saved = BoardIO.saveHoleRefs(sw);
  assert.deepStrictEqual(saved, [{ pin: '1', col: 1, row: 'b' }, { pin: '2', col: 3, row: 'b' }]);
  const kept = Object.fromEntries(Object.entries(def.controls).filter(([, s]) => s.saved).map(([k]) => [k, sw.controls[k]]));
  assert.deepStrictEqual(kept, { closed: true }, 'closed is a saved control, so the file keeps it');
  const record = JSON.parse(JSON.stringify({ type: 'toggle_switch', label: sw.label, values: sw.values, controls: kept, holeRefs: saved }));

  const loaded = { type: 'toggle_switch', label: record.label, values: record.values, controls: record.controls,
                   pins: pinsOf(2), holeRefs: BoardIO.loadHoleRefs(record) };
  assert.deepStrictEqual(Parts.legsOf(loaded).map(l => [l.pin, l.hole]), [['1', 'b2'], ['2', 'b4']]);
  const i = board.components().indexOf(sw);
  board.components()[i] = loaded;
  near(board.solve().parts.LED1.m.current, LED_MA, 0.01, 'the reloaded switch is still closed');
});

test("round trip: the button's pressed is not a saved control, so a pressed button's record keeps no controls (it reopens released)", () => {
  const def = Parts.get('button');
  const kept = Object.entries(def.controls).filter(([, s]) => s.saved).map(([k]) => k);
  assert.deepStrictEqual(kept, [], 'the button has no saved control');
  const tog = Object.entries(toggle().controls).filter(([, s]) => s.saved).map(([k]) => k);
  assert.deepStrictEqual(tog, ['closed'], 'the switch has one saved control, closed');
});

// ── The AI side ───────────────────────────────────────────────────────────

const decl = name => Server.CIRCUIT_TOOLS[0].function_declarations.find(d => d.name === name);
const toolNames = message => Server.selectTools(message, []).map(d => d.name);

test('the generated place_toggle_switch tool takes holeA and holeB, both required', () => {
  const def = toggle();
  assert.equal(def.ai.tool || 'place_' + def.type, 'place_toggle_switch');
  const t = decl('place_toggle_switch');
  assert.ok(t, `no place_toggle_switch tool; tools: ${Server.CIRCUIT_TOOLS[0].function_declarations.map(d => d.name).join(', ')}`);
  const props = t.parameters && t.parameters.properties;
  assert.ok(props && props.holeA && props.holeB, JSON.stringify(t.parameters));
  assert.deepStrictEqual([...t.parameters.required].sort(), ['holeA', 'holeB']);
});

test('set_control offers closed as a BOOLEAN, so the AI can close the switch', () => {
  toggle();
  const t = decl('set_control');
  assert.ok(t && t.parameters.properties.closed, `set_control has no "closed" param: ${JSON.stringify(t && t.parameters.properties)}`);
  assert.equal(t.parameters.properties.closed.type, 'BOOLEAN');
});

test('ai: keywords include switch, toggle, on/off, spst (at most 8, lower case); about ≤ 200 chars; not everyday', () => {
  const { ai } = toggle();
  for (const k of ['switch', 'toggle', 'on/off', 'spst']) {
    assert.ok(ai.keywords.includes(k), `keyword "${k}" in ${JSON.stringify(ai.keywords)}`);
  }
  assert.ok(ai.keywords.length <= 8, `${ai.keywords.length} keywords`);
  assert.ok(ai.keywords.every(k => k === k.toLowerCase()), JSON.stringify(ai.keywords));
  assert.ok(typeof ai.about === 'string' && ai.about.length > 0 && ai.about.length <= 200, ai.about);
  assert.ok(!ai.everyday, 'not in the everyday set, so the demo prompt stays as it is');
});

for (const message of [
  QA_PROMPT,
  'Add a toggle switch between the battery and the resistor',
  'wire an SPST switch to the buzzer',
]) {
  test(`selectTools("${message}") sends place_toggle_switch`, () => {
    toggle();
    const got = toolNames(message);
    assert.ok(got.includes('place_toggle_switch'), `place_toggle_switch missing from ${JSON.stringify(got)}`);
    assert.ok(got.length <= 12, `${got.length} tools`);
  });
}

test('selectTools for the QA prompt also sends place_led, place_resistor and set_control', () => {
  toggle();
  const got = toolNames(QA_PROMPT);
  for (const n of ['place_toggle_switch', 'place_led', 'place_resistor', 'set_control']) {
    assert.ok(got.includes(n), `${n} missing from ${JSON.stringify(got)}`);
  }
});

test('pin: the demo prompt does not send place_toggle_switch', () => {
  toggle();
  assert.ok(!toolNames(DEMO_PROMPT).includes('place_toggle_switch'), JSON.stringify(toolNames(DEMO_PROMPT)));
});

test('the known answer, closed with set_control, has no circuit problems and passes finishAIReply untouched', () => {
  toggle();
  const build = knownAnswer({ closed: true });
  assert.deepStrictEqual(Server.findCircuitProblems(build.map(a => ({ ...a }))), []);
  const out = Server.finishAIReply({ reply: 'Built it.', actions: build.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, build);
  assert.equal(out.reply, 'Built it.');
});

// ── The browser half ──────────────────────────────────────────────────────

test('in a browser-like page with no THREE or document, toggle_switch.js defines itself on window.Parts', () => {
  const file = path.join(PARTS_DIR, 'toggle_switch.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/toggle_switch.js must exist');
  const win = vm.createContext({ TextEncoder });
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(PARTS_DIR, 'registry.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(file, 'utf8'), win);
  const def = win.Parts.get('toggle_switch');
  assert.ok(def, 'window.Parts.get("toggle_switch") after loading toggle_switch.js');
  assert.equal(def.elements({}, { closed: true })[0].closed, true);
});

test('parts/toggle_switch.js draws only through ctx: a view.build and a view.update, no App, no document', () => {
  const file = path.join(PARTS_DIR, 'toggle_switch.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/toggle_switch.js must exist');
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /\bview\s*:/, 'a view: { build, update } section');
  assert.doesNotMatch(src, /\bApp\b/, 'the part file must not reach into App; use ctx');
  assert.doesNotMatch(src, /\bdocument\b/, 'the part file must not touch document');
  assert.equal(typeof toggle().view.build, 'function');
  assert.equal(typeof toggle().view.update, 'function', 'view.update shows the lever on or off');
});

// ── docs ──────────────────────────────────────────────────────────────────

test(`docs/QA.md has one AI case for "${QA_PROMPT}"`, () => {
  const qa = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'QA.md'), 'utf8');
  const rows = qa.split('\n').filter(l => l.startsWith('|') && l.includes(QA_PROMPT));
  assert.equal(rows.length, 1, 'one QA row sends the toggle-switch prompt');
  assert.match(rows[0], /^\| AI-\d+ \|/, 'it is an AI prompt check (AI-NN)');
});
