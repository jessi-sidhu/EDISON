// POST /api/voice/stt, POST /api/voice/tts and backend/voice.js (issue #12,
// Voice V1): ElevenLabs speech-to-text and text-to-speech behind the server,
// so the key never reaches the browser. No test reaches ElevenLabs:
// VOICE_PROVIDER=fixture replays test/fixtures/voice/, and a stubbed fetch
// stands in for api.elevenlabs.io (the key used here is not a real one).
//
// Shapes these tests assume (the plan's Task 1, stated so the builder matches them):
// - backend/voice.js exports { parseAudioDataUrl, voiceMode, transcribe, speak, VOICE_REPLY }.
// - parseAudioDataUrl(s) → { mime, ext, buf } for a base64 data URL of
//   audio/webm, ogg, mp4, mpeg or wav (an optional ;codecs=… allowed), where
//   mime has no codecs part and buf holds the decoded bytes; anything else → null.
// - voiceMode(env = process.env) → 'fixture' | 'elevenlabs' | 'off'.
// - transcribe(clip, { env, fetch }) resolves the transcript text.
//   speak(text, { env, fetch }) resolves a Response whose body (a web
//   ReadableStream) is the mp3. env defaults to process.env and fetch to the
//   global fetch, both looked up per call. A failure rejects with an Error
//   whose code is VOICE_FAILED or VOICE_TIMEOUT.
// - ElevenLabs as checked on 2026-10-03:
//     STT  POST https://api.elevenlabs.io/v1/speech-to-text, multipart
//          (file, model_id ELEVENLABS_STT_MODEL || scribe_v2), header xi-api-key;
//          the 200's JSON `text` is the transcript.
//     TTS  POST https://api.elevenlabs.io/v1/text-to-speech/<voice>/stream?output_format=mp3_44100_128,
//          JSON { text, model_id: ELEVENLABS_TTS_MODEL || eleven_flash_v2_5 },
//          header xi-api-key; voice ELEVENLABS_VOICE_ID || JBFqnCBsd6RMkjVDRZzb.
// - One deadline per upstream call, VOICE_TIMEOUT_MS (default 10000), run on
//   the global setTimeout/clearTimeout and an AbortController (vi.useFakeTimers
//   drives those; it can't drive AbortSignal.timeout). Every call gets the
//   signal, and aborting it makes the fake fetch reject, as a real fetch does.
// - Routes: errors are JSON { reply: VOICE_REPLY[code], code }: BAD_AUDIO and
//   BAD_TEXT 400, VOICE_OFF 503, VOICE_FAILED 502, VOICE_TIMEOUT 504. A body
//   over the cap is 413, the 21st voice request in a minute from one IP is
//   429 (checked before the body is read), both as JSON { reply }. /api/health
//   gains voice: voiceMode(). Env is read per request.
// - Logs: one "[voice] …" line per request that reached a provider (route,
//   ms, status or code). Never the audio, the transcript, an upstream body or the key.
//
// How: the real HTTP server, requests through node:http (so a stubbed global
// fetch only ever stands in for ElevenLabs). Each request comes from its own
// X-Forwarded-For address (TRUST_PROXY=1) so the rate limit only bites in the
// tests that are about it.

const assert = require('node:assert');
const fs     = require('node:fs');
const http   = require('node:http');
const path   = require('node:path');
process.env.AI_PROVIDER = 'fixture';   // /api/ask needs no key and never calls out
process.env.RECORD_FIXTURES = '0';
process.env.TRUST_PROXY = '1';
const Server = require('../backend/server.js');

// Required per test: voice.js doesn't exist before #12, and each test should
// fail on its own line rather than take the whole file down.
function Voice() {
  try {
    return require('../backend/voice.js');
  } catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND' && /voice\.js/.test(e.message)) {
      assert.fail('backend/voice.js is missing: it must export { parseAudioDataUrl, voiceMode, transcribe, speak, VOICE_REPLY }');
    }
    throw e;
  }
}

const FIXTURES     = path.join(__dirname, 'fixtures', 'voice');
const FIXTURE_TEXT = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'stt.json'), 'utf8')).text;
const FIXTURE_MP3  = fs.readFileSync(path.join(FIXTURES, 'tts.mp3'));

const STT_URL       = 'https://api.elevenlabs.io/v1/speech-to-text';
const TTS_URL       = voice => `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=mp3_44100_128`;
const DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb';
const KEY           = 'test-voice-key-not-real';
const SECRET        = 'secret-upstream-detail';
const SAY           = 'Pin four is floating.';

// The interface's error codes and their HTTP statuses.
const STATUS = { BAD_AUDIO: 400, BAD_TEXT: 400, VOICE_OFF: 503, VOICE_FAILED: 502, VOICE_TIMEOUT: 504 };
const VOICE_ENV = ['VOICE_PROVIDER', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_STT_MODEL', 'ELEVENLABS_TTS_MODEL', 'VOICE_TIMEOUT_MS'];

const OPUS    = Buffer.from('fake-opus-clip');
const clipUrl = (mime = 'audio/webm;codecs=opus', buf = OPUS) => `data:${mime};base64,${buf.toString('base64')}`;
const webm    = clipUrl();

const abortError = () => Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });

// A fetch that never answers, and rejects as a real fetch does once its
// signal aborts. A call with no signal could never be cut off: that fails.
const hangingFetch = calls => (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (!init.signal) return Promise.reject(new assert.AssertionError({ message: `fetch to ${url} was given no AbortSignal, so no deadline can stop it` }));
  return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(abortError())));
};

// Stands in for api.elevenlabs.io as the global fetch.
function stubElevenLabs(answer) {
  const calls = [];
  vi.stubGlobal('fetch', async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return answer(String(url), init);
  });
  return calls;
}

// Resolves to `promise`'s outcome (the error if it rejects), or fails the
// test once `ms` pass, so a deadline that never fires fails here and not on
// the runner's timeout.
function settle(promise, ms, what) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new assert.AssertionError({ message: `${what}: still waiting after ${ms} ms` })), ms);
  });
  return Promise.race([promise.then(value => ({ value }), error => ({ error })), late]).finally(() => clearTimeout(timer));
}

// ── The HTTP server ─────────────────────────────────────────────────────────

let port;
beforeAll(() => new Promise(r => Server.server.listen(0, '127.0.0.1', () => {
  port = Server.server.address().port;
  r();
})));
afterAll(() => new Promise(r => Server.server.close(r)));

let logs, saved, netCalls;
beforeEach(() => {
  logs = [];
  for (const m of ['log', 'info', 'warn', 'error']) {
    vi.spyOn(console, m).mockImplementation((...args) => { logs.push(args.map(String).join(' ')); });
  }
  // A key in backend/.env or the shell must not change what these tests see.
  saved = Object.fromEntries(VOICE_ENV.map(k => [k, process.env[k]]));
  for (const k of VOICE_ENV) delete process.env[k];
  // Any call out that a test didn't stub is recorded, and fails.
  netCalls = [];
  vi.stubGlobal('fetch', async url => {
    netCalls.push(String(url));
    throw new TypeError('fetch failed (no network in tests)');
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

let ipCount = 0;
const freshIp = () => `10.12.${Math.floor(++ipCount / 250)}.${ipCount % 250 + 1}`;

// Sends `body` (an object, or a raw string) from `ip`. Destroyed after `ms`
// so a hung server fails the assertion, not the runner.
function request(method, urlPath, body, { ip = freshIp(), ms = 5000 } = {}) {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text), 'X-Forwarded-For': ip } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const raw = buf.toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch { /* audio, or a 404 page */ }
        resolve({ status: res.statusCode, headers: res.headers, buf, raw, body: json, ms: Date.now() - started });
      });
    });
    req.on('error', reject);
    const timer = setTimeout(() => { req.destroy(); reject(new Error(`${urlPath} had no answer after ${ms} ms`)); }, ms);
    req.on('close', () => clearTimeout(timer));
    req.end(text);
  });
}
const post = (urlPath, body, opts) => request('POST', urlPath, body, opts);
const stt  = (body, opts) => post('/api/voice/stt', body, opts);
const tts  = (body, opts) => post('/api/voice/tts', body, opts);

function assertVoiceError(res, code, what = '') {
  const status = STATUS[code];
  assert.equal(res.status, status, `${what}: expected ${status} ${code}, got ${res.status}: ${res.raw.slice(0, 200)}`);
  assert.ok(res.body, `${what}: the ${status} body isn't JSON: ${res.raw.slice(0, 200)}`);
  assert.equal(res.body.code, code, `${what}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.reply, Voice().VOICE_REPLY[code], `${what}: reply`);
}

// The [voice] lines a request leaves (one written just after the reply included).
async function voiceLines(send) {
  logs.length = 0;
  const res = await send();
  await new Promise(r => setTimeout(r, 30));
  return { res, lines: logs.filter(l => l.startsWith('[voice]')), all: logs.slice() };
}

// ── voice.js: clips and mode ────────────────────────────────────────────────

test('parseAudioDataUrl reads the browsers\' recordings: webm, ogg and mp4 (with or without codecs), mpeg and wav', () => {
  const { parseAudioDataUrl } = Voice();
  const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/mpeg', 'audio/wav'];
  for (const mime of mimes) {
    const clip = parseAudioDataUrl(clipUrl(mime));
    assert.ok(clip, `${mime} was refused`);
    assert.equal(clip.mime, mime.split(';')[0], `${mime}: mime`);
    assert.match(String(clip.ext), /^[a-z0-9]+$/, `${mime}: ext ${clip.ext}`);
    assert.ok(Buffer.isBuffer(clip.buf) && clip.buf.equals(OPUS), `${mime}: buf is not the decoded bytes`);
  }
  assert.equal(parseAudioDataUrl(webm).ext, 'webm');
});

test('parseAudioDataUrl refuses anything that is not a base64 audio clip with null', () => {
  const { parseAudioDataUrl } = Voice();
  const bad = [
    ['empty', ''],
    ['plain text', 'hello'],
    ['missing', undefined],
    ['null', null],
    ['a number', 42],
    ['an object', { audio: webm }],
    ['an image', 'data:image/png;base64,AAAA'],
    ['a text data URL', 'data:text/plain;base64,aGVsbG8='],
    ['an audio type not listed', 'data:audio/flac;base64,AAAA'],
    ['not base64', 'data:audio/webm,notbase64'],
    ['no bytes', 'data:audio/webm;base64,'],
    ['junk for base64', 'data:audio/webm;base64,!!!!'],
    ['a URL', 'https://example.com/clip.webm'],
  ];
  for (const [what, s] of bad) assert.strictEqual(parseAudioDataUrl(s), null, what);
});

test.each([
  { label: 'VOICE_PROVIDER=fixture',                                    env: { VOICE_PROVIDER: 'fixture' },                                want: 'fixture' },
  { label: 'VOICE_PROVIDER=fixture with a key (a test never calls out)', env: { VOICE_PROVIDER: 'fixture', ELEVENLABS_API_KEY: 'k' },     want: 'fixture' },
  { label: 'a key, VOICE_PROVIDER unset',                               env: { ELEVENLABS_API_KEY: 'k' },                                 want: 'elevenlabs' },
  { label: 'a key, VOICE_PROVIDER blank as .env.example leaves it',     env: { VOICE_PROVIDER: '', ELEVENLABS_API_KEY: 'k' },             want: 'elevenlabs' },
  { label: 'VOICE_PROVIDER=elevenlabs with a key',                      env: { VOICE_PROVIDER: 'elevenlabs', ELEVENLABS_API_KEY: 'k' },   want: 'elevenlabs' },
  { label: 'nothing set',                                               env: {},                                                          want: 'off' },
  { label: 'a blank key',                                               env: { ELEVENLABS_API_KEY: '' },                                  want: 'off' },
  { label: 'VOICE_PROVIDER=elevenlabs with no key',                     env: { VOICE_PROVIDER: 'elevenlabs' },                            want: 'off' },
  { label: 'VOICE_PROVIDER=off with a key',                             env: { VOICE_PROVIDER: 'off', ELEVENLABS_API_KEY: 'k' },          want: 'off' },
])('voiceMode: $label → $want', ({ env, want }) => {
  assert.strictEqual(Voice().voiceMode(env), want);
});

test('VOICE_REPLY has a reply for every error code, and the timeout one says it didn\'t catch that and to try again', () => {
  const { VOICE_REPLY } = Voice();
  for (const code of Object.keys(STATUS)) {
    assert.ok(typeof VOICE_REPLY[code] === 'string' && VOICE_REPLY[code].trim(), `no reply for ${code}`);
  }
  assert.match(VOICE_REPLY.VOICE_TIMEOUT, /didn.t catch that/i);
  assert.match(VOICE_REPLY.VOICE_TIMEOUT, /try again/i);
});

// ── voice.js: the ElevenLabs calls ──────────────────────────────────────────

test('transcribe posts the clip to Scribe v2 as multipart (file + model_id scribe_v2), with the key in xi-api-key, and resolves its text', async () => {
  const { transcribe, parseAudioDataUrl } = Voice();
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ text: 'why is my output flat', language_code: 'en', words: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const text = await transcribe(parseAudioDataUrl(webm), { env: { ELEVENLABS_API_KEY: KEY }, fetch });
  assert.equal(text, 'why is my output flat');
  assert.equal(calls.length, 1, `ElevenLabs was asked ${calls.length} times`);
  const { url, init } = calls[0];
  assert.equal(url, STT_URL);
  assert.equal(String(init.method).toUpperCase(), 'POST');
  const headers = new Headers(init.headers);
  assert.equal(headers.get('xi-api-key'), KEY);
  // fetch writes a multipart Content-Type itself, with the boundary; one set
  // by hand has none, and ElevenLabs can't split the body.
  assert.equal(headers.get('content-type'), null, `Content-Type set by hand: ${headers.get('content-type')}`);
  assert.ok(init.body instanceof FormData, 'the body is not FormData');
  assert.equal(init.body.get('model_id'), 'scribe_v2');
  const file = init.body.get('file');
  assert.ok(file instanceof Blob, 'no file part');
  assert.equal(file.type, 'audio/webm');
  assert.ok(Buffer.from(await file.arrayBuffer()).equals(OPUS), 'the file part is not the clip\'s bytes');
  assert.deepStrictEqual(netCalls, [], 'the global fetch was used instead of ctx.fetch');
});

test('speak posts { text, model_id: eleven_flash_v2_5 } as JSON to the default voice\'s stream endpoint (mp3_44100_128) and resolves the audio stream', async () => {
  const { speak } = Voice();
  const mp3 = Buffer.from([0xff, 0xf3, 0x44, 0xc4, 0x00, 0x01]);
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(mp3, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
  };
  const res = await speak(SAY, { env: { ELEVENLABS_API_KEY: KEY }, fetch });
  assert.equal(calls.length, 1, `ElevenLabs was asked ${calls.length} times`);
  const { url, init } = calls[0];
  assert.equal(url, TTS_URL(DEFAULT_VOICE));
  assert.equal(String(init.method).toUpperCase(), 'POST');
  const headers = new Headers(init.headers);
  assert.equal(headers.get('xi-api-key'), KEY);
  assert.match(String(headers.get('content-type')), /application\/json/);
  assert.deepStrictEqual(JSON.parse(init.body), { text: SAY, model_id: 'eleven_flash_v2_5' });
  assert.ok(res && res.body && typeof res.body.getReader === 'function', 'speak should resolve a Response whose body is a web ReadableStream');
  assert.ok(Buffer.from(await new Response(res.body).arrayBuffer()).equals(mp3), 'the stream is not ElevenLabs\' bytes');
  assert.deepStrictEqual(netCalls, [], 'the global fetch was used instead of ctx.fetch');
});

test('ELEVENLABS_VOICE_ID, ELEVENLABS_STT_MODEL and ELEVENLABS_TTS_MODEL override the voice and the two models', async () => {
  const { transcribe, speak, parseAudioDataUrl } = Voice();
  const env = { ELEVENLABS_API_KEY: KEY, ELEVENLABS_VOICE_ID: 'voice123', ELEVENLABS_STT_MODEL: 'scribe_v1', ELEVENLABS_TTS_MODEL: 'eleven_turbo_v2_5' };
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return String(url) === STT_URL
      ? new Response(JSON.stringify({ text: 'hi' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response(new Uint8Array([0xff, 0xf3]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
  };
  await transcribe(parseAudioDataUrl(webm), { env, fetch });
  await speak(SAY, { env, fetch });
  assert.equal(calls.length, 2, `ElevenLabs was asked ${calls.length} times`);
  assert.equal(calls[0].init.body.get('model_id'), 'scribe_v1');
  assert.equal(calls[1].url, TTS_URL('voice123'));
  assert.equal(JSON.parse(calls[1].init.body).model_id, 'eleven_turbo_v2_5');
});

// Runs `op` against a fake ElevenLabs.
function callVoice(op, fetch, env = {}) {
  const V = Voice();
  const ctx = { env: { ELEVENLABS_API_KEY: KEY, ...env }, fetch };
  return op === 'transcribe' ? V.transcribe(V.parseAudioDataUrl(webm), ctx) : V.speak(SAY, ctx);
}

test.each(['transcribe', 'speak'])('%s: an upstream 401, 429, 500 or network error rejects VOICE_FAILED, and the error never carries the upstream body', async op => {
  Voice();
  const failures = [
    ['401', async () => new Response(JSON.stringify({ detail: { status: 'invalid_api_key', message: SECRET } }), { status: 401, headers: { 'Content-Type': 'application/json' } })],
    ['429', async () => new Response(JSON.stringify({ detail: { status: 'quota_exceeded', message: SECRET } }), { status: 429, headers: { 'Content-Type': 'application/json' } })],
    ['500', async () => new Response(SECRET, { status: 500 })],
    ['network error', async () => { throw new TypeError('fetch failed'); }],
  ];
  for (const [what, fetch] of failures) {
    const out = await settle(callVoice(op, fetch), 2000, `${op}, ${what}`);
    assert.ok(out.error, `${what}: resolved instead of rejecting`);
    assert.equal(out.error.code, 'VOICE_FAILED', `${what}: code ${out.error.code}`);
    const carried = [out.error.message, out.error.stack, JSON.stringify(out.error)].join(' ');
    assert.ok(!carried.includes(SECRET), `${what}: the error carries the upstream body: ${carried.slice(0, 200)}`);
  }
});

test.each(['transcribe', 'speak'])('%s: an upstream slower than VOICE_TIMEOUT_MS is aborted and rejects VOICE_TIMEOUT, well inside a second', async op => {
  Voice();
  const calls = [];
  const started = Date.now();
  const out = await settle(callVoice(op, hangingFetch(calls), { VOICE_TIMEOUT_MS: '50' }), 1500, `${op} with a 50 ms deadline`);
  assert.ok(out.error, 'resolved instead of rejecting');
  assert.equal(out.error.code, 'VOICE_TIMEOUT', `code ${out.error.code}: ${out.error.message}`);
  assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms with a 50 ms deadline`);
  assert.ok(calls.length === 1 && calls[0].init.signal.aborted, 'the upstream request was not aborted at the deadline');
});

test('transcribe: with VOICE_TIMEOUT_MS unset the deadline is 10 s: still waiting at 9.9 s, VOICE_TIMEOUT just past 10 s', async () => {
  Voice();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const calls = [];
  let outcome = null;
  callVoice('transcribe', hangingFetch(calls)).then(() => { outcome = 'resolved'; }, e => { outcome = e; });
  const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };   // setImmediate isn't faked
  await vi.advanceTimersByTimeAsync(9900);
  await flush();
  assert.equal(outcome, null, `settled before 10 s: ${outcome && (outcome.code || outcome.message || outcome)}`);
  await vi.advanceTimersByTimeAsync(200);
  await flush();
  assert.ok(outcome && outcome.code === 'VOICE_TIMEOUT', `just past 10 s: ${outcome && (outcome.code || outcome.message || outcome)}`);
});

// ── /api/health ─────────────────────────────────────────────────────────────

test.each([
  { label: 'VOICE_PROVIDER=fixture',        env: { VOICE_PROVIDER: 'fixture' },                     want: 'fixture' },
  { label: 'a key',                         env: { ELEVENLABS_API_KEY: KEY },                       want: 'elevenlabs' },
  { label: 'no key',                        env: {},                                                want: 'off' },
  { label: 'VOICE_PROVIDER=off with a key', env: { VOICE_PROVIDER: 'off', ELEVENLABS_API_KEY: KEY }, want: 'off' },
])('GET /api/health reports voice: $want with $label, next to status and model, never the key', async ({ env, want }) => {
  Object.assign(process.env, env);
  const res = await request('GET', '/api/health');
  assert.equal(res.status, 200, `status ${res.status}`);
  assert.equal(res.body.voice, want, JSON.stringify(res.body));
  assert.equal(res.body.status, 'ok');
  assert.equal(typeof res.body.model, 'string');
  assert.ok(!res.raw.includes(KEY), 'the health check shows the key');
});

// ── /api/voice/stt and /api/voice/tts, fixture mode ─────────────────────────

test('stt with VOICE_PROVIDER=fixture answers 200 { text } from test/fixtures/voice/stt.json, never calling out, even with a key set', async () => {
  process.env.VOICE_PROVIDER = 'fixture';
  process.env.ELEVENLABS_API_KEY = KEY;
  const res = await stt({ audio: webm });
  assert.equal(res.status, 200, `status ${res.status}: ${res.raw.slice(0, 200)}`);
  assert.deepStrictEqual(res.body, { text: FIXTURE_TEXT });
  assert.deepStrictEqual(netCalls, [], 'fixture mode called out');
});

test('stt: 400 BAD_AUDIO for a clip that is missing, not audio, not base64, or a body that is not JSON', async () => {
  process.env.VOICE_PROVIDER = 'fixture';
  const bad = [
    ['missing', {}],
    ['an image', { audio: 'data:image/png;base64,AAAA' }],
    ['not base64', { audio: 'data:audio/webm,notbase64' }],
    ['a number', { audio: 42 }],
    ['not JSON', 'audio=please'],
  ];
  for (const [what, body] of bad) assertVoiceError(await stt(body), 'BAD_AUDIO', what);
});

test('tts with VOICE_PROVIDER=fixture streams test/fixtures/voice/tts.mp3 as audio/mpeg, byte for byte, never calling out, even with a key set', async () => {
  process.env.VOICE_PROVIDER = 'fixture';
  process.env.ELEVENLABS_API_KEY = KEY;
  const res = await tts({ text: SAY });
  assert.equal(res.status, 200, `status ${res.status}: ${res.raw.slice(0, 200)}`);
  assert.match(String(res.headers['content-type']), /^audio\/mpeg/);
  assert.ok(res.buf.equals(FIXTURE_MP3), `got ${res.buf.length} bytes, the fixture has ${FIXTURE_MP3.length}`);
  assert.deepStrictEqual(netCalls, [], 'fixture mode called out');
});

test('tts: text of 1 to 600 characters is spoken; empty, blank, missing, over 600, or a body that is not JSON is 400 BAD_TEXT', async () => {
  process.env.VOICE_PROVIDER = 'fixture';
  const bad = [
    ['empty', { text: '' }],
    ['blank', { text: '   ' }],
    ['missing', {}],
    ['601 characters', { text: 'x'.repeat(601) }],
    ['not JSON', 'say=hi'],
  ];
  for (const [what, body] of bad) assertVoiceError(await tts(body), 'BAD_TEXT', what);
  for (const text of ['x', 'x'.repeat(600)]) {
    const ok = await tts({ text });
    assert.equal(ok.status, 200, `${text.length} characters: status ${ok.status}: ${ok.raw.slice(0, 200)}`);
  }
});

test('voice off (VOICE_PROVIDER=off with a key, or no key at all): stt and tts answer 503 VOICE_OFF and never call out', async () => {
  for (const [what, env] of [['VOICE_PROVIDER=off with a key', { VOICE_PROVIDER: 'off', ELEVENLABS_API_KEY: KEY }], ['no key', {}]]) {
    for (const k of VOICE_ENV) delete process.env[k];
    Object.assign(process.env, env);
    assertVoiceError(await stt({ audio: webm }), 'VOICE_OFF', `stt, ${what}`);
    assertVoiceError(await tts({ text: SAY }), 'VOICE_OFF', `tts, ${what}`);
  }
  assert.deepStrictEqual(netCalls, [], 'voice off called out');
});

// ── Caps and the rate limit ─────────────────────────────────────────────────

test('stt: a body over the 2 MB cap is 413 with a JSON reply; a 1.5 MB clip is read', async () => {
  process.env.VOICE_PROVIDER = 'fixture';
  const big = await stt({ audio: 'data:audio/webm;base64,' + 'A'.repeat(2300000) });
  assert.equal(big.status, 413, `a 2.3 MB clip got ${big.status}: ${big.raw.slice(0, 200)}`);
  assert.ok(big.body && typeof big.body.reply === 'string' && big.body.reply.trim(), `the 413 isn't JSON { reply }: ${big.raw.slice(0, 200)}`);
  const ok = await stt({ audio: 'data:audio/webm;base64,' + 'A'.repeat(1500000) });
  assert.equal(ok.status, 200, `a 1.5 MB clip got ${ok.status}: ${ok.raw.slice(0, 200)}`);
});

test.each(['stt', 'tts'])('%s: the 21st voice request in a minute from one IP is 429, before its body is looked at; another IP, and /api/ask from the same IP, are not limited by it', async route => {
  process.env.VOICE_PROVIDER = 'fixture';
  const send = route === 'stt' ? (body, opts) => stt(body || { audio: webm }, opts) : (body, opts) => tts(body || { text: SAY }, opts);
  const ip = route === 'stt' ? '10.99.12.1' : '10.99.12.2';
  for (let n = 1; n <= 20; n++) {
    const res = await send(null, { ip });
    assert.equal(res.status, 200, `request ${n} of 20 got ${res.status}: ${res.raw.slice(0, 200)}`);
  }
  const over = await send(null, { ip });
  assert.equal(over.status, 429, `the 21st got ${over.status}: ${over.raw.slice(0, 200)}`);
  assert.ok(over.body && typeof over.body.reply === 'string' && over.body.reply.trim(), `the 429 isn't JSON { reply }: ${over.raw.slice(0, 200)}`);
  const overBad = await send(route === 'stt' ? { audio: 'nope' } : { text: '' }, { ip });
  assert.equal(overBad.status, 429, `over the limit with a bad body got ${overBad.status}, not 429`);

  assert.equal((await send(null, { ip: route === 'stt' ? '10.99.13.1' : '10.99.13.2' })).status, 200, 'the limit is per IP');
  const ask = await post('/api/ask', { message: 'hello', markdown: '', history: [] }, { ip });
  assert.notEqual(ask.status, 429, 'voice must not use up /api/ask\'s limit');
});

// ── With a key: ElevenLabs behind the routes (a stubbed fetch) ──────────────

test('with a key, stt answers Scribe\'s transcript and tts pipes ElevenLabs\' audio through byte for byte; the key never reaches a reply', async () => {
  process.env.ELEVENLABS_API_KEY = KEY;
  const part1 = Buffer.concat([Buffer.from([0xff, 0xf3]), Buffer.alloc(300, 1)]);
  const part2 = Buffer.alloc(300, 2);
  const calls = stubElevenLabs(url => (url === STT_URL
    ? new Response(JSON.stringify({ text: 'why is my output flat', language_code: 'en' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    : new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(part1)); c.enqueue(new Uint8Array(part2)); c.close(); } }),
      { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })));

  const s = await stt({ audio: webm });
  assert.equal(s.status, 200, `stt status ${s.status}: ${s.raw.slice(0, 200)}`);
  assert.deepStrictEqual(s.body, { text: 'why is my output flat' });

  const t = await tts({ text: SAY });
  assert.equal(t.status, 200, `tts status ${t.status}: ${t.raw.slice(0, 200)}`);
  assert.match(String(t.headers['content-type']), /^audio\/mpeg/);
  assert.ok(t.buf.equals(Buffer.concat([part1, part2])), `got ${t.buf.length} bytes, ElevenLabs sent ${part1.length + part2.length}`);

  assert.deepStrictEqual(calls.map(c => c.url), [STT_URL, TTS_URL(DEFAULT_VOICE)]);
  for (const r of [s, t]) assert.ok(!r.raw.includes(KEY) && !JSON.stringify(r.headers).includes(KEY), 'a reply carries the key');
});

test('with a key, an ElevenLabs error is 502 VOICE_FAILED with our own reply: its body is in neither the reply nor the logs', async () => {
  process.env.ELEVENLABS_API_KEY = KEY;
  const calls = stubElevenLabs(() => new Response(JSON.stringify({ detail: { status: 'quota_exceeded', message: SECRET } }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
  const s = await stt({ audio: webm });
  assertVoiceError(s, 'VOICE_FAILED', 'stt');
  const t = await tts({ text: SAY });
  assertVoiceError(t, 'VOICE_FAILED', 'tts');
  assert.equal(calls.length, 2, `ElevenLabs was asked ${calls.length} times`);
  await new Promise(r => setTimeout(r, 30));
  for (const r of [s, t]) assert.ok(!r.raw.includes(SECRET) && !r.raw.includes(KEY), `a reply carries the upstream body or the key: ${r.raw.slice(0, 200)}`);
  for (const l of logs) assert.ok(!l.includes(SECRET) && !l.includes(KEY), `a log line carries the upstream body or the key: ${l.slice(0, 160)}`);
});

test('with a key, ElevenLabs slower than VOICE_TIMEOUT_MS: stt answers 504 VOICE_TIMEOUT well inside a second, and the upstream request is aborted', async () => {
  process.env.ELEVENLABS_API_KEY = KEY;
  process.env.VOICE_TIMEOUT_MS = '80';
  const calls = [];
  vi.stubGlobal('fetch', hangingFetch(calls));
  const res = await stt({ audio: webm }, { ms: 3000 });
  assertVoiceError(res, 'VOICE_TIMEOUT', 'stt');
  assert.ok(res.ms < 800, `answered after ${res.ms} ms with an 80 ms deadline`);
  assert.ok(calls.length === 1 && calls[0].init.signal.aborted, 'the upstream request was not aborted at the deadline');
});

// ── Logging ─────────────────────────────────────────────────────────────────

test('one [voice] line per request that reached ElevenLabs (route, ms, status), never the audio, the transcript, an upstream body or the key', async () => {
  process.env.ELEVENLABS_API_KEY = KEY;
  const clip = clipUrl('audio/webm;codecs=opus', Buffer.alloc(4096, 'v'));
  const payload = clip.slice(clip.indexOf(',') + 1, clip.indexOf(',') + 81);
  const TRANSCRIPT = 'my private transcript words';
  stubElevenLabs(url => (url === STT_URL
    ? new Response(JSON.stringify({ text: TRANSCRIPT }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    : new Response(FIXTURE_MP3, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })));
  const seen = [];

  const a = await voiceLines(() => stt({ audio: clip }));
  seen.push(...a.all);
  assert.equal(a.res.status, 200, `stt status ${a.res.status}: ${a.res.raw.slice(0, 200)}`);
  assert.equal(a.lines.length, 1, `stt logged ${a.lines.length} [voice] lines: ${JSON.stringify(a.all)}`);
  assert.match(a.lines[0], /\bstt\b/, a.lines[0]);
  assert.match(a.lines[0], /\b200\b/, a.lines[0]);
  assert.match(a.lines[0], /\d+\s?ms\b/, a.lines[0]);

  const b = await voiceLines(() => tts({ text: SAY }));
  seen.push(...b.all);
  assert.equal(b.res.status, 200, `tts status ${b.res.status}`);
  assert.equal(b.lines.length, 1, `tts logged ${b.lines.length} [voice] lines: ${JSON.stringify(b.all)}`);
  assert.match(b.lines[0], /\btts\b/, b.lines[0]);
  assert.match(b.lines[0], /\b200\b/, b.lines[0]);
  assert.match(b.lines[0], /\d+\s?ms\b/, b.lines[0]);

  stubElevenLabs(() => new Response(SECRET, { status: 500 }));
  const c = await voiceLines(() => stt({ audio: clip }));
  seen.push(...c.all);
  assert.equal(c.lines.length, 1, `a failed stt logged ${c.lines.length} [voice] lines: ${JSON.stringify(c.all)}`);
  assert.match(c.lines[0], /\bstt\b/, c.lines[0]);
  assert.match(c.lines[0], /502|VOICE_FAILED/, c.lines[0]);

  for (const l of seen) {
    for (const [what, s] of [['the audio', 'data:audio'], ['the audio', payload], ['the transcript', TRANSCRIPT], ['an upstream body', SECRET], ['the key', KEY]]) {
      assert.ok(!l.includes(s), `a log line carries ${what}: ${l.slice(0, 160)}`);
    }
  }
});

// ── Wiring: env names, e2e config, contract ─────────────────────────────────

test('.env.example lists the six voice names', () => {
  const text = fs.readFileSync(path.join(__dirname, '../../.env.example'), 'utf8');
  for (const name of VOICE_ENV) assert.match(text, new RegExp(`^${name}=`, 'm'), `.env.example has no ${name}=`);
});

test('the browser tests\' server runs voice in fixture mode, so no e2e run reaches ElevenLabs', () => {
  const file = path.join(__dirname, '..', 'playwright.config.js');
  delete require.cache[require.resolve(file)];
  try {
    const cfg = require(file);
    assert.equal(cfg.webServer.env.VOICE_PROVIDER, 'fixture', JSON.stringify(cfg.webServer.env));
  } finally {
    delete require.cache[require.resolve(file)];
  }
});

test('docs/API-CONTRACT.md has a ## Voice section before ## Testing contract, naming both routes, every error code, VOICE_PROVIDER and the health field', () => {
  const doc = fs.readFileSync(path.join(__dirname, '../../docs/API-CONTRACT.md'), 'utf8');
  const voiceAt = doc.search(/^## Voice\b/m);
  const testingAt = doc.search(/^## Testing contract/m);
  assert.ok(voiceAt >= 0, 'docs/API-CONTRACT.md has no "## Voice" section');
  assert.ok(voiceAt < testingAt, '"## Voice" should come before "## Testing contract"');
  const section = doc.slice(voiceAt, doc.indexOf('\n## ', voiceAt + 1));
  for (const s of ['/api/voice/stt', '/api/voice/tts', '/api/health', 'VOICE_PROVIDER', ...Object.keys(STATUS)]) {
    assert.ok(section.includes(s), `the Voice section never mentions ${s}`);
  }
});
