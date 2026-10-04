// The repair loop (issue #83). Before the user sees a
// full rebuild, the server checks and simulates it; if something is wrong,
// DeepSeek gets the specific problems back and fixes them, at most 2 rounds.
//
// Shapes these tests assume (decided on the issue, stated so the builder
// matches them):
// - Server.checkBuild(actions) → array of problem strings, [] when fine.
//   - Only for a full rebuild (actions contain delete_all); otherwise [].
//   - findCircuitProblems(actions, { labelForm: true })'s strings, plus the
//     simulator's: status 'unsolvable' / 'unsettled' (one sentence), shorted
//     (one sentence), and each part's warnings as "<label>: <warning>".
//     Exact duplicates removed.
//   - The board is Board.apply(Board.empty(), actions).board, applied in
//     order, so a second delete_all starts the board again. The whole check
//     judges that board: a build the model redid after a delete_all is not
//     blamed for the parts it cleared.
//   - Board.apply errors are not problems (the live board accepts older pin
//     forms). A throw in the simulation part yields just the checker's list.
// - askDeepSeek gets it as ctx.checkBuild. When the model ends its turn with
//   problems, fewer than 2 repair rounds so far, and rounds left under
//   DEEPSEEK_MAX_ROUNDS, it adds one user message:
//     "Your build has problems. Rebuild it with these fixed (delete_all first, then the whole corrected circuit):"
//     then "- <problem>" per problem, and carries on. The heading matches
//   today's prompt rule (a fix is a delete_all rebuild) until the
//   edit-in-place issue changes the rules. Repair-round actions are
//   appended; the reply is the model's latest non-empty text.
// - finishAIReply still runs after the loop, so what is still wrong shows as
//   today's "Heads up, this build has a problem:".
//
// How: the real Server.ask with AI_PROVIDER=deepseek and a fake global fetch
// that answers with one scripted assistant message per round and keeps the
// request bodies. No network, no key. The simulator and board model are real.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'deepseek';
process.env.RECORD_FIXTURES = '0';     // never write ask fixtures from here
const Server    = require('../backend/server.js');
const Providers = require('../backend/ai-providers.js');
const Board     = require('../circuit3d/js/board-model.js');
const Sim       = require('../circuit3d/js/simulate.js');
const Recipes   = require('./fixtures/recipes.js');

const HEADING = 'Your build has problems. Rebuild it with these fixed (delete_all first, then the whole corrected circuit):';
const MAX_ROUNDS = Providers.DEEPSEEK_MAX_ROUNDS;

// ── Builds ──────────────────────────────────────────────────────────────────

// The prompt's one-LED recipe: resistor b2-b6, LED cathode c8, anode c6.
const GOOD = Recipes.ONE_LED;
// The same with the LED's leads swapped: anode c8 on the ground column.
const BACKWARDS = GOOD.map(a => a.tool === 'place_led' ? { ...a, holeA: 'c6', holeB: 'c8' } : a);
// An LED straight across the rails, no resistor.
const NO_RESISTOR = [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  { tool: 'add_wire', from: 'BAT1.0', to: 'tp_50', color: 'red' },
  { tool: 'add_wire', from: 'BAT1.1', to: 'tn_50', color: 'black' },
  { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
  { tool: 'add_wire', from: 'tp_6', to: 'a6', color: 'red' },
  { tool: 'add_wire', from: 'a8', to: 'tn_8', color: 'black' },
];
// The good build with the older battery pin form, which Board.apply rejects
// (so the model's board has an unwired battery). The live board still reads
// it, but since #199 finishAIReply drops a reply whose wire ends Board.apply
// can't read, so this form never reaches the page from the server.
const LEGACY_PINS = GOOD.map(a =>
  a.from === 'BAT1.0' ? { ...a, from: 'battery_0_pin0' }
  : a.from === 'BAT1.1' ? { ...a, from: 'battery_0_pin1' } : a);

function simulate(actions) {
  const { board, errors } = Board.apply(Board.empty(), actions);
  const { components, wires } = Board.toSim(board);
  return { board, errors, result: Sim.analyze(components, wires) };
}

// ── The fake DeepSeek ───────────────────────────────────────────────────────

// Answers each request with the next scripted message, keeps every body.
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
const asCalls = (prefix, actions) => actions.map((a, i) => {
  const { tool, ...args } = a;
  return call(`${prefix}${i}`, tool, args);
});
const tools = (prefix, actions) => ({ content: '', tool_calls: asCalls(prefix, actions) });
const says  = text => ({ content: text, tool_calls: null });

// The repair messages in a request body.
const repairsIn = body => body.messages.filter(m => m.role === 'user' && String(m.content || '').startsWith(HEADING));
// The first line of each user message after the question, for failure output.
const userHeads = body => body.messages.filter(m => m.role === 'user').slice(1).map(m => String(m.content || '').split('\n')[0]);

async function run(replies, message = 'Build a single LED circuit with a current-limiting resistor.', markdown = '') {
  const fetch = scriptedDeepSeek(replies);
  vi.stubGlobal('fetch', fetch);
  for (const m of ['log', 'info', 'warn']) vi.spyOn(console, m).mockImplementation(() => {});
  const out = await Server.ask(markdown, message, []);
  return { out, calls: fetch.calls, last: fetch.calls[fetch.calls.length - 1] };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// Server.checkBuild, failing as an assertion while it doesn't exist yet.
function checkBuild(actions) {
  assert.equal(typeof Server.checkBuild, 'function', 'server.js exports no checkBuild(actions)');
  return Server.checkBuild(actions);
}

// ── checkBuild ──────────────────────────────────────────────────────────────

test('checkBuild is exported from the server', () => {
  assert.equal(typeof Server.checkBuild, 'function', 'server.js exports no checkBuild(actions)');
});

test('checkBuild: the one-LED recipe has no problems', () => {
  assert.deepStrictEqual(checkBuild(GOOD), []);
});

test('checkBuild: a backwards LED is named by label, holes and fix', () => {
  const problems = checkBuild(BACKWARDS);
  assert.ok(Array.isArray(problems), `expected an array, got ${JSON.stringify(problems)}`);
  // The checker's sentence: the holes and the fix.
  assert.ok(problems.some(p => /c6\/c8 is backwards/.test(p) && /Swap holeA and holeB/.test(p)),
    `no checker problem naming c6/c8 and the swap: ${JSON.stringify(problems)}`);
  // The simulator's warning, under the part's label.
  assert.ok(problems.some(p => /^LED1: .*backwards/i.test(p)),
    `no "LED1: ...backwards" simulator problem: ${JSON.stringify(problems)}`);
  assert.equal(new Set(problems).size, problems.length, `duplicates: ${JSON.stringify(problems)}`);
});

test('checkBuild: an LED straight across the rails is a short, with the resistor fix', () => {
  // The checker finds nothing here; only the simulator does.
  assert.deepStrictEqual(Server.findCircuitProblems(NO_RESISTOR), []);
  const problems = checkBuild(NO_RESISTOR);
  assert.ok(Array.isArray(problems), `expected an array, got ${JSON.stringify(problems)}`);
  assert.ok(problems.some(p => /short/i.test(p) && !/^[A-Z]+\d+: /.test(p)),
    `no one-sentence short-circuit problem (sim shorted: true): ${JSON.stringify(problems)}`);
  assert.ok(problems.some(p => /^LED1: Short circuit\..*no current-limiting resistor/.test(p)),
    `no "LED1: Short circuit..." warning: ${JSON.stringify(problems)}`);
  assert.ok(problems.some(p => /^LED1: Put a resistor in series: at least 350 ohm/.test(p)),
    `no "LED1: Put a resistor in series..." warning: ${JSON.stringify(problems)}`);
});

test('checkBuild: a reply without delete_all is an edit, never checked', () => {
  for (const actions of [
    [{ tool: 'set_value', part: 'R1', resistance: 1000 }],
    BACKWARDS.filter(a => a.tool !== 'delete_all'),   // broken, but not a full rebuild
    [],
  ]) {
    assert.deepStrictEqual(checkBuild(actions), [], `for ${JSON.stringify(actions)}`);
  }
});

test('checkBuild: Board.apply errors alone (older battery pin form) are not problems', () => {
  assert.ok(simulate(LEGACY_PINS).errors.length > 0, 'precondition: Board.apply rejects battery_0_pin0');
  assert.deepStrictEqual(Server.findCircuitProblems(LEGACY_PINS), [], 'precondition: the checker is happy');
  assert.deepStrictEqual(checkBuild(LEGACY_PINS), []);
});

test('checkBuild: a simulator that throws leaves just the checker problems', () => {
  vi.spyOn(Sim, 'analyze').mockImplementation(() => { throw new Error('boom'); });
  const problems = checkBuild(BACKWARDS);
  vi.restoreAllMocks();
  assert.deepStrictEqual(problems, Server.findCircuitProblems(BACKWARDS, { labelForm: true }));
});

test('checkBuild: a rebuild after a second delete_all is judged from that delete_all', () => {
  // What the repair loop sends on: the backwards build, then the model's
  // fixed rebuild appended. Applied in order, the board is the good build.
  assert.equal(simulate([...BACKWARDS, ...GOOD]).result.parts.LED1.m.on, true, 'precondition: the board lights');
  assert.deepStrictEqual(checkBuild([...BACKWARDS, ...GOOD]), []);
});

// ── The loop ────────────────────────────────────────────────────────────────

test('a backwards LED fixed in one repair round: one repair message, the good board, no Heads up', async () => {
  const FIXED = 'Fixed: the LED faces the right way now.';
  const { out, calls, last } = await run([
    tools('a', BACKWARDS),
    says('Built it.'),
    tools('b', GOOD),
    says(FIXED),
  ]);

  assert.equal(calls.length, 4, `expected 4 requests (build, end, repair build, end), got ${calls.length}`);
  assert.equal(repairsIn(calls[1]).length, 0, 'no repair before the model ends its first turn');
  const repairs = repairsIn(last);
  assert.equal(repairs.length, 1, `expected exactly 1 repair message headed ${JSON.stringify(HEADING)}, got ${repairs.length}; user messages sent: ${JSON.stringify(userHeads(last))}`);
  const text = repairs[0].content;
  const lines = text.split('\n');
  assert.equal(lines[0], HEADING, `the heading line: ${JSON.stringify(lines[0])}`);
  const items = lines.slice(1).filter(l => l.trim());
  assert.ok(items.length > 0 && items.every(l => l.startsWith('- ')), `one "- <problem>" line each: ${text}`);
  assert.ok(items.some(l => /c6\/c8 is backwards/.test(l) && /c6/.test(l) && /Swap holeA and holeB/.test(l)),
    `the repair names the holes and the fix: ${text}`);
  assert.ok(items.some(l => /^- LED1: /.test(l)), `the repair names the part (LED1): ${text}`);

  const { board, result } = simulate(out.actions);
  assert.deepStrictEqual(board.parts.map(p => p.label).sort(), ['BAT1', 'LED1', 'R1'], 'the whole final build, once');
  assert.equal(result.parts.LED1.m.on, true, 'the final board lights the LED');
  assert.doesNotMatch(out.reply, /Heads up/, `a fixed build has no Heads up: ${out.reply}`);
  assert.equal(out.reply, FIXED, 'the reply is the repair round\'s text');
});

test('still backwards after 2 repair rounds: the loop stops and the Heads up names the problem', async () => {
  const { out, calls, last } = await run([
    tools('a', BACKWARDS), says('Built it.'),
    tools('b', BACKWARDS), says('Fixed it.'),
    tools('c', BACKWARDS), says('Fixed it again.'),
  ]);

  assert.equal(repairsIn(last).length, 2, `expected exactly 2 repair messages, got ${repairsIn(last).length}; user messages sent: ${JSON.stringify(userHeads(last))}`);
  assert.equal(calls.length, 6, `no third repair round: expected 6 requests, got ${calls.length}`);
  assert.match(out.reply, /Heads up, this build has a problem:/, out.reply);
  assert.match(out.reply, /c6\/c8 is backwards/, out.reply);
  assert.match(out.reply, /^Fixed it again\./, 'the reply is the latest text');
});

// Pins (pass today): the loop must not add a round to a good build or an edit.
for (const [name, replies] of [
  ['a good build', [tools('a', GOOD), says('Built it.')]],
  ['a set_value edit', [tools('e', [{ tool: 'set_value', part: 'R1', resistance: 1000 }]), says('Done.')]],
  ['an edit placing a part without delete_all', [tools('e', BACKWARDS.filter(a => a.tool !== 'delete_all')), says('Added.')]],
]) {
  test(`pin: ${name} gets no repair round`, async () => {
    const { out, calls, last } = await run(replies);
    assert.equal(calls.length, 2, `expected 2 requests (tools, end), got ${calls.length}`);
    assert.equal(repairsIn(last).length, 0, 'no repair message');
    if (name === 'a good build') {
      assert.doesNotMatch(out.reply, /Heads up/, out.reply);
      assert.deepStrictEqual(out.actions, GOOD);
    }
  });
}

test('the repair round counts toward DEEPSEEK_MAX_ROUNDS: no request past the limit', async () => {
  // The build, then filler rounds, so the model ends its turn in the
  // second-last round. The one repair goes in the last round; when the model
  // ends its turn there, still broken, no round is left for a second repair.
  const filler = MAX_ROUNDS - 3;
  const replies = [tools('a', BACKWARDS)];
  for (let i = 0; i < filler; i++) replies.push({ content: '', tool_calls: [call(`u${i}`, 'use_parts', { types: ['led'] })] });
  replies.push(says('Built it.'));        // request MAX_ROUNDS - 1
  replies.push(says('Looks right to me.')); // request MAX_ROUNDS, answering the repair
  const { out, calls, last } = await run(replies);

  assert.equal(calls.length, MAX_ROUNDS, `expected ${MAX_ROUNDS} requests, got ${calls.length}`);
  assert.equal(repairsIn(last).length, 1, `the last round carries the one repair: got ${repairsIn(last).length}; user messages sent: ${JSON.stringify(userHeads(last))}`);
  assert.match(out.reply, /Heads up, this build has a problem:/, out.reply);
});

// Pin (issue #83, passes once built): finishAIReply sends only the final
// build. Everything before the last delete_all is wiped by it, so it is
// dropped; the actions after it, including a trailing set_control, stay in
// order. A reply with no delete_all (an edit) is left as it is.
test('pin: finishAIReply keeps only the actions from the last delete_all; an edit is unchanged', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const buildA = BACKWARDS.filter(a => a.tool !== 'delete_all');
  const buildB = GOOD.filter(a => a.tool !== 'delete_all');
  const press  = { tool: 'set_control', part: 'SW1', pressed: true };

  const rebuilt = Server.finishAIReply({ reply: 'Fixed.', actions: [
    { tool: 'delete_all' }, ...buildA, { tool: 'delete_all' }, ...buildB, press,
  ] });
  assert.deepStrictEqual(rebuilt.actions, [{ tool: 'delete_all' }, ...buildB, press]);

  const edit = [
    { tool: 'set_value', part: 'R1', resistance: 470 },
    { tool: 'place_led', holeA: 'd12', holeB: 'd10' },
    { tool: 'add_wire', from: 'a12', to: 'tn_12', color: 'black' },
    press,
  ];
  assert.deepStrictEqual(Server.finishAIReply({ reply: 'Done.', actions: edit }).actions, edit);
});

// ── Checks against the sent board (issue #84) ───────────────────────────────
// The browser sends `board` (the board-model shape, wire ids W1…) next to
// the markdown. Shapes these tests assume (decided on the issue):
// - Server.ask(markdown, message, history, board): `board` optional; passed
//   to the DeepSeek loop's checkBuild and to finishAIReply. POST /api/ask
//   reads an optional `board` from the body. Missing → today's behaviour.
// - Server.checkBuild(actions, board):
//   - a delete_all in the reply → as today, from the last delete_all; the
//     board is ignored.
//   - else, with a board → result = Board.apply(board, actions).board; the
//     checks run on Board.toActions(result).actions (findCircuitProblems
//     sees a full rebuild) plus the simulator on the result. Label names in
//     the problems are mapped back to the board's real labels (the inverse
//     of toActions' labelMap).
//   - else (no board, no delete_all) → [] as today.
// - Server.finishAIReply({ reply, actions, board }): with a board, the
//   Heads up uses the same path, so an edit gets the full checks. The
//   actions sent back are the reply's own, never the rebuild. Without a
//   board it is unchanged.

// The one-LED recipe as the browser would send it: BAT1, R1, LED1, W1…W4
// (W4 is a8 → tn_8).
const LED_BOARD = Board.apply(Board.empty(), GOOD).board;
// The same circuit with label gaps: BAT2, R3, LED2 (as after deletes).
// Rebuilt by toActions they become BAT1, R1, LED1, so every name in a
// problem has to be mapped back.
const GAP_BOARD = {
  parts: [
    { type: 'battery',  label: 'BAT2' },
    { type: 'resistor', label: 'R3', holes: ['b2', 'b6'] },
    { type: 'led',      label: 'LED2', holes: ['c8', 'c6'] },
  ],
  wires: [
    { id: 'W1', from: 'BAT2.0', to: 'tp_63' },
    { id: 'W2', from: 'BAT2.1', to: 'tn_63' },
    { id: 'W3', from: 'tp_3',   to: 'a2' },
    { id: 'W4', from: 'a8',     to: 'tn_8' },
  ],
};
// An edit (no delete_all) adding an LED straight across the rails, no
// resistor: cathode c20 to tn_20, anode c18 from tp_18.
const LED_NO_RESISTOR_EDIT = [
  { tool: 'place_led', holeA: 'c20', holeB: 'c18' },
  { tool: 'add_wire', from: 'tp_18', to: 'a18', color: 'red' },
  { tool: 'add_wire', from: 'a20', to: 'tn_20', color: 'black' },
];
const CLEAN_EDIT = [{ tool: 'set_value', part: 'R1', resistance: 1000 }];

function checkOn(actions, board) {
  assert.equal(typeof Server.checkBuild, 'function', 'server.js exports no checkBuild(actions, board)');
  const problems = Server.checkBuild(actions, board);
  assert.ok(Array.isArray(problems), `expected an array, got ${JSON.stringify(problems)}`);
  return problems;
}

test('precondition: the sent boards light their LED (14.9 mA) and have no problems as a rebuild', () => {
  for (const board of [LED_BOARD, GAP_BOARD]) {
    const { components, wires } = Board.toSim(board);
    const r = Sim.analyze(components, wires);
    const led = board.parts.find(p => p.type === 'led').label;
    assert.ok(Math.abs(r.parts[led].m.current - 7 / 470.1 * 1000) < 0.01, `${led}: ${r.parts[led].m.current}`);
  }
  assert.deepStrictEqual(checkOn(GOOD), []);
});

test('checkBuild(edit, board): an LED added with no resistor, no delete_all, is flagged as a short with the resistor fix', () => {
  const problems = checkOn(LED_NO_RESISTOR_EDIT, LED_BOARD);
  assert.ok(problems.some(p => /short/i.test(p) && !/^[A-Z]+\d+: /.test(p)),
    `no one-sentence short-circuit problem: ${JSON.stringify(problems)}`);
  assert.ok(problems.some(p => /^LED2: Short circuit\..*no current-limiting resistor/.test(p)),
    `no "LED2: Short circuit..." warning: ${JSON.stringify(problems)}`);
  assert.ok(problems.some(p => /^LED2: Put a resistor in series/.test(p)),
    `no "LED2: Put a resistor in series..." warning: ${JSON.stringify(problems)}`);
});

test('checkBuild(edit, board) names the board\'s real labels: the new LED is LED3, not the rebuild\'s LED2', () => {
  const problems = checkOn(LED_NO_RESISTOR_EDIT, GAP_BOARD);
  assert.ok(problems.some(p => /^LED3: Short circuit\./.test(p)), `no "LED3: Short circuit..." (the added LED is LED3 on this board): ${JSON.stringify(problems)}`);
  assert.deepStrictEqual(problems.filter(p => /\b(BAT1|R1|LED1)\b/.test(p)), [],
    `the board has no BAT1, R1 or LED1; those are the rebuild's names: ${JSON.stringify(problems)}`);
  assert.deepStrictEqual(problems.filter(p => /^LED2: /.test(p)), [], `LED2 is the good LED: ${JSON.stringify(problems)}`);
});

test('checkBuild(delete_wire, board): removing the battery\'s − wire names BAT2.1, the real pin', () => {
  const problems = checkOn([{ tool: 'delete_wire', wire: 'W2' }], GAP_BOARD);
  assert.ok(problems.some(p => /\bBAT2\.1 is not wired\b/.test(p)), `no "BAT2.1 is not wired": ${JSON.stringify(problems)}`);
  assert.deepStrictEqual(problems.filter(p => /\bBAT1\b/.test(p)), [], `BAT1 is the rebuild's name: ${JSON.stringify(problems)}`);
});

test('checkBuild(delete_wire W4, board): the LED\'s ground wire gone, the LED is not connected between power and ground', () => {
  const problems = checkOn([{ tool: 'delete_wire', wire: 'W4' }], LED_BOARD);
  assert.ok(problems.some(p => /LED at c8\/c6 is not connected between power and ground/.test(p)),
    `no "LED at c8/c6 is not connected": ${JSON.stringify(problems)}`);
});

test('checkBuild(clean edit, board) is []: set_value R1 1000 on the one-LED board', () => {
  assert.deepStrictEqual(checkOn(CLEAN_EDIT, LED_BOARD), []);
  assert.deepStrictEqual(checkOn([{ tool: 'set_value', part: 'R3', resistance: 1000 }], GAP_BOARD), []);
});

// Pins (pass today, must keep passing): a rebuild ignores the board, and no
// board keeps today's "an edit is never checked".
test('pin: checkBuild with a delete_all rebuild gives the same problems with or without a board', () => {
  for (const actions of [BACKWARDS, GOOD, NO_RESISTOR]) {
    assert.deepStrictEqual(checkOn(actions, LED_BOARD), checkOn(actions), `for ${JSON.stringify(actions.map(a => a.tool))}`);
  }
});

test('pin: checkBuild(edit) with no board is [] as today', () => {
  for (const actions of [LED_NO_RESISTOR_EDIT, CLEAN_EDIT, [{ tool: 'delete_wire', wire: 'W4' }]]) {
    assert.deepStrictEqual(checkOn(actions), [], `for ${JSON.stringify(actions)}`);
    assert.deepStrictEqual(checkOn(actions, undefined), [], `for ${JSON.stringify(actions)} (board undefined)`);
  }
});

// finishAIReply's Heads up with a board.
test('finishAIReply({ reply, actions, board }): a bad edit gets the Heads up; the actions stay the edit\'s own', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const out = Server.finishAIReply({ reply: 'Added an LED.', actions: LED_NO_RESISTOR_EDIT.map(a => ({ ...a })), board: LED_BOARD });
  assert.match(out.reply, /^Added an LED\./);
  assert.match(out.reply, /Heads up, this build has a problem:/, out.reply);
  assert.match(out.reply, /LED2: Short circuit/, out.reply);
  assert.deepStrictEqual(out.actions, LED_NO_RESISTOR_EDIT, 'the browser gets the edit, not a rebuild');
});

test('finishAIReply({ reply, actions, board }): a clean edit has no Heads up', () => {
  const out = Server.finishAIReply({ reply: 'Done.', actions: CLEAN_EDIT.map(a => ({ ...a })), board: LED_BOARD });
  assert.equal(out.reply, 'Done.');
  assert.deepStrictEqual(out.actions, CLEAN_EDIT);
});

test('pin: finishAIReply without a board leaves the same bad edit unflagged, as today', () => {
  const out = Server.finishAIReply({ reply: 'Added an LED.', actions: LED_NO_RESISTOR_EDIT.map(a => ({ ...a })) });
  assert.equal(out.reply, 'Added an LED.');
});

// The loop, on a sent board.
async function runOn(board, replies, message = 'Add another LED.') {
  const fetch = scriptedDeepSeek(replies);
  vi.stubGlobal('fetch', fetch);
  for (const m of ['log', 'info', 'warn']) vi.spyOn(console, m).mockImplementation(() => {});
  const out = await Server.ask('', message, [], board);
  return { out, calls: fetch.calls, last: fetch.calls[fetch.calls.length - 1] };
}
// Repair messages by their start, so a later reworded heading still counts.
const repairsOn = body => body.messages.filter(m => m.role === 'user' && /^Your build has problems/.test(String(m.content || '')));

test('an edit on a sent board that shorts an LED gets a repair round naming LED2; the fix clears the Heads up', async () => {
  const { out, calls, last } = await runOn(LED_BOARD, [
    tools('a', LED_NO_RESISTOR_EDIT), says('Added an LED.'),
    tools('b', [{ tool: 'delete_part', part: 'LED2' }]), says('Took the bare LED out.'),
  ]);
  assert.equal(calls.length, 4, `expected 4 requests (edit, end, repair fix, end), got ${calls.length}; user messages sent: ${JSON.stringify(userHeads(last))}`);
  const repairs = repairsOn(last);
  assert.equal(repairs.length, 1, `expected 1 repair message; user messages sent: ${JSON.stringify(userHeads(last))}`);
  assert.match(repairs[0].content, /LED2: Short circuit/, repairs[0].content);
  assert.equal(out.reply, 'Took the bare LED out.');
  assert.doesNotMatch(out.reply, /Heads up/);
});

test('a clean edit on a sent board gets no repair round', async () => {
  const { out, calls, last } = await runOn(LED_BOARD, [tools('e', CLEAN_EDIT), says('Done.')]);
  assert.equal(calls.length, 2, `expected 2 requests, got ${calls.length}`);
  assert.equal(repairsOn(last).length, 0);
  assert.equal(out.reply, 'Done.');
});

// ── POST /api/ask carries `board` through (issue #84) ───────────────────────
// The real HTTP handler, the DeepSeek provider with the scripted fetch. The
// test's own request goes over node:http, since fetch is stubbed.

describe('POST /api/ask with and without board', () => {
  const http = require('node:http');
  let port;
  beforeAll(() => new Promise(r => Server.server.listen(0, '127.0.0.1', () => { port = Server.server.address().port; r(); })));
  afterAll(() => new Promise(r => Server.server.close(r)));

  const post = body => new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: '/api/ask', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(text) }));
    });
    req.on('error', reject);
    req.end(data);
  });

  // The model adds a bare LED and never fixes it.
  const stubborn = () => [tools('a', LED_NO_RESISTOR_EDIT), says('Added an LED.'), says('It is fine.'), says('Still fine.')];

  test('with board: the bad edit is checked against it (repair rounds, then the Heads up)', async () => {
    const fetch = scriptedDeepSeek(stubborn());
    vi.stubGlobal('fetch', fetch);
    for (const m of ['log', 'info', 'warn', 'error']) vi.spyOn(console, m).mockImplementation(() => {});
    const res = await post({ markdown: '', message: 'Add another LED.', history: [], board: LED_BOARD });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.ok(repairsOn(fetch.calls[fetch.calls.length - 1]).length > 0,
      `the server never sent a repair round: user messages ${JSON.stringify(userHeads(fetch.calls[fetch.calls.length - 1]))}`);
    assert.match(res.json.reply, /Heads up, this build has a problem:/, res.json.reply);
    assert.match(res.json.reply, /LED2: Short circuit/, res.json.reply);
    assert.deepStrictEqual(res.json.actions, LED_NO_RESISTOR_EDIT);
  });

  test('pin: without board, the same reply is as today (no repair round, no Heads up)', async () => {
    const fetch = scriptedDeepSeek(stubborn());
    vi.stubGlobal('fetch', fetch);
    for (const m of ['log', 'info', 'warn', 'error']) vi.spyOn(console, m).mockImplementation(() => {});
    const res = await post({ markdown: '', message: 'Add another LED.', history: [] });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(fetch.calls.length, 2, `expected 2 requests, got ${fetch.calls.length}`);
    assert.equal(res.json.reply, 'Added an LED.');
    assert.deepStrictEqual(res.json.actions, LED_NO_RESISTOR_EDIT);
  });
});

// ── An edit reports only the problems it introduces (#84 review) ────────────
// With a board, checkBuild(actions, board) and finishAIReply's Heads up list
// the problems on the board after the edit minus those already on it before,
// both compared in the board's real labels. A half-built board's own gaps
// are not the edit's fault, so they never cost a repair round or a Heads up.

// Half built: BAT1 with only BAT1.0 → tp_63 wired, R1 at b2/b6, LED1 at
// c8/c6, nothing else wired. Already on it, as a rebuild: BAT1.1 not wired,
// the resistor at b2/b6 and the LED at c8/c6 not connected.
const HALF_BOARD = {
  parts: [
    { type: 'battery',  label: 'BAT1' },
    { type: 'resistor', label: 'R1', holes: ['b2', 'b6'] },
    { type: 'led',      label: 'LED1', holes: ['c8', 'c6'] },
  ],
  wires: [{ id: 'W1', from: 'BAT1.0', to: 'tp_63' }],
};
const HALF_BEFORE = [/BAT1\.1 is not wired/, /resistor at b2\/b6 is not connected/, /LED at c8\/c6 is not connected/];
// An LED straight across the rails: the − rail needs BAT1.1 first, then the
// same bare LED as LED_NO_RESISTOR_EDIT. It becomes LED2.
const HALF_LED_EDIT = [{ tool: 'add_wire', from: 'BAT1.1', to: 'tn_63', color: 'black' }, ...LED_NO_RESISTOR_EDIT];

test('precondition: the half-built board has its 3 problems as a rebuild', () => {
  const problems = checkOn(Board.toActions(HALF_BOARD).actions);
  for (const re of HALF_BEFORE) assert.ok(problems.some(p => re.test(p)), `no ${re} on the half-built board: ${JSON.stringify(problems)}`);
});

test('checkBuild(clean edit, half-built board) is []: the board\'s own gaps are not the edit\'s problems', () => {
  assert.deepStrictEqual(checkOn(CLEAN_EDIT, HALF_BOARD), []);
});

test('finishAIReply with a clean edit on the half-built board has no Heads up', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const out = Server.finishAIReply({ reply: 'Done.', actions: CLEAN_EDIT.map(a => ({ ...a })), board: HALF_BOARD });
  assert.equal(out.reply, 'Done.');
  assert.deepStrictEqual(out.actions, CLEAN_EDIT);
});

test('a clean edit on the half-built board makes 2 requests and sends no repair message', async () => {
  const { out, calls, last } = await runOn(HALF_BOARD, [tools('e', CLEAN_EDIT), says('Done.')]);
  assert.equal(calls.length, 2, `expected 2 requests, got ${calls.length}; user messages sent: ${JSON.stringify(userHeads(last))}`);
  assert.equal(repairsOn(last).length, 0, `no repair message: ${JSON.stringify(userHeads(last))}`);
  assert.equal(out.reply, 'Done.');
});

test('a bare LED added to the half-built board: only LED2\'s new problems, none of the 3 already there', () => {
  const problems = checkOn(HALF_LED_EDIT, HALF_BOARD);
  assert.ok(problems.some(p => /^LED2: Short circuit\./.test(p)), `no "LED2: Short circuit...": ${JSON.stringify(problems)}`);
  assert.ok(problems.some(p => /^LED2: Put a resistor in series/.test(p)), `no "LED2: Put a resistor in series...": ${JSON.stringify(problems)}`);
  for (const re of HALF_BEFORE) {
    assert.deepStrictEqual(problems.filter(p => re.test(p)), [], `${re} was on the board before the edit: ${JSON.stringify(problems)}`);
  }
});
