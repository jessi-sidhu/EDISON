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
  const fetch = fakeFetch(200, { choices: [{ message: { content: '', tool_calls: [
    { id: '1', type: 'function', function: { name: 'delete_all', arguments: '{}' } },
    { id: '2', type: 'function', function: { name: 'place_resistor', arguments: '{"holeA":"a3","holeB":"a7"}' } },
    { id: '3', type: 'function', function: { name: 'place_resistor', arguments: '{"holeA":"a3",' } },
  ] } }] });
  const out = await P.askDeepSeek('', 'build', [], { SYSTEM_PROMPT: 'S', CIRCUIT_TOOLS: TOOLS, fetch, apiKey: 'k' });

  assert.deepEqual(out.actions, [
    { tool: 'delete_all' },
    { tool: 'place_resistor', holeA: 'a3', holeB: 'a7' },
  ]);
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
