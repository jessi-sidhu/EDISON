// When the primary DeepSeek model stalls or breaks, the ask is retried once on
// a fallback model (issue #130). Found live: deepseek-flash stopped
// answering for over 30 minutes while deepseek-v4-pro answered in 1.5 s.
//
// Shapes these tests assume (stated so the builder matches them):
// - DEEPSEEK_FALLBACK_MODEL (env) names the fallback. Unset means
//   'deepseek-v4-pro'; an empty string turns the fallback off. Read per ask,
//   like DEEPSEEK_TIMEOUT_MS, so a test can change it.
// - DEEPSEEK_PRIMARY_TIMEOUT_MS (env, default about 25000, read per ask) is
//   how long one primary-model request may take. Past it, or on a 5xx or a
//   network error from the primary, the primary's request is aborted and the
//   WHOLE ask restarts once on the fallback: the same opening messages and
//   tools, nothing carried over from the primary's rounds. This holds on any
//   round, not only the first. The fallback never switches back and is not
//   retried itself.
// - A 4xx from the primary (bad request, bad key, empty balance, rate limit)
//   never falls back: the error stands, and /api/ask answers 502 as today.
// - Primary and fallback share the one overall deadline of #129
//   (DEEPSEEK_TIMEOUT_MS). The fallback's requests have no primary timeout,
//   only the time left. Past the deadline the ask rejects with AI_TIMEOUT.
// - With the fallback off, the primary gets the whole overall deadline: the
//   primary timeout only matters when there is a fallback to switch to.
// - The fallback's reply goes through the same clean-up as any reply. The
//   page sees the same { reply, actions } either way; only the server log
//   changes: `[ask] "…" → n action(s) (fallback deepseek-v4-pro)`.
//
// How: the real Server.ask and the real HTTP server with AI_PROVIDER=deepseek,
// and a fake global fetch standing in for DeepSeek, as in ai-timeout.test.js.
// No network, no key.

const assert = require('node:assert');
const http   = require('node:http');
process.env.AI_PROVIDER = 'deepseek';
process.env.RECORD_FIXTURES = '0';     // never write ask fixtures from here
process.env.DEEPSEEK_MODEL = 'deepseek-flash';
process.env.DEEPSEEK_TIMEOUT_MS = '300';
process.env.DEEPSEEK_PRIMARY_TIMEOUT_MS = '80';
const Server  = require('../backend/server.js');
const Recipes = require('./fixtures/recipes.js');

const OVERALL  = 300;
const PRIMARY  = 80;
const SLACK    = 350;   // event-loop and HTTP overhead on a busy laptop or CI
const FALLBACK = 'deepseek-v4-pro';
const PROMPT   = 'Build a single LED circuit.';

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

// Request n follows steps[n] (the last step repeats):
//   { delay }    ms before answering (Infinity: never; aborts like fetch)
//   { status }   an HTTP error status instead of a reply
//   { network }  rejects like fetch when the host can't be reached
//   { message }  the assistant message to answer with
// Keeps every body, every signal, when each request started, and whether
// each earlier request's signal had been aborted when this one started.
function fakeDeepSeek(steps) {
  const started = Date.now();
  const calls = [], signals = [], at = [], abortedBefore = [];
  const fn = async (url, opts) => {
    abortedBefore.push(signals.map(s => !!(s && s.aborted)));
    calls.push(JSON.parse(opts.body));
    signals.push(opts.signal);
    at.push(Date.now() - started);
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    await wait(step.delay || 0, opts.signal);
    if (step.network) throw new TypeError('fetch failed');
    if (step.status) return { ok: false, status: step.status, text: async () => `upstream ${step.status}`, json: async () => ({}) };
    return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message: step.message }] }) };
  };
  Object.assign(fn, { calls, signals, at, abortedBefore });
  fn.models = () => calls.map(c => c.model);
  return fn;
}

const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args || {}) } });
const tools = (prefix, actions) => ({ content: '', tool_calls: actions.map((a, i) => {
  const { tool, ...args } = a;
  return call(`${prefix}${i}`, tool, args);
}) });
const says = text => ({ content: text, tool_calls: null });

const HANG     = { delay: Infinity };
const BUILD    = prefix => ({ message: tools(prefix, Recipes.ONE_LED) });
const DONE     = text => ({ message: says(text) });

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

function assertResolved(out, what) {
  assert.notEqual(out.state, 'pending', `${what} still had no answer after ${out.ms} ms (deadline ${OVERALL} ms)`);
  assert.equal(out.state, 'resolved', `${what} failed: ${out.error && (out.error.code || '')} ${out.error && out.error.message}`);
}

function assertTimedOut(out, what) {
  assert.notEqual(out.state, 'pending', `${what} still had no answer after ${out.ms} ms (deadline ${OVERALL} ms)`);
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
beforeEach(() => {
  delete process.env.DEEPSEEK_FALLBACK_MODEL;   // the default fallback unless a test says otherwise
  for (const m of ['log', 'info', 'warn', 'error']) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); delete process.env.DEEPSEEK_FALLBACK_MODEL; });

// POST /api/ask with node:http, so the fake global fetch only sees DeepSeek.
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

const askLines = () => console.log.mock.calls.map(a => a.join(' ')).filter(l => l.startsWith('[ask] "'));

// ── Switching to the fallback ───────────────────────────────────────────────

test('primary hangs: the same ask goes to the fallback model, and its build is the reply, inside the overall deadline', async () => {
  const fetch = fakeDeepSeek([HANG, BUILD('f'), DONE('Built it on the fallback.')]);
  vi.stubGlobal('fetch', fetch);
  const out = await settleWithin(Server.ask('', PROMPT, []), OVERALL + SLACK);

  assert.ok(fetch.calls.length >= 2, `the hung primary was never followed by a fallback request (requests: ${fetch.calls.length}, models: ${fetch.models()})`);
  assert.equal(fetch.calls[0].model, 'deepseek-flash');
  assert.equal(fetch.calls[1].model, FALLBACK, `the second request went to ${fetch.calls[1].model}, not the fallback`);
  assert.deepStrictEqual(fetch.calls[1].messages, fetch.calls[0].messages, 'the fallback must get the same messages');
  assert.deepStrictEqual(fetch.calls[1].tools, fetch.calls[0].tools, 'the fallback must get the same tools');
  assert.ok(fetch.at[1] >= PRIMARY - 10 && fetch.at[1] < OVERALL,
    `the fallback started at ${fetch.at[1]} ms; expected at the ${PRIMARY} ms primary timeout, inside the ${OVERALL} ms deadline`);

  assertResolved(out, 'Server.ask with a hung primary');
  assert.equal(out.value.reply.startsWith('Built it on the fallback.'), true, `reply: ${out.value.reply}`);
  assert.equal(out.value.actions.length, Recipes.ONE_LED.length, `actions: ${JSON.stringify(out.value.actions)}`);
});

test.each([
  ['500', { status: 500 }],
  ['503', { status: 503 }],
  ['a network error', { network: true }],
])('primary answers %s: the fallback model is used', async (_name, failure) => {
  const fetch = fakeDeepSeek([failure, BUILD('f'), DONE('Built it.')]);
  vi.stubGlobal('fetch', fetch);
  const out = await settleWithin(Server.ask('', PROMPT, []), OVERALL + SLACK);

  assert.deepStrictEqual(fetch.models(), ['deepseek-flash', FALLBACK, FALLBACK],
    `expected the primary, then the fallback's build and its answer; got ${JSON.stringify(fetch.models())}`);
  assertResolved(out, 'Server.ask after a failed primary');
  assert.equal(out.value.actions.length, Recipes.ONE_LED.length);
});

test('primary stalls on a later round: the whole ask restarts on the fallback, nothing from the primary kept', async () => {
  // The primary builds the LED, then hangs on its "Done." round.
  const fetch = fakeDeepSeek([BUILD('p'), HANG, BUILD('f'), DONE('Built it.')]);
  vi.stubGlobal('fetch', fetch);
  const out = await settleWithin(Server.ask('', PROMPT, []), OVERALL + SLACK);

  assert.deepStrictEqual(fetch.models(), ['deepseek-flash', 'deepseek-flash', FALLBACK, FALLBACK],
    `got ${JSON.stringify(fetch.models())}`);
  assert.deepStrictEqual(fetch.calls[2].messages, fetch.calls[0].messages,
    'the fallback must start from the opening messages, not continue the primary\'s rounds');
  assertResolved(out, 'Server.ask with a primary that hangs on round 2');
  assert.equal(out.value.actions.length, Recipes.ONE_LED.length,
    `the primary's queued actions leaked into the fallback's build: ${out.value.actions.length} actions`);
});

test('switching aborts the primary\'s request: its signal fires before the fallback starts', async () => {
  const fetch = fakeDeepSeek([HANG, BUILD('f'), DONE('Built it.')]);
  vi.stubGlobal('fetch', fetch);
  await settleWithin(Server.ask('', PROMPT, []), OVERALL + SLACK);

  assert.ok(fetch.calls.length >= 2, `no fallback request (requests: ${fetch.calls.length})`);
  assert.ok(fetch.signals[0] instanceof AbortSignal, 'the primary fetch got no AbortSignal');
  assert.equal(fetch.abortedBefore[1][0], true, 'the primary request was still open when the fallback started');
  assert.ok(fetch.signals[1] instanceof AbortSignal, 'the fallback fetch got no AbortSignal: the overall deadline could not stop it');
});

test('the fallback is tried once: both models answering 500 gives the 502 reply after two requests', async () => {
  const fetch = fakeDeepSeek([{ status: 500 }]);
  vi.stubGlobal('fetch', fetch);
  const out = await postAsk(PROMPT, OVERALL + SLACK);

  assert.deepStrictEqual(fetch.models(), ['deepseek-flash', FALLBACK], `got ${JSON.stringify(fetch.models())}`);
  assert.equal(out.state, 'resolved', `/api/ask had no answer after ${out.ms} ms`);
  assert.equal(out.value.status, 502, JSON.stringify(out.value.body));
});

test('both models hang: AI_TIMEOUT by the overall deadline, after trying the fallback', async () => {
  const fetch = fakeDeepSeek([HANG]);
  vi.stubGlobal('fetch', fetch);
  const out = await settleWithin(Server.ask('', PROMPT, []), OVERALL + SLACK);

  assertTimedOut(out, 'Server.ask with both models hung');
  assert.deepStrictEqual(fetch.models(), ['deepseek-flash', FALLBACK], `got ${JSON.stringify(fetch.models())}`);
  assert.equal(fetch.signals.every(s => s && s.aborted), true, 'a request was left open after the deadline');
});

// ── When not to fall back ───────────────────────────────────────────────────

test.each([400, 401, 402, 429])('pin: primary answers %i: no fallback, the 502 reply stands', async status => {
  const fetch = fakeDeepSeek([{ status }]);
  vi.stubGlobal('fetch', fetch);
  const out = await postAsk(PROMPT, OVERALL + SLACK);

  assert.equal(out.state, 'resolved', `/api/ask had no answer after ${out.ms} ms`);
  assert.equal(out.value.status, 502, JSON.stringify(out.value.body));
  assert.deepStrictEqual(fetch.models(), ['deepseek-flash'], `a ${status} must not reach the fallback; got ${JSON.stringify(fetch.models())}`);
});

test('pin: primary answers in time: only the primary is asked', async () => {
  const fetch = fakeDeepSeek([{ ...BUILD('p'), delay: 20 }, { ...DONE('Built it.'), delay: 20 }]);
  vi.stubGlobal('fetch', fetch);
  const out = await settleWithin(Server.ask('', PROMPT, []), OVERALL + SLACK);

  assertResolved(out, 'Server.ask with a healthy primary');
  assert.deepStrictEqual(fetch.models(), ['deepseek-flash', 'deepseek-flash']);
  assert.equal(out.value.actions.length, Recipes.ONE_LED.length);
});

test('pin: fallback off (DEEPSEEK_FALLBACK_MODEL empty): a hung primary times out with AI_TIMEOUT, no fallback request', async () => {
  process.env.DEEPSEEK_FALLBACK_MODEL = '';
  const fetch = fakeDeepSeek([HANG]);
  vi.stubGlobal('fetch', fetch);
  const out = await settleWithin(Server.ask('', PROMPT, []), OVERALL + SLACK);

  assertTimedOut(out, 'Server.ask with the fallback off');
  assert.deepStrictEqual(fetch.models(), ['deepseek-flash']);
});

test('pin: fallback off: a primary slower than the primary timeout still gets the whole deadline', async () => {
  process.env.DEEPSEEK_FALLBACK_MODEL = '';
  const fetch = fakeDeepSeek([{ ...BUILD('p'), delay: PRIMARY + 60 }, DONE('Built it.')]);
  vi.stubGlobal('fetch', fetch);
  const out = await settleWithin(Server.ask('', PROMPT, []), OVERALL + SLACK);

  assertResolved(out, `Server.ask with a ${PRIMARY + 60} ms primary and no fallback`);
  assert.deepStrictEqual(fetch.models(), ['deepseek-flash', 'deepseek-flash']);
});

// ── /api/ask and the log ────────────────────────────────────────────────────

test('/api/ask answered by the fallback: the page gets the usual reply, the log names the fallback', async () => {
  vi.stubGlobal('fetch', fakeDeepSeek([HANG, BUILD('f'), DONE('Built it.')]));
  const out = await postAsk(PROMPT, OVERALL + SLACK);

  assert.equal(out.state, 'resolved', `/api/ask still had no answer after ${out.ms} ms`);
  const { status, body } = out.value;
  assert.equal(status, 200, `status ${status}: ${JSON.stringify(body)}`);
  assert.equal(body.actions.length, Recipes.ONE_LED.length);
  assert.doesNotMatch(String(body.reply), /fallback|v4-pro/i, 'the chat should look the same whichever model answered');
  const lines = askLines();
  assert.ok(lines.some(l => l.endsWith(`→ ${Recipes.ONE_LED.length} action(s) (fallback ${FALLBACK})`)),
    `no "[ask] … → n action(s) (fallback ${FALLBACK})" log line; got ${JSON.stringify(lines)}`);
});

test('pin: /api/ask answered by the primary: the log line has no fallback note', async () => {
  vi.stubGlobal('fetch', fakeDeepSeek([BUILD('p'), DONE('Built it.')]));
  const out = await postAsk(PROMPT, OVERALL + SLACK);

  assert.equal(out.state, 'resolved', `/api/ask had no answer after ${out.ms} ms`);
  assert.equal(out.value.status, 200);
  const lines = askLines();
  assert.ok(lines.some(l => l.endsWith(`→ ${Recipes.ONE_LED.length} action(s)`)), `got ${JSON.stringify(lines)}`);
});
