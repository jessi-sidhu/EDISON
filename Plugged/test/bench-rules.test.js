// The bench's rules, issue #197: at most one bench supply, one function
// generator and two multimeters on the board, and every off-board part its
// own spot, never stacked.
//
// Shapes these tests assume (stated so the builder matches them):
// - circuit3d/js/bench.js, a pure module (Node: module.exports; browser:
//   window.Bench), loaded before app.js:
//     Bench.LIMITS = { bench_supply: 1, function_generator: 1, multimeter: 2 }
//     Bench.refusal(type, components) → why the bench can't take one more of
//       `type`, or null. components: records with { type, label }.
//       "the bench has one bench supply; use PS1's two channels"
//       "the bench has one function generator; use FG1"
//       "the bench has two multimeters; use MM1 or MM2"
//     Bench.spotsOf(components) → [{ x, z }]: where the off-board ones stand
//       (a page record's group.position, or a plain record's position).
//     Bench.spotFor(type, taken, batterySpot) → { x, z }: the next free spot.
//       A battery takes batterySpot while it is free; every other off-board
//       part goes in front of the board (z ≥ BOARD_D / 2 + BATTERY_MARGIN,
//       App.offboardSpot's front zone, so it lands there as is), clear of
//       every spot in `taken`.
// - chat.js's place_<offboard> (placeOne): a part over the limit places
//   nothing, counts as failed, and notes "<label> not placed: <why>"; any
//   other goes to board.placePart(type, Bench.spotFor(type, the board's
//   off-board spots, board.batterySpot()), values).
// - Chat.predictSpots(actions, components, batterySpot) → one entry per
//   action: the { x, z } Accept will put that off-board part at, or null
//   (not an off-board place, or refused). delete_all empties the board and
//   delete_part takes its part out, as for Chat.predictLabels. The preview
//   draws each off-board ghost there.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const Chat   = require('../circuit3d/js/chat.js');
const Ids    = require('../circuit3d/js/ids.js');
const G      = require('../circuit3d/js/board-geometry.js');

// Required inside each test: it doesn't exist until #197 is built.
const Bench = () => require('../circuit3d/js/bench.js');

const MARGIN  = 2.5;                                   // App.BATTERY_MARGIN
const FRONT_Z = G.BOARD_D / 2 + MARGIN;                // App.offboardSpot's front zone starts here
const BATTERY = { x: G.BOARD_W / 2 + MARGIN, z: (G.ROW_Z.tp + G.ROW_Z.tn) / 2 };   // App.batterySpot()

// Each off-board model's footprint around its spot (x half-width, z from
// its back to its front), measured from the models in the page with
// THREE.Box3 (2026-10-03). Two parts overlap when their footprints do.
const FOOTPRINT = {
  battery:            { hw: 1.01, back: -0.66, front: 0.66 },
  bench_supply:       { hw: 1.42, back: -1.85, front: 0.35 },
  function_generator: { hw: 1.37, back: -1.60, front: 0.35 },
  multimeter:         { hw: 1.25, back: -1.82, front: 1.82 },
};
const box = (type, at) => {
  const f = FOOTPRINT[type];
  return { type, x0: at.x - f.hw, x1: at.x + f.hw, z0: at.z + f.back, z1: at.z + f.front };
};
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

// A board that keeps its parts the way App does: placePart records the part
// with its label and, off the board, the spot it was put at.
function benchBoard(parts = []) {
  const notes = [];
  const placed = [];
  return {
    notes, placed,
    note: text => notes.push(text),
    components: () => parts,
    batterySpot: () => ({ ...BATTERY }),
    holeMap: () => new Map(),
    parseHole: s => {
      const m = /^([a-j])(\d+)$/.exec(s);
      if (!m) throw new Error('parseHole: unrecognised hole address: ' + s);
      return { row: m[1], col: +m[2] - 1 };
    },
    getHole: (col, row) => ({ col, row }),
    placePart(type, where, values) {
      const rec = { type, label: Ids.nextLabel(parts, type), values,
                    holeRefs: Array.isArray(where) ? where : null,
                    position: Array.isArray(where) ? null : { x: where.x, z: where.z } };
      parts.push(rec);
      placed.push(rec);
      return rec;
    },
    clearAll: () => { parts.length = 0; },
    deletePart: comp => { parts.splice(parts.indexOf(comp), 1); },
    addWire: () => true,
    batch: fn => fn(),
  };
}

const place = type => ({ tool: 'place_' + type });

// ── The limits ────────────────────────────────────────────────

test('Bench.LIMITS: one bench supply, one function generator, two multimeters; nothing else is limited', () => {
  assert.deepStrictEqual(Bench().LIMITS, { bench_supply: 1, function_generator: 1, multimeter: 2 });
  const lots = Array.from({ length: 4 }, (_, i) => ({ type: 'battery', label: `BAT${i + 1}` }));
  assert.equal(Bench().refusal('battery', lots), null, 'a battery is never refused');
  assert.equal(Bench().refusal('resistor', [{ type: 'resistor', label: 'R1' }]), null);
});

test('Bench.refusal says why, naming the part already on the bench', () => {
  const B = Bench();
  assert.equal(B.refusal('bench_supply', []), null);
  assert.equal(B.refusal('bench_supply', [{ type: 'bench_supply', label: 'PS1' }]),
    "the bench has one bench supply; use PS1's two channels");
  assert.equal(B.refusal('function_generator', [{ type: 'function_generator', label: 'FG1' }]),
    'the bench has one function generator; use FG1');
  assert.equal(B.refusal('multimeter', [{ type: 'multimeter', label: 'MM1' }]), null, 'a second meter is fine');
  assert.equal(B.refusal('multimeter', [{ type: 'multimeter', label: 'MM1' }, { type: 'multimeter', label: 'MM2' }]),
    'the bench has two multimeters; use MM1 or MM2');
});

test('an AI build with two place_bench_supply places one and notes the other: "PS2 not placed: …; use PS1\'s two channels"', () => {
  const board = benchBoard();
  const out = Chat.applyActions([{ tool: 'place_bench_supply', voltage: 12 }, { tool: 'place_bench_supply', voltage: 5 }], board);
  assert.deepEqual(out, { applied: 1, failed: 1 });
  assert.deepEqual(board.placed.map(p => p.label), ['PS1']);
  assert.equal(board.placed[0].values.voltage, 12, 'the first one is the one placed');
  assert.deepEqual(board.notes, ["PS2 not placed: the bench has one bench supply; use PS1's two channels"]);
});

test('a second function generator and a third multimeter are refused the same way; a supply already on the board counts', () => {
  const fg = benchBoard();
  assert.deepEqual(Chat.applyActions([place('function_generator'), place('function_generator')], fg), { applied: 1, failed: 1 });
  assert.deepEqual(fg.notes, ['FG2 not placed: the bench has one function generator; use FG1']);

  const mm = benchBoard();
  assert.deepEqual(Chat.applyActions([place('multimeter'), place('multimeter'), place('multimeter')], mm), { applied: 2, failed: 1 });
  assert.deepEqual(mm.placed.map(p => p.label), ['MM1', 'MM2']);
  assert.deepEqual(mm.notes, ['MM3 not placed: the bench has two multimeters; use MM1 or MM2']);

  const ps = benchBoard([{ type: 'bench_supply', label: 'PS1', position: { x: -4, z: 9 } }]);
  assert.deepEqual(Chat.applyActions([place('bench_supply')], ps), { applied: 0, failed: 1 });
  assert.deepEqual(ps.notes, ["PS2 not placed: the bench has one bench supply; use PS1's two channels"]);

  const fresh = benchBoard([{ type: 'bench_supply', label: 'PS1', position: { x: -4, z: 9 } }]);
  assert.deepEqual(Chat.applyActions([{ tool: 'delete_all' }, place('bench_supply')], fresh), { applied: 2, failed: 0 },
    'after delete_all the bench is empty again');
});

// ── A spot each, never stacked ────────────────────────────────

// Where home's camera sees a point, in normalised device coordinates, for a
// canvas `aspect` wide: |x|, |y| ≤ 1 is on screen. The view is App.CAMERA.home
// as scene.js writes it, with the camera's 42° vertical fov.
function homeNdc(p, aspect) {
  const scene = fs.readFileSync(path.join(__dirname, '..', 'circuit3d/js/scene.js'), 'utf8');
  const view = /home:\s*\{\s*pos:\s*\[([^\]]+)\],\s*target:\s*\[([^\]]+)\]/.exec(scene);
  const fov  = Number(/PerspectiveCamera\(\s*([\d.]+)/.exec(scene)[1]);
  const [pos, target] = [view[1], view[2]].map(s => s.split(',').map(Number));
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = a => { const n = Math.hypot(...a); return a.map(v => v / n); };
  const f = unit(sub(target, pos)), r = unit(cross(f, [0, 1, 0])), u = cross(r, f);
  const d = sub(p, pos), t = Math.tan(fov * Math.PI / 360);
  return { x: dot(d, r) / (dot(d, f) * t * aspect), y: dot(d, u) / (dot(d, f) * t), depth: dot(d, f) };
}

const FULL_BENCH = [
  { tool: 'delete_all' },
  place('battery'), place('bench_supply'), place('function_generator'), place('multimeter'), place('multimeter'),
];

test('a full bench from the AI: the battery at App.batterySpot(), every instrument in front of the board, no two overlapping', () => {
  const board = benchBoard();
  assert.deepEqual(Chat.applyActions(FULL_BENCH, board), { applied: 6, failed: 0 }, JSON.stringify(board.notes));
  const at = Object.fromEntries(board.placed.map(p => [p.label, p.position]));
  assert.deepEqual(at.BAT1, BATTERY, 'the AI battery keeps its spot behind the top rails');
  for (const label of ['PS1', 'FG1', 'MM1', 'MM2']) {
    assert.ok(at[label].z >= FRONT_Z, `${label} is in front of the board (z ${at[label].z} ≥ ${FRONT_Z}), where App.offboardSpot leaves it`);
  }
  const boxes = board.placed.map(p => box(p.type, p.position));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      assert.ok(!overlaps(boxes[i], boxes[j]),
        `${board.placed[i].label} and ${board.placed[j].label} overlap: ${JSON.stringify(boxes[i])} ${JSON.stringify(boxes[j])}`);
    }
  }
});

test("every instrument the AI places is on screen from App.CAMERA.home, even on a square canvas (Edison's at 1440 × 900)", () => {
  const board = benchBoard();
  Chat.applyActions(FULL_BENCH, board);
  for (const p of board.placed.filter(q => q.type !== 'battery')) {
    const b = box(p.type, p.position);
    for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) for (const y of [0, 1.6]) {
      const s = homeNdc([x, y, z], 1.0);
      assert.ok(s.depth > 0 && Math.abs(s.x) <= 0.95 && Math.abs(s.y) <= 0.95,
        `${p.label}'s corner (${x.toFixed(2)}, ${y}, ${z.toFixed(2)}) is off screen at home: ${JSON.stringify(s)}`);
    }
  }
});

test('a second AI battery, with the first on App.batterySpot(), goes to a free spot of its own', () => {
  const board = benchBoard();
  Chat.applyActions([place('battery'), place('battery')], board);
  const [a, b] = board.placed;
  assert.deepEqual(a.position, BATTERY);
  assert.ok(!overlaps(box('battery', a.position), box('battery', b.position)), `BAT2 stacked on BAT1: ${JSON.stringify(b.position)}`);
});

test('parts already on the bench (placed by hand anywhere) are kept clear of: an AI instrument never lands on one', () => {
  // A hand-placed meter on every spot an AI instrument would take on an empty bench.
  const empty = benchBoard();
  Chat.applyActions(FULL_BENCH, empty);
  for (const target of empty.placed.filter(p => p.type !== 'battery')) {
    const hand = { type: 'multimeter', label: 'MM1', position: { ...target.position } };
    const board = benchBoard([hand]);
    Chat.applyActions([place(target.type)], board);
    const got = board.placed[0];
    assert.ok(got, `${target.type} placed beside the hand-placed meter: ${JSON.stringify(board.notes)}`);
    assert.ok(!overlaps(box('multimeter', hand.position), box(got.type, got.position)),
      `${got.label} at ${JSON.stringify(got.position)} lands on the hand-placed meter at ${JSON.stringify(hand.position)}`);
  }
  // A meter hand-placed on App.batterySpot(): the AI battery goes elsewhere.
  const board = benchBoard([{ type: 'multimeter', label: 'MM1', position: { ...BATTERY } }]);
  Chat.applyActions([place('battery')], board);
  assert.ok(!overlaps(box('multimeter', BATTERY), box('battery', board.placed[0].position)), 'BAT1 stacked on MM1');
});

test('Bench.spotsOf reads a page record\'s group.position or a plain record\'s position, off-board parts only', () => {
  const spots = Bench().spotsOf([
    { type: 'battery', label: 'BAT1', group: { position: { x: 15.8, y: -0.4, z: -3.15 } } },
    { type: 'multimeter', label: 'MM1', position: { x: 4, z: 9 } },
    { type: 'resistor', label: 'R1', group: { position: { x: 0, y: 0, z: 0 } }, holeRefs: [] },
    { type: 'bench_supply', label: 'PS1' },   // no spot known: left out
  ]);
  assert.deepEqual(spots, [{ x: 15.8, z: -3.15 }, { x: 4, z: 9 }]);
});

// ── The preview stands where Accept puts it ──────────────────

test('Chat.predictSpots gives each off-board place the spot Accept uses, null for the rest and for a refused one', () => {
  const start = [{ type: 'multimeter', label: 'MM1', position: { x: 3, z: 8 } },
                 { type: 'resistor', label: 'R1', holeRefs: [] }];
  const actions = [
    place('bench_supply'), { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
    place('bench_supply'),                                   // refused: PS1 is on the bench
    place('multimeter'), place('multimeter'),                // MM2 fits, MM3 is refused
    place('battery'), place('function_generator'), place('battery'),
    { tool: 'delete_part', part: 'PS1' }, place('bench_supply'),   // PS1 gone: room again
  ];
  const predicted = Chat.predictSpots(actions, start.map(c => ({ ...c })), { ...BATTERY });
  // Accept, one action at a time: the spot each off-board place really took.
  const board = benchBoard(start.map(c => ({ ...c })));
  const accepted = actions.map(a => {
    const n = board.placed.length;
    Chat.applyActions([a], board);
    const rec = board.placed[n];
    return rec && !rec.holeRefs ? rec.position : null;
  });
  assert.deepEqual(predicted, accepted);
  assert.deepEqual(predicted.map(Boolean), [true, false, false, true, false, true, true, true, false, true]);
});

test('Chat.predictSpots starts again after delete_all, as Accept does', () => {
  const start = [{ type: 'bench_supply', label: 'PS1', position: { x: -4, z: 9 } }];
  const spots = Chat.predictSpots([{ tool: 'delete_all' }, place('bench_supply')], start, { ...BATTERY });
  assert.equal(spots[0], null);
  assert.ok(spots[1] && spots[1].z >= FRONT_Z, `after delete_all PS1 is placed again, in front: ${JSON.stringify(spots[1])}`);
});

// Every worked build the AI is shown (a part's ai.recipe and ai.recipes) is
// one the bench can hold: the model copies these, and a build over the limits
// is refused by the server and taken back at Accept (#199). No guide names a
// second supply or generator or a third meter either.
test('every registry recipe stays within Bench.LIMITS, and no ai.guide names PS2, FG2 or MM3', () => {
  const PartsAll = require('../circuit3d/js/parts');
  const BenchMod = require('../circuit3d/js/bench.js');
  const over = [];
  for (const def of PartsAll.all()) {
    const ai = def.ai || {};
    const recipes = [ai.recipe, ...(Array.isArray(ai.recipes) ? ai.recipes : [])].filter(Boolean);
    recipes.forEach((r, i) => {
      for (const [type, max] of Object.entries(BenchMod.LIMITS)) {
        const n = (r.parts || []).filter(p => p.type === type).length;
        if (n > max) over.push(`${def.type} recipe ${i}: ${n} × ${type} (max ${max})`);
      }
    });
    if (/\b(PS2|FG2|MM3)\b/.test(ai.guide || '')) over.push(`${def.type} guide names ${ai.guide.match(/\b(PS2|FG2|MM3)\b/)[0]}`);
  }
  assert.deepStrictEqual(over, []);
});
