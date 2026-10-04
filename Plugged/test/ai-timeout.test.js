// A stalled DeepSeek can't hang /api/ask (issue #129). Found live:
// deepseek-flash stopped answering, the server waited forever, and the page
// showed "Failed to fetch" after about 5 minutes.
//
// Shapes these tests assume (stated so the builder matches them):
// - DEEPSEEK_TIMEOUT_MS (env, default 240000 since issue #4: a reasoning
//   build took up to 195 s) is one overall deadline for a whole DeepSeek ask:
//   every round of the tool loop and every repair round share it. It is not
//   per request. These tests set it to 150 ms before loading the server; the
//   default's test unsets it for one ask, so it must be read per ask.
// - Each DeepSeek fetch gets an AbortSignal (opts.signal) that is aborted
//   when the deadline passes.
// - Past the deadline the ask rejects with an Error whose code is
//   'AI_TIMEOUT', unless the model has already ended its turn on a build:
//   then the best build so far is the reply (issue #7; the details are in
//   repair-best-build.test.js).
// - /api/ask answers that with status 504 and
//   { reply: 'The AI took too long — try again.', actions: [], code: 'AI_TIMEOUT' }.
//   `reply` is what the page already shows for a failed ask. Every other
//   failure keeps today's 502 reply.
// - The page has its own guard, SparkyChat.ASK_TIMEOUT_MS (exported from
//   chat.js, read when each ask starts), longer than the server's default
//   deadline (255000 against 240000, issue #4) so the server's clear reply
//   normally arrives first.
//
// How: the real Server.ask and the real HTTP server with AI_PROVIDER=deepseek,
// and a fake global fetch standing in for DeepSeek. No network, no key. The
// fake fetch behaves like the real one on abort: it rejects with an
// AbortError when its signal fires, and otherwise never answers.

const assert = require('node:assert');
const http   = require('node:http');
process.env.AI_PROVIDER = 'deepseek';
process.env.RECORD_FIXTURES = '0';     // never write ask fixtures from here
process.env.DEEPSEEK_TIMEOUT_MS = '150';
const Server  = require('../backend/server.js');
const Recipes = require('./fixtures/recipes.js');

const DEADLINE = 150;
const SLACK    = 350;   // event-loop and HTTP overhead on a busy laptop or CI
const DEFAULT_DEADLINE = 240000;   // DEEPSEEK_TIMEOUT_MS unset (issue #4)
const FRIENDLY = /took too long/i;

// ── The fake DeepSeek ───────────────────────────────────────────────────────

const abortError = () => Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });

// Waits ms, or rejects like fetch when the signal aborts first.
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(abortError());
    const t = ms === Infinity ? null : setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(abortError()); }, { once: true });
  });
}

// Answers request n with replies[n] after delays[n] ms (Infinity: never).
// Keeps every body and every signal it was given.
function scriptedDeepSeek(replies, delays = []) {
  const calls = [];
  const signals = [];
  const fn = async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    signals.push(opts.signal);
    const n = calls.length - 1;
    await wait(delays[Math.min(n, delays.length - 1)] || 0, opts.signal);
    const message = replies[Math.min(n, replies.length - 1)];
    return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message }] }) };
  };
  fn.calls = calls;
  fn.signals = signals;
  return fn;
}
const hangingDeepSeek = () => scriptedDeepSeek([{ content: 'never sent' }], [Infinity]);

const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args || {}) } });
const tools = (prefix, actions) => ({ content: '', tool_calls: actions.map((a, i) => {
  const { tool, ...args } = a;
  return call(`${prefix}${i}`, tool, args);
}) });
const says = text => ({ content: text, tool_calls: null });

// The one-LED recipe with the LED backwards: checkBuild finds a problem, so
// the model's "Done." starts a repair round.
const BACKWARDS = Recipes.ONE_LED.map(a => a.tool === 'place_led' ? { ...a, holeA: 'c6', holeB: 'c8' } : a);

// How a promise stands after `ms`: resolved, rejected, or still pending.
function settleWithin(promise, ms) {
  const started = Date.now();
  let timer;
  const pending = new Promise(r => { timer = setTimeout(() => r({ state: 'pending', ms: Date.now() - started }), ms); });
  const done = promise.then(
    value => ({ state: 'resolved', value, ms: Date.now() - started }),
    error => ({ state: 'rejected', error, ms: Date.now() - started }));
  return Promise.race([done, pending]).finally(() => clearTimeout(timer));
}

function assertTimedOut(out, what) {
  assert.notEqual(out.state, 'pending', `${what} still had no answer after ${out.ms} ms (deadline ${DEADLINE} ms)`);
  assert.equal(out.state, 'rejected', `${what} should fail with the timeout, got a reply: ${JSON.stringify(out.value)}`);
  assert.equal(out.error && out.error.code, 'AI_TIMEOUT', `${what} rejected without code AI_TIMEOUT: ${out.error && out.error.message}`);
}

// ── The HTTP server ─────────────────────────────────────────────────────────

let port;
beforeAll(() => new Promise(r => Server.server.listen(0, '127.0.0.1', () => {
  port = Server.server.address().port;
  r();
})));
afterAll(() => new Promise(r => Server.server.close(r)));
beforeEach(() => { for (const m of ['log', 'info', 'warn', 'error']) vi.spyOn(console, m).mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// POST /api/ask with node:http, so the fake global fetch only sees DeepSeek.
// Destroyed after `ms` so a hung server fails the assertion, not the runner.
function postAsk(message, ms) {
  const body = JSON.stringify({ message, markdown: '', history: [] });
  let req;
  const reply = new Promise((resolve, reject) => {
    req = http.request({ host: '127.0.0.1', port, path: '/api/ask', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(text) }); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
  return settleWithin(reply, ms).finally(() => req.destroy());
}

// ── The provider ────────────────────────────────────────────────────────────

test('a DeepSeek that never answers: the ask fails with AI_TIMEOUT by the deadline', async () => {
  vi.stubGlobal('fetch', hangingDeepSeek());
  const out = await settleWithin(Server.ask('', 'Build a single LED circuit.', []), DEADLINE + SLACK);
  assertTimedOut(out, 'Server.ask');
});

test('the deadline aborts the DeepSeek request itself: its signal fires', async () => {
  const fetch = hangingDeepSeek();
  vi.stubGlobal('fetch', fetch);
  const ask = Server.ask('', 'Build a single LED circuit.', []);
  ask.catch(() => {});   // judged below; the rejection is expected
  await settleWithin(ask, DEADLINE + SLACK);

  assert.equal(fetch.calls.length, 1, `one request to DeepSeek, got ${fetch.calls.length}`);
  const signal = fetch.signals[0];
  assert.ok(signal instanceof AbortSignal, `the DeepSeek fetch got no AbortSignal (opts.signal is ${signal})`);
  assert.equal(signal.aborted, true, 'the DeepSeek request is still open after the deadline');
});

// Issue #7: the model ended its turn on a build before the repair round hung,
// so that build is the reply at the deadline (with the checker's Heads up),
// not AI_TIMEOUT. The real checker and finishAIReply.
test('a repair round that hangs still ends by the overall deadline, with the build made before it as the reply (issue #7)', async () => {
  const fetch = scriptedDeepSeek([tools('a', BACKWARDS), says('Done.'), says('never sent')], [0, 0, Infinity]);
  vi.stubGlobal('fetch', fetch);
  const out = await settleWithin(Server.ask('', 'Build a single LED circuit.', []), DEADLINE + SLACK);

  assert.equal(fetch.calls.length, 3, `precondition: the backwards LED starts a repair round (requests: ${fetch.calls.length})`);
  assert.notEqual(out.state, 'pending', `Server.ask still had no answer after ${out.ms} ms (deadline ${DEADLINE} ms)`);
  assert.equal(fetch.signals[2].aborted, true, 'the hung repair request is still open after the deadline');
  assert.equal(out.state, 'resolved',
    `the deadline threw away the build made before the repair: rejected with ${out.error && out.error.code} (${out.error && out.error.message})`);
  assert.deepStrictEqual(out.value.actions, BACKWARDS, `the build returned: ${JSON.stringify(out.value.actions)}`);
  assert.ok(out.value.reply.startsWith('Done.'), `reply: ${out.value.reply}`);
  assert.match(out.value.reply, /Heads up[\s\S]*backwards/, `the kept build's problem is not flagged: ${out.value.reply}`);
});

test('rounds that each beat the deadline cannot add up past it: the deadline covers the whole ask', async () => {
  // Six rounds (build, "Done.", two repairs and their "Done.") at 100 ms each
  // is 600 ms. Each one is under the 150 ms deadline; together they are not.
  const fetch = scriptedDeepSeek(
    [tools('a', BACKWARDS), says('Done.'), tools('b', BACKWARDS), says('Done.'), tools('c', BACKWARDS), says('Done.')],
    [100]);
  vi.stubGlobal('fetch', fetch);
  const out = await settleWithin(Server.ask('', 'Build a single LED circuit.', []), DEADLINE + SLACK);
  assertTimedOut(out, 'Server.ask over six 100 ms rounds');
});

// The default deadline, on a fake clock so no test waits 4 minutes. A
// DeepSeek that never answers is still waited on 1 s before the deadline and
// has failed with AI_TIMEOUT 1 s after it. The fallback model (#130) is left
// as it is by default; with reasoning on it never takes over from a primary
// that only runs long (#4), and either way the one overall deadline holds.
test.each([
  ['DEEPSEEK_TIMEOUT_MS unset: the default deadline is 240 s',  undefined, DEFAULT_DEADLINE],
  ['pin: DEEPSEEK_TIMEOUT_MS=5000 still overrides the default', '5000',    5000],
])('%s', async (_, value, ms) => {
  const saved = process.env.DEEPSEEK_TIMEOUT_MS;
  if (value === undefined) delete process.env.DEEPSEEK_TIMEOUT_MS; else process.env.DEEPSEEK_TIMEOUT_MS = value;
  vi.useFakeTimers();
  try {
    vi.stubGlobal('fetch', hangingDeepSeek());
    const started = Date.now();
    let out = null;
    Server.ask('', 'Build a single LED circuit.', []).then(
      v => { out = { state: 'resolved', value: v, at: Date.now() - started }; },
      e => { out = { state: 'rejected', error: e, at: Date.now() - started }; });

    await vi.advanceTimersByTimeAsync(ms - 1000);
    assert.equal(out, null, `the ask gave up after ${out && out.at} ms (${out && out.error && out.error.message}); the deadline is ${ms} ms`);
    await vi.advanceTimersByTimeAsync(2000);
    assert.ok(out, `the ask had no answer ${ms + 1000} ms in (deadline ${ms} ms)`);
    assert.equal(out.state, 'rejected', `the ask should fail with the timeout, got a reply: ${JSON.stringify(out.value)}`);
    assert.equal(out.error && out.error.code, 'AI_TIMEOUT', `rejected without code AI_TIMEOUT: ${out.error && out.error.message}`);
  } finally {
    vi.useRealTimers();
    if (saved === undefined) delete process.env.DEEPSEEK_TIMEOUT_MS; else process.env.DEEPSEEK_TIMEOUT_MS = saved;
  }
});

test('pin: a reply inside the deadline is unaffected', async () => {
  vi.stubGlobal('fetch', scriptedDeepSeek([tools('a', Recipes.ONE_LED), says('Built it.')], [30]));
  const out = await settleWithin(Server.ask('', 'Build a single LED circuit.', []), 2000);
  assert.equal(out.state, 'resolved', `a 60 ms ask failed: ${out.error && out.error.message}`);
  assert.equal(out.value.reply.startsWith('Built it.'), true, `reply: ${out.value.reply}`);
  assert.equal(out.value.actions.length, Recipes.ONE_LED.length);
});

// ── /api/ask ────────────────────────────────────────────────────────────────

test('/api/ask with a DeepSeek that never answers: 504, AI_TIMEOUT and the friendly reply, by the deadline', async () => {
  vi.stubGlobal('fetch', hangingDeepSeek());
  const out = await postAsk('Build a single LED circuit.', DEADLINE + SLACK);

  assert.equal(out.state, 'resolved', `/api/ask still had no answer after ${out.ms} ms (deadline ${DEADLINE} ms)`);
  const { status, body } = out.value;
  assert.equal(status, 504, `status ${status}: ${JSON.stringify(body)}`);
  assert.equal(body.code, 'AI_TIMEOUT', JSON.stringify(body));
  assert.match(String(body.reply), FRIENDLY);
  assert.deepStrictEqual(body.actions, []);
});

test('pin: any other DeepSeek failure keeps the 502 reply, with no AI_TIMEOUT code', async () => {
  vi.stubGlobal('fetch', async () => ({ ok: false, status: 500, text: async () => 'upstream broke', json: async () => ({}) }));
  const out = await postAsk('Build a single LED circuit.', 2000);

  assert.equal(out.state, 'resolved', `/api/ask had no answer after ${out.ms} ms`);
  const { status, body } = out.value;
  assert.equal(status, 502, JSON.stringify(body));
  assert.notEqual(body.code, 'AI_TIMEOUT');
  assert.doesNotMatch(String(body.reply), FRIENDLY);
});

// ── The page's guard ────────────────────────────────────────────────────────

test('the page waits longer than the server\'s default 240 s deadline before giving up itself', () => {
  const Chat = require('../circuit3d/js/chat.js');
  assert.equal(typeof Chat.ASK_TIMEOUT_MS, 'number', 'chat.js exports no ASK_TIMEOUT_MS');
  assert.ok(Chat.ASK_TIMEOUT_MS > DEFAULT_DEADLINE,
    `ASK_TIMEOUT_MS is ${Chat.ASK_TIMEOUT_MS}; the server's own ${DEFAULT_DEADLINE / 1000} s timeout reply should arrive first`);
});
