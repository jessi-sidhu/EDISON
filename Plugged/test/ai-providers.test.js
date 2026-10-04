// Tests for backend/ai-providers.js: the DeepSeek provider.
// No network: a fake fetch records the request and returns a canned reply.

const assert = require('node:assert');
const P = require('../backend/ai-providers.js');

// The same shape as CIRCUIT_TOOLS in server.js (Gemini's schema style).
const TOOLS = [{
  function_declarations: [
    { name: 'delete_all', description: 'Clear the board.' },
    {
      name: 'place_resistor',
      description: 'Place a resistor.',
      parameters: {
        type: 'OBJECT',
        properties: { holeA: { type: 'STRING', description: 'Start' }, holeB: { type: 'STRING', description: 'End' } },
        required: ['holeA', 'holeB'],
      },
    },
  ],
}];

function fakeFetch(status, body) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) });
    return { ok: status >= 200 && status < 300, status,
             json: async () => body, text: async () => JSON.stringify(body) };
  };
  fn.calls = calls;
  return fn;
}


// A fetch that answers each call with the next reply in the list.
function scriptedFetch(replies) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    const message = replies[Math.min(calls.length - 1, replies.length - 1)];
    return { ok: true, status: 200, json: async () => ({ choices: [{ message }] }) };
  };
  fn.calls = calls;
  return fn;
}
const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args || {}) } });

test('toOpenAITools turns the Gemini tool list into OpenAI function tools', () => {
  assert.deepEqual(P.toOpenAITools(TOOLS), [
    { type: 'function', function: { name: 'delete_all', description: 'Clear the board.',
      parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'place_resistor', description: 'Place a resistor.',
      parameters: { type: 'object',
        properties: { holeA: { type: 'string', description: 'Start' }, holeB: { type: 'string', description: 'End' } },
        required: ['holeA', 'holeB'] } } },
  ]);
});

test('askDeepSeek sends one non-thinking chat request with the tools, history and board', async () => {
  const fetch = fakeFetch(200, { choices: [{ message: { content: 'Hi!', tool_calls: null } }] });
  const out = await P.askDeepSeek('BOARD MD', 'What is this?',
    [{ role: 'user', text: 'hello' }, { role: 'model', text: 'hey' }],
    { SYSTEM_PROMPT: 'SYS', CIRCUIT_TOOLS: TOOLS, fetch, apiKey: 'sk-test' });

  assert.deepEqual(out, { reply: 'Hi!', actions: [] });
  const [call] = fetch.calls;
  assert.equal(call.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(call.opts.headers.Authorization, 'Bearer sk-test');
  assert.equal(call.body.model, 'deepseek-flash');
  assert.deepEqual(call.body.thinking, { type: 'disabled' });
  assert.equal(call.body.tools.length, 2);
  assert.deepEqual(call.body.messages, [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hey' },
    { role: 'user', content: 'BOARD STATE:\nBOARD MD\n\nQUESTION: What is this?' },
  ]);
});

test('askDeepSeek turns tool calls into actions and skips ones with broken JSON', async () => {
  const fetch = scriptedFetch([
    { content: '', tool_calls: [
      { id: '1', type: 'function', function: { name: 'delete_all', arguments: '{}' } },
      { id: '2', type: 'function', function: { name: 'place_resistor', arguments: '{"holeA":"a3","holeB":"a7"}' } },
      { id: '3', type: 'function', function: { name: 'place_resistor', arguments: '{"holeA":"a3",' } },
    ] },
    { content: 'Done.', tool_calls: null },
  ]);
  const out = await P.askDeepSeek('', 'build', [], { SYSTEM_PROMPT: 'S', CIRCUIT_TOOLS: TOOLS, fetch, apiKey: 'k' });

  assert.deepEqual(out.actions, [
    { tool: 'delete_all' },
    { tool: 'place_resistor', holeA: 'a3', holeB: 'a7' },
  ]);
  // The broken call is answered with an error, so the model can retry it.
  const results = fetch.calls[1].messages.filter(m => m.role === 'tool');
  assert.match(results.find(m => m.tool_call_id === '3').content, /not valid JSON/);
});

// DeepSeek calls tools a turn at a time and waits for their results.
test('askDeepSeek keeps the conversation going until the model stops calling tools', async () => {
  const fetch = scriptedFetch([
    { content: '', tool_calls: [call('c1', 'delete_all'), call('c2', 'place_battery')] },
    { content: '', tool_calls: [call('c3', 'place_resistor', { holeA: 'a2', holeB: 'a6' })] },
    { content: 'Built it.', tool_calls: null },
  ]);
  const out = await P.askDeepSeek('', 'build', [], { SYSTEM_PROMPT: 'S', CIRCUIT_TOOLS: TOOLS, fetch, apiKey: 'k' });

  assert.equal(out.reply, 'Built it.');
  assert.deepEqual(out.actions.map(a => a.tool), ['delete_all', 'place_battery', 'place_resistor']);
  assert.equal(fetch.calls.length, 3);
  // Round 2 carries round 1's tool calls and a result for each, by id.
  const sent = fetch.calls[1].messages.slice(-3);
  assert.equal(sent[0].role, 'assistant');
  assert.deepEqual(sent[0].tool_calls.map(c => c.id), ['c1', 'c2']);
  assert.deepEqual(sent.slice(1).map(m => [m.role, m.tool_call_id]), [['tool', 'c1'], ['tool', 'c2']]);
});

test('askDeepSeek stops after a fixed number of rounds if the model never finishes', async () => {
  const fetch = scriptedFetch([{ content: '', tool_calls: [call('x', 'delete_all')] }]);
  const out = await P.askDeepSeek('', 'build', [], { SYSTEM_PROMPT: 'S', CIRCUIT_TOOLS: TOOLS, fetch, apiKey: 'k' });

  assert.equal(fetch.calls.length, P.DEEPSEEK_MAX_ROUNDS);
  assert.equal(out.actions.length, P.DEEPSEEK_MAX_ROUNDS);
});

test('askDeepSeek explains an empty balance (HTTP 402)', async () => {
  const fetch = fakeFetch(402, { error: { message: 'Insufficient Balance' } });
  await assert.rejects(
    P.askDeepSeek('', 'hi', [], { SYSTEM_PROMPT: 'S', CIRCUIT_TOOLS: TOOLS, fetch, apiKey: 'k' }),
    /DeepSeek 402.*top up/i);
});

test('with AI_PROVIDER=deepseek, makeAsk runs the reply through the shared finish step', async () => {
  const fetch = fakeFetch(200, { choices: [{ message: { content: 'ok', tool_calls: null } }] });
  const saved = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = 'deepseek';
  try {
    const ask = P.makeAsk(() => { throw new Error('gemini should not be called'); },
      { SYSTEM_PROMPT: 'S', CIRCUIT_TOOLS: TOOLS, fetch, apiKey: 'k',
        finish: r => ({ reply: r.reply + ' [checked]', actions: r.actions }) });
    assert.deepEqual(await ask('', 'hi', []), { reply: 'ok [checked]', actions: [] });
  } finally {
    if (saved === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = saved;
  }
});
