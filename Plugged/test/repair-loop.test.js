// The repair loop (issue #83, AI context v2 spec §4). Before the user sees a
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
// (so the model's board has an unwired battery) but the live board accepts.
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
