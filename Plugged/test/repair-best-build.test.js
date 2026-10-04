// The repair loop keeps the best build (issue #6, TODO task 3). On the
// reasoning-off test-set run, some repairs raised the problem count (1→2,
// 7→8), and every "parts placed, no wires" run was a second rebuild the
// 12-round cap cut off, sent as it stood.
//
// Shapes these tests assume (decided on the issue, stated so the builder
// matches them):
// - An ATTEMPT is recorded each time the model ends its turn (no tool
//   calls) while ctx.checkBuild is set: the actions as they stand then, the
//   reply text then, and checkBuild's problem count for them.
// - When the loop ends (the model is done, repairs are used up, or the round
//   cap hits), deepSeekRounds returns the attempt with the fewest problems;
//   a tie goes to the later one. The actions it returns leave the same
//   board as that attempt's (compared here from the last delete_all, as
//   finishAIReply sends them), and the reply is that attempt's text.
// - The round cap never returns unfinished work: if rounds run out after a
//   repair was sent and before the model ended its turn again (a rebuild
//   after its delete_all, or an in-place fix), the best recorded attempt is
//   returned. With no attempt recorded at all, the result is as today.
// - Round numbers count the repairs sent before an attempt, as the existing
//   "[repair] round N" / "after round N" logs do: round 0 is the first build,
//   round 1 the answer to the first repair. One log line names the one kept:
//     "[repair] kept round N: K problems"
// - The repair message asks for fixes, not a rebuild: it lists the build's
//   wires with their ids (Board.apply's numbering, as the board markdown's
//   Wires table shows them: for a rebuild from its last delete_all, for an
//   edit on the sent board), and names delete_wire, add_wire and set_value.
//   It still lists each problem as "- <problem>". A rebuild keeps today's
//   rebuild message (the heading, then the "- " lines) when the problems
//   say it is unusable (a battery terminal not wired, nothing powered) or,
//   by decision 2 on the issue, when any problem needs a part turned or
//   moved. An edit on a sent board always gets the fix message.
// - Fix steps apply to the queued build as they would to the board: a
//   delete_wire of a wire the rebuild added takes that wire away for the
//   loop's check and for finishAIReply's Heads up, so the returned build is
//   the fixed one.
//
//
// Issue #7, the follow-ups (the last two sections):
// - An EMPTY attempt is a rebuild whose actions from its last delete_all
//   place no parts (delete_all alone, or with wires only). It is never kept
//   over an attempt that places parts, whatever the problem counts; the real
//   checker calls delete_all alone clean. If every attempt is empty, the
//   choice above stands. An edit on a sent board (no delete_all) is never
//   empty: it is judged on its problems as before.
// - When the overall deadline (DEEPSEEK_TIMEOUT_MS) passes after at least one
//   attempt was recorded, the ask returns the attempt chosen as above
//   ({ reply, actions }), not AI_TIMEOUT, and logs one line:
//     "[repair] deadline: kept round N: K problems"
//   With no attempt recorded, AI_TIMEOUT as today.
// - The fallback model's restart (#130, #4) keeps nothing from the primary's
//   rounds, its attempts included.
//
// How: deepSeekRounds through P.askDeepSeek with a scripted fake model and a
// fake ctx.checkBuild that returns scripted problem lists per build (the
// first part), and the real Server.ask with the real checker and simulator
// (the repair message and the fix). No network, no key, no real AI.

const assert = require('node:assert');
const { isDeepStrictEqual } = require('node:util');
process.env.AI_PROVIDER = 'deepseek';
process.env.RECORD_FIXTURES = '0';     // never write ask fixtures from here
process.env.DEEPSEEK_THINKING = '0';   // the request body doesn't matter here; keep it fixed
const Server  = require('../backend/server.js');
const P       = require('../backend/ai-providers.js');
const Board   = require('../circuit3d/js/board-model.js');
const Sim     = require('../circuit3d/js/simulate.js');
const Recipes = require('./fixtures/recipes.js');

const MAX_ROUNDS      = P.DEEPSEEK_MAX_ROUNDS;
const REBUILD_HEADING = 'Your build has problems. Rebuild it with these fixed (delete_all first, then the whole corrected circuit):';

// ── Builds ──────────────────────────────────────────────────────────────────

// The one-LED recipe: W1 BAT1.0→tp_63, W2 BAT1.1→tn_63, W3 tp_3→a2, W4 a8→tn_8.
const GOOD = Recipes.ONE_LED;
// The LED's leads swapped.
const BACKWARDS = GOOD.map(a => (a.tool === 'place_led' ? { ...a, holeA: 'c6', holeB: 'c8' } : a));
// The LED's cathode column wired to the + rail (W4 a8 → tp_8): fixable with
// one wire moved.
const WRONG = GOOD.map(a => (a.from === 'a8' ? { ...a, to: 'tp_8' } : a));
// The parts placed and no wires: nothing is powered.
const NO_WIRES = GOOD.filter(a => a.tool !== 'add_wire');
// WRONG's fix in place: W4 moved to the − rail.
const FIX_W4 = [{ tool: 'delete_wire', wire: 'W4' }, { tool: 'add_wire', from: 'a8', to: 'tn_8', color: 'black' }];
// A "fix" that moves the resistor's feed off its column.
const WORSE_W3 = [{ tool: 'delete_wire', wire: 'W3' }, { tool: 'add_wire', from: 'tp_3', to: 'a3', color: 'red' }];
const PLACE_R  = { tool: 'place_resistor', holeA: 'b12', holeB: 'b16' };

// The actions from the last delete_all on, as finishAIReply sends them; all
// of them when there is none.
function effective(actions) {
  let i = -1;
  (actions || []).forEach((a, k) => { if (a && a.tool === 'delete_all') i = k; });
  return i < 0 ? actions : actions.slice(i);
}

// The board a build leaves (Board.apply from its last delete_all), as
// something to compare: its parts, and its wires' ends without their ids.
// Two action lists that leave the same board compare equal, so a fix folded
// into the build counts the same as one applied after it.
function boardOf(actions) {
  const { board } = Board.apply(Board.empty(), effective(actions));
  return {
    parts: board.parts.map(p => ({ type: p.type, label: p.label, holes: p.holes || null, values: p.values || {} })),
    wires: board.wires.map(w => `${w.from}→${w.to}`).sort(),
  };
}

const problems = (n, tag) => Array.from({ length: n }, (_, i) => `${tag}: problem ${i + 1} of ${n}.`);

// A fake checkBuild: the scripted problems for each board it knows, and
// none for any other.
function fakeCheck(table) {
  return actions => {
    const board = boardOf(actions);
    const row = table.find(([b]) => isDeepStrictEqual(boardOf(b), board));
    return row ? row[1].slice() : [];
  };
}

// The build returned leaves the board `want` leaves.
function assertBoard(actions, want, why) {
  const got = boardOf(actions), exp = boardOf(want);
  assert.deepStrictEqual(got.wires, exp.wires, `${why}: the wires`);
  assert.deepStrictEqual(got.parts, exp.parts, `${why}: the parts`);
}

// ── The fake DeepSeek ───────────────────────────────────────────────────────

// Answers each request with the next scripted message (the last repeats),
// keeps every request body.
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
const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args || {}) } });
const asCalls = (prefix, actions) => actions.map((a, i) => { const { tool, ...args } = a; return call(`${prefix}${i}`, tool, args); });
const tools = (prefix, actions, content = '') => ({ content, tool_calls: asCalls(prefix, actions) });
const says  = text => ({ content: text, tool_calls: null });

const TOOLS = [{ function_declarations: ['delete_all', 'place_battery', 'place_resistor', 'place_led', 'add_wire', 'delete_wire', 'set_value']
  .map(name => ({ name, description: name })) }];

// The console, kept: log, info and warn lines as text.
function keepConsole() {
  const lines = [];
  for (const m of ['log', 'info', 'warn']) vi.spyOn(console, m).mockImplementation((...a) => { lines.push(a.map(String).join(' ')); });
  return lines;
}

// deepSeekRounds with a fake checkBuild. An edit passes the sent board and
// its message; a test that needs delays or HTTP errors passes its own fetch.
async function runLoop(replies, table, { board, message = 'Build a single LED circuit with a current-limiting resistor.', fetch = scriptedFetch(replies) } = {}) {
  const lines = keepConsole();
  const out = await P.askDeepSeek('', message, [],
    { SYSTEM_PROMPT: 'S', CIRCUIT_TOOLS: TOOLS, fetch, apiKey: 'k', checkBuild: fakeCheck(table) }, board);
  return { out, calls: fetch.calls, lines, kept: lines.filter(l => l.startsWith('[repair] kept')) };
}

// The one "[repair] kept round N: K problems" line.
function assertKept(kept, round, count, lines) {
  assert.equal(kept.length, 1, `expected one "[repair] kept round ${round}: ${count} problems" line, got ${JSON.stringify(kept)}; [repair] lines: ${JSON.stringify(lines.filter(l => l.startsWith('[repair]')))}`);
  assert.match(kept[0], new RegExp(`^\\[repair\\] kept round ${round}: ${count} problems?\\b`), `the kept line: ${JSON.stringify(kept[0])}`);
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// ── 1. A repair that makes things worse: the first build comes back ─────────

for (const [name, repair, after] of [
  ['an in-place fix', WORSE_W3, [...BACKWARDS, ...WORSE_W3]],
  ['a delete_all rebuild', WRONG, WRONG],
]) {
  test(`a repair that makes it worse (1 → 2 problems, ${name}) returns the first build, its reply, and logs "kept round 0: 1 problems"`, async () => {
    const { out, calls, lines, kept } = await runLoop([
      tools('a', BACKWARDS), says('Built it.'),
      tools('b', repair),    says('Fixed it.'),
      says('Done.'),
    ], [[BACKWARDS, problems(1, 'first build')], [after, problems(2, 'repair')]]);

    assert.equal(calls.length, 5, `precondition: build, end, repair, end, second repair's end; got ${calls.length} requests`);
    assertBoard(out.actions, BACKWARDS, 'the build sent is the first one (1 problem), not the repair (2)');
    assert.equal(out.reply, 'Built it.', 'the reply goes with the build kept');
    assertKept(kept, 0, 1, lines);
  });
}

// ── 2. The round cap never sends unfinished work ────────────────────────────

test('a second rebuild cut off at the round cap after its delete_all is never returned: the best earlier build (round 1, 1 problem) is', async () => {
  // The fake checker calls the unfinished rebuild clean, so only the
  // "never return it" rule can keep it out.
  const { out, calls, lines, kept } = await runLoop([
    tools('a', BACKWARDS), says('Built it.'),
    tools('b', WRONG),     says('Rebuilt it.'),
    tools('c', [{ tool: 'delete_all' }, { tool: 'place_battery' }], 'Starting over once more.'),
    tools('d', [PLACE_R]),   // repeats until the cap
  ], [[BACKWARDS, problems(3, 'first build')], [WRONG, problems(1, 'rebuild')]]);

  assert.equal(calls.length, MAX_ROUNDS, `precondition: the model never ends its turn after the second repair; got ${calls.length} requests`);
  assertBoard(out.actions, WRONG, 'the build sent is round 1\'s, not the cut-off rebuild (delete_all, parts, no wires)');
  assert.equal(out.reply, 'Rebuilt it.', 'the reply goes with the build kept, not the cut-off round\'s text');
  assertKept(kept, 1, 1, lines);
});

test('an in-place fix cut off at the round cap is never returned: the first build (round 0, 2 problems) is', async () => {
  const { out, calls, lines, kept } = await runLoop([
    tools('a', WRONG), says('Built it.'),
    tools('b', [{ tool: 'delete_wire', wire: 'W4' }], 'Moving the LED wire.'),
    tools('c', [PLACE_R]),   // repeats until the cap
  ], [[WRONG, problems(2, 'first build')]]);

  assert.equal(calls.length, MAX_ROUNDS, `precondition: the model never ends its turn after the repair; got ${calls.length} requests`);
  assertBoard(out.actions, WRONG, 'the build sent is round 0\'s, not the unfinished fix (W4 deleted, never re-added)');
  assert.equal(out.reply, 'Built it.');
  assertKept(kept, 0, 2, lines);
});

// Pin (passes today): with no attempt recorded, the round cap returns what
// it always did, every queued action.
test('pin: a model that never ends its turn still gets every queued action back, with checkBuild set', async () => {
  const { out, calls } = await runLoop([tools('x', [PLACE_R])], []);
  assert.equal(calls.length, MAX_ROUNDS);
  assert.deepStrictEqual(out.actions, Array(MAX_ROUNDS).fill(PLACE_R), `expected the ${MAX_ROUNDS} queued placements, got ${JSON.stringify(out.actions)}`);
});

// ── 3. A repair that fixes everything is returned ───────────────────────────

test('a repair that fixes everything (2 → 0 problems) is returned, with its reply, and logs "kept round 1: 0 problems"', async () => {
  const { out, calls, lines, kept } = await runLoop([
    tools('a', WRONG),  says('Built it.'),
    tools('b', FIX_W4), says('Fixed: the LED goes to ground now.'),
  ], [[WRONG, problems(2, 'first build')], [[...WRONG, ...FIX_W4], []]]);

  assert.equal(calls.length, 4, `a clean repair ends the loop: expected 4 requests, got ${calls.length}`);
  assertBoard(out.actions, [...WRONG, ...FIX_W4], 'the build sent is the fixed one');
  assert.equal(out.reply, 'Fixed: the LED goes to ground now.');
  assertKept(kept, 1, 0, lines);
});

// ── 4. A tie goes to the later attempt ──────────────────────────────────────

test('a tie (1 → 1) goes to the later attempt, even when a worse one (3) follows it', async () => {
  const { out, calls, lines, kept } = await runLoop([
    tools('a', BACKWARDS), says('Built it.'),
    tools('b', WRONG),     says('Rebuilt it.'),
    tools('c', WORSE_W3),  says('Moved a wire.'),
  ], [[BACKWARDS, problems(1, 'first build')], [WRONG, problems(1, 'rebuild')], [[...WRONG, ...WORSE_W3], problems(3, 'second repair')]]);

  assert.equal(calls.length, 6, `precondition: two repairs; got ${calls.length} requests`);
  assertBoard(out.actions, WRONG, 'the tie between round 0 and round 1 goes to round 1; round 2 is worse');
  assert.equal(out.reply, 'Rebuilt it.');
  assertKept(kept, 1, 1, lines);
});

// ── 5. The repair message asks for fixes, unless the build is unusable ──────
// The real Server.ask, checker and simulator; the model is scripted.

async function ask(replies, message, board) {
  const fetch = scriptedFetch(replies);
  vi.stubGlobal('fetch', fetch);
  keepConsole();
  const out = await Server.ask('', message, [], board);
  return { out, calls: fetch.calls };
}
// The first repair message: the user message after the question.
function firstRepair(calls) {
  assert.ok(calls.length >= 3, `no repair round: ${calls.length} requests`);
  const users = calls[2].messages.filter(m => m.role === 'user');
  assert.equal(users.length, 2, `expected the question and one repair message, got ${users.length}`);
  return String(users[1].content || '');
}
const BUILD_MSG = 'Build a single LED circuit with a current-limiting resistor.';

// The one-LED build as the browser sends it (W1…W4), and an edit adding a
// bare LED across the rails (LED2; its wires become W5 and W6).
const LED_BOARD = Board.apply(Board.empty(), GOOD).board;
const BARE_LED_EDIT = [
  { tool: 'place_led', holeA: 'c20', holeB: 'c18' },
  { tool: 'add_wire', from: 'tp_18', to: 'a18', color: 'red' },
  { tool: 'add_wire', from: 'a20', to: 'tn_20', color: 'black' },
];

// A fix message: not the rebuild wording, the fix tools named, each wire on
// a line with its id and both ends, each problem a "- " line.
function assertFixMessage(text, wires, want) {
  const lines = text.split('\n');
  assert.notEqual(lines[0], REBUILD_HEADING, `a fixable build got the rebuild heading:\n${text}`);
  assert.doesNotMatch(text, /delete_all first/i, `a fixable build is asked to rebuild:\n${text}`);
  for (const tool of ['delete_wire', 'add_wire', 'set_value']) {
    assert.match(text, new RegExp(`\\b${tool}\\b`), `the repair message doesn't name ${tool}:\n${text}`);
  }
  for (const w of wires) {
    const id = new RegExp(`\\b${w.id}\\b`);
    assert.ok(lines.some(l => id.test(l) && l.includes(w.from) && l.includes(w.to)),
      `no line names ${w.id} with ${w.from} and ${w.to}:\n${text}`);
  }
  for (const p of want) assert.ok(lines.includes(`- ${p}`), `the problem is not listed as "- ${p}":\n${text}`);
}
// Today's rebuild message, exactly: the heading, then one "- " line per problem.
function assertRebuildMessage(text, want) {
  assert.equal(text, `${REBUILD_HEADING}\n${want.map(p => `- ${p}`).join('\n')}`, `expected today's rebuild message:\n${text}`);
}

for (const [name, replies, message, board, wiresAfter, problemsOf] of [
  ['a fixable rebuild (W4 on the wrong rail)',
    [tools('a', WRONG), says('Built it.'), tools('b', FIX_W4), says('Fixed.')], BUILD_MSG, undefined,
    () => Board.apply(Board.empty(), WRONG).board.wires, () => Server.checkBuild(WRONG)],
  ['an edit on a sent board (a bare LED added)',
    [tools('a', BARE_LED_EDIT), says('Added an LED.'), tools('b', [{ tool: 'delete_part', part: 'LED2' }]), says('Took it out.')], 'Add another LED.', LED_BOARD,
    () => Board.apply(LED_BOARD, BARE_LED_EDIT).board.wires, () => Server.checkBuild(BARE_LED_EDIT, LED_BOARD)],
]) {
  test(`the repair message for ${name} lists every wire with its id and ends, and asks for delete_wire / add_wire / set_value fixes`, async () => {
    const want = problemsOf();
    assert.ok(want.length > 0, 'precondition: the checker finds a problem');
    assert.ok(!want.some(p => /is not wired to a .*rail/.test(p)), `precondition: the build is usable: ${JSON.stringify(want)}`);
    const { calls } = await ask(replies, message, board);
    assertFixMessage(firstRepair(calls), wiresAfter(), want);
  });
}

// Decision 2 on the issue: inside a delete_all rebuild the checker can't see
// a delete_part, so a rebuild is asked for fixes only when every problem is
// wire-level. A problem that needs a part turned or moved ("backwards",
// "Swap holeA", "forward path", "not placed", or a stacked hole whose list
// names no wire) keeps today's rebuild message. The fake checker gives the
// rebuild these problems; the model's build is WRONG (wires W1…W4).
const BACKWARDS_P = 'The LED at c6/c8 is backwards: its cathode c6 is on the power side and its anode c8 is on the ground side. Swap holeA and holeB.';
const NO_PATH_P   = 'The LED at c8/c6 has no forward path from + to −, so it cannot light. Check each diode on its path: cathode (holeA) toward −, anode (holeB) toward +.';
const STACKED_P   = 'Hole b10 holds 2 leads (2 LEDs). A hole takes one lead; use another hole in the same column.';
const NOT_PLACED_P = 'R2 not placed: a resistor\'s leads must be 3–5 columns apart; b2 to b32 is 30.';
const WIRE_HOLE_P = 'Hole a8 holds 2 leads (the resistor and a wire). A hole takes one lead; use another hole in the same column.';
const SHORT_P     = 'BAT1.0 and BAT1.1 are joined by wires alone, which is a short circuit across the battery. Put a resistor or other part between them.';

for (const [name, list, kind] of [
  ['a backwards LED ("Swap holeA and holeB")',          [BACKWARDS_P],          'rebuild'],
  ['no forward path',                                    [NO_PATH_P],            'rebuild'],
  ['a stacked hole naming no wire (2 LEDs)',             [STACKED_P],            'rebuild'],
  ['a part not placed',                                  [NOT_PLACED_P],         'rebuild'],
  ['a wire-level problem and a backwards LED together',  [SHORT_P, BACKWARDS_P], 'rebuild'],
  ['a stacked hole with a wire in it',                   [WIRE_HOLE_P],          'fix'],
  ['wires alone shorting the battery',                   [SHORT_P],              'fix'],
]) {
  test(`decision 2: a rebuild whose problems are ${name} gets ${kind === 'fix' ? 'the fix message' : 'today\'s rebuild message'}`, async () => {
    const { calls } = await runLoop([tools('a', WRONG), says('Built it.'), says('Done.')], [[WRONG, list]]);
    const text = firstRepair(calls);
    if (kind === 'fix') assertFixMessage(text, Board.apply(Board.empty(), WRONG).board.wires, list);
    else assertRebuildMessage(text, list);
  });
}

// Pin (passes today): an unusable build keeps the rebuild wording.
test('pin: the repair message for parts placed with no wires (BAT1.0 not wired, nothing powered) keeps the rebuild heading', async () => {
  assert.ok(Server.checkBuild(NO_WIRES).some(p => /^BAT1\.0 is not wired to a positive rail/.test(p)),
    `precondition: ${JSON.stringify(Server.checkBuild(NO_WIRES))}`);
  const { calls } = await ask([tools('a', NO_WIRES), says('Placed the parts.'), tools('b', GOOD), says('Built it.')], BUILD_MSG);
  assertRebuildMessage(firstRepair(calls), Server.checkBuild(NO_WIRES));
});

// ── The fix lands on the queued build ───────────────────────────────────────

function simulate(actions) {
  const { board } = Board.apply(Board.empty(), actions);
  const { components, wires } = Board.toSim(board);
  return { board, result: Sim.analyze(components, wires) };
}

test('a fixable rebuild repaired with delete_wire W4 + add_wire a8 → tn_8 is checked as fixed: one repair, no Heads up, the LED lights as the recipe does', async () => {
  const lit = simulate(GOOD).result.parts.LED1.m.current;
  assert.ok(Math.abs(simulate([...WRONG, ...FIX_W4]).result.parts.LED1.m.current - lit) < 1e-9, 'precondition: applied in order, the fix is the recipe\'s board');

  const { out, calls } = await ask([tools('a', WRONG), says('Built it.'), tools('b', FIX_W4), says('Fixed.')], BUILD_MSG);
  const users = calls[calls.length - 1].messages.filter(m => m.role === 'user').slice(1).map(m => String(m.content).split('\n')[0]);
  assert.equal(calls.length, 4, `the fix was judged on the deleted wire too: expected 4 requests (one repair), got ${calls.length}; user messages: ${JSON.stringify(users)}`);
  assert.doesNotMatch(out.reply, /Heads up/, `the fixed build is flagged: ${out.reply}`);

  const { board, result } = simulate(out.actions);
  const ends = board.wires.map(w => `${w.from}→${w.to}`);
  assert.ok(ends.includes('a8→tn_8') && !ends.includes('a8→tp_8'), `the board's wires: ${JSON.stringify(ends)}`);
  assert.ok(Math.abs(result.parts.LED1.m.current - lit) < 0.01, `LED1: ${result.parts.LED1.m.current} mA, want ${lit.toFixed(1)}`);
});

// ── 6. An empty rebuild never wins (issue #7) ───────────────────────────────

const DELETE_ALL = { tool: 'delete_all' };
// A wire with no part on either end.
const BARE_WIRE  = { tool: 'add_wire', from: 'tp_40', to: 'a40', color: 'red' };

test('precondition: the real checker calls delete_all alone clean, so an empty rebuild checks as 0 problems', () => {
  assert.deepStrictEqual(Server.checkBuild([DELETE_ALL]), [], 'if this changes, the empty-rebuild rule may no longer be needed');
});

// The fake checker calls the empty rebuild clean, as the real one does, so
// only the empty-rebuild rule keeps it out.
for (const [name, empty] of [
  ['delete_all alone',                  [DELETE_ALL]],
  ['delete_all and a wire, no parts',   [DELETE_ALL, BARE_WIRE]],
]) {
  test(`a repair answered with ${name} (0 problems) loses to the earlier 1-problem build: that build, its reply and "kept round 0: 1 problems"`, async () => {
    const { out, calls, lines, kept } = await runLoop([
      tools('a', BACKWARDS), says('Built it.'),
      tools('b', empty),     says('Cleared the board.'),
    ], [[BACKWARDS, problems(1, 'first build')]]);

    assert.equal(calls.length, 4, `precondition: the empty rebuild checks clean and ends the loop; got ${calls.length} requests`);
    assert.equal(boardOf(out.actions).parts.length > 0, true,
      `an empty board was sent: ${JSON.stringify(effective(out.actions))}`);
    assertBoard(out.actions, BACKWARDS, 'the build sent is round 0\'s (1 problem), not the empty rebuild (0 problems)');
    assert.equal(out.reply, 'Built it.', 'the reply goes with the build kept');
    assertKept(kept, 0, 1, lines);
  });
}

// Pin (passes today): with every attempt empty, the choice is #6's: fewest
// problems, a tie to the later one (not the first, not the last).
test('pin: every attempt empty: a tie (1 → 1) still goes to the later one, even when a worse empty one (3) follows it', async () => {
  const EMPTY_0 = [DELETE_ALL];
  const EMPTY_1 = [DELETE_ALL, BARE_WIRE];
  const EMPTY_2 = [DELETE_ALL, { tool: 'add_wire', from: 'tn_44', to: 'j44', color: 'black' }];
  const { out, calls, lines, kept } = await runLoop([
    tools('a', EMPTY_0), says('Cleared it.'),
    tools('b', EMPTY_1), says('Added a wire.'),
    tools('c', EMPTY_2), says('Moved the wire.'),
  ], [[EMPTY_0, problems(1, 'empty 0')], [EMPTY_1, problems(1, 'empty 1')], [EMPTY_2, problems(3, 'empty 2')]]);

  assert.equal(calls.length, 6, `precondition: two repairs; got ${calls.length} requests`);
  assertBoard(out.actions, EMPTY_1, 'with every attempt empty, round 1 is kept (the tie with round 0 goes to the later; round 2 is worse)');
  assert.equal(out.reply, 'Added a wire.');
  assertKept(kept, 1, 1, lines);
});

// Pin (passes today): an edit on a sent board has no delete_all, so it is
// never an empty rebuild, even when its own steps place no part. It is
// judged on its problems: the wire move (1) beats the repair that adds a
// resistor (2).
test('pin: an edit on a sent board that places no part is not empty: the 1-problem wire move beats the 2-problem repair that adds a resistor', async () => {
  const MOVE_W4 = [{ tool: 'delete_wire', wire: 'W4' }, { tool: 'add_wire', from: 'a8', to: 'tp_8', color: 'red' }];
  const { out, calls, lines, kept } = await runLoop([
    tools('a', MOVE_W4), says('Moved the LED wire.'),
    tools('b', [PLACE_R]), says('Added a resistor.'),
    says('Done.'),
  ], [[MOVE_W4, problems(1, 'wire move')], [[...MOVE_W4, PLACE_R], problems(2, 'resistor added')]],
  { board: LED_BOARD, message: 'Move the LED\'s ground wire to the other rail.' });

  assert.equal(calls.length, 5, `precondition: two repairs (edit, end, resistor, end, "Done."); got ${calls.length} requests`);
  assert.deepStrictEqual(out.actions, MOVE_W4, `the edit kept should be round 0's wire move, got ${JSON.stringify(out.actions)}`);
  assert.equal(out.reply, 'Moved the LED wire.');
  assertKept(kept, 0, 1, lines);
});

// ── 7. A deadline returns the best build so far (issue #7) ──────────────────

const abortError = () => Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });

// Waits ms, or rejects like fetch when the signal aborts first.
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(abortError());
    if (!ms) return resolve();
    const t = ms === Infinity ? null : setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(abortError()); }, { once: true });
  });
}

// Request n follows steps[n] (the last repeats): { message, ms } answers
// after ms (Infinity: never, aborting like fetch), { status } is an HTTP
// error. Keeps every body and every signal.
function timedFetch(steps) {
  const calls = [], signals = [];
  const fn = async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    signals.push(opts.signal);
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    await wait(step.ms || 0, opts.signal);
    if (step.status) return { ok: false, status: step.status, text: async () => `upstream ${step.status}`, json: async () => ({}) };
    return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message: step.message }] }) };
  };
  Object.assign(fn, { calls, signals });
  return fn;
}

// Read per ask and changed by the tests below: put back after each one.
const ENV = ['DEEPSEEK_THINKING', 'DEEPSEEK_TIMEOUT_MS', 'DEEPSEEK_FALLBACK_MODEL'];
function withEnv(set, body) {
  const saved = ENV.map(k => process.env[k]);
  for (const k of ENV) { if (set[k] === undefined) delete process.env[k]; else process.env[k] = set[k]; }
  return Promise.resolve().then(body).finally(() => {
    ENV.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; });
  });
}

const DEFAULT_DEADLINE = 240000;   // DEEPSEEK_TIMEOUT_MS unset (issue #4)
const REASONING = 30000;           // each answered round, as a reasoning build takes
const HANG      = { ms: Infinity };
const answer    = message => ({ message, ms: REASONING });

// On a fake clock, with the live defaults: reasoning on (so no 25 s switch
// to the fallback), the 240 s deadline, the fallback left on. Each answered
// round takes 30 s; the last request never answers.
const DEADLINE_CASES = [
  ['a deadline during the second repair, after a repair that made it worse (1 → 2), returns the first build, its reply, and logs "deadline: kept round 0: 1 problems"',
    [answer(tools('a', BACKWARDS)), answer(says('Built it.')), answer(tools('b', WRONG)), answer(says('Rebuilt it.')), HANG],
    [[BACKWARDS, problems(1, 'first build')], [WRONG, problems(2, 'rebuild')]],
    { board: BACKWARDS, reply: 'Built it.', round: 0, count: 1 }],
  ['a deadline during the second repair, after it queued a half-finished rebuild (delete_all, a battery), returns the best recorded build (the 1 → 1 tie: round 1), never the half-finished one',
    [answer(tools('a', BACKWARDS)), answer(says('Built it.')), answer(tools('b', WRONG)), answer(says('Rebuilt it.')),
      answer(tools('c', [DELETE_ALL, { tool: 'place_battery' }], 'Starting over.')), HANG],
    [[BACKWARDS, problems(1, 'first build')], [WRONG, problems(1, 'rebuild')]],
    { board: WRONG, reply: 'Rebuilt it.', round: 1, count: 1 }],
  ['pin: a deadline before any turn-end, with the build\'s steps already queued, still rejects with AI_TIMEOUT',
    [answer(tools('a', BACKWARDS)), HANG],
    [[BACKWARDS, problems(1, 'first build')]],
    'AI_TIMEOUT'],
];

test.each(DEADLINE_CASES)('%s', (_, steps, table, want) => withEnv({ DEEPSEEK_THINKING: undefined, DEEPSEEK_TIMEOUT_MS: undefined, DEEPSEEK_FALLBACK_MODEL: undefined }, async () => {
  vi.useFakeTimers();
  try {
    const fetch = timedFetch(steps);
    const lines = keepConsole();
    let out = null;
    P.askDeepSeek('', BUILD_MSG, [], { SYSTEM_PROMPT: 'S', CIRCUIT_TOOLS: TOOLS, fetch, apiKey: 'k', checkBuild: fakeCheck(table) }).then(
      value => { out = { state: 'resolved', value }; },
      error => { out = { state: 'rejected', error }; });

    await vi.advanceTimersByTimeAsync(DEFAULT_DEADLINE - 1000);
    assert.equal(out, null, `the ask ended before the ${DEFAULT_DEADLINE / 1000} s deadline: ${JSON.stringify(out && (out.value || out.error.message))}`);
    assert.equal(fetch.calls.length, steps.length, `precondition: every scripted request was made and the last one hangs; got ${fetch.calls.length} of ${steps.length}`);
    await vi.advanceTimersByTimeAsync(2000);
    assert.ok(out, `the ask had no answer 1 s past the ${DEFAULT_DEADLINE / 1000} s deadline`);
    assert.equal(fetch.signals[fetch.signals.length - 1].aborted, true, 'the hung request is still open after the deadline');

    if (want === 'AI_TIMEOUT') {
      assert.equal(out.state, 'rejected', `with no build recorded, the ask should fail with the timeout; got a reply: ${JSON.stringify(out.value)}`);
      assert.equal(out.error && out.error.code, 'AI_TIMEOUT', `rejected without code AI_TIMEOUT: ${out.error && out.error.message}`);
      return;
    }
    assert.equal(out.state, 'resolved',
      `the deadline threw away the recorded build(s): rejected with ${out.error && out.error.code} (${out.error && out.error.message})`);
    assertBoard(out.value.actions, want.board, 'the build returned at the deadline');
    assert.equal(out.value.reply, want.reply, 'the reply goes with the build kept');
    const deadline = lines.filter(l => l.startsWith('[repair] deadline'));
    assert.equal(deadline.length, 1, `expected one "[repair] deadline: kept round ${want.round}: ${want.count} problems" line, got ${JSON.stringify(deadline)}; [repair] lines: ${JSON.stringify(lines.filter(l => l.startsWith('[repair]')))}`);
    assert.match(deadline[0], new RegExp(`^\\[repair\\] deadline: kept round ${want.round}: ${want.count} problems?\\b`), `the deadline line: ${JSON.stringify(deadline[0])}`);
  } finally {
    vi.useRealTimers();
  }
}));

// Pin (passes today): the fallback's restart keeps nothing from the
// primary's rounds (#130), its recorded attempts included. The primary's
// 1-problem build would beat every fallback attempt (2) if it were kept.
test('pin: after the primary records a build and then fails (500), the fallback\'s attempts alone are judged: its build comes back, not the primary\'s better one', () => withEnv({ DEEPSEEK_THINKING: '0', DEEPSEEK_TIMEOUT_MS: undefined, DEEPSEEK_FALLBACK_MODEL: undefined }, async () => {
  const fetch = timedFetch([
    { message: tools('a', BACKWARDS) }, { message: says('Built it.') },        // the primary: round 0, 1 problem
    { status: 500 },                                                           // the primary fails on its repair
    { message: tools('f', WRONG) }, { message: says('Built it on the fallback.') }, // the fallback: round 0, 2 problems
    { message: says('Done.') },                                                // rounds 1 and 2, 2 problems each
  ]);
  const { out, calls, lines, kept } = await runLoop(null, [[BACKWARDS, problems(1, 'primary')], [WRONG, problems(2, 'fallback')]], { fetch });

  assert.equal(calls.length, 7, `precondition: the primary's build, its end, the 500, then the fallback's build and three ends; got ${calls.length} requests`);
  assert.notEqual(calls[3].model, calls[0].model, `precondition: the fourth request went to the fallback; models ${JSON.stringify(calls.map(c => c.model))}`);
  assertBoard(out.actions, WRONG, 'the fallback\'s build, not the primary\'s');
  assert.equal(out.reply, 'Done.');
  assertKept(kept, 2, 2, lines);
}));
