// The DeepSeek tool loop with generated tools (issue #27, step D1): tool
// selection per request, use_parts, and placement refusals the model can
// retry. Runs the real server over HTTP with AI_PROVIDER=deepseek, and a fake
// fetch standing in for DeepSeek. No network, no key.
//
// Shapes these tests assume (stated so the builder matches them):
// - Round 1 sends selectTools(message, boardTypes) as OpenAI tools. The
//   board's part types come from the Components table in the board markdown
//   ("| BZ1 | buzzer | ... |"), the only board state /api/ask gets.
// - use_parts {types} adds those parts' tools for the next round. It is
//   answered as a tool result and never reaches the browser as an action.
// - A place_* call is checked with Parts.checkPlacement against the holes the
//   actions so far use. A refusal is that call's tool result: the reason and
//   "place it again". The refused action is dropped.
// - Each request logs the names of the tools it sends (console.log or
//   console.info), on one line.

const assert = require('node:assert');
const http   = require('node:http');
process.env.AI_PROVIDER = 'deepseek';
process.env.RECORD_FIXTURES = '0';     // never write fixture files from here
const Server  = require('../backend/server.js');
const Recipes = require('./fixtures/recipes.js');


// A DeepSeek stand-in: answers each request with the next message in the
// list, and keeps every request body.
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
const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args || {}) } });
const toolNames = body => (body.tools || []).map(t => t.function.name);
const resultFor = (body, id) => {
  const m = body.messages.find(x => x.role === 'tool' && x.tool_call_id === id);
  assert.ok(m, `no tool result for call ${id}`);
  return String(m.content);
};

let base;
beforeAll(() => new Promise(r => Server.server.listen(0, '127.0.0.1', () => {
  base = Server.server.address().port;
  r();
})));
afterAll(() => new Promise(r => Server.server.close(r)));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// POST /api/ask with node:http, so the fake global fetch only sees DeepSeek.
function ask(message, markdown = '') {
  const body = JSON.stringify({ message, markdown, history: [] });
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: base, path: '/api/ask', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, ...JSON.parse(text) }); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

// The one-LED recipe's first four calls, then the rest.
const [DEL, BAT, W1, W2, RES, LEDC, W3, W4] = Recipes.ONE_LED;
const asCalls = (prefix, actions) => actions.map((a, i) => {
  const { tool, ...args } = a;
  return call(`${prefix}${i}`, tool, args);
});

test('use_parts adds the buzzer tool for the next round, and is not sent on as an action', async () => {
  const fetch = scriptedDeepSeek([
    { content: '', tool_calls: [call('u1', 'use_parts', { types: ['buzzer'] })] },
    { content: 'Here you go.', tool_calls: null },
  ]);
  vi.stubGlobal('fetch', fetch);
  const out = await ask('add a button');

  assert.equal(out.status, 200, JSON.stringify(out));
  assert.equal(fetch.calls.length, 2);
  const round1 = toolNames(fetch.calls[0]);
  assert.ok(round1.includes('use_parts'), `round 1 sends use_parts: ${JSON.stringify(round1)}`);
  assert.ok(!round1.includes('place_buzzer'), `round 1 should not send place_buzzer yet: ${JSON.stringify(round1)}`);
  const round2 = toolNames(fetch.calls[1]);
  assert.ok(round2.includes('place_buzzer'), `round 2 sends place_buzzer after use_parts: ${JSON.stringify(round2)}`);
  resultFor(fetch.calls[1], 'u1');
  assert.ok(!out.actions.some(a => a.tool === 'use_parts'), 'use_parts is not a board action');
});

test('a part on the board has its tool sent from round 1', async () => {
  const markdown = [
    '**Board status: 1 component(s), 0 wire(s).**', '',
    '## Components',
    '| id | type | value | pin_A | pin_B |',
    '|----|------|-------|-------|-------|',
    '| BZ1 | buzzer | — | b3 | b5 |', '',
    '## Wires', '_None._',
  ].join('\n');
  const fetch = scriptedDeepSeek([{ content: 'Sure.', tool_calls: null }]);
  vi.stubGlobal('fetch', fetch);
  await ask('add a button', markdown);

  const round1 = toolNames(fetch.calls[0]);
  assert.ok(round1.includes('place_buzzer'), `the buzzer on the board: ${JSON.stringify(round1)}`);
  assert.ok(round1.includes('place_button'), `the keyword match: ${JSON.stringify(round1)}`);
  assert.ok(!round1.includes('place_led'), `nothing asked for an LED: ${JSON.stringify(round1)}`);
});

test('a resistor at b2→b32 is refused with "3–5"; the retry at b2→b6 is kept', async () => {
  const fetch = scriptedDeepSeek([
    { content: '', tool_calls: [...asCalls('a', [DEL, BAT, W1, W2]), call('bad', 'place_resistor', { holeA: 'b2', holeB: 'b32' })] },
    { content: '', tool_calls: asCalls('b', [RES, LEDC, W3, W4]) },
    { content: 'Built it.', tool_calls: null },
  ]);
  vi.stubGlobal('fetch', fetch);
  const out = await ask('Build a single LED circuit');

  assert.equal(fetch.calls.length, 3);
  const said = resultFor(fetch.calls[1], 'bad');
  assert.match(said, /3–5/, `the refusal gives the range: ${said}`);
  assert.match(said, /place it again/i, `the refusal asks for a retry: ${said}`);
  assert.deepStrictEqual(out.actions, Recipes.ONE_LED, 'the refused resistor is dropped, the retry kept');
  assert.equal(out.reply, 'Built it.', 'a refusal the model fixed needs no note');
});

test('an LED into a hole the resistor already holds is refused; the retry is kept', async () => {
  const fetch = scriptedDeepSeek([
    { content: '', tool_calls: [...asCalls('a', [DEL, BAT, W1, W2, RES]), call('clash', 'place_led', { holeA: 'b8', holeB: 'b6' })] },
    { content: '', tool_calls: asCalls('b', [LEDC, W3, W4]) },
    { content: 'Built it.', tool_calls: null },
  ]);
  vi.stubGlobal('fetch', fetch);
  const out = await ask('Build a single LED circuit');

  const said = resultFor(fetch.calls[1], 'clash');
  assert.match(said, /\bb6\b/, `the refusal names the hole: ${said}`);
  assert.match(said, /already holds/, said);
  assert.match(said, /place it again/i, said);
  assert.deepStrictEqual(out.actions, Recipes.ONE_LED);
  assert.equal(out.reply, 'Built it.');
});

test('a good placement is answered as done, not refused', async () => {
  const fetch = scriptedDeepSeek([
    { content: '', tool_calls: asCalls('a', Recipes.ONE_LED) },
    { content: 'Built it.', tool_calls: null },
  ]);
  vi.stubGlobal('fetch', fetch);
  const out = await ask('Build a single LED circuit');
  assert.doesNotMatch(resultFor(fetch.calls[1], 'a4'), /place it again|not placed|must be/i);
  assert.deepStrictEqual(out.actions, Recipes.ONE_LED);
});

test('each request logs the names of the tools it sends', async () => {
  const lines = [];
  for (const m of ['log', 'info']) vi.spyOn(console, m).mockImplementation((...a) => { lines.push(a.map(String).join(' ')); });
  vi.stubGlobal('fetch', scriptedDeepSeek([{ content: 'Sure.', tool_calls: null }]));
  await ask('add a button');
  const want = ['delete_all', 'add_wire', 'place_battery', 'use_parts', 'place_button'];
  assert.ok(lines.some(l => want.every(n => l.includes(n))),
    `no log line names every tool sent (${want.join(', ')}):\n${lines.join('\n')}`);
});

// Guard: the loop still ends and the server still answers when a tool has
// broken JSON arguments (as before #27).
test('broken JSON arguments are still answered as not valid JSON', async () => {
  const fetch = scriptedDeepSeek([
    { content: '', tool_calls: [{ id: 'x', type: 'function', function: { name: 'place_resistor', arguments: '{"holeA":' } }] },
    { content: 'Sorry.', tool_calls: null },
  ]);
  vi.stubGlobal('fetch', fetch);
  const out = await ask('Build a single LED circuit');
  assert.match(resultFor(fetch.calls[1], 'x'), /not valid JSON/);
  assert.deepEqual(out.actions, []);
});
