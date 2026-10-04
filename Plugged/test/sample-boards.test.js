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
// - PhotoSamples['ensc-lab'] (issue #16): photo 11, Aarmen's ENSC 220 bench
//   photo, offered, after leds-buttons: { file: 'samples/ensc-lab.jpg',
//   title: 'ENSC 220 lab bench', credit naming Aarmen ("Photo: Aarmen, ENSC
//   220 lab"), board }. Its board is his saved build (Board.toActions, holes
//   +1, the no-op PS1.com → PS1.com wire and the set_control mode: series
//   step dropped), a TL072 comparator:
//     PS1 ±12 V series: + → tp_1, COM → tn_1, COM2 → tn_2, − → bn_1;
//         tn_3 → bp_3 puts the bottom + rail (bp) on ground
//     U1 TL072 at f57 facing right: OUT1 f57, IN1− f58, IN1+ f59, V− f60,
//         IN2+ e60, IN2− e59, OUT2 e58, V+ e57; d57 → tp_58 (V+ +12 V),
//         j60 → bn_60 (V− −12 V)
//     R1 10 kΩ d29–d34, tp_29 → a29 (+12 V)
//     R2 470 Ω h29–h33, bp_29 → j29 (ground)
//     the divider node: cols 34 (a–e) → c34–d40 → 40 → e40–f41 → 41 (f–j),
//         33 (f–j) → i33–h41 → 41; g41 → h58 takes it to IN1−
//     R3 470 Ω g55–g59, FG1.out → f55: the generator into IN1+
//     FG1 5 V, 1 Hz sine, offset 0; COM → tn_38
//   A wire end on PS1 or FG1 may be written by pin name or index (PS1.pos or
//   PS1.0): the tests compare names.

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

const LAB = 'ensc-lab';   // issue #16

// Every sample with a board, leds-buttons and ensc-lab always among them (so
// their tests run, and fail, before they exist).
const BOARD_IDS = [...new Set([ID, LAB, ...Object.entries(loadSamples()).filter(([, s]) => s.board).map(([id]) => id)])];

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

// ── ensc-lab (issue #16) ───────────────────────────────────────────────────

test('ensc-lab is offered, titled "ENSC 220 lab bench", its photo samples/ensc-lab.jpg on disk (a JPEG of its own) and its credit naming Aarmen', () => {
  const samples = loadSamples();
  const s = samples[LAB];
  assert.ok(s, `PhotoSamples has '${LAB}': got ${JSON.stringify(Object.keys(samples))}`);
  assert.notEqual(s.offered, false, `${LAB} is offered on the picker`);
  assert.equal(s.title, 'ENSC 220 lab bench', `${LAB}'s tile title`);
  assert.equal(s.file, 'samples/ensc-lab.jpg');
  const file = path.join(CIRCUIT3D, s.file);
  assert.ok(fs.existsSync(file), `circuit3d/${s.file} exists`);
  const bytes = fs.readFileSync(file);
  assert.ok(bytes.length > 1000 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff, `circuit3d/${s.file} is a JPEG`);
  for (const [id, o] of Object.entries(samples)) {
    if (id === LAB || !o.file || !fs.existsSync(path.join(CIRCUIT3D, o.file))) continue;
    assert.ok(!bytes.equals(fs.readFileSync(path.join(CIRCUIT3D, o.file))), `${LAB}'s photo is its own, not a copy of ${id}'s ${o.file}`);
  }
  assert.ok(String(s.credit || '').includes('Aarmen'), `${LAB}.credit names Aarmen: ${JSON.stringify(s.credit)}`);
});

// A wire end with an off-board part's pin by name: PS1.0 and PS1.pos are the
// same end (the page's own add_wire takes either).
function endName(board, end) {
  const m = /^([A-Z]+\d+)\.(\w+)$/.exec(String(end));
  const part = m && board.parts.find(p => p.label === m[1]);
  if (!part) return String(end);
  const pins = Parts.get(part.type).pins;
  return `${m[1]}.${/^\d+$/.test(m[2]) ? pins[Number(m[2])] : m[2]}`;
}

const LAB_WIRES = [['PS1.pos', 'tp_1'], ['PS1.com', 'tn_1'], ['PS1.com2', 'tn_2'], ['PS1.neg', 'bn_1'], ['tn_3', 'bp_3'],
                   ['d57', 'tp_58'], ['j60', 'bn_60'],                               // U1's V+ and V−
                   ['tp_29', 'a29'], ['bp_29', 'j29'],                               // the divider's ends
                   ['c34', 'd40'], ['e40', 'f41'], ['i33', 'h41'], ['g41', 'h58'],   // its node to IN1−
                   ['FG1.com', 'tn_38'], ['FG1.out', 'f55']];                       // the generator, into R3

test('ensc-lab is exactly U1 (a TL072 at f57, facing right), PS1 at 12 V, FG1 (a 5 V, 1 Hz sine, offset 0) and R1 10 kΩ, R2 470 Ω, R3 470 Ω at their holes, plus its 15 wires', () => {
  const board = built(LAB);
  const values = Object.fromEntries(board.parts.map(p => [p.label, p.values || {}]));
  // U1 in pin order (OUT1 IN1− IN1+ V− IN2+ IN2− OUT2 V+); a resistor's holes sorted.
  const got  = board.parts.map(p => [p.label, p.type, p.type === 'tl072' ? p.holes : sorted(p.holes || [])]);
  const want = [['U1', 'tl072', ['f57', 'f58', 'f59', 'f60', 'e60', 'e59', 'e58', 'e57']],
                ['PS1', 'bench_supply', []], ['FG1', 'function_generator', []],
                ['R1', 'resistor', ['d29', 'd34']], ['R2', 'resistor', ['h29', 'h33']], ['R3', 'resistor', ['g55', 'g59']]];
  const byLabel = list => list.slice().sort((x, y) => x[0].localeCompare(y[0]));
  assert.deepStrictEqual(byLabel(got), byLabel(want), 'the parts, by label: [label, type, holes]');

  assert.equal(Number(values.R1.resistance), 10000, 'R1 is 10 kΩ');
  assert.equal(Number(values.R2.resistance), 470, 'R2 is 470 Ω');
  assert.equal(Number(values.R3.resistance), 470, 'R3 is 470 Ω');
  assert.equal(Number(values.PS1.voltage), 12, 'PS1 is set to 12 V');
  assert.deepStrictEqual({ amplitude: Number(values.FG1.amplitude), frequency: Number(values.FG1.frequency), offset: Number(values.FG1.offset) },
    { amplitude: 5, frequency: 1, offset: 0 }, 'FG1 is a 5 V, 1 Hz sine with no offset');

  assert.deepStrictEqual(sorted(board.wires.map(w => pair(endName(board, w.from), endName(board, w.to)))),
    sorted(LAB_WIRES.map(([a, b]) => pair(a, b))), 'the wires, ends by pin name');
});

// The board solved once (a plain solve: FG1 reads its offset).
function solveLab(actions) {
  const { board, errors } = Board.apply(Board.empty(), actions);
  assert.deepStrictEqual(errors, [], `Board.apply errors: ${JSON.stringify(errors)}`);
  const sim = Board.toSim(board);
  const r = Sim.analyze(sim.components, sim.wires);
  assert.equal(r.status, 'ok', `status ${r.status}; ${(r.lines || []).map(l => l.text).join(' | ')}`);
  assert.ok(r.parts.U1 && r.parts.R1 && r.parts.R2, `U1, R1 and R2 solved: got ${JSON.stringify(Object.keys(r.parts))}`);
  return r;
}

// Hand calculation. PS1 in series puts tp at +12 V and bn at −12 V against
// COM (tn), and tn_3 → bp_3 puts bp on ground too. R1 (10 kΩ) from +12 V and
// R2 (470 Ω) to ground in series; IN1− draws nothing (JFET inputs), so
//   I(R1) = I(R2) = 12 / 10 470 = 1.1461 mA
//   IN1−  = 12 · 470 / 10 470   = 0.5387 V
const SUPPLY   = 12;
const DIV_MA   = SUPPLY / (10000 + 470) * 1000;   // 1.1461 mA
const DIV_V    = SUPPLY * 470 / (10000 + 470);    // 0.5387 V

test('ensc-lab: R1 carries 12 V / 10.47 kΩ ≈ 1.146 mA, the divider puts IN1− (U1 pin 2) at 12·470/10 470 ≈ 0.539 V, and U1 sits on ±12 V', () => {
  const r = solveLab(boardOf(LAB));
  assert.ok(Math.abs(r.parts.R1.m.current - DIV_MA) < 0.001, `R1: expected ${DIV_MA.toFixed(4)} mA, got ${r.parts.R1.m.current}`);
  assert.ok(Math.abs(r.parts.R2.m.current - DIV_MA) < 0.001, `R2 carries R1's current (IN1− draws none): expected ${DIV_MA.toFixed(4)} mA, got ${r.parts.R2.m.current}`);
  const pins = r.parts.U1.r.pins;
  assert.ok(typeof pins.in1n === 'number' && Math.abs(pins.in1n - DIV_V) < 0.005, `IN1−: expected ${DIV_V.toFixed(4)} V, got ${pins.in1n}`);
  assert.ok(Math.abs(pins.vpos - SUPPLY) < 0.01, `V+ (pin 8) on +12 V, got ${pins.vpos}`);
  assert.ok(Math.abs(pins.vneg + SUPPLY) < 0.01, `V− (pin 4) on −12 V, got ${pins.vneg}`);
});

// The comparator, on a copy of the board with FG1 held at a DC level
// (amplitude 0, offset = the level). IN1+ = the offset: no input current,
// so no drop across the generator's 50 Ω or R3. Open loop (gain 200 000),
// OUT1 sits at a clip, HEADROOM (1.5 V, parts/tl072.js) inside its rails:
//   IN1+ below 0.5387 V → V− + 1.5 = −10.5 V
//   IN1+ above 0.5387 V → V+ − 1.5 = +10.5 V
// OUT1 drives nothing (column 57 f–j holds only pin 1), so no drop across
// its 50 Ω. 0.5 V and 0.6 V bracket the reference, so the threshold is the
// divider's, not ground's.
const HEADROOM = Parts.get('tl072').elements()[0].headroom;
const CLIP     = SUPPLY - HEADROOM;   // 10.5 V
const LEVELS = [
  [0,   'below', -CLIP, 'low'],
  [0.5, 'below', -CLIP, 'low'],
  [0.6, 'above', +CLIP, 'high'],
  [1,   'above', +CLIP, 'high'],
];

test.each(LEVELS)('ensc-lab as a comparator: FG1 at %s V DC (%s IN1− ≈ 0.539 V) puts OUT1 at %s V, the clip', (offset, side, vout, mode) => {
  const own = boardOf(LAB);
  const before = JSON.stringify(own);
  const fg = own.filter(a => a.tool === 'place_function_generator');
  assert.equal(fg.length, 1, `${LAB} places one function generator`);
  const copy = own.map(a => (a.tool === 'place_function_generator' ? { ...a, amplitude: 0, offset } : a));

  const r = solveLab(copy);
  const pins = r.parts.U1.r.pins, m = r.parts.U1.m;
  assert.ok(Math.abs(pins.in1p - offset) < 0.005, `IN1+ follows FG1: expected ${offset} V, got ${pins.in1p}`);
  assert.ok(Math.abs(pins.in1n - DIV_V) < 0.005, `IN1− stays at the divider's ${DIV_V.toFixed(4)} V, got ${pins.in1n}`);
  assert.ok(typeof m.vout1 === 'number' && Math.abs(m.vout1 - vout) < 0.01, `FG1 at ${offset} V (${side}): OUT1 expected ${vout} V, got ${m.vout1}`);
  assert.equal(m.mode1, mode, `FG1 at ${offset} V: op-amp 1 clipped ${mode}`);
  assert.equal(JSON.stringify(own), before, 'the sample\'s own board is not changed');
});
