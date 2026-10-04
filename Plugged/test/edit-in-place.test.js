// Edit in place (issue #85). "Fix it." fixes only what is wrong and "Add a
// second LED" adds only the new LED; a delete_all rebuild is for new builds
// and "start over".
//
// Shapes these tests assume (decided on the issue, stated so the builder
// matches them):
// - The prompt's BUILDING BEHAVIOR section (the per-request DeepSeek prompt
//   and SYSTEM_PROMPT) says: keep every part and wire that is correct;
//   change only what is wrong (delete_wire, delete_part, set_value, then
//   place/wire what is missing); to add, place only the new parts and wires;
//   delete_all only when the user asks to start over or build something new;
//   for "Fix it.", say what was wrong first, then what you changed. The old
//   "never patch … Always clear and rebuild" rule is gone. The worked recipes
//   still start with delete_all (they are for new builds).
// - Repair heading by kind: a reply with a delete_all keeps
//     "Your build has problems. Rebuild it with these fixed (delete_all first, then the whole corrected circuit):"
//   (pinned by test/repair-loop.test.js); an edit gets
//     "Your build has problems. Fix only these, keeping everything else:"
// - Server.checkBuild(actions, board, { fullCheck }): with fullCheck an edit
//   on a sent board reports every problem on the board after the edit, not
//   just the ones it adds. The loop sets it when the user's message matches
//   /\b(fix|repair)\b/i; any other edit stays "after minus before".
// - A reply with a delete_all, on a board that has parts, to a message that
//   does not match /\b(build|make|create|start over|new|from scratch|again)\b/i
//   logs console.warn('[edit] delete_all …'). It is not refused.
//
// How: the real Server.ask with AI_PROVIDER=deepseek and a fake global fetch
// (as in test/repair-loop.test.js). No network, no key; the simulator and
// board model are real.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'deepseek';
process.env.RECORD_FIXTURES = '0';     // never write ask fixtures from here
const Server  = require('../backend/server.js');
const Board   = require('../circuit3d/js/board-model.js');
const Recipes = require('./fixtures/recipes.js');

const EDIT_HEADING    = 'Your build has problems. Fix only these, keeping everything else:';
const REBUILD_HEADING = 'Your build has problems. Rebuild it with these fixed (delete_all first, then the whole corrected circuit):';

// ── Boards and replies ──────────────────────────────────────────────────────

const GOOD = Recipes.ONE_LED;
const BACKWARDS = GOOD.map(a => (a.tool === 'place_led' ? { ...a, holeA: 'c6', holeB: 'c8' } : a));
// The one-LED build as the browser sends it: BAT1, R1, LED1, W1…W4.
const LED_BOARD = Board.apply(Board.empty(), GOOD).board;
// The same with LED1 backwards (anode c8 on the ground column).
const BACK_BOARD = Board.apply(Board.empty(), BACKWARDS).board;
// Half built: BAT1 with only BAT1.0 → tp_63 wired (see repair-loop.test.js).
const HALF_BOARD = {
  parts: [
    { type: 'battery',  label: 'BAT1' },
    { type: 'resistor', label: 'R1', holes: ['b2', 'b6'] },
    { type: 'led',      label: 'LED1', holes: ['c8', 'c6'] },
  ],
  wires: [{ id: 'W1', from: 'BAT1.0', to: 'tp_63' }],
};
// An edit adding an LED straight across the rails, no resistor (LED2).
const LED_NO_RESISTOR_EDIT = [
  { tool: 'place_led', holeA: 'c20', holeB: 'c18' },
  { tool: 'add_wire', from: 'tp_18', to: 'a18', color: 'red' },
  { tool: 'add_wire', from: 'a20', to: 'tn_20', color: 'black' },
];
const SET_1K = [{ tool: 'set_value', part: 'R1', resistance: 1000 }];
// LED1 turned round in the same holes: the minimal fix of BACK_BOARD.
const FLIP_LED1 = [{ tool: 'delete_part', part: 'LED1' }, { tool: 'place_led', holeA: 'c8', holeB: 'c6' }];

// ── The fake DeepSeek ───────────────────────────────────────────────────────

function scriptedDeepSeek(replies) {
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
const tools = (prefix, actions) => ({
  content: '',
  tool_calls: actions.map((a, i) => { const { tool, ...args } = a; return call(`${prefix}${i}`, tool, args); }),
});
const says = text => ({ content: text, tool_calls: null });

const repairsIn = body => body.messages.filter(m => m.role === 'user' && /^Your build has problems/.test(String(m.content || '')));
const userHeads = body => body.messages.filter(m => m.role === 'user').slice(1).map(m => String(m.content || '').split('\n')[0]);

// Server.ask on a sent board; console is spied, warn calls kept.
async function runOn(board, replies, message, markdown = '') {
  const fetch = scriptedDeepSeek(replies);
  vi.stubGlobal('fetch', fetch);
  for (const m of ['log', 'info']) vi.spyOn(console, m).mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const out = await Server.ask(markdown, message, [], board);
  const warns = warn.mock.calls.map(args => args.map(String).join(' '));
  return { out, calls: fetch.calls, last: fetch.calls[fetch.calls.length - 1], warns };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// ── 1. The prompt's build rules ─────────────────────────────────────────────

// The BUILDING BEHAVIOR section: from its heading to the next blank line.
function buildingRules(prompt) {
  const start = prompt.indexOf('BUILDING BEHAVIOR:');
  assert.ok(start >= 0, 'the prompt has no BUILDING BEHAVIOR section');
  const end = prompt.indexOf('\n\n', start);
  return prompt.slice(start, end < 0 ? undefined : end);
}

test('the per-request prompt for an edit on a built board says keep what is correct, change only what is wrong, delete_all only to start over', async () => {
  const { calls } = await runOn(LED_BOARD, [says('Sure.')], 'Add a second LED in parallel.', '## Components\n| R1 | resistor |');
  const system = calls[0].messages[0];
  assert.equal(system.role, 'system');
  for (const [name, prompt] of [['per-request prompt', system.content], ['SYSTEM_PROMPT', Server.SYSTEM_PROMPT]]) {
    const rules = buildingRules(prompt);
    // The rule that made every fix a rebuild is gone.
    assert.doesNotMatch(rules, /never patch/i, `${name}: still says "never patch":\n${rules}`);
    assert.doesNotMatch(rules, /always clear and rebuild/i, `${name}: still says "Always clear and rebuild":\n${rules}`);
    assert.doesNotMatch(rules, /\bfix\b[^\n]*delete_all FIRST/i, `${name}: still sends a fix through delete_all first:\n${rules}`);
    // The new rules, by meaning.
    assert.match(rules, /\bkeep\b[^\n]*\bcorrect\b/i, `${name}: no "keep every part and wire that is correct":\n${rules}`);
    assert.match(rules, /only what(?:'s| is) wrong/i, `${name}: no "change only what is wrong":\n${rules}`);
    assert.match(rules, /delete_wire/, `${name}: the edit tools (delete_wire) are not named in the build rules:\n${rules}`);
    assert.match(rules, /only the new parts/i, `${name}: no "to add, place only the new parts and wires":\n${rules}`);
    assert.match(rules, /delete_all[^\n]*start over|start over[^\n]*delete_all/i, `${name}: no "delete_all only when the user asks to start over":\n${rules}`);
    assert.match(rules, /what was wrong[^\n]*what you changed/i, `${name}: no "for Fix it., say what was wrong first, then what you changed":\n${rules}`);
  }
});

// Pin (passes today): the worked recipes stay rebuild-from-scratch.
test('pin: the one-LED recipe still starts with delete_all', () => {
  assert.match(Server.SYSTEM_PROMPT, /COMPLETE RECIPE FOR ONE LED[^\n]*\n\s*1\. delete_all/);
});

// ── 2. The repair heading by kind ───────────────────────────────────────────

test('an edit that adds a problem gets the edit heading ("Fix only these, keeping everything else:"), not the rebuild one', async () => {
  const { calls, last } = await runOn(LED_BOARD, [
    tools('a', LED_NO_RESISTOR_EDIT), says('Added an LED.'),
    tools('b', [{ tool: 'delete_part', part: 'LED2' }]), says('Took the bare LED out.'),
  ], 'Add another LED.');
  assert.equal(calls.length, 4, `expected 4 requests (edit, end, repair fix, end); user messages: ${JSON.stringify(userHeads(last))}`);
  const repairs = repairsIn(last);
  assert.equal(repairs.length, 1, `expected 1 repair message; user messages: ${JSON.stringify(userHeads(last))}`);
  const lines = repairs[0].content.split('\n');
  assert.equal(lines[0], EDIT_HEADING, `the edit's repair heading: ${JSON.stringify(lines[0])}`);
  assert.notEqual(lines[0], REBUILD_HEADING);
  assert.ok(lines.slice(1).some(l => /^- LED2: Short circuit/.test(l)), repairs[0].content);
});

// ── 3. "Fix it." gets the full check ────────────────────────────────────────

test('checkBuild(edit, board, { fullCheck: true }) reports the backwards LED already on the board', () => {
  assert.equal(typeof Server.checkBuild, 'function');
  // Without fullCheck an edit reports only what it adds: nothing here.
  assert.deepStrictEqual(Server.checkBuild(SET_1K, BACK_BOARD), [], 'precondition: after minus before is []');
  const problems = Server.checkBuild(SET_1K, BACK_BOARD, { fullCheck: true });
  assert.ok(Array.isArray(problems), `expected an array, got ${JSON.stringify(problems)}`);
  assert.ok(problems.some(p => /c6\/c8 is backwards/.test(p)), `no "c6/c8 is backwards" with fullCheck: ${JSON.stringify(problems)}`);
  assert.ok(problems.some(p => /^LED1: .*backwards/i.test(p)), `no "LED1: …backwards" with fullCheck: ${JSON.stringify(problems)}`);
  // A full check of a fixed board is clean.
  assert.deepStrictEqual(Server.checkBuild(FLIP_LED1, BACK_BOARD, { fullCheck: true }), []);
});

test('"Fix it." with an edit that leaves the backwards LED as it was gets a repair round (edit heading) naming it; the flip clears it', async () => {
  const FIXED = 'LED1 was backwards. I turned it round in the same holes.';
  const { out, calls, last } = await runOn(BACK_BOARD, [
    tools('a', SET_1K), says('Done.'),
    tools('b', FLIP_LED1), says(FIXED),
  ], 'Fix it.');
  assert.equal(calls.length, 4, `expected 4 requests (edit, end, repair fix, end), got ${calls.length}; user messages: ${JSON.stringify(userHeads(last))}`);
  const repairs = repairsIn(last);
  assert.equal(repairs.length, 1, `expected 1 repair message; user messages: ${JSON.stringify(userHeads(last))}`);
  assert.equal(repairs[0].content.split('\n')[0], EDIT_HEADING);
  assert.match(repairs[0].content, /c6\/c8 is backwards/, repairs[0].content);
  assert.equal(out.reply, FIXED);
  assert.deepStrictEqual(out.actions, [...SET_1K, ...FLIP_LED1], 'the edit and its repair, no rebuild');
});

// Pins (pass today, must keep passing): an edit that is not a "fix" is still
// judged only on what it adds, so a half-built board costs no round.
test('pin: "Make R1 1k." on the half-built board makes 2 requests and sends no repair message', async () => {
  for (const message of ['Make R1 1k.', 'Change the resistor to 1k, a fixed value.']) {
    const { out, calls, last } = await runOn(HALF_BOARD, [tools('e', SET_1K), says('Done.')], message);
    assert.equal(calls.length, 2, `${message}: expected 2 requests, got ${calls.length}; user messages: ${JSON.stringify(userHeads(last))}`);
    assert.equal(repairsIn(last).length, 0, `${message}: no repair message`);
    assert.equal(out.reply, 'Done.');
  }
});

// ── 4. A delete_all in reply to an edit is logged ───────────────────────────

const editWarns = warns => warns.filter(w => w.startsWith('[edit] delete_all'));

test('a delete_all rebuild in reply to "Fix it." / "Add a second LED" on a built board logs "[edit] delete_all…" and is still sent', async () => {
  // #85 review: "make <a part> <value>" and "add a new <part>" are edits, not new builds.
  for (const message of ['Fix it.', 'Add a second LED in parallel.', 'Make the resistor 1k.', 'Make LED1 green.', 'Add a new LED.']) {
    const { out, warns } = await runOn(BACK_BOARD, [tools('a', GOOD), says('Rebuilt it.')], message);
    assert.equal(editWarns(warns).length, 1, `${message}: expected one console.warn starting "[edit] delete_all", got ${JSON.stringify(warns)}`);
    assert.equal(out.actions[0] && out.actions[0].tool, 'delete_all', `${message}: the rebuild is not refused`);
    assert.deepStrictEqual(out.actions, GOOD);
  }
});

// Pins (pass today): no warning for a new build ("build", "make a <circuit>",
// "create", "new circuit"), "start over", "from scratch", "again", an empty
// board, or an edit without delete_all.
test('pin: no "[edit] delete_all" warning for a new build, start over, an empty board, or an edit', async () => {
  const rows = [
    ['a new build',          LED_BOARD,     GOOD,   'Build a single LED circuit with a current-limiting resistor.'],
    ['start over',           LED_BOARD,     GOOD,   'Start over with one LED.'],
    ['from scratch',         LED_BOARD,     GOOD,   'Do it from scratch.'],
    ['again',                LED_BOARD,     GOOD,   'Do it again.'],
    ['make a <circuit>',     LED_BOARD,     GOOD,   'Make a night light that turns an LED on when it gets dark.'],
    ['create',               LED_BOARD,     GOOD,   'Create a temperature alarm with a buzzer.'],
    ['new circuit',          LED_BOARD,     GOOD,   'New circuit: two LEDs in series.'],
    ['an empty board',       Board.empty(), GOOD,   'Fix it.'],
    ['an edit, no delete_all', BACK_BOARD,  FLIP_LED1, 'Fix it.'],
  ];
  for (const [name, board, actions, message] of rows) {
    const { warns } = await runOn(board, [tools('a', actions), says('Done.')], message);
    assert.deepStrictEqual(editWarns(warns), [], `${name}: ${JSON.stringify(warns)}`);
  }
});

// ── #85 review: the delete_all tool, the recipes, the parallel line ─────────

const deleteAllDecl = decls => decls.find(d => d.name === 'delete_all');

test('the delete_all tool no longer says to call it FIRST when building or fixing; it is for starting over or something new', async () => {
  const { calls } = await runOn(LED_BOARD, [says('Sure.')], 'Add a second LED in parallel.');
  const sent = (calls[0].tools || []).map(t => t.function).find(f => f.name === 'delete_all');
  for (const [name, d] of [['CIRCUIT_TOOLS', deleteAllDecl(Server.CIRCUIT_TOOLS[0].function_declarations)], ['the tool sent', sent]]) {
    assert.ok(d, `${name}: no delete_all tool`);
    const text = d.description || '';
    assert.doesNotMatch(text, /FIRST when building/i, `${name}: ${text}`);
    assert.doesNotMatch(text, /\bfix(ing)?\b/i, `${name}: still sends a fix through delete_all: ${text}`);
    assert.match(text, /start(ing)? over/i, `${name}: does not say it is for starting over: ${text}`);
    assert.match(text, /\bnew\b/i, `${name}: does not say it is for something new: ${text}`);
  }
});

test('the prompt says the worked recipes build from an empty board, and adding to an existing circuit means only the new steps', () => {
  const lines = Server.SYSTEM_PROMPT.split('\n');
  assert.ok(lines.some(l => /\brecipes?\b/i.test(l) && /\bempty board\b|\bfrom scratch\b/i.test(l)),
    'no line saying the worked recipes build from an empty board');
  assert.ok(lines.some(l => /\bexisting\b/i.test(l) && /only the new steps?\b/i.test(l)),
    'no line saying that adding to an existing circuit means doing only the new steps');
});

test('the parallel guidance no longer runs steps 1-8 on a board that already has the circuit', () => {
  const p = Server.SYSTEM_PROMPT;
  assert.match(p, /RECIPE FOR 2 LEDs IN PARALLEL/, 'precondition: SYSTEM_PROMPT has the LED pack');
  const lines = p.split('\n');
  const addLine = lines.find(l => /Add a second LED in parallel/i.test(l));
  assert.ok(addLine, 'no "Add a second LED in parallel" line');
  assert.doesNotMatch(addLine, /means the parallel recipe below/i, `still sends "Add a second LED" through the whole recipe: ${addLine}`);
  assert.match(addLine, /step 9|only the new LED|only (place|add) the (new|second) LED/i, `does not say to add only the new LED: ${addLine}`);
  const steps18 = lines.filter(l => /Steps 1-8/i.test(l));
  assert.ok(steps18.every(l => /\b(empty|new build|from scratch|not already)\b/i.test(l)),
    `"Steps 1-8" is not limited to an empty board: ${JSON.stringify(steps18)}`);
});

// ── #85 review: the Heads up after "Fix it." uses the full check ────────────

test('"Fix it." with an edit that leaves the backwards LED, never fixed in the repairs: the Heads up names it', async () => {
  const { out } = await runOn(BACK_BOARD, [
    tools('a', SET_1K), says('Done.'), says('Looks fine to me.'), says('Still fine.'),
  ], 'Fix it.');
  assert.match(out.reply, /Heads up, this build has a problem:/, `no Heads up after "Fix it." left LED1 backwards: ${JSON.stringify(out.reply)}`);
  assert.match(out.reply, /c6\/c8 is backwards/, out.reply);
});

// ── #85 eval: a wire already on the board is not added again ────────────────
// On "Fix it." the AI deleted and re-placed LED1 and also re-added a8 → tn_8,
// which W4 already is (delete_part keeps the wires in the part's columns), so
// a8 held two wire ends. Decided:
// - The server drops an add_wire whose ends equal a wire on the sent board,
//   or an earlier add_wire in the same reply, unless that wire was deleted in
//   between (delete_wire, or a delete_all). Either direction counts; hole
//   names compare case-insensitively, LABEL.k pins in canonical form.
// - In the DeepSeek loop the dropped call gets a tool result starting
//   "Refused:" that names the wire already there (e.g. W4). It is left out of
//   the returned actions; finishAIReply drops it too (the Gemini path).
// - A prompt line: wires connect to holes, not parts; delete_part removes
//   only the part, the wires in its columns stay; don't re-add a wire the
//   Wires table already lists.

const DUP_FIX = [...FLIP_LED1, { tool: 'add_wire', from: 'a8', to: 'tn_8', color: 'black' }];
const finish = (actions, board) => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  return Server.finishAIReply({ reply: 'Done.', actions: actions.map(a => ({ ...a })), board });
};
const wiresIn = actions => actions.filter(a => a.tool === 'add_wire').map(a => `${a.from}→${a.to}`);

test('finishAIReply: "Fix it." re-adding W4 (a8 → tn_8) after re-placing LED1 drops the add_wire; no stacked hole, no Heads up', () => {
  const out = finish(DUP_FIX, BACK_BOARD);
  assert.deepStrictEqual(out.actions, FLIP_LED1, `the duplicate wire is still sent: ${JSON.stringify(out.actions)}`);
  assert.doesNotMatch(out.reply, /Heads up/, out.reply);
});

test('Server.ask: the same "Fix it." reply comes back without the duplicate wire and without a Heads up', async () => {
  const { out } = await runOn(BACK_BOARD, [tools('a', DUP_FIX), says('LED1 was backwards; I turned it round.')], 'Fix it.');
  assert.deepStrictEqual(out.actions, FLIP_LED1, `the duplicate wire is still sent: ${JSON.stringify(out.actions)}`);
  assert.doesNotMatch(out.reply, /Heads up/, out.reply);
});

test('a wire already on the board counts in either direction, any case, and by LABEL.k pin', () => {
  for (const [name, wire, alreadyAs] of [
    ['reversed ends',  { from: 'tn_8', to: 'a8' },       'W4'],
    ['upper case',     { from: 'A8', to: 'TN_8' },       'W4'],
    ['battery pin',    { from: 'bat1.1', to: 'tn_63' },  'W2'],
    ['pin, reversed',  { from: 'tn_63', to: 'BAT1.1' },  'W2'],
  ]) {
    const out = finish([{ tool: 'add_wire', ...wire }], LED_BOARD);
    assert.deepStrictEqual(wiresIn(out.actions), [], `${name}: ${wire.from} → ${wire.to} is ${alreadyAs}, but it is still sent`);
  }
});

test('the same new wire twice in one reply keeps the first only', () => {
  const out = finish([
    { tool: 'add_wire', from: 'a20', to: 'a24' },
    { tool: 'add_wire', from: 'a24', to: 'a20' },
    { tool: 'add_wire', from: 'a20', to: 'a24' },
  ], LED_BOARD);
  assert.deepStrictEqual(wiresIn(out.actions), ['a20→a24']);
});

// Pins (pass today): a wire deleted earlier in the reply may come back, and a
// different wire is never dropped.
test('pin: a wire re-added after its delete_wire in the same reply is kept; a new wire is kept', () => {
  const back = [{ tool: 'delete_wire', wire: 'W4' }, { tool: 'add_wire', from: 'a8', to: 'tn_8' }];
  assert.deepStrictEqual(finish(back, LED_BOARD).actions, back);
  const fresh = [{ tool: 'add_wire', from: 'a8', to: 'tn_9' }];
  assert.deepStrictEqual(finish(fresh, LED_BOARD).actions, fresh);
});

test('DeepSeek loop: the duplicate add_wire gets a "Refused:" tool result naming W4; the others are queued', async () => {
  const { calls } = await runOn(BACK_BOARD, [tools('a', DUP_FIX), says('LED1 was backwards; I turned it round.')], 'Fix it.');
  const results = Object.fromEntries(calls[1].messages.filter(m => m.role === 'tool').map(m => [m.tool_call_id, String(m.content)]));
  assert.ok(results.a2, `no tool result for the add_wire: ${JSON.stringify(results)}`);
  assert.match(results.a2, /^Refused:/, `the duplicate add_wire was queued: ${results.a2}`);
  assert.match(results.a2, /\bW4\b/, `the refusal does not name W4: ${results.a2}`);
  for (const id of ['a0', 'a1']) assert.doesNotMatch(results[id] || '', /^Refused:/, `${id}: ${results[id]}`);
});

test('the prompt says wires connect to holes, not parts; delete_part leaves the wires in its columns; never re-add a listed wire', () => {
  const lines = Server.SYSTEM_PROMPT.split('\n');
  assert.ok(lines.some(l => /\bholes?\b[^\n]*\bnot (to )?(the )?parts?\b/i.test(l)),
    'no line saying wires connect to holes, not parts');
  assert.ok(lines.some(l => /\bdelete_part\b/.test(l) && /\bwires?\b[^\n]*\bstay/i.test(l)),
    'no line saying delete_part leaves the wires in its columns');
  assert.ok(lines.some(l => /\bWires table\b/i.test(l) && /\b(re-?add|again|already)\b/i.test(l)),
    'no line saying not to re-add a wire the Wires table already lists');
});
