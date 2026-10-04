// ─────────────────────────────────────────────────────────────
//  DeepSeek reasoning behind a switch (issue #205).
//
//  DEEPSEEK_THINKING unset (or 0) keeps today's request exactly. 1 turns
//  DeepSeek's thinking mode on: thinking enabled, no temperature (thinking
//  mode ignores it), a larger max_tokens, and reasoning_effort when
//  DEEPSEEK_REASONING_EFFORT is set. DeepSeek requires each assistant
//  message's reasoning_content to be sent back in every later request of a
//  tool loop, so the loop keeps it. Explain mode (#169) never thinks.
// ─────────────────────────────────────────────────────────────

const assert = require('node:assert');
const P = require('../backend/ai-providers.js');

const TOOLS = [{ function_declarations: [
  { name: 'delete_all', description: 'Clear the board.' },
  { name: 'place_battery', description: 'Place a battery.' },
] }];

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
const ask = (fetch, extra = {}) => P.askDeepSeek('', 'build', [], { SYSTEM_PROMPT: 'S', CIRCUIT_TOOLS: TOOLS, fetch, apiKey: 'k', ...extra });

const ENV = ['DEEPSEEK_THINKING', 'DEEPSEEK_REASONING_EFFORT', 'DEEPSEEK_MAX_TOKENS'];
let saved;
beforeEach(() => { saved = ENV.map(k => process.env[k]); ENV.forEach(k => delete process.env[k]); vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { ENV.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; }); vi.restoreAllMocks(); });

test('pin: with DEEPSEEK_THINKING unset the request is as before: thinking disabled, temperature 0.3, max_tokens 2048, no reasoning_effort', async () => {
  const fetch = scriptedFetch([{ content: 'Hi', tool_calls: null }]);
  await ask(fetch);
  const body = fetch.calls[0];
  assert.deepStrictEqual(body.thinking, { type: 'disabled' });
  assert.strictEqual(body.temperature, 0.3);
  assert.strictEqual(body.max_tokens, 2048);
  assert.ok(!('reasoning_effort' in body));
});

test('DEEPSEEK_THINKING=1: thinking enabled, no temperature, max_tokens 16000, reasoning_effort only when DEEPSEEK_REASONING_EFFORT is set', async () => {
  process.env.DEEPSEEK_THINKING = '1';
  let fetch = scriptedFetch([{ content: 'Hi', tool_calls: null }]);
  await ask(fetch);
  let body = fetch.calls[0];
  assert.deepStrictEqual(body.thinking, { type: 'enabled' });
  assert.ok(!('temperature' in body), JSON.stringify(body));
  assert.strictEqual(body.max_tokens, 16000);
  assert.ok(!('reasoning_effort' in body));

  process.env.DEEPSEEK_REASONING_EFFORT = 'high';
  process.env.DEEPSEEK_MAX_TOKENS = '24000';
  fetch = scriptedFetch([{ content: 'Hi', tool_calls: null }]);
  await ask(fetch);
  body = fetch.calls[0];
  assert.strictEqual(body.reasoning_effort, 'high');
  assert.strictEqual(body.max_tokens, 24000);
});

test('DEEPSEEK_THINKING=1: each round sends back the reasoning_content of every earlier assistant message (tool rounds)', async () => {
  process.env.DEEPSEEK_THINKING = '1';
  const fetch = scriptedFetch([
    { content: '', reasoning_content: 'R1: clear, then the battery', tool_calls: [call('c1', 'delete_all')] },
    { content: '', reasoning_content: 'R2: now the battery', tool_calls: [call('c2', 'place_battery')] },
    { content: 'Built it.', reasoning_content: 'R3: done', tool_calls: null },
  ]);
  const out = await ask(fetch);
  assert.deepStrictEqual(out.actions.map(a => a.tool), ['delete_all', 'place_battery']);
  const assistants = n => fetch.calls[n].messages.filter(m => m.role === 'assistant');
  assert.deepStrictEqual(assistants(1).map(m => m.reasoning_content), ['R1: clear, then the battery']);
  assert.deepStrictEqual(assistants(2).map(m => m.reasoning_content), ['R1: clear, then the battery', 'R2: now the battery']);
});

test('DEEPSEEK_THINKING=1: a repair round sends back the reasoning_content of the answer it repairs', async () => {
  process.env.DEEPSEEK_THINKING = '1';
  const fetch = scriptedFetch([
    { content: '', reasoning_content: 'R1', tool_calls: [call('c1', 'delete_all')] },
    { content: 'Done.', reasoning_content: 'R2: finished', tool_calls: null },
    { content: 'Fixed.', reasoning_content: 'R3', tool_calls: null },
  ]);
  let checks = 0;
  await ask(fetch, { checkBuild: () => (checks++ === 0 ? ['a problem'] : []) });
  const last = fetch.calls[fetch.calls.length - 1].messages;
  const repaired = last.filter(m => m.role === 'assistant').pop();
  assert.strictEqual(repaired.reasoning_content, 'R2: finished', JSON.stringify(last.slice(-3)));
});

test('pin: without thinking no reasoning_content is sent back, even if a reply carries one', async () => {
  const fetch = scriptedFetch([
    { content: '', reasoning_content: 'stray', tool_calls: [call('c1', 'delete_all')] },
    { content: 'Built it.', tool_calls: null },
  ]);
  await ask(fetch);
  assert.ok(fetch.calls[1].messages.every(m => !('reasoning_content' in m)));
});

test('explain mode never thinks, even with DEEPSEEK_THINKING=1: thinking disabled, temperature 0', async () => {
  process.env.DEEPSEEK_THINKING = '1';
  const fetch = scriptedFetch([{ content: 'It is backwards.', tool_calls: null }]);
  await ask(fetch, { explain: true });
  const body = fetch.calls[0];
  assert.deepStrictEqual(body.thinking, { type: 'disabled' });
  assert.strictEqual(body.temperature, 0);
  assert.strictEqual(body.max_tokens, 2048);
});

// ── The eval says what it ran with and how long each build took ──────────────
const Eval = require('../scripts/ai-eval.js');

test('ai-eval reads the settings a run used: the model (default deepseek-flash), thinking on or off, the reasoning effort', () => {
  assert.deepStrictEqual(Eval.evalSettings({}), { model: 'deepseek-flash', thinking: false, effort: null });
  assert.deepStrictEqual(Eval.evalSettings({ DEEPSEEK_MODEL: 'deepseek-v4-pro', DEEPSEEK_THINKING: '1', DEEPSEEK_REASONING_EFFORT: 'high' }),
    { model: 'deepseek-v4-pro', thinking: true, effort: 'high' });
  assert.strictEqual(Eval.evalSettings({ DEEPSEEK_THINKING: '0' }).thinking, false);
});

test('ai-eval\'s median: the middle value, the mean of the two middle ones for an even count, 0 for none', () => {
  assert.strictEqual(Eval.median([30, 10, 20]), 20);
  assert.strictEqual(Eval.median([40, 10, 20, 30]), 25);
  assert.strictEqual(Eval.median([]), 0);
});

test('a reply cut off at max_tokens (finish_reason "length") is logged, so an empty build is explained', async () => {
  process.env.DEEPSEEK_THINKING = '1';
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'long…', tool_calls: null } }] }) });
  await ask(fetch);
  assert.ok(warn.mock.calls.some(c => /max_tokens/.test(String(c[0]))), JSON.stringify(warn.mock.calls));
});
