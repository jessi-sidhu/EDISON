// A stalled DeepSeek can't hang /api/ask (issue #129). Found live:
// deepseek-flash stopped answering, the server waited forever, and the page
// showed "Failed to fetch" after about 5 minutes.
//
// Shapes these tests assume (stated so the builder matches them):
// - DEEPSEEK_TIMEOUT_MS (env, default 60000) is one overall deadline for a
//   whole DeepSeek ask: every round of the tool loop and every repair round
//   share it. It is not per request. These tests set it to 150 ms before
//   loading the server, so reading it at load time or call time both work.
// - Each DeepSeek fetch gets an AbortSignal (opts.signal) that is aborted
//   when the deadline passes.
// - Past the deadline the ask rejects with an Error whose code is
//   'AI_TIMEOUT'.
// - /api/ask answers that with status 504 and
//   { reply: 'The AI took too long — try again.', actions: [], code: 'AI_TIMEOUT' }.
//   `reply` is what the page already shows for a failed ask. Every other
//   failure keeps today's 502 reply.
// - The page has its own guard, SparkyChat.ASK_TIMEOUT_MS (exported from
//   chat.js, read when each ask starts), longer than the server's default
//   deadline so the server's clear reply normally arrives first.
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

test('a repair round that hangs still ends by the overall deadline', async () => {
  const fetch = scriptedDeepSeek([tools('a', BACKWARDS), says('Done.'), says('never sent')], [0, 0, Infinity]);
  vi.stubGlobal('fetch', fetch);
  const out = await settleWithin(Server.ask('', 'Build a single LED circuit.', []), DEADLINE + SLACK);

  assert.equal(fetch.calls.length, 3, `precondition: the backwards LED starts a repair round (requests: ${fetch.calls.length})`);
  assertTimedOut(out, 'Server.ask with a hung repair round');
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

test('the page waits longer than the server\'s default 60 s deadline before giving up itself', () => {
  const Chat = require('../circuit3d/js/chat.js');
  assert.equal(typeof Chat.ASK_TIMEOUT_MS, 'number', 'chat.js exports no ASK_TIMEOUT_MS');
  assert.ok(Chat.ASK_TIMEOUT_MS > 60000, `ASK_TIMEOUT_MS is ${Chat.ASK_TIMEOUT_MS}; the server's own 60 s timeout reply should arrive first`);
});
