// The potentiometer, parts/potentiometer.js (issue #31): the first real
// footprint part (3 legs) and the first slider control with a scroll gesture.
// Its definition half loads in Node through require('circuit3d/js/parts')
// and in a browser-like context with no THREE or document; its model is
// checked in the browser by e2e/potentiometer.spec.js and e2e/parts.spec.js.
//
// Shapes these tests assume (the issue and its decisions comment; stated so
// the builder matches them):
// - Identity: type 'potentiometer', name 'Potentiometer', sub '3 leads · knob',
//   category 'Passives', prefix 'RV' (labels RV1, RV2…).
// - pins ['1', 'wiper', '3']; place { kind: 'footprint',
//   legs [[0,0],[1,0],[2,0]], rotations [0, 90, 180, 270] }.
// - values.resistance { unit 'Ω', default 10000, min 100, max 1e6, series 'E12' }.
// - controls.position { type 'slider', default 50, min 0, max 100, step 1,
//   unit '%', saved: true }; gestures { scroll: 'position' }.
// - elements(values, controls): two R elements, p = position / 100,
//   R(1, wiper) = max(p·R, 1 Ω) and R(wiper, 3) = max((1 − p)·R, 1 Ω).
//   0 % puts the wiper at pin 1. Re-evaluated with the record's controls on
//   every simulation (never cached on the record).
// - measure(r) → { position, wiperVolts }: position from r.controls,
//   wiperVolts = r.pins.wiper (null when the wiper floats).
// - report(r, m) → "50 % · 5.0 kΩ | 5.0 kΩ": position, then R(1–wiper) |
//   R(wiper–3), one decimal in kΩ.
// - ai: tool place_potentiometer (the default), keywords potentiometer, pot,
//   knob, variable resistor, dimmer, trimmer. The generated tool takes
//   { hole, direction, resistance }. ai.guide keeps the issue's sentence and
//   lays out the dimmer at C = 2 with these holes (the #31 correction: the
//   ends flipped, pin 3 to + and pin 1 to −, so scrolling up brightens): pot
//   c2 (pin 1), c3 (wiper), c4 (pin 3); wires tp_4 → a4 and a2 → tn_2;
//   resistor b3–b7; LED
//   anode c7, cathode c9; wire a9 → tn_9.
// - server.js findCircuitProblems builds a footprint part's pin nodes from
//   its legs (actionLegs), so parts in series with a pot are not flagged as
//   "not connected"; a pot whose wiper is joined to nothing is flagged, in
//   one line that names the potentiometer, its wiper and the wiper's hole.
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

function pot() {
  const def = Parts.get('potentiometer');
  assert.ok(def, "Parts.get('potentiometer') is null: parts/potentiometer.js must exist and be listed in parts/index.js");
  return def;
}

const plain = o => JSON.parse(JSON.stringify(o));

// The two R elements: the one between pin 1 and the wiper, and the one
// between the wiper and pin 3, whichever way round each names its pins.
function halves(values, controls) {
  const els = pot().elements(values, controls);
  assert.ok(Array.isArray(els), `elements() returns a list; got ${JSON.stringify(els)}`);
  const between = (a, b) => els.find(e => e.kind === 'R' && e.pins.length === 2 && e.pins.includes(a) && e.pins.includes(b));
  const top = between('1', 'wiper'), bottom = between('wiper', '3');
  assert.ok(top && bottom, `an R from pin 1 to the wiper and an R from the wiper to pin 3; got ${JSON.stringify(els)}`);
  return { els, top: top.ohms, bottom: bottom.ohms };
}

// Both halves, to within a milliohm (0.9 × 10000 is 8999.999… in floating point).
function ohmsNear(h, [top, bottom], what) {
  assert.ok(Math.abs(h.top - top) < 1e-3 && Math.abs(h.bottom - bottom) < 1e-3,
    `${what || 'halves'}: expected ${top} | ${bottom} Ω, got ${h.top} | ${h.bottom}`);
}

// "a2" → { col: 1, row: 'a' }; "tp_50" → { col: 49, row: 'tp' }.
function holeRef(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  assert.ok(m, 'not a hole: ' + s);
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}
const pinsOf = n => Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));

// A PartResult for the pot, as the core hands it to measure / report.
function result({ values, controls, wiper }) {
  return { label: 'RV1', values: Object.assign({ resistance: 10000 }, values),
           controls: Object.assign({ position: 50 }, controls),
           pins: { 1: 9, wiper: wiper === undefined ? 4.5 : wiper, 3: 0 }, current: {}, modes: {}, open: {} };
}

// ── The file and its identity ─────────────────────────────────────────────

test('parts/index.js lists potentiometer.js, and the file exists', () => {
  const src = fs.readFileSync(path.join(PARTS_DIR, 'index.js'), 'utf8');
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, 'parts/index.js must keep its FILES list');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  assert.ok(files.includes('potentiometer.js'), `FILES should include 'potentiometer.js'; got ${JSON.stringify(files)}`);
  assert.ok(fs.existsSync(path.join(PARTS_DIR, 'potentiometer.js')), 'circuit3d/js/parts/potentiometer.js must exist');
});

test('identity: type potentiometer, "Potentiometer", "3 leads · knob", Passives, prefix RV (labels RV1, RV2)', () => {
  const def = pot();
  assert.equal(def.type, 'potentiometer');
  assert.equal(def.name, 'Potentiometer');
  assert.equal(def.sub, '3 leads · knob');
  assert.equal(def.category, 'Passives');
  assert.equal(def.prefix, 'RV', 'RV: the standard designator for a variable resistor');
  assert.equal(Ids.nextLabel([], 'potentiometer'), 'RV1');
  assert.equal(Ids.nextLabel([{ type: 'potentiometer', label: 'RV1' }], 'potentiometer'), 'RV2');
});

test("pins ['1', 'wiper', '3']; a footprint part, legs [0,0] [1,0] [2,0], rotations 0, 90, 180, 270", () => {
  const def = pot();
  assert.deepStrictEqual([...def.pins], ['1', 'wiper', '3']);
  const place = plain(def.place);
  assert.equal(place.kind, 'footprint');
  assert.deepStrictEqual(place.legs, [[0, 0], [1, 0], [2, 0]]);
  assert.deepStrictEqual(place.rotations, [0, 90, 180, 270]);
  assert.ok(!place.straddle, 'a pot is not a chip: it does not straddle the gap');
});

test('footprintLegs: at c2 facing right the pins sit in c2 (1), c3 (wiper), c4 (3)', () => {
  pot();
  const legs = Parts.footprintLegs('potentiometer', 'c2', 0);
  assert.deepStrictEqual(legs.map(l => [l.pin, l.row + (l.col + 1)]), [['1', 'c2'], ['wiper', 'c3'], ['3', 'c4']]);
  assert.deepStrictEqual(Parts.checkPlacement('potentiometer', legs, new Map(), { cols: N, bodyRows: ROWS }), { ok: true });
});

// ── Values and controls ───────────────────────────────────────────────────

test('values.resistance: Ω, 10 kΩ by default, 100 Ω–1 MΩ, E12 kit values', () => {
  assert.deepStrictEqual(plain(pot().values), {
    resistance: { unit: 'Ω', default: 10000, min: 100, max: 1e6, series: 'E12' },
  });
});

test('checkValue on the pot: 1 kΩ ok (a kit value), 50 Ω refused with the range, 1234 Ω gets the kit hint', () => {
  pot();
  assert.deepStrictEqual(Parts.checkValue('potentiometer', 'resistance', 1000), { ok: true, value: 1000 });
  assert.deepStrictEqual(Parts.checkValue('potentiometer', 'resistance', 50),
    { ok: false, reason: 'resistance must be 100 Ω–1 MΩ; got 50' });
  assert.deepStrictEqual(Parts.checkValue('potentiometer', 'resistance', 1234),
    { ok: true, value: 1234, hint: 'closest kit value: 1.2 kΩ' });
});

test('controls.position: a saved slider, 0–100 %, step 1, 50 by default; the scroll gesture moves it', () => {
  const def = pot();
  assert.deepStrictEqual(plain(def.controls), {
    position: { type: 'slider', default: 50, min: 0, max: 100, step: 1, unit: '%', saved: true },
  });
  assert.deepStrictEqual(plain(def.gestures), { scroll: 'position' });
});

// ── elements(): two R, with a 1 Ω floor ───────────────────────────────────

test('elements() at the defaults (10 kΩ, 50 %): two R elements, 5 kΩ each', () => {
  const { els, top, bottom } = halves({ resistance: 10000 }, { position: 50 });
  assert.equal(els.length, 2, `two elements; got ${JSON.stringify(els)}`);
  ohmsNear({ top, bottom }, [5000, 5000]);
});

test('elements() at 25 % of 10 kΩ: R(1, wiper) 2.5 kΩ, R(wiper, 3) 7.5 kΩ; at 30 % of 1 kΩ: 300 Ω and 700 Ω', () => {
  ohmsNear(halves({ resistance: 10000 }, { position: 25 }), [2500, 7500], '10 kΩ at 25 %');
  ohmsNear(halves({ resistance: 1000 }, { position: 30 }), [300, 700], '1 kΩ at 30 %');
});

test('elements() at 0 % and 100 %: the short side is floored at 1 Ω, never 0', () => {
  ohmsNear(halves({ resistance: 10000 }, { position: 0 }), [1, 10000], '0 %: the wiper sits at pin 1');
  ohmsNear(halves({ resistance: 10000 }, { position: 100 }), [10000, 1], '100 %: the wiper sits at pin 3');
});

test('changing controls.position changes the elements (nothing is cached between calls)', () => {
  const v = { resistance: 10000 };
  ohmsNear(halves(v, { position: 10 }), [1000, 9000], '10 %');
  ohmsNear(halves(v, { position: 90 }), [9000, 1000], 'then 90 %');
  ohmsNear(halves(v, { position: 10 }), [1000, 9000], 'then 10 % again');
});

// ── measure() and report() ────────────────────────────────────────────────

test('measure(): { position, wiperVolts } from the controls and the wiper pin', () => {
  const def = pot();
  assert.equal(typeof def.measure, 'function', 'the pot defines measure()');
  const r = result({ controls: { position: 25 }, wiper: 6.75 });
  assert.deepStrictEqual(plain(def.measure(r)), { position: 25, wiperVolts: 6.75 });
});

test('measure(): wiperVolts is null when the wiper floats', () => {
  const def = pot();
  const r = result({ controls: { position: 50 }, wiper: null });
  assert.deepStrictEqual(plain(def.measure(r)), { position: 50, wiperVolts: null });
});

test('report(): "50 % · 5.0 kΩ | 5.0 kΩ" for 10 kΩ at 50 %; "25 % · 2.5 kΩ | 7.5 kΩ" at 25 %', () => {
  const def = pot();
  const r50 = result({ controls: { position: 50 } });
  assert.equal(def.report(r50, def.measure(r50)), '50 % · 5.0 kΩ | 5.0 kΩ');
  const r25 = result({ controls: { position: 25 }, wiper: 6.75 });
  const line = def.report(r25, def.measure(r25));
  assert.equal(line, '25 % · 2.5 kΩ | 7.5 kΩ');
  assert.ok(line.length <= 80, line);
});

// ── The simulator: a divider across 9 V ───────────────────────────────────
// Battery on the rails; tp_10 → a10 (pin 1 at +9 V), a12 → tn_12 (pin 3 at
// 0 V); the pot at c10 facing right: pin 1 c10, wiper c11, pin 3 c12.
// Wiper volts = 9 · R(wiper, 3) / R = 9 · (1 − p), with the 1 Ω floor at the
// ends: 0 % → 9 · 10000 / 10001 = 8.9991 V; 100 % → 9 · 1 / 10001 = 0.0009 V.

function divider(position, resistance = 10000) {
  const bat = { type: 'battery', label: 'BAT1', pins: pinsOf(2), holeRefs: null, values: { voltage: 9 } };
  const rv  = { type: 'potentiometer', label: 'RV1', pins: pinsOf(3), holeRefs: ['c10', 'c11', 'c12'].map(holeRef),
                values: { resistance }, controls: { position } };
  const w = (a, b) => ({ startHole: holeRef(a), endHole: holeRef(b) });
  const wires = [{ startComp: bat, startPinIdx: 0, endHole: holeRef('tp_50') },
                 { startComp: bat, startPinIdx: 1, endHole: holeRef('tn_50') },
                 w('tp_10', 'a10'), w('a12', 'tn_12')];
  return { components: [bat, rv], wires, rv };
}

function wiperVolts(circuit) {
  const r = Sim.analyze(circuit.components, circuit.wires);
  assert.equal(r.status, 'ok', `status ${r.status}: ${(r.lines || []).map(l => l.text).join(' | ')}`);
  const p = r.parts && r.parts.RV1;
  assert.ok(p, `analyze().parts has no RV1; got ${JSON.stringify(Object.keys(r.parts || {}))}`);
  return p.m.wiperVolts;
}

test('known answer: 9 V across pins 1 and 3 at 25 % → the wiper reads 6.75 V (±0.05)', () => {
  pot();
  const v = wiperVolts(divider(25));
  assert.ok(typeof v === 'number' && Math.abs(v - 6.75) <= 0.05, `wiper at 25 %: expected 6.75 V, got ${v}`);
});

test('at 0 % the wiper reads 9 V (8.999); at 100 % about 0 V (0.0009)', () => {
  pot();
  const v0 = wiperVolts(divider(0));
  assert.ok(Math.abs(v0 - 8.9991) < 0.005, `0 %: expected 8.999 V, got ${v0}`);
  const v100 = wiperVolts(divider(100));
  assert.ok(Math.abs(v100) < 0.005, `100 %: expected ~0 V, got ${v100}`);
});

test('decision 3: the same record re-simulated after its position changes gives the new wiper volts', () => {
  pot();
  const c = divider(25);
  assert.ok(Math.abs(wiperVolts(c) - 6.75) <= 0.05);
  c.rv.controls.position = 75;
  const v = wiperVolts(c);
  assert.ok(Math.abs(v - 2.25) <= 0.05, `after turning to 75 %: expected 2.25 V, got ${v}`);
  c.rv.controls.position = 25;
  assert.ok(Math.abs(wiperVolts(c) - 6.75) <= 0.05, 'and back');
});

test('examples: the 25 % divider is a known-answer example expecting 6.75 V at the wiper', () => {
  const def = pot();
  const found = def.examples.some(ex => ex.parts.some(p => p.type === 'potentiometer' && p.controls
    && p.controls.position === 25 && ex.expect[p.label] && Array.isArray(ex.expect[p.label].wiperVolts)
    && ex.expect[p.label].wiperVolts[0] <= 6.75 && ex.expect[p.label].wiperVolts[1] >= 6.75
    && ex.expect[p.label].wiperVolts[1] - ex.expect[p.label].wiperVolts[0] <= 0.1));
  assert.ok(found, `no example sets position 25 and expects wiperVolts [lo, hi] around 6.75: ${JSON.stringify(def.examples)}`);
});

// ── The dimmer recipe (decision 5) through the AI apply path ──────────────
// At C = 2, one lead per hole (the #31 correction: pin 3 to +, pin 1 to −):
// pot c2/c3/c4 (1 kΩ), tp_4 → a4 (pin 3), a2 → tn_2 (pin 1),
// resistor b3–b7 from the wiper column, LED anode c7 / cathode c9, a9 → tn_9.
//
// Hand-computed: the wiper is a source of Vth = 9 · R(1,w) / R behind
// Rth = R(1,w) · R(w,3) / R, driving 470 Ω and a red LED (vf 2.0, ron 0.1):
//   100 %: R(1,w) = 1000, R(w,3) = 1 Ω (floor) → Vth = 8.99101, Rth = 0.999
//         I = (8.99101 − 2.0) / (0.999 + 470 + 0.1) = 14.840 mA
//         (not 14.9: the 1 Ω floor and the pot's 1 kΩ load pull it down a little)
//   50 %:  Vth = 4.5 V, Rth = 250 Ω → I = 2.5 / 720.1 = 3.4717 mA
//   20 %:  Vth = 1.8 V < vf 2.0 → the LED is off; the wiper reads 1.80 V

const wire = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });
const DIMMER = [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  wire('BAT1.0', `tp_${N}`, 'red'),
  wire('BAT1.1', `tn_${N}`, 'black'),
  { tool: 'place_potentiometer', hole: 'c2', direction: 'right', resistance: 1000 },
  wire('tp_4', 'a4', 'red'),     // pin 3 → +
  wire('a2', 'tn_2', 'black'),   // pin 1 → −
  { tool: 'place_resistor', holeA: 'b3', holeB: 'b7' },
  { tool: 'place_led', holeA: 'c9', holeB: 'c7' },
  wire('a9', 'tn_9', 'black'),
];

// A board that keeps real records the way App leaves them (as in
// test/footprint.test.js), so Sim.analyze can solve it.
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

function dimmerBoard() {
  pot();
  const board = simBoard();
  const out = Chat.acceptBuild(DIMMER, board);
  assert.deepEqual(out, { applied: DIMMER.length, failed: 0 }, `applied, notes ${JSON.stringify(board.notes)}`);
  const rv = board.components().find(c => c.type === 'potentiometer');
  assert.ok(rv, 'the pot is on the board');
  return { board, rv };
}

function ledAt(board) {
  const r = board.solve();
  assert.equal(r.status, 'ok', `status ${r.status}: ${(r.lines || []).map(l => l.text).join(' | ')}`);
  assert.ok(r.parts.LED1, `analyze().parts has no LED1; got ${JSON.stringify(Object.keys(r.parts))}`);
  return { led: r.parts.LED1.m, rv: r.parts.RV1 && r.parts.RV1.m };
}

test('the dimmer places the pot as RV1 on c2 c3 c4 with 1 kΩ, at 50 % by default', () => {
  const { rv } = dimmerBoard();
  assert.equal(rv.label, 'RV1');
  assert.deepStrictEqual(Parts.legsOf(rv).map(l => [l.pin, l.hole]), [['1', 'c2'], ['wiper', 'c3'], ['3', 'c4']]);
  assert.equal(rv.values.resistance, 1000);
  assert.deepStrictEqual(rv.controls, { position: 50 });
});

test('dimmer at 100 %: the LED lights at 14.84 mA (hand-computed)', () => {
  const { board, rv } = dimmerBoard();
  rv.controls.position = 100;
  const { led } = ledAt(board);
  assert.equal(led.on, true, JSON.stringify(led));
  assert.ok(Math.abs(led.current - 14.840) < 0.02, `expected 14.84 mA, got ${led.current}`);
});

test('dimmer at 50 %: the LED lights at 3.47 mA (Vth 4.5 V, Rth 250 Ω)', () => {
  const { board, rv } = dimmerBoard();
  rv.controls.position = 50;
  const { led } = ledAt(board);
  assert.equal(led.on, true, JSON.stringify(led));
  assert.ok(Math.abs(led.current - 3.4717) < 0.02, `expected 3.47 mA, got ${led.current}`);
});

test('dimmer at 20 %: the LED is off (Vth 1.8 V is under vf), and the wiper reads 1.80 V', () => {
  const { board, rv } = dimmerBoard();
  rv.controls.position = 20;
  const { led, rv: m } = ledAt(board);
  assert.equal(led.on, false, JSON.stringify(led));
  assert.ok(m && Math.abs(m.wiperVolts - 1.8) < 0.01, `wiper: expected 1.80 V, got ${JSON.stringify(m)}`);
  assert.equal(m.position, 20);
});

test('turning the same dimmer 100 % → 50 % → 20 % on one board: the current falls, then the LED goes dark', () => {
  const { board, rv } = dimmerBoard();
  const seen = [100, 50, 20].map(p => { rv.controls.position = p; return ledAt(board).led; });
  assert.ok(seen[0].current > seen[1].current, JSON.stringify(seen));
  assert.deepStrictEqual(seen.map(m => m.on), [true, true, false]);
});

// ── Save and load ─────────────────────────────────────────────────────────

test('a placed pot saves one named holeRef per pin and loads back to the same legs', () => {
  pot();
  const legs = Parts.footprintLegs('potentiometer', 'e30', 90);   // down: e30 f30 g30
  const comp = { type: 'potentiometer', label: 'RV1', values: { resistance: 1000 }, controls: { position: 30 },
                 holeRefs: legs.map(l => ({ col: l.col, row: l.row })), pins: pinsOf(3) };
  const saved = BoardIO.saveHoleRefs(comp);
  assert.deepStrictEqual(saved, [{ pin: '1', col: 29, row: 'e' }, { pin: 'wiper', col: 29, row: 'f' }, { pin: '3', col: 29, row: 'g' }]);
  const loaded = { type: 'potentiometer', label: 'RV1', holeRefs: BoardIO.loadHoleRefs({ type: 'potentiometer', label: 'RV1', holeRefs: saved }) };
  assert.deepStrictEqual(Parts.legsOf(loaded).map(l => [l.pin, l.hole]), [['1', 'e30'], ['wiper', 'f30'], ['3', 'g30']]);
  const map = BoardIO.buildHoleMap([comp], []);
  assert.deepStrictEqual(map.get('f30'), { label: 'RV1', pin: 'wiper' });
});

// ── The server: tools, selection, circuit problems ────────────────────────

const decl = name => Server.CIRCUIT_TOOLS[0].function_declarations.find(d => d.name === name);

test('the generated place_potentiometer tool takes { hole, direction, resistance }; hole and direction required', () => {
  pot();
  const t = decl('place_potentiometer');
  assert.ok(t, `no place_potentiometer tool; tools: ${Server.CIRCUIT_TOOLS[0].function_declarations.map(d => d.name).join(', ')}`);
  assert.deepStrictEqual(Object.keys(t.parameters.properties).sort(), ['direction', 'hole', 'resistance']);
  assert.deepStrictEqual([...t.parameters.required].sort(), ['direction', 'hole']);
  assert.equal(t.parameters.properties.resistance.type, 'NUMBER');
  assert.deepStrictEqual([...t.parameters.properties.direction.enum].sort(), ['down', 'left', 'right', 'up']);
});

test('ai: keywords potentiometer, pot, knob, variable resistor, dimmer, trimmer', () => {
  const def = pot();
  assert.equal(def.ai.tool || 'place_' + def.type, 'place_potentiometer');
  assert.deepStrictEqual([...def.ai.keywords].sort(),
    ['dimmer', 'knob', 'pot', 'potentiometer', 'trimmer', 'variable resistor']);
  assert.ok(def.ai.about.length > 0);
});

const SENTENCE = 'Wiper is the middle pin. Ends go to + and −; the wiper gives the adjustable voltage.';

test("ai.guide keeps the issue's sentence and lays out the dimmer at C = 2 with its exact holes", () => {
  const guide = pot().ai.guide;
  assert.equal(typeof guide, 'string', 'the pot has an ai.guide');
  assert.ok(guide.includes(SENTENCE), `the guide keeps "${SENTENCE}": ${guide}`);
  assert.ok(guide.length <= 400, `at most 400 characters; got ${guide.length}`);
  for (const h of ['c2', 'c3', 'c4', 'tp_4', 'a4', 'a2', 'tn_2', 'b3', 'b7', 'c7', 'c9', 'a9', 'tn_9']) {
    assert.match(guide, new RegExp(`(^|[^a-z0-9_])${h}(?![0-9])`), `the dimmer layout names ${h}: ${guide}`);
  }
  assert.match(guide, /1000|1 ?k/i, `the recipe asks for a 1 kΩ pot: ${guide}`);
});

test('selectTools("Make an LED dimmer with a potentiometer") sends place_potentiometer, place_resistor and place_led', () => {
  pot();
  const got = Server.selectTools('Make an LED dimmer with a potentiometer', []).map(d => d.name);
  for (const n of ['place_potentiometer', 'place_resistor', 'place_led']) {
    assert.ok(got.includes(n), `${n} missing from ${JSON.stringify(got)}`);
  }
});

test('the dimmer recipe passes finishAIReply untouched: every action kept, no "Heads up"', () => {
  pot();
  assert.deepStrictEqual(Server.findCircuitProblems(DIMMER.map(a => ({ ...a }))), []);
  const out = Server.finishAIReply({ reply: 'Built it.', actions: DIMMER.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, DIMMER);
  assert.equal(out.reply, 'Built it.');
});

// A pot beside the one-LED circuit, ends on + and −, its wiper (c21) wired
// to nothing: the wiper's adjustable voltage goes nowhere.
test('a pot whose wiper goes nowhere is flagged in one line naming the potentiometer, its wiper and c21', () => {
  pot();
  const actions = [
    ...Recipes.ONE_LED,
    { tool: 'place_potentiometer', hole: 'c20', direction: 'right' },   // 1 c20, wiper c21, 3 c22
    wire('tp_20', 'a20', 'red'), wire('a22', 'tn_22', 'black'),
  ];
  const got = Server.findCircuitProblems(actions.map(a => ({ ...a })));
  assert.equal(got.length, 1, `exactly one problem: ${JSON.stringify(got)}`);
  assert.match(got[0], /potentiometer/);
  assert.match(got[0], /\bwiper\b/);
  assert.match(got[0], /\bc21\b/);
});

// ── The browser half ──────────────────────────────────────────────────────

test('in a browser-like page with no THREE or document, potentiometer.js defines itself on window.Parts', () => {
  const file = path.join(PARTS_DIR, 'potentiometer.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/potentiometer.js must exist');
  const win = vm.createContext({ TextEncoder });
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(PARTS_DIR, 'registry.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(file, 'utf8'), win);
  const def = win.Parts.get('potentiometer');
  assert.ok(def, 'window.Parts.get("potentiometer") after loading potentiometer.js');
  assert.equal(def.elements({ resistance: 10000 }, { position: 50 }).length, 2);
});

test('parts/potentiometer.js draws only through ctx: a view.build, no App, no document', () => {
  const file = path.join(PARTS_DIR, 'potentiometer.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/potentiometer.js must exist');
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /\bview\s*:/, 'a view: { build } section');
  assert.doesNotMatch(src, /\bApp\b/, 'the part file must not reach into App; use ctx');
  assert.doesNotMatch(src, /\bdocument\b/, 'the part file must not touch document');
  assert.equal(typeof pot().view.build, 'function');
});
