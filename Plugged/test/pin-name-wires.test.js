// AI wire ends by pin name (issue #11, TODO task 6): the model may write an
// add_wire end as an on-board part's pin (U1.in1p, LED1.anode, or LED1.1 by
// index for a 2-pin part), and the server turns it into a free hole in that
// pin's strip before anything else sees it. Hole bookkeeping stops being the
// model's job.
//
// Shapes these tests assume (from the issue; stated so the builder matches
// them):
// - A pin's strip is its column half: rows a–e or f–j of the pin's column
//   (or a whole rail). The end becomes a hole in that strip that holds no
//   part lead and no wire end, counting the sent board and the earlier
//   actions in this reply (earlier rewrites included), never the pin's own
//   hole. A delete_all in the reply wipes the sent board, as it does
//   everywhere else. Which free row is picked (the search order) is not
//   pinned here: a test that needs one hole fills the others first.
// - The rewrite runs in finishAIReply before the duplicate, placement and
//   reference checks and the checker, and in DeepSeek's tool loop through
//   an optional ctx hook, before ctx.duplicate / ctx.refusal, so the loop's
//   checker and repair messages see holes too.
// - Off-board pins (BAT1.0, MM1.red, PS1.com, FG1.0) stay as written.
// - A pin the part doesn't have, or a strip with no free hole, is refused:
//   that add_wire is dropped (the rest of the build stays) and the reply
//   says why, naming the end and, for a bad pin, every pin the part has. In
//   the tool loop a refusal is the call's tool result ("Refused: …"), as
//   placement refusals are, and nothing is queued.
// - The prompt's "Never use "R1.0" or "LED1.1" as a wire end." becomes a line
//   saying an on-board part's pin may be named as a wire end (U1.in1p,
//   LED1.anode) and the server picks a free hole in its strip. That changes
//   the golden prompts (test/fixtures/prompts/); the orchestrator updates
//   them after review.
//
// How: Server.finishAIReply with actions and a board, and the real Server.ask
// with a scripted fake DeepSeek (as test/repair-best-build.test.js), the real
// checker and the simulator. No network, no key, no real AI.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'deepseek';
process.env.RECORD_FIXTURES = '0';     // never write ask fixtures from here
process.env.DEEPSEEK_THINKING = '0';   // the request body doesn't matter here; keep it fixed
const Server  = require('../backend/server.js');
const Parts   = require('../circuit3d/js/parts');
const Board   = require('../circuit3d/js/board-model.js');
const Sim     = require('../circuit3d/js/simulate.js');
const Recipes = require('./fixtures/recipes.js');

// ── Builds ──────────────────────────────────────────────────────────────────

// The TL072 at f30 facing right: out1 f30, in1n f31, in1p f32, vneg f33 on
// row f; in2p e33, in2n e32, out2 e31, vpos e30 back along row e.
const PLACE_TL072 = { tool: 'place_tl072', hole: 'f30', direction: 'right' };
const PLACE_FG    = { tool: 'place_function_generator' };
const OP_BUILD    = [{ tool: 'delete_all' }, PLACE_TL072, PLACE_FG];

// Column 32, rows g–j: the four holes in1p's strip (f–j) has besides its own.
// R1 g32/g36 puts a part lead in g32; wires fill the rest.
const PLACE_R_G32 = { tool: 'place_resistor', holeA: 'g32', holeB: 'g36' };
const wire = (from, to) => ({ tool: 'add_wire', from, to });

// The LED at b6/b8: cathode b6 (holeA), anode b8 (holeB).
const LED_BUILD = [{ tool: 'delete_all' }, { tool: 'place_battery' }, { tool: 'place_led', holeA: 'b6', holeB: 'b8' }];

const isHole = s => /^(?:[a-j]\d+|(?:tp|tn|bp|bn)_\d+)$/i.test(String(s));
const strip  = (col, rows) => new RegExp(`^[${rows}]${col}$`);

// The other end of each add_wire with `end` as one of its ends.
const otherEnds = (actions, end) => actions
  .filter(a => a && a.tool === 'add_wire' && (a.from === end || a.to === end))
  .map(a => (a.from === end ? a.to : a.from));

// The one add_wire with `end` as an end: its other end.
function otherEnd(actions, end, why) {
  const found = otherEnds(actions, end);
  assert.equal(found.length, 1, `${why}: expected one wire with the end ${end}, got ${found.length}: ${JSON.stringify(actions.filter(a => a && a.tool === 'add_wire'))}`);
  return found[0];
}

// Every add_wire end, as sent.
const wireEnds = actions => actions.filter(a => a && a.tool === 'add_wire').flatMap(a => [a.from, a.to]);

function finish(actions, board) {
  return Server.finishAIReply({ reply: 'Built it.', actions: actions.map(a => ({ ...a })), board });
}

beforeEach(() => { for (const m of ['log', 'info', 'warn']) vi.spyOn(console, m).mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test('precondition: the TL072 at f30 facing right puts in1p in f32, in2n in e32 and vpos in e30', () => {
  const legs = Parts.footprintLegs('tl072', 'f30', 0);
  const at = Object.fromEntries(legs.map(l => [l.pin, l.hole]));
  assert.deepStrictEqual([at.in1p, at.in2n, at.vpos], ['f32', 'e32', 'e30'], JSON.stringify(at));
});

// ── 1. A pin name becomes a free hole in its strip ──────────────────────────

for (const [end, other, col, rows, own] of [
  ['U1.in1p', 'FG1.0', 32, 'f-j', 'f32'],
  ['U1.in2n', 'bn_40', 32, 'a-e', 'e32'],
  ['U1.vpos', 'tp_40', 30, 'a-e', 'e30'],
]) {
  test(`${end} on a TL072 at f30 (right) becomes a free hole in column ${col}, rows ${rows}, not its own hole ${own}`, () => {
    const out = finish([...OP_BUILD, wire(end, other)]);
    const hole = otherEnd(out.actions, other, `the wire ${end} → ${other}`);
    assert.match(String(hole), strip(col, rows), `${end} should become a hole in column ${col}, rows ${rows}; got ${JSON.stringify(hole)}`);
    assert.notEqual(hole, own, `${end} must not land in the pin's own hole ${own}`);
  });
}

test('U1.in1p with the TL072 on the sent board (an edit) becomes a free hole in column 32, rows f–j', () => {
  const board = Board.apply(Board.empty(), [PLACE_TL072, PLACE_FG]).board;
  assert.deepStrictEqual(board.parts.map(p => p.label), ['U1', 'FG1'], 'precondition: the board holds U1 and FG1');
  const out = finish([wire('U1.in1p', 'FG1.0')], board);
  const hole = otherEnd(out.actions, 'FG1.0', 'the wire U1.in1p → FG1.0');
  assert.match(String(hole), strip(32, 'g-j'), `U1.in1p should become g32–j32 (f32 is the pin's own hole); got ${JSON.stringify(hole)}`);
});

test('both ends named (a follower\'s OUT1 → IN1−): U1.out1 → U1.in1n becomes column 30 f–j → column 31 f–j', () => {
  const out = finish([...OP_BUILD, wire('U1.out1', 'U1.in1n')]);
  const wires = out.actions.filter(a => a.tool === 'add_wire');
  assert.equal(wires.length, 1, `expected the one wire, got ${JSON.stringify(wires)}`);
  assert.match(String(wires[0].from), strip(30, 'g-j'), `U1.out1 (f30) → ${JSON.stringify(wires[0].from)}`);
  assert.match(String(wires[0].to), strip(31, 'g-j'), `U1.in1n (f31) → ${JSON.stringify(wires[0].to)}`);
});

// ── 2. Two wires to one pin get different holes ─────────────────────────────

test('two wires to U1.in1p get two different free holes in column 32, rows g–j', () => {
  const out = finish([...OP_BUILD, wire('U1.in1p', 'FG1.0'), wire('U1.in1p', 'a40')]);
  const one = otherEnd(out.actions, 'FG1.0', 'the first wire'), two = otherEnd(out.actions, 'a40', 'the second wire');
  for (const h of [one, two]) assert.match(String(h), strip(32, 'g-j'), `each wire lands in in1p's strip, not f32: got ${JSON.stringify([one, two])}`);
  assert.notEqual(one, two, `the two wires share hole ${one}`);
});

// ── 3. A pin the part doesn't have is refused, naming its pins ──────────────

test('U1.nope is refused: the wire is dropped, the reply names every TL072 pin, and the rest of the build stays', () => {
  const out = finish([...OP_BUILD, wire('U1.nope', 'FG1.0')]);
  assert.deepStrictEqual(otherEnds(out.actions, 'FG1.0'), [], `the U1.nope wire was kept: ${JSON.stringify(out.actions.filter(a => a.tool === 'add_wire'))}`);
  assert.match(out.reply, /U1\.nope/, `the reply should say which end was refused: ${out.reply}`);
  const missing = Parts.get('tl072').pins.filter(p => !new RegExp(`\\b${p}\\b`).test(out.reply));
  assert.deepStrictEqual(missing, [], `the reply should list U1's pins: ${out.reply}`);
  assert.ok(out.actions.some(a => a.tool === 'place_tl072'), 'the TL072 itself is still placed');
});

// A fix lands whole or not at all (#199): an edit on a sent board with a
// wire to a pin the part doesn't have changes nothing, as an edit naming a
// part or wire the board lacks does today.
const LED_BOARD = Board.apply(Board.empty(), Recipes.ONE_LED).board;   // BAT1, R1 b2/b6, LED1 c8/c6, W1–W4

test('an edit with a bad pin name (set_value R1 + add_wire LED1.nope → tn_5) changes nothing, and the reply says LED1.nope and "Nothing was changed"', () => {
  assert.deepStrictEqual(LED_BOARD.parts.map(p => p.label), ['BAT1', 'R1', 'LED1'], 'precondition: the sent board');
  const out = finish([{ tool: 'set_value', part: 'R1', resistance: 1000 }, wire('LED1.nope', 'tn_5')], LED_BOARD);
  assert.deepStrictEqual(out.actions, [], `half the fix would land: ${JSON.stringify(out.actions)}`);
  assert.match(out.reply, /LED1\.nope/, `the reply should name LED1.nope: ${out.reply}`);
  assert.match(out.reply, /Nothing was changed/, `the reply should say nothing was changed: ${out.reply}`);
});

// Pin (passes today): a rebuild is not an edit, so a bad pin drops only its wire.
test('pin: a rebuild (delete_all) with a wire to LED1.nope keeps the rest of the build exactly', () => {
  const out = finish([...Recipes.ONE_LED, wire('LED1.nope', 'tn_5')]);
  assert.deepStrictEqual(out.actions, Recipes.ONE_LED, `got ${JSON.stringify(out.actions)}`);
  assert.match(out.reply, /LED1\.nope/, out.reply);
});

// The other end of the wire, a plain hole, is taken too: U1.in1p → j32 must
// not become j32 → j32.
test('U1.in1p → j32 (TL072 at f30, right): in1p becomes g32, h32 or i32, never the wire\'s own other end j32', () => {
  const out = finish([...OP_BUILD, wire('U1.in1p', 'j32')]);
  const wires = out.actions.filter(a => a.tool === 'add_wire');
  assert.equal(wires.length, 1, `expected the one wire, got ${JSON.stringify(wires)}`);
  const hole = wires[0].to === 'j32' ? wires[0].from : wires[0].to;
  assert.match(String(hole), strip(32, 'g-i'), `U1.in1p should land in g32–i32, not on its own wire's other end: got ${JSON.stringify(wires[0])}`);
});

// ── 4. A 2-pin part: by name or by index ────────────────────────────────────

for (const [end, col, own] of [
  ['LED1.anode',   8, 'b8'],
  ['LED1.1',       8, 'b8'],   // index 1 of [cathode, anode]
  ['LED1.cathode', 6, 'b6'],
]) {
  test(`${end} on an LED at b6/b8 (cathode b6) becomes a free hole in column ${col}, rows a–e, not ${own}`, () => {
    const out = finish([...LED_BUILD, wire('tp_10', end)]);
    const hole = otherEnd(out.actions, 'tp_10', `the wire tp_10 → ${end}`);
    assert.match(String(hole), strip(col, 'a-e'), `${end} should become a hole in column ${col}, rows a–e; got ${JSON.stringify(hole)}`);
    assert.notEqual(hole, own, `${end} must not land in the LED's own hole ${own}`);
  });
}

// An all-digit k in LABEL.k is always a pin INDEX (as Board.apply, Board.toSim
// and BAT1.0 read it), even on a part whose pins are named '1' and '2': the
// bulb's pins are ['1', '2'], holeA the first (index 0), holeB the second
// (index 1). So LP1.1 is the pin named '2' (b13), and LP1.0 the pin named '1'.
const BULB_BUILD = [{ tool: 'delete_all' }, { tool: 'place_battery' }, { tool: 'place_bulb', holeA: 'b10', holeB: 'b13' }];

test('precondition: the bulb\'s pins are named "1" and "2", in holeA, holeB order', () => {
  assert.deepStrictEqual(Parts.get('bulb').pins, ['1', '2']);
});

for (const [end, col, own] of [
  ['LP1.1', 13, 'b13'],   // index 1: the pin named '2', in holeB
  ['LP1.0', 10, 'b10'],   // index 0: the pin named '1', in holeA
]) {
  test(`${end} on a bulb at b10/b13 is pin index ${end.slice(-1)}, so it becomes a free hole in column ${col}, rows a–e, not ${own}`, () => {
    const out = finish([...BULB_BUILD, wire('tp_20', end)]);
    const hole = otherEnd(out.actions, 'tp_20', `the wire tp_20 → ${end}`);
    assert.match(String(hole), strip(col, 'a-e'), `${end} is pin index ${end.slice(-1)} (in ${own}), so it should become a hole in column ${col}, rows a–e; got ${JSON.stringify(hole)}`);
    assert.notEqual(hole, own, `${end} must not land in the bulb's own hole ${own}`);
  });
}

// A potentiometer's pins are named '1', 'wiper', '3', so "RV1.1" can't name
// pin "1" (all digits is an index) and isn't offered as a name to use: the
// model is pointed at the hole instead. At c2 facing right: 1 c2, wiper c3, 3 c4.
const POT_BUILD = [{ tool: 'delete_all' }, { tool: 'place_battery' }, { tool: 'place_potentiometer', hole: 'c2', direction: 'right' }];

test('precondition: the potentiometer at c2 facing right puts pin "1" in c2, the wiper in c3, pin "3" in c4', () => {
  assert.deepStrictEqual(Parts.footprintLegs('potentiometer', 'c2', 0).map(l => [l.pin, l.hole]), [['1', 'c2'], ['wiper', 'c3'], ['3', 'c4']]);
});

test('RV1.1 → tp_5 on a potentiometer is refused, pointing at pin 1\'s hole c2 (or its hole), never offering "1" as a name to use', () => {
  const out = finish([...POT_BUILD, wire('RV1.1', 'tp_5')]);
  assert.deepStrictEqual(otherEnds(out.actions, 'tp_5'), [], `the RV1.1 wire was kept: ${JSON.stringify(out.actions.filter(a => a.tool === 'add_wire'))}`);
  // The refusal's own line (the Heads up below it names the pot "at c2" anyway).
  const why = out.reply.split('\n').filter(l => /RV1\.1/.test(l)).join('\n');
  assert.ok(why, `the reply should say the RV1.1 wire was refused: ${out.reply}`);
  assert.ok(/\bc2\b/.test(why) || /through (?:its|the) holes?|holes? (?:it|they) sits? in/i.test(why),
    `the reason should point at pin 1's hole c2, or say to wire through the hole: ${why}`);
  assert.doesNotMatch(why, /\b1, wiper, 3\b/, `the reason offers "1" as a pin name to use: ${why}`);
});

// Pin (passes today): a pin with a real name still works on that part.
test('pin: RV1.wiper on the potentiometer at c2 (right) becomes a free hole in column 3, rows a–e, not c3', () => {
  const out = finish([...POT_BUILD, wire('RV1.wiper', 'tp_5')]);
  const hole = otherEnd(out.actions, 'tp_5', 'the wire RV1.wiper → tp_5');
  assert.match(String(hole), strip(3, 'abde'), `RV1.wiper (c3) should become a3, b3, d3 or e3; got ${JSON.stringify(hole)}`);
});

// ── 5. Off-board pins stay as written ───────────────────────────────────────

// Pin (passes today): the rewrite is for on-board parts only.
test('pin: off-board ends (BAT1.0, MM1.red, PS1.com, FG1.0) are left as written', () => {
  const ends = [['BAT1.0', 'tp_63'], ['MM1.red', 'a2'], ['PS1.com', 'tn_5'], ['FG1.0', 'a6']];
  const out = finish([
    { tool: 'delete_all' }, { tool: 'place_battery' }, { tool: 'place_multimeter' }, { tool: 'place_bench_supply' }, PLACE_FG,
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
    ...ends.map(([from, to]) => wire(from, to)),
  ]);
  const got = out.actions.filter(a => a.tool === 'add_wire').map(a => [a.from, a.to]);
  assert.deepStrictEqual(got, ends, `the off-board wires changed: ${JSON.stringify(got)}`);
});

// ── 6. Free means no lead and no wire end: the reply's and the board's ──────

// in1p's strip is f32 (the pin) and g32–j32. These fill g32 (R1's lead),
// h32 and j32 (wire ends), leaving only i32.
const FILL_GHJ = [PLACE_R_G32, wire('h32', 'bn_1'), wire('j32', 'bn_3')];
const BOARD_GHJ = Board.apply(Board.empty(), [PLACE_TL072, PLACE_FG, ...FILL_GHJ]).board;
const BOARD_FULL = Board.apply(Board.empty(), [PLACE_TL072, PLACE_FG, ...FILL_GHJ, wire('i32', 'bn_2')]).board;

for (const [name, actions, board, want] of [
  ['a resistor lead and two wire ends earlier in the reply', [...OP_BUILD, ...FILL_GHJ, wire('U1.in1p', 'FG1.0')], undefined, ['i32']],
  ['the sent board\'s resistor lead and wires', [wire('U1.in1p', 'FG1.0')], BOARD_GHJ, ['i32']],
  ['a full sent board wiped by a delete_all in the reply', [...OP_BUILD, wire('U1.in1p', 'FG1.0')], BOARD_FULL, ['g32', 'h32', 'i32', 'j32']],
]) {
  test(`U1.in1p skips the holes taken by ${name}: it becomes ${want.join(' or ')}`, () => {
    const out = finish(actions, board);
    const hole = otherEnd(out.actions, 'FG1.0', 'the wire U1.in1p → FG1.0');
    assert.ok(want.includes(hole), `expected ${want.join(' or ')}, got ${JSON.stringify(hole)}`);
  });
}

// ── 7. A strip with no free hole is refused ─────────────────────────────────

for (const [name, actions, board] of [
  ['a resistor lead and three wire ends in the reply', [...OP_BUILD, ...FILL_GHJ, wire('i32', 'bn_2'), wire('U1.in1p', 'FG1.0')], undefined],
  ['the sent board', [wire('U1.in1p', 'FG1.0')], BOARD_FULL],
  ['four earlier wires to U1.in1p', [...OP_BUILD, ...['bn_1', 'bn_2', 'bn_3', 'bn_4'].map(r => wire('U1.in1p', r)), wire('U1.in1p', 'FG1.0')], undefined],
]) {
  test(`a full strip (column 32 f–j, filled by ${name}) refuses U1.in1p → FG1.0, with a reason naming U1.in1p`, () => {
    const out = finish(actions, board);
    assert.deepStrictEqual(otherEnds(out.actions, 'FG1.0'), [], `the wire was kept with nowhere free to go: ${JSON.stringify(out.actions.filter(a => a.tool === 'add_wire'))}`);
    assert.ok(!wireEnds(out.actions).some(e => /^u1\./i.test(String(e))), `a pin-named end reached the page: ${JSON.stringify(wireEnds(out.actions))}`);
    assert.match(out.reply, /U1\.in1p/, `the reply should say the U1.in1p wire was refused: ${out.reply}`);
  });
}

test('four wires to U1.in1p fill g32–j32, one hole each, before the fifth is refused', () => {
  const rails = ['bn_1', 'bn_2', 'bn_3', 'bn_4'];
  const out = finish([...OP_BUILD, ...rails.map(r => wire('U1.in1p', r)), wire('U1.in1p', 'FG1.0')]);
  const holes = rails.map(r => otherEnd(out.actions, r, `the wire U1.in1p → ${r}`));
  assert.deepStrictEqual(holes.slice().sort(), ['g32', 'h32', 'i32', 'j32'], `got ${JSON.stringify(holes)}`);
});

// ── 8. The tool loop: the checker and the repair loop see holes ─────────────

function scriptedFetch(replies) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    const message = replies[Math.min(calls.length - 1, replies.length - 1)];
    return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message }] }) };
  };
  fn.calls = calls;
  return fn;
}
const call  = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args || {}) } });
const tools = (prefix, actions) => ({ content: '', tool_calls: actions.map((a, i) => { const { tool, ...args } = a; return call(`${prefix}${i}`, tool, args); }) });
const says  = text => ({ content: text, tool_calls: null });
const BUILD_MSG = 'Build a single LED circuit with a current-limiting resistor, and measure the LED\'s voltage.';

async function ask(replies, board) {
  const fetch = scriptedFetch(replies);
  vi.stubGlobal('fetch', fetch);
  const out = await Server.ask('', BUILD_MSG, [], board);
  return { out, calls: fetch.calls };
}

// The user messages after the question: the repair messages sent.
const repairsSent = calls => calls[calls.length - 1].messages.filter(m => m.role === 'user').slice(1).map(m => String(m.content));

function simulate(actions) {
  const { board } = Board.apply(Board.empty(), actions);
  const { components, wires } = Board.toSim(board);
  return Sim.analyze(components, wires);
}

// The one-LED recipe (R1 b2/b6, LED1 cathode c8 / anode c6) with its two
// body wires and a voltmeter across the LED all written by pin name. Two
// wires land on the cathode's strip (column 8, rows a–e), so the loop's
// rewrite must count the one it already made.
const PINNED_LED = [
  ...Recipes.ONE_LED.map(a => (a.to === 'a2' ? { ...a, to: 'R1.lead1' } : a.from === 'a8' ? { ...a, from: 'LED1.cathode' } : a)),
  { tool: 'place_multimeter' },
  { tool: 'add_wire', from: 'MM1.red',   to: 'LED1.anode',   color: 'red' },
  { tool: 'add_wire', from: 'MM1.black', to: 'LED1.cathode', color: 'black' },
];
// The same build with holes: what a careful model writes today.
const HOLED_LED = [
  ...Recipes.ONE_LED,
  { tool: 'place_multimeter' },
  { tool: 'add_wire', from: 'MM1.red',   to: 'a6', color: 'red' },
  { tool: 'add_wire', from: 'MM1.black', to: 'd8', color: 'black' },
];

test('through the tool loop, a build wired by pin names is checked on its holes: no repair round, no Heads up, and it simulates as the holed build does', async () => {
  assert.deepStrictEqual(Server.checkBuild(HOLED_LED), [], 'precondition: the holed build is clean');
  const want = simulate(HOLED_LED).parts;
  // (9 V − 2.0 V) / 470 Ω ≈ 14.9 mA; the meter reads the LED's ≈ 2.0 V.
  assert.ok(Math.abs(want.LED1.m.current - 14.9) < 0.1 && Math.abs(want.MM1.m.reading - 2.0) < 0.05, `precondition: ${JSON.stringify([want.LED1.m, want.MM1.m])}`);

  const { out, calls } = await ask([tools('a', PINNED_LED), says('Built it, with a meter across the LED.')]);
  const sent = repairsSent(calls);
  assert.equal(calls.length, 2, `the loop's checker saw the pin-named ends, not holes, and sent ${sent.length} repair(s):\n${sent.join('\n---\n')}`);
  assert.doesNotMatch(out.reply, /Heads up/, `the build is flagged: ${out.reply}`);

  const ends = wireEnds(out.actions);
  const bad = ends.filter(e => !isHole(e) && !/^(BAT|MM)\d+\./.test(String(e)));
  assert.deepStrictEqual(bad, [], `the page would get pin-named on-board ends: ${JSON.stringify(ends)}`);
  const got = simulate(out.actions).parts;
  assert.ok(Math.abs(got.LED1.m.current - want.LED1.m.current) < 0.01, `LED1: ${got.LED1.m.current} mA, want ${want.LED1.m.current.toFixed(2)}`);
  assert.ok(Math.abs(got.MM1.m.reading - want.MM1.m.reading) < 0.01, `MM1: ${got.MM1.m.reading} V, want ${want.MM1.m.reading.toFixed(3)}`);
});

test('through the tool loop, LED1.nope is refused as the call\'s tool result, naming the LED\'s pins, and is not queued', async () => {
  const build = [...Recipes.ONE_LED, { tool: 'place_multimeter' }, wire('MM1.red', 'LED1.nope')];
  const { out, calls } = await ask([tools('a', build), says('Built it.'), says('Done.')]);
  const results = calls[1].messages.filter(m => m.role === 'tool');
  const mine = results.find(m => m.tool_call_id === `a${build.length - 1}`);
  assert.ok(mine, `no tool result for the LED1.nope call: ${JSON.stringify(results.map(m => m.tool_call_id))}`);
  assert.match(String(mine.content), /^Refused/, `the LED1.nope wire should be refused, got: ${mine.content}`);
  for (const pin of Parts.get('led').pins) assert.match(String(mine.content), new RegExp(`\\b${pin}\\b`), `the refusal should name the LED's pins: ${mine.content}`);
  assert.ok(!wireEnds(out.actions).some(e => /nope/i.test(String(e))), `the LED1.nope wire reached the page: ${JSON.stringify(wireEnds(out.actions))}`);
});

// ── 9. The prompt allows on-board pin names as wire ends ────────────────────

async function demoPrompt() {
  const fetch = scriptedFetch([says('Sure.')]);
  vi.stubGlobal('fetch', fetch);
  await Server.ask('', 'Build a single LED circuit with a current-limiting resistor.', []);
  return fetch.calls[0].messages[0].content;
}

for (const [name, prompt] of [['SYSTEM_PROMPT (every tool)', () => Server.SYSTEM_PROMPT], ['the demo request\'s prompt', demoPrompt]]) {
  test(`${name} no longer says "Never use "R1.0"…" and says an on-board pin (LED1.anode) may be a wire end, the server picking a free hole`, async () => {
    const lines = String(await prompt()).split('\n');
    const forbids = lines.filter(l => /Never use "R1\.0"/.test(l));
    assert.deepStrictEqual(forbids, [], 'the old rule against pin-named wire ends is gone');
    const allows = lines.filter(l => /\bLED1\.anode\b/.test(l) && /wire end/i.test(l) && /free hole/i.test(l));
    assert.equal(allows.length, 1, 'one line says an on-board part\'s pin (e.g. LED1.anode) may be named as a wire end and the server picks a free hole in its strip');
  });
}
