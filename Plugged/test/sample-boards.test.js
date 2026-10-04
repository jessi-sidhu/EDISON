// Tests for the hard-coded sample boards (issue #15): a photo sample may carry
// `board`, a fixed action list the page builds as it is, with no AI and no
// Reading (photo.js: the photo with "Reading your board…" for
// SAMPLE_READ_MS, then built({ actions: s.board, flags: [], labels: {},
// skipped: [] })). The browser half is e2e/sample-board.spec.js.
// window.PhotoSamples is loaded the way the page loads it (a plain script on
// a window), as test/photo-samples.test.js does.
// Contract: docs/API-CONTRACT.md → "Page additions" (window.PhotoSamples).
//
// Shapes these tests assume (stated so the builder matches them):
// - PhotoSamples[id].board, optional: an array of actions in the AI's build
//   shape (place_* with holeA / holeB, add_wire { from, to }, holes like
//   "e3", rails like "bp_23", battery leads "BAT1.0" / "BAT1.1"), no
//   delete_all (SparkyChat.applyBuild clears the board itself).
// - PhotoSamples['leds-buttons']: photo 2 of the web eval set, offered on the
//   picker: { file: 'samples/leds-buttons.jpg' (a byte copy of
//   test/fixtures/photo/web/p2_leds_buttons.jpg), cols: 63, title, credit
//   (names the photo's author and licence from ATTRIBUTION.md), board }.
//   It needs no taps and no recording: the board wins.
// - Its board, in app holes (the orchestrator's correction to the issue, with
//   R1 and the cathode wire moved so the page takes them; the j-side rails
//   are the app's bp (+) and bn (−)):
//     BAT1 9 V   BAT1.0 → bp_23, BAT1.1 → bn_23
//     SW1 a1–a4, SW2 a5–a8, SW3 a9–a12      (in at the low column, out at the high)
//     LED1 green  cathode e3,  anode e4
//     LED2 yellow cathode e7,  anode e8
//     LED3 red    cathode e11, anode e12
//     R1 1.5 kΩ  d11 → g11 (straight across the centre gap: the page takes a
//                resistor on one row 3–5 columns apart or across the gap,
//                never from a body hole into a rail)
//     wires bp_3 → c1, bp_6 → c5, bp_9 → c9 (+ to each button's input),
//           b3 → b11, b7 → c11 (the cathodes to R1; one end per hole),
//           j11 → bn_11 (black: R1's far end to the − rail)
//   So + → SWn → LEDn's anode → its cathode → R1 → −: pressing SWn lights
//   only LEDn.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const Parts    = require('../circuit3d/js/parts');
const Board    = require('../circuit3d/js/board-model.js');
const Sim      = require('../circuit3d/js/simulate.js');
const Chat     = require('../circuit3d/js/chat.js');
const BoardIO  = require('../circuit3d/js/board-io.js');
const Ids      = require('../circuit3d/js/ids.js');
const Readings = require('../circuit3d/js/readings.js');
const { checkBuild } = require('../backend/server.js');

const CIRCUIT3D = path.join(__dirname, '..', 'circuit3d');
const SAMPLES   = path.join(CIRCUIT3D, 'samples', 'samples.js');
const WEB       = path.join(__dirname, 'fixtures', 'photo', 'web');

const ID    = 'leds-buttons';
const PHOTO = 'p2_leds_buttons.jpg';

// samples.js as the page runs it: a plain script on a window. JSON round
// trip: plain objects of this realm, so deepStrictEqual compares values only.
function loadSamples() {
  const window = {};
  vm.runInNewContext(fs.readFileSync(SAMPLES, 'utf8'), { window }, { filename: SAMPLES });
  assert.ok(window.PhotoSamples && typeof window.PhotoSamples === 'object', 'samples.js sets window.PhotoSamples');
  return JSON.parse(JSON.stringify(window.PhotoSamples));
}

// A sample's board, required.
function boardOf(id) {
  const s = loadSamples()[id];
  assert.ok(s, `PhotoSamples has '${id}': got ${JSON.stringify(Object.keys(loadSamples()))}`);
  assert.ok(Array.isArray(s.board) && s.board.length > 0, `PhotoSamples['${id}'].board is a non-empty action list, got ${JSON.stringify(s.board)}`);
  return s.board;
}

// The board the page builds from it (Board.apply on an empty board).
function built(id) {
  const { board, errors } = Board.apply(Board.empty(), boardOf(id));
  assert.deepStrictEqual(errors, [], `${id}: Board.apply errors: ${JSON.stringify(errors)}`);
  return board;
}

// Every sample with a board, leds-buttons always among them (so its tests
// run, and fail, before it exists).
const BOARD_IDS = [...new Set([ID, ...Object.entries(loadSamples()).filter(([, s]) => s.board).map(([id]) => id)])];

// ATTRIBUTION.md's table: file → { author, licence }, links and "(site)"
// notes stripped (as test/photo-samples.test.js reads it).
function attributions() {
  const out = {};
  for (const line of fs.readFileSync(path.join(WEB, 'ATTRIBUTION.md'), 'utf8').split('\n')) {
    const m = /^\|\s*`([^`]+)`\s*\|[^|]*\|([^|]*)\|([^|]*)\|/.exec(line);
    if (!m) continue;
    const plain = s => s.trim().replace(/^\[([^\]]+)\]\([^)]*\)$/, '$1');
    out[m[1]] = { author: plain(m[2]).replace(/\s*\(.*\)$/, ''), licence: plain(m[3]) };
  }
  return out;
}

// ── The page's own apply path, in Node ─────────────────────────────────────
// SparkyChat.applyBuild runs Chat.acceptBuild → Chat.applyActions on the
// live board. Here the same Chat.applyActions runs on a board of plain
// records whose hole map is the page's own (BoardIO.buildHoleMap, which
// App.holeMap calls), so every place_* meets the page's placement check
// (Parts.checkPlacement) against the parts and wire ends placed before it.
// A refused step is a failed action and a note, as on the page.

const HOLE = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/;
function holeRef(s) {
  const m = HOLE.exec(String(s));
  if (!m) return null;
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}

function pageBoard() {
  const parts = [], wires = [], notes = [];
  const wireEnd = (e, side) => (e.hole
    ? { [side + 'Hole']: { col: e.hole.col, row: e.hole.row }, [side + 'Comp']: null, [side + 'PinIdx']: -1 }
    : { [side + 'Hole']: null, [side + 'Comp']: e.comp, [side + 'PinIdx']: e.pin });
  return {
    notes,
    note:        text => notes.push(text),
    components:  () => parts,
    batterySpot: () => ({ x: 15.8, z: -3.15 }),
    parseHole:   s => {
      const r = holeRef(s);
      if (!r) throw new Error('parseHole: unrecognised hole address: ' + s);
      return r;
    },
    getHole:     (col, row) => ({ col, row }),
    holeMap:     () => BoardIO.buildHoleMap(parts, wires),
    placePart(type, where, values) {
      const def = Parts.get(type);
      const rec = { type, label: Ids.nextLabel(parts, type), pins: def.pins.map(() => ({ x: 0, y: 0, z: 0 })),
                    holeRefs: Array.isArray(where) ? where.map(h => ({ col: h.col, row: h.row })) : null,
                    position: Array.isArray(where) ? undefined : where, values: Object.assign({}, values) };
      parts.push(rec);
      return rec;
    },
    setValues:   (comp, v) => { comp.values = Object.assign({}, comp.values, v); },
    setControls: (comp, c) => { comp.controls = Object.assign({}, comp.controls, c); },
    deletePart:  () => { throw new Error('a sample board deletes nothing'); },
    deleteWire:  () => false,
    clearAll:    () => { parts.length = 0; wires.length = 0; },
    addWire(from, to) {
      wires.push(Object.assign({}, wireEnd(from, 'start'), wireEnd(to, 'end')));
      return true;
    },
    batch:       fn => fn(),
  };
}

// ── Every sample with a board ──────────────────────────────────────────────

test.each(BOARD_IDS)('%s\'s board applies cleanly: Board.apply takes every action, and the page\'s apply path (Chat.applyActions, its placement checks) refuses none, with no note', id => {
  const actions = boardOf(id);
  assert.ok(!actions.some(a => a && a.tool === 'delete_all'), `${id}: no delete_all (applyBuild clears the board itself)`);
  built(id);

  const board = pageBoard();
  const out = Chat.applyActions(actions.map(a => ({ ...a })), board);
  assert.deepStrictEqual(board.notes, [], `${id}: the page's apply path said: ${JSON.stringify(board.notes)}`);
  assert.deepStrictEqual({ applied: out.applied, failed: out.failed }, { applied: actions.length, failed: 0 },
    `${id}: refused ${JSON.stringify(out.failedActions)}`);
});

// A hole holds one lead (the page's Parts.checkPlacement, and server.js's
// "A hole takes one lead"): no part lead or wire end shares a hole, body or
// rail. The page's add_wire doesn't check this, so it is checked here.
test.each(BOARD_IDS)('%s\'s board puts at most one lead or wire end in each hole', id => {
  const board = built(id);
  const seen = new Map();
  const put = (hole, what) => {
    if (!holeRef(hole)) return;   // a LABEL.k pin end, not a hole
    if (!seen.has(hole)) seen.set(hole, []);
    seen.get(hole).push(what);
  };
  for (const p of board.parts) (p.holes || []).forEach((h, k) => put(h, `${p.label}.${Parts.get(p.type).pins[k]}`));
  for (const w of board.wires) { put(w.from, `${w.id} (${w.from} → ${w.to})`); put(w.to, `${w.id} (${w.from} → ${w.to})`); }
  const stacked = [...seen].filter(([, list]) => list.length > 1).map(([h, list]) => `${h} holds ${list.join(' and ')}`);
  assert.deepStrictEqual(stacked, [], `${id}: a hole holds one lead`);
});

test.each(BOARD_IDS)('%s\'s board simulates with no error: status ok, not shorted', id => {
  const sim = Board.toSim(built(id));
  const r = Sim.analyze(sim.components, sim.wires);
  assert.equal(r.status, 'ok', `${id}: status ${r.status}; ${(r.lines || []).map(l => l.text).join(' | ')}`);
  assert.equal(r.shorted, false, `${id}: shorted`);
});

// ── leds-buttons ───────────────────────────────────────────────────────────

test('leds-buttons is offered, its photo a byte copy of p2_leds_buttons.jpg, 63 columns, with a title and a credit naming Ilikefood and the licence', () => {
  const samples = loadSamples();
  const s = samples[ID];
  assert.ok(s, `PhotoSamples has '${ID}': got ${JSON.stringify(Object.keys(samples))}`);
  assert.notEqual(s.offered, false, `${ID} is offered on the picker`);
  assert.equal(s.file, 'samples/leds-buttons.jpg');
  const file = path.join(CIRCUIT3D, s.file);
  assert.ok(fs.existsSync(file), `circuit3d/${s.file} exists`);
  assert.ok(fs.readFileSync(file).equals(fs.readFileSync(path.join(WEB, PHOTO))), `circuit3d/${s.file} is a copy of test/fixtures/photo/web/${PHOTO}`);
  assert.equal(s.cols, 63, `${ID}: the photo's board has 63 columns`);
  assert.ok(typeof s.title === 'string' && s.title.trim() !== '', `${ID}.title is a non-empty string, got ${JSON.stringify(s.title)}`);
  const others = Object.entries(samples).filter(([id]) => id !== ID).map(([, o]) => o.title);
  assert.ok(!others.includes(s.title), `${ID}'s title names its tile apart from the others: ${JSON.stringify(s.title)}`);

  const by = attributions()[PHOTO];
  assert.ok(by, `ATTRIBUTION.md lists ${PHOTO}`);
  assert.equal(by.author, 'Ilikefood', 'ATTRIBUTION.md\'s author for photo 2');
  const credit = String(s.credit || '').toLowerCase();
  assert.ok(credit.includes(by.author.toLowerCase()), `${ID}.credit names the author "${by.author}": ${JSON.stringify(s.credit)}`);
  assert.ok(credit.includes(by.licence.toLowerCase()), `${ID}.credit names the licence "${by.licence}": ${JSON.stringify(s.credit)}`);
});

// The correction's layout: each button, the LED it feeds, and that LED's
// colour and holes.
const LAYOUT = [
  { sw: 'SW1', holes: ['a1', 'a4'],  led: 'LED1', color: 'green',  cathode: 'e3',  anode: 'e4' },
  { sw: 'SW2', holes: ['a5', 'a8'],  led: 'LED2', color: 'yellow', cathode: 'e7',  anode: 'e8' },
  { sw: 'SW3', holes: ['a9', 'a12'], led: 'LED3', color: 'red',    cathode: 'e11', anode: 'e12' },
];
const R1_HOLES = ['d11', 'g11'];
const R_OHMS = 1500;
const VOLTS  = 9;
const WIRES  = [['BAT1.0', 'bp_23'], ['BAT1.1', 'bn_23'],
                ['bp_3', 'c1'], ['bp_6', 'c5'], ['bp_9', 'c9'],
                ['b3', 'b11'], ['b7', 'c11'], ['j11', 'bn_11']];

const pair   = (a, b) => [String(a), String(b)].sort().join(' ~ ');
const sorted = list => list.slice().sort();

test('leds-buttons is exactly a 9 V battery, SW1–SW3, the green, yellow and red LEDs and R1 1.5 kΩ at their holes, plus the 6 wires and the 2 battery leads', () => {
  const board = built(ID);
  const sim   = Board.toSim(board);
  const values = Object.fromEntries(sim.components.map(c => [c.label, c.values || {}]));
  const ledPins = Parts.get('led').pins;   // holes in pin order: [cathode, anode]

  const got  = board.parts.map(p => [p.label, p.type, p.type === 'led' ? p.holes : sorted(p.holes || [])]);
  const want = [['BAT1', 'battery', []],
                ...LAYOUT.map(l => [l.sw, 'button', sorted(l.holes)]),
                ...LAYOUT.map(l => [l.led, 'led', ledPins.map(pin => l[pin])]),
                ['R1', 'resistor', sorted(R1_HOLES)]];
  const byLabel = list => list.slice().sort((x, y) => x[0].localeCompare(y[0]));
  assert.deepStrictEqual(byLabel(got), byLabel(want), 'the parts, by label: [label, type, holes]');

  assert.equal(Number(values.BAT1.voltage), VOLTS, 'BAT1 is 9 V');
  assert.equal(Number(values.R1.resistance), R_OHMS, 'R1 is 1.5 kΩ');
  for (const l of LAYOUT) assert.equal(values[l.led].color, l.color, `${l.led} is ${l.color}`);

  assert.deepStrictEqual(sorted(board.wires.map(w => pair(w.from, w.to))), sorted(WIRES.map(([a, b]) => pair(a, b))),
    'the wires: the battery\'s 2 leads, + to each button\'s input, the cathodes to R1, R1 to the − rail');
});

// The board solved with `press` (a button's label) pressed, the way a test
// presses one: a set_control action on the board (as the AI's would).
function solve(board, press) {
  const after = press ? Board.apply(board, [{ tool: 'set_control', part: press, pressed: true }]) : { board, errors: [] };
  assert.deepStrictEqual(after.errors, [], `pressing ${press}: ${JSON.stringify(after.errors)}`);
  const sim = Board.toSim(after.board);
  const r = Sim.analyze(sim.components, sim.wires);
  assert.equal(r.status, 'ok', `${press || 'nothing'} pressed: status ${r.status}; ${(r.lines || []).map(l => l.text).join(' | ')}`);
  return r;
}

// The part of `type` sitting in exactly `holes` (any order), by label.
function labelAt(board, type, holes) {
  const p = board.parts.find(x => x.type === type && sorted(x.holes || []).join() === sorted(holes).join());
  assert.ok(p, `a ${type} in ${holes.join(' and ')}: the board has ${board.parts.map(x => `${x.label} ${(x.holes || []).join('/')}`).join(', ')}`);
  return p.label;
}

const OFF_MA = 0.01;   // "no current": below 10 µA

test('leds-buttons with no button pressed: all 3 LEDs are dark', () => {
  const board = built(ID);
  const r = solve(board, null);
  for (const l of LAYOUT) {
    const led = labelAt(board, 'led', [l.cathode, l.anode]);
    const m = r.parts[led].m;
    assert.equal(m.on, false, `the ${l.color} LED (${led}) is dark with nothing pressed`);
    assert.ok(Math.abs(m.current) < OFF_MA, `the ${l.color} LED (${led}): expected ≈0 mA, got ${m.current}`);
  }
});

// Hand calculation, one button pressed. Ideal 9 V battery; the closed button
// is 1 mΩ and the LED's on-resistance 0.1 Ω, both negligible beside 1.5 kΩ;
// the LED drops its colour's Vf (parts/led.js):
//   green  (9 − 2.2) / 1500 = 4.533 mA
//   yellow (9 − 2.1) / 1500 = 4.600 mA
//   red    (9 − 2.0) / 1500 = 4.667 mA
// all inside 3–6 mA, above the LED's 1 mA ON threshold. The other two
// buttons stay open, so their LEDs carry nothing.
test.each(LAYOUT.map(l => [l.sw, l.color, l]))('leds-buttons: pressing %s lights only the %s LED, at (9 − Vf) / 1500 Ω', (sw, color, l) => {
  const board = built(ID);
  const button = labelAt(board, 'button', l.holes);
  const r = solve(board, button);
  const vf = Parts.get('led').values.color.choices[color].vf;
  const hand = (VOLTS - vf) / R_OHMS * 1000;
  for (const other of LAYOUT) {
    const led = labelAt(board, 'led', [other.cathode, other.anode]);
    const m = r.parts[led].m;
    if (other === l) {
      assert.equal(m.on, true, `${button} pressed: the ${color} LED (${led}) lights`);
      assert.ok(m.current >= 3 && m.current <= 6, `${button} pressed: the ${color} LED at 3–6 mA, got ${m.current}`);
      assert.ok(Math.abs(m.current - hand) < 0.01, `${button} pressed: the ${color} LED expected ${hand.toFixed(3)} mA, got ${m.current}`);
    } else {
      assert.equal(m.on, false, `${button} pressed: the ${other.color} LED (${led}) stays dark`);
      assert.ok(Math.abs(m.current) < OFF_MA, `${button} pressed: the ${other.color} LED (${led}) expected ≈0 mA, got ${m.current}`);
    }
  }
});

// Edison sees the sample as built: the mistakes panel (Readings) and the
// server's own build checker (checkBuild, as on an AI build or a "Fix it."
// full check) find nothing to fix, so asking about it never sends the AI off
// to rewire the photo's board.
test('leds-buttons as built has no problem rows and nothing for the server\'s checker to fix', () => {
  const board = built(ID);
  const sim = Board.toSim(board);
  const r = Sim.analyze(sim.components, sim.wires);
  const rows = Readings.from(r, sim).problems();
  assert.deepStrictEqual(rows.map(p => `${p.kind}: ${p.labels}`), [], 'no row in the mistakes panel');
  assert.deepStrictEqual(checkBuild([{ tool: 'delete_all' }, ...boardOf(ID)], null), [], 'the server\'s checker finds nothing');
});
