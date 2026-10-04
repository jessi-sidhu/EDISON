// Footprint placement, issue #28: parts with 3 or more legs, placed from an
// anchor hole plus a rotation, and chips that straddle the centre gap.
// docs/API-CONTRACT.md → "Placement", "Legs and the hole map",
// "Parts.checkPlacement" (edge and straddle messages) and "AI tools"
// (footprint parts: place_<type> { hole, direction }).
//
// The parts here are test-only fixtures (test/fixtures/parts/test_three.js
// and test_chip.js), never loaded by the app. They are defined on top of the
// real parts BEFORE server.js is required, since the server builds its tools
// from Parts.all() when it loads. Vitest runs each test file in its own
// module registry, so they don't leak into other files.
//
// Shapes these tests assume (the issue's decisions comment; stated so the
// builder matches them):
// - Parts.footprintLegs(type, anchor, rotation) → [{ pin, col, row }], one per
//   pin in pin order. Pure, in parts/registry.js.
//     anchor:   a body hole name, e.g. 'a10' (pin 0 goes there).
//     rotation: one of the part's place.rotations (0, 90, 180, 270).
//     col:      0-based, as Parts.legsOf gives it ('a10' → col 9).
//     row:      'a'..'j'. A leg past row a or j still comes back, with a row
//               that is not a–j; a leg past column 1 or 63 comes back with
//               col < 0 or col ≥ 63. checkPlacement then refuses them.
//   Legs may carry extra fields (e.g. `hole`); only pin, col, row are read.
//   A rotation not in the part's place.rotations gives null (not legs).
// - Rotation turns the offsets clockwise as seen on the board (+col = right,
//   +row = toward row j): 0: (dc, dr), 90: (−dr, dc), 180: (−dc, −dr),
//   270: (dr, −dc). The AI's direction: right = 0, down = 90, left = 180,
//   up = 270.
// - chat.js: place_<footprint type> { hole, direction } → footprintLegs →
//   Parts.checkPlacement against board.holeMap() → board.placePart(type,
//   where, values), where = board.getHole(col, row) per leg, in pin order.
//   A refusal (edge, straddle, taken hole, or a direction the part can't
//   face) places nothing, counts as failed, and gives one board.note.
// - server.js: finishAIReply (and the DeepSeek loop, through the same
//   placementRefusal) checks footprint actions the same way, and puts every
//   leg of a kept footprint part into the hole map later actions are checked
//   against. Labels after a delete_all use the part's prefix (TT1, TC1).
// - A placed footprint record saves one holeRef per pin with its pin name
//   (board-io saveHoleRefs) and loads back to the same legs; no rotation
//   field is saved.

const assert = require('node:assert');
const http   = require('node:http');

process.env.AI_PROVIDER     = 'deepseek';   // the tool loop below; finishAIReply runs for every provider
process.env.RECORD_FIXTURES = '0';

const Parts     = require('../circuit3d/js/parts');
const testThree = require('./fixtures/parts/test_three.js');
const testChip  = require('./fixtures/parts/test_chip.js');
if (!Parts.get('test_three')) Parts.define(testThree());
if (!Parts.get('test_chip'))  Parts.define(testChip());

const Server  = require('../backend/server.js');
const Chat    = require('../circuit3d/js/chat.js');
const BoardIO = require('../circuit3d/js/board-io.js');
const Sim     = require('../circuit3d/js/simulate.js');
const Ids     = require('../circuit3d/js/ids.js');
const Recipes = require('./fixtures/recipes.js');

const N     = Recipes.HIGHEST_COL;   // 63
const BOARD = { cols: N, bodyRows: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] };
const ROWS  = BOARD.bodyRows;

// ── Helpers ───────────────────────────────────────────────────────────────

function footprintLegs(type, anchor, rotation) {
  assert.equal(typeof Parts.footprintLegs, 'function',
    'parts/registry.js must export Parts.footprintLegs(type, anchor, rotation) → [{ pin, col, row }]');
  return Parts.footprintLegs(type, anchor, rotation);
}

// "a10" for a leg on the board, else "?<col>,<row>" so off-board legs still print.
const name = l => (ROWS.includes(l.row) && l.col >= 0 && l.col < N ? l.row + (l.col + 1) : `?${l.col},${l.row}`);
const names = legs => legs.map(name);
const pinsOf = legs => legs.map(l => l.pin);
const bare = legs => legs.map(l => ({ pin: l.pin, col: l.col, row: l.row }));

// "a2" → { col: 1, row: 'a' }; "tp_50" → { col: 49, row: 'tp' }; else null.
function holeRef(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  if (!m) return null;
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}

const place = (type, legs, holeMap = new Map()) => Parts.checkPlacement(type, legs, holeMap, BOARD);

// ── footprintLegs: test_three (pins in, gnd, out; legs [0,0] [1,0] [2,0]) ──

describe('footprintLegs for test_three at a10', () => {
  test('rotation 0 (right): a10 a11 a12, pins in, gnd, out', () => {
    const legs = footprintLegs('test_three', 'a10', 0);
    assert.ok(Array.isArray(legs), `expected a list of legs, got ${JSON.stringify(legs)}`);
    assert.deepStrictEqual(bare(legs), [
      { pin: 'in', col: 9, row: 'a' }, { pin: 'gnd', col: 10, row: 'a' }, { pin: 'out', col: 11, row: 'a' },
    ]);
  });

  test('rotation 90 (down, toward row j): a10 b10 c10', () => {
    const legs = footprintLegs('test_three', 'a10', 90);
    assert.deepStrictEqual(names(legs), ['a10', 'b10', 'c10']);
    assert.deepStrictEqual(pinsOf(legs), ['in', 'gnd', 'out']);
  });

  test('rotation 180 (left): a10 a9 a8', () => {
    const legs = footprintLegs('test_three', 'a10', 180);
    assert.deepStrictEqual(names(legs), ['a10', 'a9', 'a8']);
    assert.deepStrictEqual(pinsOf(legs), ['in', 'gnd', 'out']);
  });

  test('rotation 270 (up): a10, then two legs above row a, returned anyway and refused by checkPlacement', () => {
    const legs = footprintLegs('test_three', 'a10', 270);
    assert.ok(Array.isArray(legs) && legs.length === 3, `3 legs even off the board, got ${JSON.stringify(legs)}`);
    assert.deepStrictEqual(bare(legs)[0], { pin: 'in', col: 9, row: 'a' });
    for (const l of legs.slice(1)) {
      assert.equal(l.col, 9, `leg ${l.pin} stays in column 10: ${JSON.stringify(l)}`);
      assert.ok(!ROWS.includes(l.row), `leg ${l.pin} is above row a, not in a–j: ${JSON.stringify(l)}`);
    }
    assert.equal(place('test_three', legs).ok, false, 'checkPlacement refuses legs above row a');
  });

  test('rotation 90 at e30 runs down across the gap: e30 f30 g30, and checkPlacement allows it', () => {
    const legs = footprintLegs('test_three', 'e30', 90);
    assert.deepStrictEqual(names(legs), ['e30', 'f30', 'g30']);
    assert.deepStrictEqual(place('test_three', legs), { ok: true });
  });
});

// ── checkPlacement with footprint legs ────────────────────────────────────

describe('checkPlacement with footprintLegs', () => {
  test('test_three at a10 facing right is allowed', () => {
    assert.deepStrictEqual(place('test_three', footprintLegs('test_three', 'a10', 0)), { ok: true });
  });

  test('at the last column (63) facing right it is refused as running past column 63', () => {
    const legs = footprintLegs('test_three', 'a63', 0);
    assert.deepStrictEqual(legs.map(l => l.col), [62, 63, 64], 'legs run past the edge and are still returned');
    const r = place('test_three', legs);
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('at column 63 would run past column 63'), `edge message naming the column: "${r.reason}"`);
  });

  test('at column 62 facing right it is refused too, naming column 62', () => {
    const r = place('test_three', footprintLegs('test_three', 'a62', 0));
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('at column 62 would run past column 63'), `"${r.reason}"`);
  });

  test('at column 1 facing left it is refused as running past column 1', () => {
    const legs = footprintLegs('test_three', 'a1', 180);
    assert.deepStrictEqual(legs.map(l => l.col), [0, -1, -2]);
    const r = place('test_three', legs);
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('would run past column 1'), `"${r.reason}"`);
  });

  test('on a taken hole it is refused, naming the occupant by label and pin', () => {
    const map = new Map([['a11', { label: 'R1', pin: 'lead2' }]]);
    const r = place('test_three', footprintLegs('test_three', 'a10', 0), map);
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes("a11 already holds R1's pin lead2"), `"${r.reason}"`);
  });

  test('a rotation not in place.rotations gives no legs: test_chip allows only 0 and 180', () => {
    for (const rot of [90, 270, 45]) {
      assert.equal(footprintLegs('test_chip', 'e20', rot), null, `test_chip at rotation ${rot} must give null`);
    }
    assert.equal(footprintLegs('test_three', 'a10', 45), null, 'test_three has no 45° rotation');
  });
});

// ── test_chip: 8-pin DIP across the centre gap ────────────────────────────

describe('test_chip', () => {
  test('at e20, rotation 0: e20 e21 e22 e23 f23 f22 f21 f20, pins p1..p8, and it is allowed', () => {
    const legs = footprintLegs('test_chip', 'e20', 0);
    assert.deepStrictEqual(names(legs), ['e20', 'e21', 'e22', 'e23', 'f23', 'f22', 'f21', 'f20']);
    assert.deepStrictEqual(pinsOf(legs), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
    assert.deepStrictEqual(place('test_chip', legs), { ok: true });
  });

  test('at f23, rotation 180: the mirror, pin 1 in row f: f23 f22 f21 f20 e20 e21 e22 e23, allowed', () => {
    const legs = footprintLegs('test_chip', 'f23', 180);
    assert.deepStrictEqual(names(legs), ['f23', 'f22', 'f21', 'f20', 'e20', 'e21', 'e22', 'e23']);
    assert.deepStrictEqual(pinsOf(legs), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
    assert.deepStrictEqual(place('test_chip', legs), { ok: true });
  });

  test('anchored at a20 it is refused with the straddle message', () => {
    const legs = footprintLegs('test_chip', 'a20', 0);
    assert.deepStrictEqual(names(legs), ['a20', 'a21', 'a22', 'a23', 'b23', 'b22', 'b21', 'b20']);
    const r = place('test_chip', legs);
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('a chip must sit across the centre gap (rows e and f).'), `"${r.reason}"`);
  });

  test('anchored at f20 facing right (rows f and g) it is refused with the straddle message', () => {
    const r = place('test_chip', footprintLegs('test_chip', 'f20', 0));
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('rows e and f'), `"${r.reason}"`);
  });

  test('at e62 it is refused as an 8-pin chip running past column 63', () => {
    const r = place('test_chip', footprintLegs('test_chip', 'e62', 0));
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('8-pin'), `"${r.reason}"`);
    assert.ok(r.reason.includes('at column 62 would run past column 63'), `"${r.reason}"`);
  });

  test('rotation 90 is not allowed', () => {
    assert.equal(footprintLegs('test_chip', 'e20', 90), null);
  });

  // Review fix: a chip with legs past row a or j breaks the straddle rule
  // (decision 4: "any leg outside rows e/f gets the straddle message"), so it
  // gets the straddle message, not the row-edge one.
  for (const [anchor, rot] of [['j20', 0], ['a20', 180]]) {
    test(`at ${anchor} rotation ${rot} (legs off the ${anchor[0] === 'j' ? 'bottom' : 'top'} edge) it is refused with the straddle message`, () => {
      const r = place('test_chip', footprintLegs('test_chip', anchor, rot));
      assert.equal(r.ok, false);
      assert.ok(r.reason.includes('a chip must sit across the centre gap (rows e and f).'),
        `expected the straddle message, got "${r.reason}"`);
    });
  }
});

describe('a footprint part (not a chip) past row a or j', () => {
  test('test_three at b10 rotation 270 is refused with the row-edge message, "would run past row a"', () => {
    const r = place('test_three', footprintLegs('test_three', 'b10', 270));
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('would run past row a'), `expected the row-edge message, got "${r.reason}"`);
  });
});

// ── Round trip: save one holeRef per pin, load back the same legs ─────────

describe('a placed footprint record round-trips', () => {
  const record = (type, label, legs) => ({
    type, label, values: {}, holeRefs: legs.map(l => ({ col: l.col, row: l.row })), pins: legs.map(() => ({})),
  });

  for (const [type, label, anchor, rot] of [['test_three', 'TT1', 'e30', 90], ['test_chip', 'TC1', 'e20', 0], ['test_chip', 'TC2', 'f45', 180]]) {
    test(`${type} at ${anchor} rotation ${rot}: saveHoleRefs names every pin, and loading gives the same legs`, () => {
      const legs = footprintLegs(type, anchor, rot);
      const comp = record(type, label, legs);
      const saved = BoardIO.saveHoleRefs(comp);
      assert.deepStrictEqual(saved, bare(legs), 'one { pin, col, row } per pin, in pin order; no rotation field');

      const loaded = { type, label, values: {}, holeRefs: BoardIO.loadHoleRefs({ type, label, holeRefs: saved }) };
      assert.deepStrictEqual(bare(Parts.legsOf(loaded)), bare(legs), 'the reopened record has the same legs');

      const map = BoardIO.buildHoleMap([comp], []);
      const mine = [...map.entries()].filter(([, o]) => o.label === label);
      assert.equal(mine.length, Parts.get(type).pins.length, `the hole map holds all ${legs.length} legs`);
      for (const l of legs) assert.deepStrictEqual(map.get(name(l)), { label, pin: l.pin });
    });
  }
});

// ── The AI apply path (chat.js) ───────────────────────────────────────────

// A part's values the way App.componentValues fills them.
function valuesFor(type, given) {
  const def = Parts.get(type);
  const v = {};
  for (const [key, spec] of Object.entries(def.values || {})) v[key] = spec.default;
  Object.assign(v, given || {});
  for (const [key, spec] of Object.entries(def.values || {})) {
    if (spec.choices && spec.choices[v[key]]) Object.assign(v, spec.choices[v[key]]);
  }
  return v;
}

// A board that keeps real records the way App leaves them, so Sim.analyze
// can solve it (the same pattern as test/chat.test.js's simBoard).
function simBoard() {
  let parts = [], wires = [];
  const notes = [];
  const calls = { placePart: [] };
  const wireEnd = (e, side) => (e.hole
    ? { [side + 'Hole']: { col: e.hole.col, row: e.hole.row }, [side + 'Comp']: null, [side + 'PinIdx']: undefined }
    : { [side + 'Hole']: null, [side + 'Comp']: e.comp, [side + 'PinIdx']: e.pin });
  return {
    notes, calls,
    note: text => notes.push(text),
    components: () => parts,
    batterySpot: () => ({ x: 15.8, z: -3.15 }),
    parseHole: s => {
      const r = holeRef(s);
      if (!r) throw new Error('parseHole: unrecognised hole address: ' + s);
      return r;
    },
    getHole: (col, row) => (ROWS.includes(row) || ['tp', 'tn', 'bp', 'bn'].includes(row)) && col >= 0 && col < N
      ? { col, row } : null,
    holeMap: () => BoardIO.buildHoleMap(parts, wires),
    placePart(type, where, values) {
      calls.placePart.push([type, where, values]);
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

const placedWhere = board => board.calls.placePart.map(([type, where]) =>
  [type, Array.isArray(where) ? where.map(h => ({ col: h.col, row: h.row })) : where]);

describe('chat.js applies footprint parts from { hole, direction }', () => {
  test("place_test_three { hole: 'a10', direction: 'down' } places legs a10 b10 c10 through board.placePart", () => {
    const board = simBoard();
    const out = Chat.applyActions([{ tool: 'place_test_three', hole: 'a10', direction: 'down' }], board);
    assert.deepEqual(out, { applied: 1, failed: 0 }, `placed, got ${JSON.stringify(out)}, notes ${JSON.stringify(board.notes)}`);
    assert.deepStrictEqual(placedWhere(board), [['test_three', [{ col: 9, row: 'a' }, { col: 9, row: 'b' }, { col: 9, row: 'c' }]]]);
    assert.deepStrictEqual(board.notes, []);
  });

  for (const [direction, want] of [['right', ['a10', 'a11', 'a12']], ['left', ['e10', 'e9', 'e8']], ['up', ['j10', 'i10', 'h10']]]) {
    test(`direction ${direction} maps to its rotation: ${want.join(' ')}`, () => {
      const board = simBoard();
      const hole = want[0];
      const out = Chat.applyActions([{ tool: 'place_test_three', hole, direction }], board);
      assert.deepEqual(out, { applied: 1, failed: 0 }, `placed, got ${JSON.stringify(out)}, notes ${JSON.stringify(board.notes)}`);
      const where = board.calls.placePart[0][1];
      assert.deepStrictEqual(where.map(h => h.row + (h.col + 1)), want);
    });
  }

  test("place_test_three at a62 facing right places nothing, and the note gives the edge reason", () => {
    const board = simBoard();
    const out = Chat.applyActions([{ tool: 'place_test_three', hole: 'a62', direction: 'right' }], board);
    assert.deepEqual(out, { applied: 0, failed: 1 });
    assert.equal(board.calls.placePart.length, 0, 'nothing placed');
    assert.equal(board.notes.length, 1, `one note with the refusal, got ${JSON.stringify(board.notes)}`);
    assert.ok(board.notes[0].includes('would run past column 63'), `"${board.notes[0]}"`);
  });

  test('place_test_chip at e20 facing right places 8 legs across the gap, in pin order', () => {
    const board = simBoard();
    const out = Chat.applyActions([{ tool: 'place_test_chip', hole: 'e20', direction: 'right' }], board);
    assert.deepEqual(out, { applied: 1, failed: 0 }, `placed, got ${JSON.stringify(out)}, notes ${JSON.stringify(board.notes)}`);
    assert.deepStrictEqual(board.calls.placePart[0][1].map(h => h.row + (h.col + 1)),
      ['e20', 'e21', 'e22', 'e23', 'f23', 'f22', 'f21', 'f20']);
  });

  test('place_test_chip at a20 is refused with the straddle message', () => {
    const board = simBoard();
    const out = Chat.applyActions([{ tool: 'place_test_chip', hole: 'a20', direction: 'right' }], board);
    assert.deepEqual(out, { applied: 0, failed: 1 });
    assert.equal(board.calls.placePart.length, 0);
    assert.ok(board.notes.some(n => n.includes('a chip must sit across the centre gap (rows e and f).')), `a note with the straddle message, got ${JSON.stringify(board.notes)}`);
  });

  test('place_test_chip facing down (90°, not allowed) places nothing, and the note names the direction', () => {
    const board = simBoard();
    const out = Chat.applyActions([{ tool: 'place_test_chip', hole: 'e20', direction: 'down' }], board);
    assert.deepEqual(out, { applied: 0, failed: 1 });
    assert.equal(board.calls.placePart.length, 0);
    assert.equal(board.notes.length, 1, `one note with the refusal, got ${JSON.stringify(board.notes)}`);
    assert.match(board.notes[0], /\bdown\b/);
  });
});

// ── The server: finishAIReply and the DeepSeek loop ───────────────────────

const [DEL, BAT, W1, W2] = Recipes.ONE_LED;
const finish = actions => Server.finishAIReply({ reply: 'Built it.', actions: actions.map(a => ({ ...a })) });
const has = (out, a) => out.actions.some(x => JSON.stringify(x) === JSON.stringify(a));

describe('finishAIReply checks footprint parts', () => {
  test("drops test_three { hole: 'a62', direction: 'right' } with the edge message", () => {
    const bad = { tool: 'place_test_three', hole: 'a62', direction: 'right' };
    const out = finish([DEL, BAT, W1, W2, bad]);
    assert.ok(!has(out, bad), `the edge placement is dropped: ${JSON.stringify(out.actions)}`);
    assert.equal(out.actions.length, 4, 'only it is dropped');
    assert.ok(out.reply.includes('at column 62 would run past column 63'), out.reply);
  });

  test('keeps test_three at e30 facing down next to the one-LED build, holding e30 f30 g30', () => {
    const ok  = { tool: 'place_test_three', hole: 'e30', direction: 'down' };   // e30 f30 g30
    const res = { tool: 'place_resistor', holeA: 'g30', holeB: 'g34' };
    const out = finish([...Recipes.ONE_LED, ok, res]);
    assert.ok(has(out, ok), `kept: ${out.reply}`);
    assert.ok(!has(out, res), 'a resistor on its g30 leg is dropped');
    assert.ok(out.reply.includes("g30 already holds TT1's pin out"), out.reply);
    assert.ok(!out.reply.includes('TT1 not placed'), out.reply);
  });

  test("a footprint part over an earlier action's hole is refused, naming it: c4 right lands on LED1's anode at c6", () => {
    const bad = { tool: 'place_test_three', hole: 'c4', direction: 'right' };
    const out = finish([...Recipes.ONE_LED, bad]);
    assert.ok(!has(out, bad), 'dropped');
    assert.deepStrictEqual(out.actions, Recipes.ONE_LED, 'the rest is kept');
    assert.ok(out.reply.includes("c6 already holds LED1's pin anode"), out.reply);
  });

  test("a later part on a kept footprint part's leg is refused, naming the footprint part's pin", () => {
    const three = { tool: 'place_test_three', hole: 'b20', direction: 'right' };   // b20 b21 b22
    const res   = { tool: 'place_resistor', holeA: 'b22', holeB: 'b26' };
    const out = finish([DEL, BAT, three, res]);
    assert.ok(has(out, three), 'the footprint part is kept');
    assert.ok(!has(out, res), 'the resistor on its out leg is dropped');
    assert.ok(out.reply.includes("b22 already holds TT1's pin out"), out.reply);
  });

  test('test_chip: at e20 kept; at a20 dropped with the straddle message; facing down dropped, naming it', () => {
    const good = { tool: 'place_test_chip', hole: 'e20', direction: 'right' };
    const high = { tool: 'place_test_chip', hole: 'a40', direction: 'right' };
    const down = { tool: 'place_test_chip', hole: 'e50', direction: 'down' };
    const out = finish([DEL, BAT, good, high, down]);
    assert.ok(has(out, good), `e20 kept: ${out.reply}`);
    assert.ok(!has(out, high), 'a40 dropped');
    assert.ok(!has(out, down), 'facing down dropped');
    assert.ok(out.reply.includes('a chip must sit across the centre gap (rows e and f).'), out.reply);
    assert.match(out.reply, /\bdown\b/);
  });

  test('a chip leg on a taken hole names the holder: f22 holds LED3\'s anode', () => {
    const led  = { tool: 'place_led', holeA: 'f24', holeB: 'f22' };          // cathode f24, anode f22
    const chip = { tool: 'place_test_chip', hole: 'e20', direction: 'right' }; // … f23 f22 …
    const out = finish([...Recipes.SERIES_2, led, chip]);
    assert.ok(!has(out, chip), 'the chip is dropped');
    assert.ok(out.reply.includes("f22 already holds LED3's pin anode"), out.reply);
  });
});

describe('the DeepSeek tool loop refuses a footprint part at the edge, and keeps the retry', () => {
  function scriptedDeepSeek(replies) {
    const calls = [];
    const fn = async (url, opts) => {
      calls.push(JSON.parse(opts.body));
      const message = replies[Math.min(calls.length - 1, replies.length - 1)];
      return { ok: true, status: 200, json: async () => ({ choices: [{ message }] }), text: async () => '' };
    };
    fn.calls = calls;
    return fn;
  }
  const call = (id, nm, args) => ({ id, type: 'function', function: { name: nm, arguments: JSON.stringify(args || {}) } });

  let port;
  beforeAll(() => new Promise(r => Server.server.listen(0, '127.0.0.1', () => { port = Server.server.address().port; r(); })));
  afterAll(() => new Promise(r => Server.server.close(r)));
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  function ask(message) {
    const body = JSON.stringify({ message, markdown: '', history: [] });
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/api/ask', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
        let text = '';
        res.on('data', c => { text += c; });
        res.on('end', () => { try { resolve({ status: res.statusCode, ...JSON.parse(text) }); } catch (e) { reject(e); } });
      });
      req.on('error', reject);
      req.end(body);
    });
  }

  test('place_test_three at a63 right: the tool result carries the edge reason; the retry at a10 is kept', async () => {
    const fetch = scriptedDeepSeek([
      { content: '', tool_calls: [call('d', 'delete_all'), call('bad', 'place_test_three', { hole: 'a63', direction: 'right' })] },
      { content: '', tool_calls: [call('good', 'place_test_three', { hole: 'a10', direction: 'right' })] },
      { content: 'Placed the three.', tool_calls: null },
    ]);
    vi.stubGlobal('fetch', fetch);
    const out = await ask('place a test three');
    assert.equal(out.status, 200, JSON.stringify(out));
    const result = String((fetch.calls[1].messages.find(m => m.role === 'tool' && m.tool_call_id === 'bad') || {}).content);
    assert.ok(result.includes('would run past column 63'), `the refused call's tool result: "${result}"`);
    const threes = out.actions.filter(a => a.tool === 'place_test_three');
    assert.deepStrictEqual(threes, [{ tool: 'place_test_three', hole: 'a10', direction: 'right' }]);
  });
});

// ── Mixed circuits: footprint parts beside real ones ──────────────────────

const wire = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });
const current = (board, label) => {
  const r = board.solve();
  const p = r.parts && r.parts[label];
  assert.ok(p, `analyze().parts has no ${label}; status ${r.status}`);
  return p.m.current;
};
const near = (got, want, what) =>
  assert.ok(typeof got === 'number' && Math.abs(got - want) < 0.01, `${what}: expected ${want.toFixed(2)} mA, got ${got}`);

describe('footprint parts in mixed circuits', () => {
  test('test_three beside the one-LED circuit: placed, in the hole map, and LED1 still reads 14.9 mA', () => {
    const board = simBoard();
    assert.deepEqual(Chat.acceptBuild(Recipes.ONE_LED, board), { applied: 8, failed: 0 });
    const before = current(board, 'LED1');
    near(before, 14.9, 'LED1 before');

    const out = Chat.applyActions([{ tool: 'place_test_three', hole: 'e30', direction: 'down' }], board);
    assert.deepEqual(out, { applied: 1, failed: 0 }, `placed, got ${JSON.stringify(out)}, notes ${JSON.stringify(board.notes)}`);
    const three = board.components().find(c => c.type === 'test_three');
    const map = board.holeMap();
    for (const h of ['e30', 'f30', 'g30']) {
      assert.equal(map.get(h) && map.get(h).label, three.label, `${h} holds the test three`);
    }
    near(current(board, 'LED1'), before, 'LED1 after');
  });

  test('test_chip straddling beside a series LED pair, wired p1 to + and p8 to −: 9 mA through it, LEDs unchanged', () => {
    const board = simBoard();
    assert.deepEqual(Chat.acceptBuild(Recipes.SERIES_2, board), { applied: 9, failed: 0 });
    const l1 = current(board, 'LED1'), l2 = current(board, 'LED2');
    near(l1, 10.63, 'LED1 in series before');

    const out = Chat.applyActions([
      { tool: 'place_test_chip', hole: 'e20', direction: 'right' },
      wire('tp_20', 'a20', 'red'), wire('j20', 'tn_20', 'black'),
    ], board);
    assert.deepEqual(out, { applied: 3, failed: 0 }, `placed and wired, got ${JSON.stringify(out)}, notes ${JSON.stringify(board.notes)}`);
    const chip = board.components().find(c => c.type === 'test_chip');
    assert.ok(chip, 'the chip is placed');
    near(current(board, chip.label), 9, 'chip p1–p8');
    near(current(board, 'LED1'), l1, 'LED1 after the chip');
    near(current(board, 'LED2'), l2, 'LED2 after the chip');
  });

  test("a chip whose leg lands on an LED's lead is refused, and the rest simulates with the same numbers", () => {
    const board = simBoard();
    assert.deepEqual(Chat.acceptBuild([...Recipes.SERIES_2, { tool: 'place_led', holeA: 'f24', holeB: 'f22' }], board),
      { applied: 10, failed: 0 });
    const l1 = current(board, 'LED1'), l2 = current(board, 'LED2');

    const out = Chat.applyActions([{ tool: 'place_test_chip', hole: 'e20', direction: 'right' }], board);   // f22 is LED3's anode
    assert.deepEqual(out, { applied: 0, failed: 1 });
    assert.ok(!board.components().some(c => c.type === 'test_chip'), 'no chip on the board');
    assert.equal(board.notes.length, 1, `one note with the refusal, got ${JSON.stringify(board.notes)}`);
    assert.ok(board.notes[0].includes("f22 already holds LED3's pin anode"), `"${board.notes[0]}"`);
    near(current(board, 'LED1'), l1, 'LED1');
    near(current(board, 'LED2'), l2, 'LED2');
  });
});
