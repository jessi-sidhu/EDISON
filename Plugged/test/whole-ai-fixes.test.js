// ─────────────────────────────────────────────────────────────
//  An AI fix lands whole or not at all (issue #199).
//
//  Aarmen asked Edison to fix a board and got "Remove wire W5: no wire on
//  the board has that id." for W5–W8, twice, while the steps that did
//  resolve (removing W3) were applied: half a fix, a worse board.
//
//  - In DeepSeek's tool loop a step that names a wire or part the board
//    doesn't have is answered "Refused: …", with the board's real wire ids
//    (or part labels), so the model can correct it in the same turn, as it
//    already does for a refused placement.
//  - finishAIReply (every provider): a reply whose delete_wire, delete_part,
//    set_value or set_control names something not on the board (nor placed
//    earlier in the same reply) is dropped whole, with one line saying so.
// ─────────────────────────────────────────────────────────────

const assert = require('node:assert');

// The real Server.ask with AI_PROVIDER=deepseek and a fake global fetch, as
// test/edit-in-place.test.js: set before the server is required.
process.env.AI_PROVIDER = 'deepseek';
process.env.RECORD_FIXTURES = '0';     // never write ask fixtures from here

const Server  = require('../backend/server.js');
const Board   = require('../circuit3d/js/board-model.js');
const Recipes = require('./fixtures/recipes.js');

// The one-LED build: BAT1, R1, LED1 and wires W1–W4.
const LED_BOARD = Board.apply(Board.empty(), Recipes.ONE_LED).board;

// ── The fake DeepSeek (as test/edit-in-place.test.js) ───────────────────────
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
const call  = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args || {}) } });
const tools = (prefix, actions) => ({
  content: '',
  tool_calls: actions.map((a, i) => { const { tool, ...args } = a; return call(`${prefix}${i}`, tool, args); }),
});
const says = text => ({ content: text, tool_calls: null });

async function runOn(board, replies, message) {
  const fetch = scriptedDeepSeek(replies);
  vi.stubGlobal('fetch', fetch);
  for (const m of ['log', 'info', 'warn']) vi.spyOn(console, m).mockImplementation(() => {});
  const out = await Server.ask('', message, [], board);
  return { out, calls: fetch.calls };
}
const toolResult = (body, id) => (body.messages.find(m => m.role === 'tool' && m.tool_call_id === id) || {}).content;

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test('sanity: the one-LED board has wires W1–W4 and parts BAT1, R1, LED1', () => {
  assert.deepStrictEqual(LED_BOARD.wires.map(w => w.id), ['W1', 'W2', 'W3', 'W4']);
  assert.deepStrictEqual(LED_BOARD.parts.map(p => p.label).sort(), ['BAT1', 'LED1', 'R1']);
});

// ── 1. The DeepSeek loop refuses a step that names what isn't there ─────────

test('DeepSeek loop: delete_wire W5 on a W1–W4 board is refused with the real wire ids; the model\'s corrected delete_wire W3 goes through', async () => {
  const { out, calls } = await runOn(LED_BOARD, [
    tools('a', [{ tool: 'delete_wire', wire: 'W5' }]),
    tools('b', [{ tool: 'delete_wire', wire: 'W3' }]),
    says('Removed W3.'),
  ], 'Fix it.');
  const said = String(toolResult(calls[1], 'a0'));
  assert.match(said, /^Refused:/, `W5's tool result: ${said}`);
  assert.match(said, /W5/, `it names W5: ${said}`);
  assert.match(said, /W1, W2, W3, W4/, `it lists the board's wires: ${said}`);
  assert.deepStrictEqual(out.actions, [{ tool: 'delete_wire', wire: 'W3' }]);
});

test('DeepSeek loop: set_value on a label not on the board (R9) is refused, naming the board\'s parts', async () => {
  const { out, calls } = await runOn(LED_BOARD, [
    tools('a', [{ tool: 'set_value', part: 'R9', resistance: 1000 }]),
    tools('b', [{ tool: 'set_value', part: 'R1', resistance: 1000 }]),
    says('R1 is now 1 kΩ.'),
  ], 'Make the resistor 1k.');
  const said = String(toolResult(calls[1], 'a0'));
  assert.match(said, /^Refused:/, said);
  assert.match(said, /R9/, said);
  assert.match(said, /R1/, `it names the board's parts: ${said}`);
  assert.deepStrictEqual(out.actions, [{ tool: 'set_value', part: 'R1', resistance: 1000 }]);
});

test('pin: a part placed earlier in the same reply can be set: place_resistor then set_value R2 is not refused', async () => {
  const { out } = await runOn(LED_BOARD, [
    tools('a', [{ tool: 'place_resistor', holeA: 'f20', holeB: 'f24' }, { tool: 'set_value', part: 'R2', resistance: 2200 }]),
    says('Added R2.'),
  ], 'Add a 2.2k resistor at f20.');
  assert.deepStrictEqual(out.actions.map(a => a.tool), ['place_resistor', 'set_value']);
});

// ── 2. finishAIReply: whole or nothing ───────────────────────────────────────

const finish = (actions, board) => Server.finishAIReply({ reply: 'I fixed it.', actions: actions.map(a => ({ ...a })), board });

test('finishAIReply: a fix that deletes W5 (not on the board) and W3 applies nothing, and says so once, naming W5', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const out = finish([{ tool: 'delete_wire', wire: 'W5' }, { tool: 'delete_wire', wire: 'W3' }], LED_BOARD);
  assert.deepStrictEqual(out.actions, [], `nothing should be applied: ${JSON.stringify(out.actions)}`);
  assert.match(out.reply, /W5/, out.reply);
  assert.match(out.reply, /nothing (was|has been) changed/i, out.reply);
  assert.strictEqual((out.reply.match(/W5/g) || []).length, 1, `W5 is named once, not once per step: ${out.reply}`);
});

test('finishAIReply: delete_part and set_control on labels not on the board drop the whole reply too', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  for (const bad of [{ tool: 'delete_part', part: 'LED7' }, { tool: 'set_control', part: 'SW4', pressed: true }]) {
    const out = finish([{ tool: 'set_value', part: 'R1', resistance: 1000 }, bad], LED_BOARD);
    assert.deepStrictEqual(out.actions, [], `${bad.tool} ${bad.part}: ${JSON.stringify(out.actions)}`);
    assert.match(out.reply, new RegExp(bad.part), out.reply);
  }
});

test('pin: a fix whose every step names what is there is sent as it was', () => {
  const steps = [{ tool: 'delete_wire', wire: 'W3' }, { tool: 'set_value', part: 'R1', resistance: 1000 }];
  const out = finish(steps, LED_BOARD);
  assert.deepStrictEqual(out.actions, steps);
  assert.doesNotMatch(out.reply, /nothing (was|has been) changed/i, out.reply);
});

test('pin: a fresh build (delete_all first) on the same board is judged on its own, not on the old board\'s ids', () => {
  const out = finish(Recipes.ONE_LED, LED_BOARD);
  assert.deepStrictEqual(out.actions.map(a => a.tool), Recipes.ONE_LED.map(a => a.tool));
});
