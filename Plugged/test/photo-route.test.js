// POST /api/photo and backend/photo-reader.js (issue #138): the route with its
// own size and rate limits, friendly errors, and the fixture provider. The
// live Gemini/DeepSeek readers are #139; here they only ever fail.
//
// Shapes these tests assume (stated so the builder matches them):
// - photo-reader.js exports { readPhoto, validateReading, PROVIDERS }.
// - A provider is { name, read(input, ctx) }: input is the request's
//   { image, grid, sample }, ctx has at least { signal, fetch }. read resolves
//   { reading, model }; throwing (or rejecting) means it failed. Its reading
//   goes through validateReading.
// - PROVIDERS maps a name to a provider. It holds 'fixture' (and, from #139,
//   'gemini' and 'deepseek'). The route resolves PHOTO_PROVIDERS names through
//   it, so a test can register its own provider there. A name with no entry
//   counts as a provider that failed.
// - readPhoto({ image, grid, sample }, { providers, deadlineMs, fetch, fixturesDir })
//     providers   names or provider objects, tried in order; default
//                 process.env.PHOTO_PROVIDERS || 'gemini' (split on ','; it
//                 was 'gemini,deepseek' before #172)
//     deadlineMs  one overall deadline; default Number(PHOTO_TIMEOUT_MS) || 45000
//     fetch       handed to providers; default the global fetch
//     fixturesDir default Plugged/test/fixtures/photo
//   resolves { reading, provider, model } (provider is the provider's name);
//   rejects with an Error whose code is 'AI_FAILED' or 'AI_TIMEOUT'. Past the
//   deadline the signal handed to the provider is aborted.
// - Fixtures: <fixturesDir>/<key>.json = { sample, sha256, reading, provider,
//   model }; key = sample, else the hex SHA-256 of the data URL's decoded
//   bytes. providers === ['fixture'] replays only. A request with a sample
//   whose fixture exists is answered from it straight away, with no provider
//   call, unless PHOTO_RECORD=1 (#157). For an image with no sample, the
//   fixture is only a last resort, after every listed provider failed. Either
//   way it comes back with provider 'fixture' and the model the file recorded.
// - PHOTO_RECORD=1 saves each live Reading to <fixturesDir>/<key>.json.
// - Env read per request (PHOTO_PROVIDERS, PHOTO_TIMEOUT_MS, PHOTO_RECORD,
//   TRUST_PROXY), so these tests change them between requests.
// - The route answers 422 NO_BOARD itself when reading.board.visible is false.
//
// - #172: Gemini's 503s are retried on Gemini 1–2 s apart (up to 4 calls, see
//   photo-reader.test.js section 9), deepseek-flash follows only a Gemini
//   400/401/403 when listed, and the [photo] line gains retries=N. A test
//   that reaches those retries runs on a fake clock (drive()).
// - #176: Robotics-ER silent at PHOTO_FALLBACK_AT_MS (new env, default 25000)
//   → the same box request also goes to PHOTO_FALLBACK_MODEL (new env,
//   default 'gemini-3.1-flash-lite'; '' turns it off); the response's model
//   is the model that answered (provider stays 'gemini'), and the [photo]
//   line says model=<that model> fallback=yes when the fallback answered.
//
// How: the real HTTP server, requests through node:http (so a stubbed global
// fetch only ever stands in for the AI). No network, no key. Each request
// comes from its own X-Forwarded-For address (TRUST_PROXY=1) so the 6-a-minute
// photo limit only bites in the test that is about it.

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs     = require('node:fs');
const http   = require('node:http');
const os     = require('node:os');
const path   = require('node:path');
process.env.AI_PROVIDER = 'fixture';   // /api/ask needs no key and never calls out
process.env.RECORD_FIXTURES = '0';
process.env.TRUST_PROXY = '1';
const Server = require('../backend/server.js');

// Required per test: photo-reader.js doesn't exist before #138, and the
// /api/ask pin below must still run.
const Reader = () => require('../backend/photo-reader.js');

// The contract's error replies, word for word (docs/API-CONTRACT.md).
const REPLY = {
  BAD_IMAGE:  "I can't read that file. Try a JPEG or PNG photo, or use the sample photo.",
  BAD_GRID:   'Something went wrong lining up the board. Tap the four corners again, or use the sample photo.',
  TOO_LARGE:  'That photo is too large. Try a smaller one, or use the sample photo.',
  NO_BOARD:   "I couldn't find a breadboard in that photo. Try one from straight above with the whole board in view, or use the sample photo.",
  RATE:       'Too many photos at once. Wait a minute and try again, or use the sample photo.',
  AI_FAILED:  "I couldn't read the photo just now. Try again, or use the sample photo.",
  AI_TIMEOUT: 'Reading the photo took too long. Try again, or use the sample photo.',
};

// The contract's mock Reading, read from the contract itself.
const MOCK_READING = (() => {
  const doc = fs.readFileSync(path.join(__dirname, '../../docs/API-CONTRACT.md'), 'utf8');
  const m = /#### Mock Reading \(the demo board\)[\s\S]*?```json\n([\s\S]*?)```/.exec(doc);
  assert.ok(m, 'docs/API-CONTRACT.md has no "Mock Reading (the demo board)" JSON block');
  return JSON.parse(m[1]);
})();
const clone = o => JSON.parse(JSON.stringify(o));

// The demo board's flattened frame (PhotoGrid: pitch 30, a1 at (90, 190)).
const GRID = { cols: 63, pitch: 30, x0: 90, y0: 190, width: 2040, height: 710 };

// A JPEG-looking data URL of about `bytes` decoded bytes; `seed` makes it unique.
function photo(bytes = 2048, seed = 'a', mime = 'image/jpeg') {
  const head = { 'image/jpeg': [0xff, 0xd8, 0xff, 0xe0], 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/webp': [0x52, 0x49, 0x46, 0x46] }[mime] || [0, 0, 0, 0];
  const fill = Buffer.alloc(Math.max(0, Math.floor(bytes) - head.length), seed);
  const buf = Buffer.concat([Buffer.from(head), fill]);
  return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

// ── The HTTP server ─────────────────────────────────────────────────────────

let port;
beforeAll(() => new Promise(r => Server.server.listen(0, '127.0.0.1', () => {
  port = Server.server.address().port;
  r();
})));
afterAll(() => new Promise(r => Server.server.close(r)));

let logs;
const added = [];   // provider names a test registered
beforeEach(() => {
  logs = [];
  for (const m of ['log', 'info', 'warn', 'error']) {
    vi.spyOn(console, m).mockImplementation((...args) => { logs.push(args.map(String).join(' ')); });
  }
  delete process.env.PHOTO_PROVIDERS;
  delete process.env.PHOTO_TIMEOUT_MS;
  delete process.env.PHOTO_RECORD;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (added.length) {
    const { PROVIDERS } = Reader();
    for (const name of added.splice(0)) delete PROVIDERS[name];
  }
});

// Registers a provider the route can be pointed at with PHOTO_PROVIDERS.
function register(name, read) {
  Reader().PROVIDERS[name] = { name, read };
  added.push(name);
}

let ipCount = 0;
const freshIp = () => `10.38.${Math.floor(++ipCount / 250)}.${ipCount % 250 + 1}`;

// POSTs `body` (an object, or a raw string) from `ip`. Destroyed after `ms`
// so a hung server fails the assertion, not the runner.
function post(urlPath, body, { ip = freshIp(), ms = 5000 } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const started = Date.now();
  let req;
  return new Promise((resolve, reject) => {
    req = http.request({ host: '127.0.0.1', port, path: urlPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text), 'X-Forwarded-For': ip } }, res => {
      let out = '';
      res.on('data', c => { out += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(out); } catch { /* not JSON: a 404 page, say */ }
        resolve({ status: res.statusCode, body: parsed, raw: out, ms: Date.now() - started });
      });
    });
    req.on('error', reject);
    const timer = setTimeout(() => { req.destroy(); reject(new Error(`${urlPath} had no answer after ${ms} ms`)); }, ms);
    req.on('close', () => clearTimeout(timer));
    req.end(text);
  });
}
const postPhoto = (body, opts) => post('/api/photo', body, opts);
const demoBody = (extra = {}) => ({ image: photo().dataUrl, grid: GRID, sample: 'demo-board', ...extra });

function assertError(res, status, code, reply) {
  assert.equal(res.status, status, `expected ${status} ${code || ''}, got ${res.status}: ${res.raw.slice(0, 200)}`);
  assert.ok(res.body, `the ${status} body isn't JSON: ${res.raw.slice(0, 200)}`);
  assert.equal(res.body.reply, reply);
  if (code) assert.equal(res.body.code, code, JSON.stringify(res.body));
  else assert.equal('code' in res.body, false, `a ${status} has no code, got ${JSON.stringify(res.body)}`);
}

// ── Fixtures ────────────────────────────────────────────────────────────────

test('the demo-board recording holds the contract\'s mock Reading, model deepseek-flash', () => {
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/photo/demo-board.json'), 'utf8'));
  assert.deepStrictEqual(file, { sample: 'demo-board', sha256: null, reading: MOCK_READING, provider: 'fixture', model: 'deepseek-flash' });
});

test('fixture by sample: PHOTO_PROVIDERS=fixture and sample demo-board → 200 with the mock Reading', async () => {
  process.env.PHOTO_PROVIDERS = 'fixture';
  const res = await postPhoto(demoBody());
  assert.equal(res.status, 200, `status ${res.status}: ${res.raw.slice(0, 200)}`);
  assert.equal(res.body.provider, 'fixture');
  assert.equal(res.body.model, 'deepseek-flash', 'a fixture answers with the model it recorded');
  assert.equal(typeof res.body.ms, 'number', `ms: ${res.body.ms}`);
  assert.deepStrictEqual(res.body.reading, MOCK_READING);
});

test('fixture by hash (no sample): the key is the SHA-256 of the decoded image bytes', async () => {
  const { readPhoto } = Reader();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-fixtures-'));
  try {
    const img = photo(4096, 'h');
    const reading = clone(MOCK_READING);
    reading.parts = reading.parts.filter(p => p.id === 'LED1');
    fs.writeFileSync(path.join(dir, `${img.sha256}.json`),
      JSON.stringify({ sample: null, sha256: img.sha256, reading, provider: 'gemini', model: 'gemini-test-model' }));

    const out = await readPhoto({ image: img.dataUrl, grid: GRID }, { providers: ['fixture'], fixturesDir: dir });
    assert.equal(out.provider, 'fixture');
    assert.equal(out.model, 'gemini-test-model');
    assert.deepStrictEqual(out.reading, reading);

    // Another image has another hash, so no fixture: AI_FAILED.
    const other = readPhoto({ image: photo(4096, 'z').dataUrl, grid: GRID }, { providers: ['fixture'], fixturesDir: dir });
    await assert.rejects(other, e => e.code === 'AI_FAILED');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('fixture only, no fixture for the key → 502 AI_FAILED', async () => {
  process.env.PHOTO_PROVIDERS = 'fixture';
  const res = await postPhoto({ image: photo(2048, 'q').dataUrl, grid: GRID, sample: 'no-such-sample' });
  assertError(res, 502, 'AI_FAILED', REPLY.AI_FAILED);
});

test('a sample id is a key, not a path: one that climbs out of the fixtures folder finds nothing', async () => {
  process.env.PHOTO_PROVIDERS = 'fixture';
  // path.join(fixtures, '../photo/demo-board.json') is the demo fixture itself.
  const res = await postPhoto(demoBody({ sample: '../photo/demo-board' }));
  assertError(res, 502, 'AI_FAILED', REPLY.AI_FAILED);
});

// #172 rewrote this one: the default is Gemini alone now, and its 503s are
// retried for seconds, so the image with no recording runs on the fake clock.
// #176: with the fallback model on, Robotics-ER spending its 4 calls brings
// gemini-3.1-flash-lite in at once (the next tests). This one counts
// Robotics-ER's own calls, so the fallback is off here.
test('live mode (default: Gemini alone, #172; fallback model off, PHOTO_FALLBACK_MODEL=\'\', #176), Gemini down (503): the sample\'s recording answers with no AI call; an image with no recording → 502 AI_FAILED after Gemini\'s 4 calls, deepseek never asked, retries=3 in the log', async () => {
  const restore = withAiKeys();
  const savedFallback = process.env.PHOTO_FALLBACK_MODEL;
  process.env.PHOTO_FALLBACK_MODEL = '';
  try {
    const calls = stubAi({ gemini: 503, deepseek: 503 });
    const withFixture = await postPhoto(demoBody());
    assert.equal(withFixture.status, 200, `status ${withFixture.status}: ${withFixture.raw.slice(0, 200)}`);
    assert.equal(withFixture.body.provider, 'fixture');
    assert.deepStrictEqual(withFixture.body.reading, MOCK_READING);
    assert.deepStrictEqual(calls, [], 'a sample with a recording never reaches the AI');

    vi.useFakeTimers(CLOCK);
    logs.length = 0;
    const noFixture = await drive(postPhoto({ image: photo(2048, 'n').dataUrl, grid: GRID }, { ms: LONG }));
    assertError(noFixture, 502, 'AI_FAILED', REPLY.AI_FAILED);
    assert.equal(calls.filter(c => c.service === 'deepseek').length, 0,
      `PHOTO_PROVIDERS unset is Gemini alone: deepseek was asked (calls: ${calls.map(c => c.service).join(', ')})`);
    assert.deepStrictEqual(calls.map(c => c.service), ['gemini', 'gemini', 'gemini', 'gemini'],
      `a Gemini that answers 503 every time is called 4 times, then AI_FAILED; calls: ${calls.map(c => c.service).join(', ')}`);
    const line = logs.find(l => l.startsWith('[photo]')) || '(no [photo] line)';
    assert.match(line, /\bretries=3\b/, `4 Gemini calls are 3 retries: ${line}`);
  } finally {
    restore();
    if (savedFallback === undefined) delete process.env.PHOTO_FALLBACK_MODEL;
    else process.env.PHOTO_FALLBACK_MODEL = savedFallback;
  }
});

// An image with no sample whose hash has a recording, in a temp fixtures folder.
function withHashFixture(seed, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-hash-'));
  const img = photo(4096, seed);
  fs.writeFileSync(path.join(dir, `${img.sha256}.json`),
    JSON.stringify({ sample: null, sha256: img.sha256, reading: clone(MOCK_READING), provider: 'gemini', model: 'gemini-recorded' }));
  return Promise.resolve(run(img, dir)).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

test('live mode tries the providers in order and only falls back to the fixture last (an image with no sample)', async () => {
  const { readPhoto } = Reader();
  const tried = [];
  const broken = { name: 'broken', read: async () => { tried.push('broken'); throw new Error('503'); } };
  const works  = { name: 'works',  read: async () => { tried.push('works'); return { reading: clone(MOCK_READING), model: 'works-1' }; } };
  const never  = { name: 'never',  read: async () => { tried.push('never'); throw new Error('should not be asked'); } };

  // The image has a recording, yet a working provider is the one that answers.
  await withHashFixture('p', async (img, dir) => {
    const out = await readPhoto({ image: img.dataUrl, grid: GRID }, { providers: [broken, works, never], fixturesDir: dir });
    assert.deepStrictEqual(tried, ['broken', 'works']);
    assert.equal(out.provider, 'works');
    assert.equal(out.model, 'works-1');
    assert.deepStrictEqual(out.reading, MOCK_READING);
  });
});

test('PHOTO_RECORD=1 saves a live Reading as { sample, sha256, reading, provider, model }', async () => {
  const { readPhoto } = Reader();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-record-'));
  try {
    process.env.PHOTO_RECORD = '1';
    const img = photo(4096, 'r');
    const works = { name: 'works', read: async () => ({ reading: clone(MOCK_READING), model: 'works-1' }) };
    await readPhoto({ image: img.dataUrl, grid: GRID }, { providers: [works], fixturesDir: dir });

    const file = path.join(dir, `${img.sha256}.json`);
    assert.ok(fs.existsSync(file), `nothing recorded at <sha256>.json; the folder has: ${fs.readdirSync(dir).join(', ') || 'nothing'}`);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')),
      { sample: null, sha256: img.sha256, reading: MOCK_READING, provider: 'works', model: 'works-1' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── The response's key (#139) ───────────────────────────────────────────────

test('a 200 carries key: the sample id when sent, else the image\'s SHA-256', async () => {
  process.env.PHOTO_PROVIDERS = 'fixture';
  const bySample = await postPhoto(demoBody());
  assert.equal(bySample.status, 200, `status ${bySample.status}: ${bySample.raw.slice(0, 200)}`);
  assert.equal(bySample.body.key, 'demo-board', `key: ${JSON.stringify(bySample.body.key)}`);

  register('works-key', async () => ({ reading: clone(MOCK_READING), model: 'works-1' }));
  process.env.PHOTO_PROVIDERS = 'works-key';
  const img = photo(2048, 'k');
  const byHash = await postPhoto({ image: img.dataUrl, grid: GRID });
  assert.equal(byHash.status, 200, `status ${byHash.status}: ${byHash.raw.slice(0, 200)}`);
  assert.equal(byHash.body.key, img.sha256, `key: ${JSON.stringify(byHash.body.key)}`);
});

// ── The live readers through the route (#139) ───────────────────────────────

// Fake AI keys for one test, so the live readers get as far as fetch.
function withAiKeys() {
  const saved = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY };
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
  return () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

// A global fetch that answers per service and keeps every call as
// { service, model }. statusFor maps a service to a status (the body an
// error), or is (service, n) => { status, body }, n the call's number for
// that service. Plain response objects, so a fake clock can't stall them.
function stubAi(statusFor) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const u = String(url);
    const service = u.includes('generativelanguage.googleapis.com') ? 'gemini' : u.includes('api.deepseek.com') ? 'deepseek' : u;
    let body = null;
    try { body = JSON.parse(opts.body); } catch { /* not JSON */ }
    const n = calls.filter(c => c.service === service).length + 1;
    calls.push({ service, model: body && body.model });
    const out = typeof statusFor === 'function' ? statusFor(service, n)
      : { status: statusFor[service] || 500, body: { error: { code: statusFor[service] } } };
    const text = JSON.stringify(out.body);
    return { ok: out.status >= 200 && out.status < 300, status: out.status, text: async () => text, json: async () => JSON.parse(text) };
  }));
  return calls;
}

// ── The fake clock (#172) ───────────────────────────────────────────────────
// Gemini's retries wait 1–2 s. A test that reaches them runs the server on a
// fake clock: drive() moves it in 250 ms steps, letting the real socket I/O
// through between steps, until the response is in. Its post() gets a guard
// (LONG) the fake clock never reaches.
const CLOCK = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] };
const LONG  = 3600000;
async function drive(pending, limitMs = 60000) {
  let done = false, res, err;
  pending.then(r => { done = true; res = r; }, e => { done = true; err = e; });
  for (let t = 0; t < limitMs && !done; t += 250) {
    await vi.advanceTimersByTimeAsync(250);
    for (let i = 0; i < 30 && !done; i++) await new Promise(r => setImmediate(r));
  }
  const end = performance.now() + 1000;
  while (!done && performance.now() < end) await new Promise(r => setImmediate(r));
  if (err) throw err;
  assert.ok(done, `no response after ${limitMs / 1000} s on the fake clock`);
  return res;
}

// #172 rewrote this one: it was "Gemini 503 and deepseek-flash 503, the
// default list → both tried". The default is Gemini alone now, a 503 is
// retried on Gemini, and deepseek (when listed) follows a 400/401/403.
test('live readers: PHOTO_PROVIDERS=gemini,deepseek, Gemini 401 and deepseek-flash 503, no fixture → 502 AI_FAILED after trying both, in order, each once', async () => {
  const restore = withAiKeys();
  try {
    process.env.PHOTO_PROVIDERS = 'gemini,deepseek';
    const calls = stubAi({ gemini: 401, deepseek: 503 });
    const res = await postPhoto({ image: photo(2048, 'f').dataUrl, grid: GRID });
    assertError(res, 502, 'AI_FAILED', REPLY.AI_FAILED);
    assert.deepStrictEqual(calls.map(c => c.service), ['gemini', 'deepseek'], `a Gemini 401 hands over to deepseek-flash; calls: ${JSON.stringify(calls)}`);
    assert.equal(calls[1].model, 'deepseek-flash');
  } finally {
    restore();
  }
});

test('live readers, default providers (Gemini alone): Gemini 400 → 502 AI_FAILED after one call, without ever asking deepseek', async () => {
  const restore = withAiKeys();
  try {
    const calls = stubAi({ gemini: 400, deepseek: 503 });
    const res = await postPhoto({ image: photo(2048, 'x').dataUrl, grid: GRID });
    assertError(res, 502, 'AI_FAILED', REPLY.AI_FAILED);
    assert.deepStrictEqual(calls.map(c => c.service), ['gemini'], `a 400 must not fall back: ${JSON.stringify(calls)}`);
  } finally {
    restore();
  }
});

// ── Use sample photo replays its recording (#157) ───────────────────────────

test('#157 bug: live mode, Use sample photo (sample demo-board) is answered from its recording with no AI call, whether the AI would answer or is down; the log says provider=fixture fallback=no', async () => {
  const restore = withAiKeys();
  const geminiReply = { candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({
    rails: { aOuter: '+', aInner: '-', jInner: '+', jOuter: '-' },
    items: [{ type: 'resistor', value: '470', conf: 0.8, box_2d: [300, 100, 400, 250] }] }) }] }, finishReason: 'STOP' }] };
  const cases = [
    ['the AI would answer', service => (service === 'gemini' ? { status: 200, body: geminiReply } : { status: 503, body: { error: { code: 503 } } })],
    ['the AI is down', () => ({ status: 503, body: { error: { code: 503 } } })],
  ];
  try {
    for (const [what, answer] of cases) {
      const calls = [];
      vi.stubGlobal('fetch', vi.fn(async url => {
        const u = String(url);
        const service = u.includes('generativelanguage.googleapis.com') ? 'gemini' : u.includes('api.deepseek.com') ? 'deepseek' : u;
        calls.push(service);
        const { status, body } = answer(service);
        return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      }));
      logs.length = 0;
      const res = await postPhoto(demoBody());
      assert.equal(res.status, 200, `${what}: status ${res.status}: ${res.raw.slice(0, 200)}`);
      assert.equal(res.body.provider, 'fixture', `${what}: answered by ${res.body.provider} (${res.body.model}), not the demo-board recording`);
      assert.deepStrictEqual(calls, [], `${what}: the sample went to the AI: ${calls.join(', ')}`);
      assert.equal(res.body.model, 'deepseek-flash', `${what}: the model the recording holds`);
      assert.equal(res.body.key, 'demo-board', what);
      assert.deepStrictEqual(res.body.reading, MOCK_READING, what);
      const line = logs.find(l => l.startsWith('[photo]')) || '';
      assert.match(line, /sample=demo-board/, `${what}: [photo] line: ${line}`);
      assert.match(line, /provider=fixture/, `${what}: [photo] line: ${line}`);
      assert.match(line, /fallback=no/, `${what}: a sample's recording is its answer, not a fallback: ${line}`);
    }
  } finally {
    restore();
  }
});

// ── Body cap ────────────────────────────────────────────────────────────────

test('/api/photo: a body over 4 MB → 413 TOO_LARGE; a 3.5 MB photo is read', async () => {
  process.env.PHOTO_PROVIDERS = 'fixture';
  const big = await postPhoto(demoBody({ image: photo(3.2 * 1024 * 1024, 'b').dataUrl }));   // ~4.3 MB as base64
  assertError(big, 413, 'TOO_LARGE', REPLY.TOO_LARGE);

  const ok = await postPhoto(demoBody({ image: photo(2.6 * 1024 * 1024, 'o').dataUrl }));    // ~3.5 MB as base64
  assert.equal(ok.status, 200, `a 3.5 MB photo got ${ok.status}: ${ok.raw.slice(0, 200)}`);
});

test('pin: /api/ask still rejects a body over 256 KB with 413', async () => {
  const res = await post('/api/ask', JSON.stringify({ message: 'x'.repeat(260 * 1024), markdown: '', history: [] }));
  assert.equal(res.status, 413, `status ${res.status}`);
});

// ── Bad requests ────────────────────────────────────────────────────────────

test('400 BAD_IMAGE when image is not a JPEG, PNG or WebP data URL; those three are read', async () => {
  process.env.PHOTO_PROVIDERS = 'fixture';
  const bad = [
    ['missing', undefined],
    ['a GIF data URL', photo(512, 'g', 'image/gif').dataUrl],
    ['a text data URL', 'data:text/plain;base64,aGVsbG8='],
    ['a plain URL', 'https://example.com/board.jpg'],
    ['not a string', 42],
  ];
  for (const [what, image] of bad) {
    const res = await postPhoto(demoBody({ image }));
    assert.equal(res.status, 400, `${what}: status ${res.status}`);
    assertError(res, 400, 'BAD_IMAGE', REPLY.BAD_IMAGE);
  }
  for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
    const res = await postPhoto(demoBody({ image: photo(2048, 'm', mime).dataUrl }));
    assert.equal(res.status, 200, `${mime}: status ${res.status}: ${res.raw.slice(0, 200)}`);
  }
});

test('400 BAD_GRID when grid is missing, cols is not 30 or 63, or a field is not a positive number', async () => {
  process.env.PHOTO_PROVIDERS = 'fixture';
  const bad = [
    ['missing', undefined],
    ['cols 40', { ...GRID, cols: 40 }],
    ['pitch 0', { ...GRID, pitch: 0 }],
    ['x0 negative', { ...GRID, x0: -5 }],
    ['height a string', { ...GRID, height: 'tall' }],
    ['width missing', { cols: 63, pitch: 30, x0: 90, y0: 190, height: 710 }],
  ];
  for (const [what, grid] of bad) {
    const res = await postPhoto(demoBody({ grid }));
    assert.equal(res.status, 400, `${what}: status ${res.status}`);
    assertError(res, 400, 'BAD_GRID', REPLY.BAD_GRID);
  }
  const thirty = await postPhoto(demoBody({ grid: { ...GRID, cols: 30, width: 1050 } }));
  assert.equal(thirty.status, 200, `a 30-column grid got ${thirty.status}: ${thirty.raw.slice(0, 200)}`);
});

// ── Rate limit ──────────────────────────────────────────────────────────────

test('429 on the 7th photo in a minute from one IP; other IPs and /api/ask are not limited by it', async () => {
  process.env.PHOTO_PROVIDERS = 'fixture';
  const ip = '10.99.0.7';
  for (let n = 1; n <= 6; n++) {
    const res = await postPhoto(demoBody(), { ip });
    assert.equal(res.status, 200, `photo ${n} of 6 got ${res.status}: ${res.raw.slice(0, 200)}`);
  }
  assertError(await postPhoto(demoBody(), { ip }), 429, undefined, REPLY.RATE);

  assert.equal((await postPhoto(demoBody(), { ip: '10.99.0.8' })).status, 200, 'the limit is per IP');
  const ask = await post('/api/ask', { message: 'hello', markdown: '', history: [] }, { ip });
  assert.notEqual(ask.status, 429, 'photos must not use up /api/ask\'s limit');
});

// ── Timeout and no board ────────────────────────────────────────────────────

test('a provider slower than PHOTO_TIMEOUT_MS → 504 AI_TIMEOUT, well inside a second', async () => {
  let signal;
  register('slow-test', (input, ctx) => {
    signal = ctx && ctx.signal;
    return new Promise(() => {});   // never answers
  });
  process.env.PHOTO_PROVIDERS = 'slow-test';
  process.env.PHOTO_TIMEOUT_MS = '100';
  const res = await postPhoto({ image: photo(2048, 's').dataUrl, grid: GRID }, { ms: 3000 });
  assertError(res, 504, 'AI_TIMEOUT', REPLY.AI_TIMEOUT);
  assert.ok(res.ms < 800, `answered after ${res.ms} ms with a 100 ms deadline`);
  assert.ok(signal instanceof AbortSignal && signal.aborted, 'the slow provider\'s request was not aborted at the deadline');
});

test('readPhoto: past deadlineMs it rejects with AI_TIMEOUT', async () => {
  const { readPhoto } = Reader();
  const slow = { name: 'slow', read: () => new Promise(() => {}) };
  const started = Date.now();
  await assert.rejects(readPhoto({ image: photo(2048, 't').dataUrl, grid: GRID }, { providers: [slow], deadlineMs: 80 }),
    e => e.code === 'AI_TIMEOUT');
  assert.ok(Date.now() - started < 600, `took ${Date.now() - started} ms with an 80 ms deadline`);
});

test('readPhoto in live mode: past deadlineMs a fixture for the image answers instead, and no later provider starts', async () => {
  const { readPhoto } = Reader();
  const slow = { name: 'slow', read: () => new Promise(() => {}) };
  let neverCalled = false;
  const never = { name: 'never', read: async () => { neverCalled = true; throw new Error('should not be asked'); } };
  await withHashFixture('d', async (img, dir) => {
    const started = Date.now();
    const out = await readPhoto({ image: img.dataUrl, grid: GRID }, { providers: [slow, never], deadlineMs: 80, fixturesDir: dir });
    assert.ok(Date.now() - started >= 70, `answered after ${Date.now() - started} ms, before the 80 ms deadline`);
    assert.ok(Date.now() - started < 600, `took ${Date.now() - started} ms with an 80 ms deadline`);
    assert.equal(out.provider, 'fixture');
    assert.equal(out.fallback, true);
    assert.equal(out.model, 'gemini-recorded');
    assert.deepStrictEqual(out.reading, MOCK_READING);
    assert.equal(neverCalled, false, 'a provider after the slow one was started past the deadline');
  });
});

test('422 NO_BOARD when the Reading says board.visible is false', async () => {
  register('blind-test', async () => {
    const reading = clone(MOCK_READING);
    reading.board.visible = false;
    return { reading, model: 'blind-1' };
  });
  process.env.PHOTO_PROVIDERS = 'blind-test';
  const res = await postPhoto({ image: photo(2048, 'v').dataUrl, grid: GRID });
  assertError(res, 422, 'NO_BOARD', REPLY.NO_BOARD);
});

// ── Logging ─────────────────────────────────────────────────────────────────

test('one [photo] log line per request, never the image', async () => {
  process.env.PHOTO_PROVIDERS = 'fixture';
  const img = photo(8192, 'L');
  const payload = img.dataUrl.slice(img.dataUrl.indexOf(',') + 1, img.dataUrl.indexOf(',') + 81);

  const lines = async body => {
    logs.length = 0;
    await postPhoto(body);
    await new Promise(r => setTimeout(r, 20));   // a log written just after the reply
    return logs.slice();
  };

  const okLogs = await lines({ image: img.dataUrl, grid: GRID, sample: 'demo-board' });
  const okPhoto = okLogs.filter(l => l.startsWith('[photo]'));
  assert.equal(okPhoto.length, 1, `a read logged ${okPhoto.length} [photo] lines: ${JSON.stringify(okLogs)}`);
  assert.match(okPhoto[0], /sample=demo-board/);
  assert.match(okPhoto[0], /provider=fixture/);

  const failLogs = await lines({ image: img.dataUrl, grid: GRID, sample: 'no-such-sample' });
  const failPhoto = failLogs.filter(l => l.startsWith('[photo]'));
  assert.equal(failPhoto.length, 1, `a failed read logged ${failPhoto.length} [photo] lines: ${JSON.stringify(failLogs)}`);

  for (const l of okLogs.concat(failLogs)) {
    assert.ok(!l.includes('data:image') && !l.includes(payload), `a log line carries the image: ${l.slice(0, 160)}`);
  }
});

const GEMINI_READS = { candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({
  rails: { aOuter: '+', aInner: '-', jInner: '+', jOuter: '-' },
  items: [{ type: 'resistor', value: '470', conf: 0.8, box_2d: [300, 100, 400, 250] }] }) }] }, finishReason: 'STOP' }] };

test('#172: the [photo] line counts Gemini\'s retries: a 503, then Gemini answers → 200 from gemini with retries=1; a recording → retries=0', async () => {
  const restore = withAiKeys();
  try {
    const calls = stubAi((service, n) => (service === 'gemini' && n > 1 ? { status: 200, body: GEMINI_READS } : { status: 503, body: { error: { code: 503 } } }));
    vi.useFakeTimers(CLOCK);
    logs.length = 0;
    const res = await drive(postPhoto({ image: photo(2048, 'y').dataUrl, grid: GRID }, { ms: LONG }));
    const line = logs.find(l => l.startsWith('[photo]')) || '(no [photo] line)';
    assert.match(line, /\bretries=1\b/, `one Gemini 503, then its answer: the [photo] line has no retries=1: ${line}`);
    assert.equal(res.status, 200, `status ${res.status}: ${res.raw.slice(0, 200)}`);
    assert.equal(res.body.provider, 'gemini', JSON.stringify(res.body).slice(0, 200));
    assert.match(line, /provider=gemini/, line);
    assert.deepStrictEqual(calls.map(c => c.service), ['gemini', 'gemini'], `calls: ${calls.map(c => c.service).join(', ')}`);
    vi.useRealTimers();

    process.env.PHOTO_PROVIDERS = 'fixture';
    logs.length = 0;
    const replay = await postPhoto(demoBody());
    assert.equal(replay.status, 200, `status ${replay.status}: ${replay.raw.slice(0, 200)}`);
    await new Promise(r => setTimeout(r, 20));   // a log written just after the reply
    const fixtureLine = logs.find(l => l.startsWith('[photo]')) || '(no [photo] line)';
    assert.match(fixtureLine, /\bretries=0\b/, `a recording makes no AI call: ${fixtureLine}`);
  } finally {
    restore();
  }
});

// ── The fallback model in the [photo] line (#176) ───────────────────────────
// Robotics-ER silent at PHOTO_FALLBACK_AT_MS (default 25000), or out of calls
// before then (a 503 storm, at once) → the same box request also goes to
// PHOTO_FALLBACK_MODEL (default gemini-3.1-flash-lite); the response's model
// is the model that answered, and the [photo] line says so, with fallback=yes
// (photo-reader.test.js section 10 has the rules).

const ER_MODEL = 'gemini-robotics-er-2-preview';
const FB_MODEL = 'gemini-3.1-flash-lite';
const FB_ENV   = ['PHOTO_GEMINI_MODEL', 'PHOTO_FALLBACK_MODEL', 'PHOTO_FALLBACK_AT_MS', 'PHOTO_HEDGE_MS'];

// Runs run() with fake AI keys and the photo models' env unset (the
// defaults), putting both back after.
async function withPhotoDefaults(run) {
  const restore = withAiKeys();
  const saved = Object.fromEntries(FB_ENV.map(k => [k, process.env[k]]));
  for (const k of FB_ENV) delete process.env[k];
  try {
    return await run();
  } finally {
    restore();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// A global fetch for the two Gemini models. erMode() says what Robotics-ER
// does: 'hang' (until its call is aborted), '503' or 'answer'. The fallback
// model answers at once. Returns each call's model, in order.
function stubTwoModels(erMode) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn((url, opts = {}) => {
    const u = String(url);
    const model = (/\/models\/([^/:]+):generateContent$/.exec(u) || [])[1] || u;
    calls.push(model);
    const mode = model === FB_MODEL ? 'answer' : model === ER_MODEL ? erMode() : 'unexpected';
    if (mode === 'answer') {
      const text = JSON.stringify(GEMINI_READS);
      return Promise.resolve({ ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) });
    }
    if (mode === '503') {
      const text = JSON.stringify({ error: { code: 503 } });
      return Promise.resolve({ ok: false, status: 503, text: async () => text, json: async () => JSON.parse(text) });
    }
    if (mode !== 'hang') return Promise.reject(new Error(`the photo reader called an unexpected URL: ${u}`));
    return new Promise((_, reject) => {
      if (opts.signal) opts.signal.addEventListener('abort', () => reject(opts.signal.reason || new Error('aborted')), { once: true });
    });
  }));
  return calls;
}

test('#176: Robotics-ER silent → gemini-3.1-flash-lite answers at 25 s → 200 with model gemini-3.1-flash-lite, and the [photo] line says model=gemini-3.1-flash-lite fallback=yes; Robotics-ER answering → its model, fallback=no', async () => {
  await withPhotoDefaults(async () => {
    let erMode = 'hang';
    const calls = stubTwoModels(() => erMode);

    vi.useFakeTimers(CLOCK);
    logs.length = 0;
    const res = await drive(postPhoto({ image: photo(2048, 'q').dataUrl, grid: GRID }, { ms: LONG }));
    const line = logs.find(l => l.startsWith('[photo]')) || '(no [photo] line)';
    assert.equal(res.status, 200, `Robotics-ER silent: status ${res.status} (${res.raw.slice(0, 120)}); calls: ${calls.join(', ')}; ${line}`);
    assert.ok(calls.includes(FB_MODEL), `${FB_MODEL} was never asked; calls: ${calls.join(', ')}`);
    assert.equal(res.body.model, FB_MODEL, `the response's model is the model that answered: ${JSON.stringify(res.body).slice(0, 200)}`);
    assert.equal(res.body.provider, 'gemini', JSON.stringify(res.body).slice(0, 200));
    assert.match(line, /\bmodel=gemini-3\.1-flash-lite\s/, `the [photo] line names the model that answered: ${line}`);
    assert.match(line, /\bfallback=yes\b/, `the fallback model answered: ${line}`);
    vi.useRealTimers();

    erMode = 'answer';
    calls.length = 0;
    logs.length = 0;
    const er = await postPhoto({ image: photo(2048, 'u').dataUrl, grid: GRID });
    const erLine = logs.find(l => l.startsWith('[photo]')) || '(no [photo] line)';
    assert.equal(er.status, 200, `Robotics-ER answering: status ${er.status}: ${er.raw.slice(0, 200)}`);
    assert.equal(er.body.model, ER_MODEL, JSON.stringify(er.body).slice(0, 200));
    assert.deepStrictEqual(calls, [ER_MODEL], `Robotics-ER answered at once; calls: ${calls.join(', ')}`);
    assert.match(erLine, /\bmodel=gemini-robotics-er-2-preview\s/, erLine);
    assert.match(erLine, /\bfallback=no\b/, `Robotics-ER answered, not the fallback: ${erLine}`);
  });
});

test('#176: Robotics-ER 503 every time → its 4 calls spent within seconds, gemini-3.1-flash-lite asked at once and answering → 200 well before 25 s, model gemini-3.1-flash-lite, fallback=yes in the [photo] line', async () => {
  await withPhotoDefaults(async () => {
    const calls = stubTwoModels(() => '503');
    vi.useFakeTimers(CLOCK);
    logs.length = 0;
    const started = Date.now();
    const res = await drive(postPhoto({ image: photo(2048, 'z').dataUrl, grid: GRID }, { ms: LONG }));
    const took = Date.now() - started;
    const line = logs.find(l => l.startsWith('[photo]')) || '(no [photo] line)';
    assert.equal(res.status, 200, `Robotics-ER spent on 503s: status ${res.status} (${res.raw.slice(0, 120)}); calls: ${calls.join(', ')}; ${line}`);
    assert.deepStrictEqual(calls, [ER_MODEL, ER_MODEL, ER_MODEL, ER_MODEL, FB_MODEL],
      `Robotics-ER's 4 calls, then the fallback once; calls: ${calls.join(', ')}`);
    assert.ok(took < 25000, `answered after ${took} ms of fake time; the fallback should go out at once when Robotics-ER is spent, not at 25 s`);
    assert.equal(res.body.model, FB_MODEL, JSON.stringify(res.body).slice(0, 200));
    assert.match(line, /\bmodel=gemini-3\.1-flash-lite\s/, line);
    assert.match(line, /\bfallback=yes\b/, `the fallback model answered: ${line}`);
  });
});

// ── validateReading ─────────────────────────────────────────────────────────

test('validateReading keeps a valid Reading unchanged, with no notes', () => {
  const { validateReading } = Reader();
  const { reading, notes } = validateReading(clone(MOCK_READING));
  assert.deepStrictEqual(reading, MOCK_READING);
  assert.deepStrictEqual(notes, []);
});

test('validateReading coerces fields it can repair and drops what it can\'t, with a note for each drop', () => {
  const { validateReading } = Reader();
  const raw = clone(MOCK_READING);
  raw.board.rails.jOuter = 'plus';                         // not '+', '-' or '?'
  const r1 = raw.parts[0];
  r1.type = 'capacitor';                                   // not resistor | led | other
  delete r1.value;
  delete r1.bands;
  delete r1.unsure;
  raw.parts[1].leads[0].role = 'positive';                 // not a role
  raw.parts.push({ id: 'R9', type: 'resistor', what: 'a resistor', value: 1000, bands: [], color: '', leads: [],
    box: [0, 0, 1, 1], confidence: 0.5, unsure: [] });     // no leads: dropped
  raw.wires.push({ id: 'W9', color: 'red', ends: [{ hole: 'a1', pt: [90, 190] }], confidence: 0.5, unsure: [] });   // 1 end: dropped
  raw.power[0].kind = 'aa_pack';                           // not a power kind
  delete raw.power[0].volts;

  const { reading, notes } = validateReading(raw);
  assert.equal(reading.board.rails.jOuter, '?');
  assert.equal(reading.board.rails.aOuter, '+', 'a valid rail sign is kept');
  assert.deepStrictEqual(reading.parts.map(p => p.id), ['R1', 'LED1'], 'R9 has no leads and is dropped');
  const r = reading.parts[0];
  assert.equal(r.type, 'other');
  assert.equal(r.value, 0);
  assert.deepStrictEqual(r.bands, []);
  assert.deepStrictEqual(r.unsure, []);
  assert.deepStrictEqual(r.leads, MOCK_READING.parts[0].leads, 'R1\'s leads are kept');
  assert.equal(reading.parts[1].leads[0].role, 'unknown');
  assert.equal(reading.parts[1].leads[1].role, 'anode', 'a valid role is kept');
  assert.deepStrictEqual(reading.wires.map(w => w.id), ['W1'], 'W9 has one end and is dropped');
  assert.equal(reading.power[0].kind, 'unknown');
  assert.equal(reading.power[0].volts, 0);

  assert.ok(Array.isArray(notes) && notes.every(n => typeof n === 'string'), `notes: ${JSON.stringify(notes)}`);
  assert.ok(notes.some(n => n.includes('R9')), `no note says why R9 was dropped: ${JSON.stringify(notes)}`);
  assert.ok(notes.some(n => n.includes('W9')), `no note says why W9 was dropped: ${JSON.stringify(notes)}`);
});
