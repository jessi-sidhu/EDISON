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

// deepSeekRounds with a fake checkBuild.
async function runLoop(replies, table) {
  const fetch = scriptedFetch(replies);
  const lines = keepConsole();
  const out = await P.askDeepSeek('', 'Build a single LED circuit with a current-limiting resistor.', [],
    { SYSTEM_PROMPT: 'S', CIRCUIT_TOOLS: TOOLS, fetch, apiKey: 'k', checkBuild: fakeCheck(table) });
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
