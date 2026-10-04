# ElevenLabs Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo each task becomes one GitHub issue and runs through `/start-task` (test-writer → builder → reviewer) and `/ship`.

**Goal:** Students can hold a key, ask Edison a question out loud ("Edison, why is my output flat?"), and hear the answer spoken back, using ElevenLabs. When ElevenLabs is missing or slow, the browser's own speech takes over.

**Architecture:**
- **Server:** two new routes in the zero-dependency Node server proxy ElevenLabs, so the API key never reaches the browser.
  - `POST /api/voice/stt` takes a recorded clip as a base64 data URL and returns `{ text }` (Scribe v2).
  - `POST /api/voice/tts` takes reply text and streams `audio/mpeg` back (Flash v2.5).
- **Browser:** a small module, `circuit3d/js/voice.js`, adds a hold-to-talk mic to the chat.
  1. It records with MediaRecorder.
  2. It sends the transcript through the existing `sparkyAsk()`.
  3. It speaks the reply, but only for questions that were asked by voice.
- **Fallbacks:** `GET /api/health` reports whether server voice is on. When it is off, the browser uses Web Speech for both directions.

**Tech Stack:**
- Node 20 built-ins: the global `fetch`, `FormData`, `Blob` and `Readable.fromWeb`.
- Browser MediaRecorder, getUserMedia, `<audio>`, SpeechSynthesis and webkitSpeechRecognition.
- Vitest and Playwright.
- No npm packages: the backend has a zero-runtime-deps rule (`Plugged/AGENTS.md`).

**Spec:** this plan's "Design" section below. It records Aarmen's decisions and the 2026-10-01 voice research: push-to-talk, ElevenLabs Scribe + Flash through a zero-dep proxy, and a Web Speech fallback. The demo beat is in `docs/DEMO.md` beat 3.

## Design

| Decision | Choice |
|---|---|
| Who talks | The student holds the 🎤 button, or holds **Space** while focus is not in a text field. On release, the clip is sent. A hold shorter than 300 ms is ignored. |
| Speech to text | ElevenLabs `POST https://api.elevenlabs.io/v1/speech-to-text`: multipart, `file` plus `model_id=scribe_v2`, header `xi-api-key`. The response's `text` is the transcript. |
| Text to speech | ElevenLabs `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream?output_format=mp3_44100_128`, JSON `{ text, model_id: "eleven_flash_v2_5" }`, header `xi-api-key`. The default voice is `JBFqnCBsd6RMkjVDRZzb` (overridable). |
| Upload format | A base64 data URL inside JSON, as `/api/photo` does. `readBody` decodes UTF-8, so raw binary would be corrupted. |
| When Edison speaks | Only when the question was asked by voice. Typed questions stay silent. |
| What is spoken | `cleanForSpeech(reply)`: no `**`, no emoji, no server "Heads up…" warning lines, no hole ids in parentheses. Capped at about 400 characters, cut at a sentence end. |
| A build preview is open | If the transcript is "accept / yes / build it" or "decline / no / cancel", it presses Accept or Decline. Any other speech shows a hint, "Accept or decline the build first", and is not sent. That avoids `sparkyAsk()` silently declining the preview. |
| No key, or `VOICE_PROVIDER=off` | `/api/health` returns `voice: "off"`. The mic uses `webkitSpeechRecognition` and replies use `speechSynthesis`. With neither available, the mic button is hidden. |
| ElevenLabs slow or failing | STT times out at 10 s (`VOICE_TIMEOUT_MS`) with "I didn't catch that, try again". If TTS fails or takes over 8 s before audio starts, the reply is spoken with `speechSynthesis`. |
| Tests | Never call ElevenLabs. `VOICE_PROVIDER=fixture` serves `test/fixtures/voice/`, the Playwright webServer env sets it, and unit tests stub `fetch`. |

## Global Constraints

- **The backend uses only Node built-ins.** No new npm packages (`Plugged/AGENTS.md:28`). Use the global `fetch`, `FormData` and `Blob` (Node 20).
- **Keys live only in `Plugged/backend/.env`, edited by a person.** Agents can't read it. New variable names go in the root `.env.example` as `NAME=`:
  - `ELEVENLABS_API_KEY`
  - `ELEVENLABS_VOICE_ID`
  - `ELEVENLABS_STT_MODEL`
  - `ELEVENLABS_TTS_MODEL`
  - `VOICE_PROVIDER`
  - `VOICE_TIMEOUT_MS`
- **No test or e2e run may reach `api.elevenlabs.io`.**
- **Upstream bodies and audio payloads are never logged.** One `[voice]` log line per request: route, ms, status.
- **Laptop only, light UI tests:** at most 2 e2e tests per task.
- **Each task stays under about 300 changed lines.** It ships to `dev` with `/ship`.
- **Edison skin CSS follows the design guard:** no gradients, `box-shadow: none` only, no purple (`test/edison-design-guard.test.js`).

## Review Focus

1. **No ElevenLabs key at the venue:** the mic still works through Web Speech, and replies are spoken by the browser. Pinned in Task 2, test 4.
2. **Microphone permission denied:** a clear system message ("Microphone blocked: allow it in the address bar to talk to Edison"), the button disabled, typing unaffected. Pinned in Task 2, test 5.
3. **Voice while a build preview is open:** "accept" accepts, other speech gives a hint and is not sent, and the preview is never silently declined. Pinned in Task 2, e2e 2.
4. **A long or markdown-heavy reply:** the spoken text is cleaned and capped, so it doesn't read "asterisk asterisk" or fifteen sentences. Pinned in Task 2, test 1.
5. **ElevenLabs slow:** STT over 10 s gives a retry message, and TTS that hasn't started within 8 s falls back to `speechSynthesis`. Pinned in Task 1, test 6 (the server's VOICE_TIMEOUT) and Task 2, test 6 (the 8 s deadline constant). The client fallback path itself is checked in Task 2, Step 7: run it with `VOICE_TIMEOUT_MS=1` and the reply is spoken by the browser voice.

---

### Task 1: Server voice routes (issue V1)

**Files:**
- Create: `Plugged/backend/voice.js` (provider calls, data URL parsing, fixture mode)
- Modify: `Plugged/backend/server.js`: the routes next to `:1620`, caps and hits maps next to `:1377-1386`, and the health field at `:1591-1593`
- Create: `Plugged/test/fixtures/voice/stt.json`, `Plugged/test/fixtures/voice/tts.mp3`
- Modify: `Plugged/playwright.config.js:30` (webServer env `VOICE_PROVIDER: 'fixture'`)
- Modify: root `.env.example` (the 6 names), `docs/API-CONTRACT.md` (new `## Voice` before `## Testing contract`, `:722`)
- Test: `Plugged/test/voice-server.test.js`

**Interfaces:**
- Produces, used by Task 2:
  - `POST /api/voice/stt`:
    - request body `{ audio: "data:audio/<webm|ogg|mp4|mpeg|wav>[;codecs=…];base64,…" }`
    - 200 `{ text: string }`
    - 400 `{ reply, code: 'BAD_AUDIO' }`, 413, 429
    - 503 `{ reply, code: 'VOICE_OFF' }`, 504 `{ reply, code: 'VOICE_TIMEOUT' }`, 502 `{ reply, code: 'VOICE_FAILED' }`
  - `POST /api/voice/tts`:
    - request body `{ text: string }` (1–600 chars)
    - 200, a streamed `audio/mpeg` body
    - errors as JSON, same codes, 400 `BAD_TEXT`
  - `GET /api/health` → `{ status, model, voice: 'elevenlabs' | 'fixture' | 'off' }`
  - `voice.js` exports `{ parseAudioDataUrl, voiceMode, transcribe, speak, VOICE_REPLY }`

- [ ] **Step 1: Make the fixtures.**

```bash
cd Plugged
mkdir -p test/fixtures/voice
printf '{ "text": "Why is my output flat?" }\n' > test/fixtures/voice/stt.json
ffmpeg -loglevel error -f lavfi -i anullsrc=r=22050:cl=mono -t 0.3 -q:a 9 test/fixtures/voice/tts.mp3
ls -la test/fixtures/voice   # tts.mp3 should be about 1–3 KB
```

- [ ] **Step 2: Write the failing tests** in `Plugged/test/voice-server.test.js`.

```js
// Voice routes (V1): ElevenLabs behind the server, never reached by tests.
const assert = require('node:assert');
const http = require('node:http');

process.env.AI_PROVIDER = 'fixture';
process.env.TRUST_PROXY = '1';
const Voice = require('../backend/voice.js');

const webm = 'data:audio/webm;codecs=opus;base64,' + Buffer.from('fake-opus').toString('base64');

test('parseAudioDataUrl accepts webm/ogg/mp4/mpeg/wav clips and rejects anything else', () => {
  const ok = Voice.parseAudioDataUrl(webm);
  assert.strictEqual(ok.mime, 'audio/webm');
  assert.strictEqual(ok.ext, 'webm');
  assert.ok(Buffer.isBuffer(ok.buf) && ok.buf.length > 0);
  for (const bad of ['', 'data:image/png;base64,AAAA', 'data:audio/webm,notbase64', 'hello'])
    assert.strictEqual(Voice.parseAudioDataUrl(bad), null, bad);
});

test('voiceMode: fixture when VOICE_PROVIDER=fixture, off with no key, elevenlabs with a key', () => {
  assert.strictEqual(Voice.voiceMode({ VOICE_PROVIDER: 'fixture' }), 'fixture');
  assert.strictEqual(Voice.voiceMode({}), 'off');
  assert.strictEqual(Voice.voiceMode({ VOICE_PROVIDER: 'off', ELEVENLABS_API_KEY: 'k' }), 'off');
  assert.strictEqual(Voice.voiceMode({ ELEVENLABS_API_KEY: 'k' }), 'elevenlabs');
});

test('transcribe posts multipart to Scribe with the key header and returns its text', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ text: 'why is my output flat', language_code: 'en' }), { status: 200 }); };
  const text = await Voice.transcribe(Voice.parseAudioDataUrl(webm), { env: { ELEVENLABS_API_KEY: 'k' }, fetch });
  assert.strictEqual(text, 'why is my output flat');
  assert.strictEqual(calls[0].url, 'https://api.elevenlabs.io/v1/speech-to-text');
  assert.strictEqual(calls[0].init.headers['xi-api-key'], 'k');
  assert.ok(calls[0].init.body instanceof FormData);
  assert.strictEqual(calls[0].init.body.get('model_id'), 'scribe_v2');
  assert.ok(calls[0].init.body.get('file') instanceof Blob);
});

test('speak posts JSON to the Flash stream endpoint with the default voice', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return new Response(new Uint8Array([0xff, 0xf3]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }); };
  const res = await Voice.speak('Pin four is floating.', { env: { ELEVENLABS_API_KEY: 'k' }, fetch });
  assert.strictEqual(calls[0].url, 'https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb/stream?output_format=mp3_44100_128');
  assert.deepStrictEqual(JSON.parse(calls[0].init.body), { text: 'Pin four is floating.', model_id: 'eleven_flash_v2_5' });
  assert.ok(res.body);   // a web ReadableStream the route pipes out
});

test('an upstream error becomes VOICE_FAILED and never carries the upstream body', async () => {
  const fetch = async () => new Response('{"detail":"secret upstream text"}', { status: 401 });
  await assert.rejects(Voice.transcribe(Voice.parseAudioDataUrl(webm), { env: { ELEVENLABS_API_KEY: 'k' }, fetch }),
    e => e.code === 'VOICE_FAILED' && !String(e.message).includes('secret'));
});

test('a slow upstream becomes VOICE_TIMEOUT after VOICE_TIMEOUT_MS', async () => {
  const fetch = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  await assert.rejects(Voice.transcribe(Voice.parseAudioDataUrl(webm), { env: { ELEVENLABS_API_KEY: 'k', VOICE_TIMEOUT_MS: '50' }, fetch }),
    e => e.code === 'VOICE_TIMEOUT');
});

describe('routes (VOICE_PROVIDER=fixture)', () => {
  let Server, base, n = 0;
  beforeAll(async () => {
    process.env.VOICE_PROVIDER = 'fixture';
    Server = require('../backend/server.js');
    await new Promise(r => Server.server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${Server.server.address().port}`;
  });
  afterAll(() => new Promise(r => Server.server.close(r)));
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.9.0.${++n}` }, body: JSON.stringify(body) });

  test('health reports voice: fixture', async () => {
    const h = await (await fetch(base + '/api/health')).json();
    assert.strictEqual(h.voice, 'fixture');
  });
  test('stt returns the fixture transcript; a bad clip is 400 BAD_AUDIO', async () => {
    const ok = await post('/api/voice/stt', { audio: webm });
    assert.strictEqual(ok.status, 200);
    assert.deepStrictEqual(await ok.json(), { text: 'Why is my output flat?' });
    const bad = await post('/api/voice/stt', { audio: 'data:image/png;base64,AAAA' });
    assert.strictEqual(bad.status, 400);
    assert.strictEqual((await bad.json()).code, 'BAD_AUDIO');
  });
  test('tts streams audio/mpeg; empty or over-long text is 400 BAD_TEXT', async () => {
    const ok = await post('/api/voice/tts', { text: 'Pin four is floating.' });
    assert.strictEqual(ok.status, 200);
    assert.match(ok.headers.get('content-type'), /audio\/mpeg/);
    assert.ok((await ok.arrayBuffer()).byteLength > 100);
    for (const text of ['', 'x'.repeat(601)]) {
      const bad = await post('/api/voice/tts', { text });
      assert.strictEqual(bad.status, 400);
      assert.strictEqual((await bad.json()).code, 'BAD_TEXT');
    }
  });
  test('stt over the 2 MB cap is 413', async () => {
    const big = 'data:audio/webm;base64,' + 'A'.repeat(2300000);   // over MAX_VOICE_BYTES (2 MB + 64 KB)
    assert.strictEqual((await post('/api/voice/stt', { audio: big })).status, 413);
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail.**

Run `cd Plugged && npx vitest run test/voice-server.test.js`. Expected: FAIL with "Cannot find module '../backend/voice.js'".

- [ ] **Step 4: Write `Plugged/backend/voice.js`.**

```js
// ─────────────────────────────────────────────────────────────
//  backend/voice.js: ElevenLabs speech for Edison (V1).
//  Speech to text: Scribe v2, multipart. Text to speech: Flash v2.5,
//  streamed mp3. The key stays on the server. VOICE_PROVIDER=fixture
//  replays test/fixtures/voice/ so tests never reach ElevenLabs.
//  Node built-ins only: global fetch, FormData, Blob (Node 20).
// ─────────────────────────────────────────────────────────────
const fs = require('node:fs');
const path = require('node:path');

const API = 'https://api.elevenlabs.io/v1';
const FIXTURES = path.join(__dirname, '..', 'test', 'fixtures', 'voice');
const AUDIO_URL = /^data:audio\/(webm|ogg|mp4|mpeg|wav|x-wav)(;codecs=[\w.]+)?;base64,([A-Za-z0-9+/=]+)$/;
const EXT = { webm: 'webm', ogg: 'ogg', mp4: 'm4a', mpeg: 'mp3', wav: 'wav', 'x-wav': 'wav' };

const VOICE_REPLY = {
  BAD_AUDIO: 'That recording could not be read. Try again.',
  BAD_TEXT: 'Nothing to say.',
  VOICE_OFF: 'Voice is off on this server.',
  VOICE_TIMEOUT: "I didn't catch that in time. Try again.",
  VOICE_FAILED: 'Voice failed. Try again or type your question.',
};

function parseAudioDataUrl(s) {
  const m = typeof s === 'string' && AUDIO_URL.exec(s);
  if (!m) return null;
  const buf = Buffer.from(m[3], 'base64');
  return buf.length ? { mime: 'audio/' + m[1], ext: EXT[m[1]], buf } : null;
}

function voiceMode(env = process.env) {
  if (env.VOICE_PROVIDER === 'fixture') return 'fixture';
  if (env.VOICE_PROVIDER === 'off' || !env.ELEVENLABS_API_KEY) return 'off';
  return 'elevenlabs';
}

const timeoutMs = env => Number(env.VOICE_TIMEOUT_MS) || 10000;
const fail = (code, msg) => Object.assign(new Error(msg || code), { code });

async function call(url, init, { env = process.env, fetch: f = fetch }) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs(env));
  try {
    const res = await f(url, { ...init, signal: ac.signal });
    if (!res.ok) throw fail('VOICE_FAILED', `elevenlabs ${res.status}`);   // never the upstream body
    return res;
  } catch (e) {
    if (e.code) throw e;
    throw fail(e.name === 'AbortError' ? 'VOICE_TIMEOUT' : 'VOICE_FAILED', e.name);
  } finally { clearTimeout(timer); }
}

async function transcribe(clip, ctx = {}) {
  const env = ctx.env || process.env;
  if (voiceMode(env) === 'fixture') return JSON.parse(fs.readFileSync(path.join(FIXTURES, 'stt.json'), 'utf8')).text;
  const form = new FormData();
  form.append('model_id', env.ELEVENLABS_STT_MODEL || 'scribe_v2');
  form.append('file', new Blob([clip.buf], { type: clip.mime }), 'speech.' + clip.ext);
  const res = await call(`${API}/speech-to-text`, { method: 'POST', headers: { 'xi-api-key': env.ELEVENLABS_API_KEY }, body: form }, { ...ctx, env });
  const data = await res.json();
  return String(data.text || '').trim();
}

async function speak(text, ctx = {}) {
  const env = ctx.env || process.env;
  if (voiceMode(env) === 'fixture') return new Response(fs.readFileSync(path.join(FIXTURES, 'tts.mp3')), { headers: { 'Content-Type': 'audio/mpeg' } });
  const voice = env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
  return call(`${API}/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5' }),
  }, { ...ctx, env });
}

module.exports = { parseAudioDataUrl, voiceMode, transcribe, speak, VOICE_REPLY };
```

- [ ] **Step 5: Add the routes to `Plugged/backend/server.js`.** They go next to the photo constants (`:1377-1386`) and routes (`:1620`), following `handleLeads`' shape.

```js
// near the other caps/maps
const Voice = require('./voice.js');
const MAX_VOICE_BYTES = 2 * 1024 * 1024 + 64 * 1024;   // ~60 s of opus, as base64 JSON
const MAX_TTS_BYTES = 8 * 1024;
const VOICE_MAX_PER_WINDOW = 20;
const voiceHits = new Map();
const VOICE_STATUS = { BAD_AUDIO: 400, BAD_TEXT: 400, VOICE_OFF: 503, VOICE_TIMEOUT: 504, VOICE_FAILED: 502 };
const voiceErr = (res, code) => sendJSON(res, VOICE_STATUS[code] || 502, { reply: Voice.VOICE_REPLY[code] || Voice.VOICE_REPLY.VOICE_FAILED, code });

async function handleVoiceStt(req, res) {
  if (rateLimited(req, voiceHits, VOICE_MAX_PER_WINDOW)) return sendJSON(res, 429, { reply: 'Too many voice requests. Wait a moment.', code: 'RATE_LIMITED' });
  const raw = await readBody(req, res, MAX_VOICE_BYTES, { reply: 'That recording is too long.', code: 'TOO_LARGE' });
  if (raw === null) return;
  let clip = null;
  try { clip = Voice.parseAudioDataUrl(JSON.parse(raw).audio); } catch { /* bad JSON is a bad clip */ }
  if (!clip) return voiceErr(res, 'BAD_AUDIO');
  if (Voice.voiceMode() === 'off') return voiceErr(res, 'VOICE_OFF');
  const t0 = Date.now();
  try {
    const text = await Voice.transcribe(clip);
    console.log(`[voice] stt 200 ${Date.now() - t0} ms`);
    return sendJSON(res, 200, { text });
  } catch (e) {
    console.log(`[voice] stt ${e.code || 'VOICE_FAILED'} ${Date.now() - t0} ms`);
    return voiceErr(res, e.code || 'VOICE_FAILED');
  }
}

async function handleVoiceTts(req, res) {
  if (rateLimited(req, voiceHits, VOICE_MAX_PER_WINDOW)) return sendJSON(res, 429, { reply: 'Too many voice requests. Wait a moment.', code: 'RATE_LIMITED' });
  const raw = await readBody(req, res, MAX_TTS_BYTES, { reply: 'That reply is too long to speak.', code: 'TOO_LARGE' });
  if (raw === null) return;
  let text = '';
  try { text = String(JSON.parse(raw).text || '').trim(); } catch { /* bad JSON is bad text */ }
  if (!text || text.length > 600) return voiceErr(res, 'BAD_TEXT');
  if (Voice.voiceMode() === 'off') return voiceErr(res, 'VOICE_OFF');
  const t0 = Date.now();
  try {
    const up = await Voice.speak(text);
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
    require('node:stream').Readable.fromWeb(up.body).pipe(res);
    console.log(`[voice] tts 200 ${Date.now() - t0} ms to first byte`);
  } catch (e) {
    console.log(`[voice] tts ${e.code || 'VOICE_FAILED'} ${Date.now() - t0} ms`);
    return voiceErr(res, e.code || 'VOICE_FAILED');
  }
}

// in the route chain, next to /api/photo/leads
if (req.method === 'POST' && req.url === '/api/voice/stt') return handleVoiceStt(req, res);
if (req.method === 'POST' && req.url === '/api/voice/tts') return handleVoiceTts(req, res);

// /api/health
sendJSON(res, 200, { status: 'ok', model: MODEL_NAME, voice: Voice.voiceMode() });
```

- [ ] **Step 6: Wire the rest.**
  - In `Plugged/playwright.config.js`, the webServer env becomes `{ PORT: String(PORT), AI_PROVIDER: 'fixture', PHOTO_PROVIDERS: 'fixture', VOICE_PROVIDER: 'fixture' }`.
  - Append these to the root `.env.example`:
    ```
    ELEVENLABS_API_KEY=
    ELEVENLABS_VOICE_ID=
    ELEVENLABS_STT_MODEL=
    ELEVENLABS_TTS_MODEL=
    VOICE_PROVIDER=
    VOICE_TIMEOUT_MS=
    ```
  - In `docs/API-CONTRACT.md`, add `## Voice (V1)` before `## Testing contract`, in `/api/photo`'s format:
    - the request, the response, an errors table (Status | code | When | reply) using `VOICE_STATUS` / `VOICE_REPLY` above;
    - the caps (2 MB clip, 600-character text) and the rate limit (20 a minute per IP);
    - providers: `VOICE_PROVIDER = elevenlabs | fixture | off`, defaulting to elevenlabs when `ELEVENLABS_API_KEY` is set, otherwise off;
    - fixtures (`test/fixtures/voice/`), logging (one `[voice]` line, no payloads) and the health field.

- [ ] **Step 7: Run the tests and confirm they pass.**

Run `cd Plugged && npx vitest run test/voice-server.test.js && npm run check && npm test`. Expected: all pass, and the `.env.example` names test still passes.

- [ ] **Step 8: Commit and ship.**

```bash
git add Plugged/backend/voice.js Plugged/backend/server.js Plugged/test/voice-server.test.js Plugged/test/fixtures/voice Plugged/playwright.config.js .env.example docs/API-CONTRACT.md
git commit -m "Add /api/voice/stt and /api/voice/tts: ElevenLabs speech behind the server (V1)"
```

Run `/ship`. It runs the full e2e, because `playwright.config.js` changed.

---

### Task 2: Hold-to-talk in the chat (issue V2)

**Files:**
- Create: `Plugged/circuit3d/js/voice.js`: a UMD pure half (cleanForSpeech, voiceCommand, pickMime, MIN_HOLD_MS) and a browser half (mic button, recording, STT, ask, speak, fallbacks)
- Modify: `Plugged/circuit3d/index.html`: `#mic-btn` after `#photo-wrap` in `#sparky-input-row` (`:203-213`), and the script tag after `js/chat.js` (`:340`)
- Modify: `Plugged/circuit3d/js/chat.js`: in `sparkyAsk` (`:611-645`), accept `{ spoken: true }` and call `SparkyVoice.speak(data.reply)` after the reply renders (`:629-631`); expose a `hasPendingBuild()` read of `_pendingActions` (`:413`)
- Modify: `Plugged/circuit3d/css/chat.css` (the mic button and its recording state), `Plugged/circuit3d/css/theme-edison.css` (`html[data-ui="edison"] #mic-btn`)
- Test: `Plugged/test/voice-client.test.js`, `Plugged/e2e/voice.spec.js`

**Interfaces:**
- Consumes, from Task 1: `GET /api/health` → `.voice`; `POST /api/voice/stt` `{audio}` → `{text}`; `POST /api/voice/tts` `{text}` → audio/mpeg.
- Consumes, from chat.js: `sparkyAsk(msg, { spoken })`, `sparkyAcceptChanges()`, `sparkyDeclineChanges()`, `sparkyAddMsg(text, 'system')`, `SparkyChat.hasPendingBuild()`.
- Produces: `window.SparkyVoice = { speak(text), stop(), state }`, plus the pure exports `{ cleanForSpeech, voiceCommand, pickMime, MIN_HOLD_MS }` for Node.

- [ ] **Step 1: Write the failing unit tests** in `Plugged/test/voice-client.test.js`.

```js
// The pure half of circuit3d/js/voice.js (V2).
const assert = require('node:assert');
const V = require('../circuit3d/js/voice.js');

test('cleanForSpeech drops bold, emoji, hole ids and the server warning lines, then caps at a sentence', () => {
  const reply = '**Pin 4 (V−)** is not connected 🔌 (tp_12 → a12). Wire it to the −12 V rail.\n\nHeads up, this build has a problem:\n- LED1 is backwards';
  assert.strictEqual(V.cleanForSpeech(reply), 'Pin 4 (V−) is not connected. Wire it to the −12 V rail.');
  const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} explains a thing.`).join(' ');
  const out = V.cleanForSpeech(long);
  assert.ok(out.length <= 400 && /\.$/.test(out), out);
});

test('voiceCommand maps accept and decline phrases, and nothing else', () => {
  for (const s of ['Accept', 'yes', 'Build it.', 'accept it']) assert.strictEqual(V.voiceCommand(s), 'accept', s);
  for (const s of ['Decline', 'no', 'cancel', 'Reject it']) assert.strictEqual(V.voiceCommand(s), 'decline', s);
  for (const s of ['why is my output flat', 'yes why is it flat', '']) assert.strictEqual(V.voiceCommand(s), null, s);
});

test('pickMime prefers webm/opus, then mp4 (Safari), else empty', () => {
  assert.strictEqual(V.pickMime(m => m.startsWith('audio/webm')), 'audio/webm;codecs=opus');
  assert.strictEqual(V.pickMime(m => m === 'audio/mp4'), 'audio/mp4');
  assert.strictEqual(V.pickMime(() => false), '');
});

test('fallback plan: server voice on uses ElevenLabs; off uses Web Speech; neither hides the mic', () => {
  assert.deepStrictEqual(V.plan({ voice: 'elevenlabs' }, { recognition: true, synthesis: true, recorder: true }), { listen: 'server', say: 'server' });
  assert.deepStrictEqual(V.plan({ voice: 'off' }, { recognition: true, synthesis: true, recorder: true }), { listen: 'browser', say: 'browser' });
  assert.deepStrictEqual(V.plan({ voice: 'off' }, { recognition: false, synthesis: false, recorder: true }), { listen: null, say: null });
});

test('permission denied gives one clear message', () => {
  assert.match(V.micErrorText({ name: 'NotAllowedError' }), /Microphone blocked/);
  assert.match(V.micErrorText({ name: 'NotFoundError' }), /No microphone/);
});

test('speak falls back to the browser voice when the server audio has not started in 8 s', () => {
  assert.strictEqual(V.TTS_START_MS, 8000);
  assert.strictEqual(V.MIN_HOLD_MS, 300);
});
```

- [ ] **Step 2: Write the failing e2e tests** in `Plugged/e2e/voice.spec.js`. There are 2. Both stub the microphone and `/api/voice/*`, so they never use real audio.

```js
const { test, expect } = require('@playwright/test');

// A fake microphone: getUserMedia resolves, and MediaRecorder emits one small blob on stop.
const fakeMic = () => {
  navigator.mediaDevices.getUserMedia = async () => new MediaStream();
  window.MediaRecorder = class { constructor() { this.state = 'inactive'; } static isTypeSupported(m) { return m.startsWith('audio/webm'); }
    start() { this.state = 'recording'; } stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['opus'], { type: 'audio/webm' }) }); this.onstop?.(); } };
  window.__played = 0; HTMLMediaElement.prototype.play = function () { window.__played++; this.dispatchEvent(new Event('ended')); return Promise.resolve(); };
};

async function open(page) {
  await page.addInitScript(fakeMic);
  await page.route('**/api/voice/stt', r => r.fulfill({ json: { text: 'Why is my output flat?' } }));
  await page.route('**/api/voice/tts', r => r.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from([0xff, 0xf3, 0, 0]) }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && window.SparkyChat && window.SparkyVoice);
}

test('hold the mic, ask out loud: the transcript is sent, the reply is shown and spoken', async ({ page }) => {
  await page.route('**/api/ask', r => r.fulfill({ json: { reply: '**Pin 4** is not connected to −12 V.', actions: [] } }));
  await open(page);
  const mic = page.locator('#mic-btn');
  await expect(mic).toBeVisible();
  await mic.dispatchEvent('pointerdown');
  await page.waitForTimeout(400);                       // past MIN_HOLD_MS
  await mic.dispatchEvent('pointerup');
  await expect(page.locator('.chat-msg.user').last()).toHaveText('Why is my output flat?');
  await expect(page.locator('.chat-msg.ai').last()).toContainText('Pin 4');
  await expect.poll(() => page.evaluate(() => window.__played)).toBe(1);
});

test('with a build preview open, saying "accept" accepts it and nothing is sent to the AI', async ({ page }) => {
  let asks = 0;
  await page.route('**/api/ask', r => { asks++; r.fulfill({ json: { reply: 'Here is an LED.', actions: [{ tool: 'place', part: 'led', hole: 'c10' }] } }); });
  await open(page);
  await page.fill('#sparky-input', 'Build an LED'); await page.press('#sparky-input', 'Enter');
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.unroute('**/api/voice/stt');
  await page.route('**/api/voice/stt', r => r.fulfill({ json: { text: 'Accept.' } }));
  const mic = page.locator('#mic-btn');
  await mic.dispatchEvent('pointerdown'); await page.waitForTimeout(400); await mic.dispatchEvent('pointerup');
  await expect(page.locator('#sparky-pending-bar')).toBeHidden();
  expect(asks).toBe(1);
});
```

Before relying on it, the builder checks the action shape against `chat.js`'s action parsing, and uses the shape an existing e2e uses for a pending build (grep `e2e/` for `sparky-pending-bar`).

- [ ] **Step 3: Run the tests and confirm they fail.**

Run `cd Plugged && npx vitest run test/voice-client.test.js` (expect "Cannot find module '../circuit3d/js/voice.js'"), then `npm run e2e -- e2e/voice.spec.js --workers=1` (expect `#mic-btn` not found).

- [ ] **Step 4: Write `Plugged/circuit3d/js/voice.js`.**

```js
// ─────────────────────────────────────────────────────────────
//  circuit3d/js/voice.js: hold to talk to Edison (V2).
//  Hold 🎤 (or Space, outside text fields) → record → /api/voice/stt →
//  the transcript goes through sparkyAsk(…, { spoken: true }) → the reply
//  is spoken by /api/voice/tts. Server voice off → Web Speech both ways.
//  Browser: window.SparkyVoice. Node: the pure helpers.
// ─────────────────────────────────────────────────────────────
(function (root, factory) {
  const V = factory();
  if (typeof module === 'object' && module.exports) module.exports = V;
  if (root && root.document) { root.SparkyVoice = V; V.boot(root); }
})(typeof window !== 'undefined' ? window : null, function () {
  const MIN_HOLD_MS = 300, TTS_START_MS = 8000, MAX_SPOKEN = 400;

  function cleanForSpeech(text, max = MAX_SPOKEN) {
    let t = String(text || '')
      .replace(/\n\s*Heads up[\s\S]*$/i, '')                         // server warnings appended at the end
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\s*\((?:[a-j]|tp|tn|bp|bn)_?\d+[^)]*\)/gi, '')      // hole ids like (tp_12 → a12)
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
      .replace(/\s+([.,!?])/g, '$1').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max), end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    return end > 80 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
  }

  function voiceCommand(s) {
    const t = String(s || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
    if (/^(accept|yes|build it|do it)( it)?$/.test(t)) return 'accept';
    if (/^(decline|no|cancel|reject)( it)?$/.test(t)) return 'decline';
    return null;
  }

  function pickMime(isSupported) {
    for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) if (isSupported(m)) return m;
    return '';
  }

  function plan(health, can) {
    if (health && (health.voice === 'elevenlabs' || health.voice === 'fixture') && can.recorder) return { listen: 'server', say: 'server' };
    return { listen: can.recognition ? 'browser' : null, say: can.synthesis ? 'browser' : null };
  }

  function micErrorText(e) {
    if (e && e.name === 'NotAllowedError') return 'Microphone blocked: allow it in the address bar to talk to Edison.';
    if (e && e.name === 'NotFoundError') return 'No microphone found. Type your question instead.';
    return 'The microphone did not start. Type your question instead.';
  }

  // ── The page half ───────────────────────────────────────────
  // State: idle → recording → sending → speaking → idle. One clip at a time.
  let winRef = null, how = { listen: null, say: null }, state = 'idle';
  let rec = null, stream = null, chunks = [], recognition = null, heard = '', pressedAt = 0;
  let audio = null, ttsTimer = null;

  function setState(s) {
    state = s; api.state = s;
    const b = winRef && winRef.document.getElementById('mic-btn');
    if (b) b.dataset.state = s;
  }

  const toDataUrl = blob => new Promise((ok, no) => {
    const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(blob);
  });

  function boot(win) {
    winRef = win;
    if (win.document.readyState === 'loading') win.document.addEventListener('DOMContentLoaded', () => mount(win));
    else mount(win);
  }

  async function mount(win) {
    const doc = win.document, btn = doc.getElementById('mic-btn');
    if (!btn) return;
    let health = null;
    try { health = await (await win.fetch('/api/health')).json(); } catch { /* no health → browser voice */ }
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    how = plan(health, { recorder: !!(win.MediaRecorder && win.navigator.mediaDevices), recognition: !!SR, synthesis: !!win.speechSynthesis });
    if (!how.listen) { btn.hidden = true; return; }
    if (how.listen === 'browser') {
      recognition = new SR(); recognition.lang = 'en-US'; recognition.interimResults = false;
      recognition.onresult = e => { heard = Array.from(e.results).map(r => r[0].transcript).join(' '); };
    }
    const typing = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    btn.addEventListener('pointerdown', e => { e.preventDefault(); press(win); });
    btn.addEventListener('pointerup', () => release(win));
    btn.addEventListener('pointerleave', () => { if (state === 'recording') release(win); });
    doc.addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat && !typing(e.target)) { e.preventDefault(); press(win); } });
    doc.addEventListener('keyup', e => { if (e.code === 'Space' && !typing(e.target)) { e.preventDefault(); release(win); } });
  }

  async function press(win) {
    if (state === 'recording' || state === 'sending') return;
    stop();
    pressedAt = Date.now(); heard = ''; chunks = [];
    setState('recording');
    if (how.listen === 'browser') { try { recognition.start(); } catch { /* already listening */ } return; }
    try {
      stream = await win.navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMime(m => win.MediaRecorder.isTypeSupported(m));
      rec = new win.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.start();
    } catch (e) {
      setState('idle');
      win.sparkyAddMsg(micErrorText(e), 'system');
      if (e && e.name === 'NotAllowedError') win.document.getElementById('mic-btn').disabled = true;
    }
  }

  function release(win) {
    if (state !== 'recording') return;
    const held = Date.now() - pressedAt;
    if (how.listen === 'browser') {
      recognition.onend = () => { recognition.onend = null; if (held < MIN_HOLD_MS || !heard) setState('idle'); else handle(win, heard); };
      recognition.stop();
      return;
    }
    const r = rec; rec = null;
    const done = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
    if (!r || held < MIN_HOLD_MS) { if (r && r.state !== 'inactive') r.stop(); done(); setState('idle'); return; }
    r.onstop = async () => {
      done();
      setState('sending');
      try {
        const blob = new Blob(chunks, { type: String(r.mimeType || 'audio/webm').split(';')[0] });
        const res = await win.fetch('/api/voice/stt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: await toDataUrl(blob) }) });
        const data = await res.json();
        if (!res.ok || !data.text) { setState('idle'); win.sparkyAddMsg(data.reply || "I didn't catch that. Try again.", 'system'); return; }
        handle(win, data.text);
      } catch { setState('idle'); win.sparkyAddMsg("I didn't catch that. Try again.", 'system'); }
    };
    r.stop();
  }

  function handle(win, text) {
    setState('idle');
    const t = String(text || '').trim();
    if (!t) return;
    const chat = win.SparkyChat;
    if (chat && chat.hasPendingBuild && chat.hasPendingBuild()) {
      const cmd = voiceCommand(t);
      if (cmd === 'accept') return win.sparkyAcceptChanges();
      if (cmd === 'decline') return win.sparkyDeclineChanges();
      return win.sparkyAddMsg('Accept or decline the build first.', 'system');
    }
    win.sparkyAsk(t, { spoken: true });
  }

  function browserSay(win, t) {
    if (!win.speechSynthesis) { setState('idle'); return; }
    const u = new win.SpeechSynthesisUtterance(t);
    u.onend = () => setState('idle');
    win.speechSynthesis.speak(u);
  }

  function speak(text) {
    const win = winRef; if (!win) return;
    const t = cleanForSpeech(text); if (!t) return;
    stop();
    setState('speaking');
    if (how.say !== 'server') { browserSay(win, t); return; }
    let started = false;
    ttsTimer = setTimeout(() => { if (!started) { stop(); setState('speaking'); browserSay(win, t); } }, TTS_START_MS);
    win.fetch('/api/voice/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) })
      .then(r => { if (!r.ok) throw new Error('tts ' + r.status); return r.blob(); })
      .then(blob => {
        if (state !== 'speaking') return undefined;
        audio = new win.Audio(URL.createObjectURL(blob));
        audio.addEventListener('ended', () => setState('idle'));
        return audio.play().then(() => { started = true; clearTimeout(ttsTimer); });
      })
      .catch(() => { clearTimeout(ttsTimer); if (state === 'speaking' && !started) browserSay(win, t); });
  }

  function stop() {
    clearTimeout(ttsTimer);
    if (audio) { audio.pause(); audio = null; }
    if (winRef && winRef.speechSynthesis) winRef.speechSynthesis.cancel();
    if (state === 'speaking') setState('idle');
  }

  const api = { MIN_HOLD_MS, TTS_START_MS, state, cleanForSpeech, voiceCommand, pickMime, plan, micErrorText, boot, speak, stop };
  return api;
});
```

Check `sparkyAsk`'s first argument before relying on it: the transcript must become the user's bubble, as typed text does (`chat.js:611-625`). If `sparkyAsk` only reads `#sparky-input`, set the input's value to the transcript first.

- [ ] **Step 5: Change chat.js and the page.**
  - In `chat.js`'s `sparkyAsk(overrideMsg, { context, explain, spoken } = {})`, after `sparkyAddMsg(data.reply || '(no reply)', 'ai')` (`:631`), add `if (spoken && window.SparkyVoice) SparkyVoice.speak(data.reply || '');`.
  - On the `SparkyChat` object, add `hasPendingBuild: () => !!(_pendingActions && _pendingActions.length)`.
  - In `index.html`, add `<button id="mic-btn" type="button" title="Hold to talk to Edison (or hold Space)" aria-label="Hold to talk">🎤</button>` right after `#photo-wrap`, and `<script src="js/voice.js"></script>` after `js/chat.js`.
  - In `chat.css`, `#mic-btn` copies `#photo-btn`'s box (30×30, the same border and radius, `style.css:195-206`). `#mic-btn[data-state="recording"]` gets the border and text in `var(--danger, #c4333b)` with a 1 s opacity pulse that respects `prefers-reduced-motion`. `[data-state="speaking"]` gets the accent border.
  - In `theme-edison.css`, use `html[data-ui="edison"] #mic-btn { background: var(--ed-sheet); border: 1px solid var(--border-dark); border-radius: var(--r-control); box-shadow: none; }`, and the recording state uses `var(--bus-red)`.

- [ ] **Step 6: Run the tests and confirm they pass.**

Run `cd Plugged && npx vitest run test/voice-client.test.js && npm run check && npm test`. Then the wait loop, then `npm run e2e -- e2e/voice.spec.js e2e/chat-bold.spec.js e2e/ai-timeout.spec.js --workers=1`. Expected: all pass.

- [ ] **Step 7: Live check.** This needs Aarmen's key in `backend/.env`; agents can't add it.

Start the server with the real key, open `/circuit3d/index.html?lab=lab2`, hold 🎤 and ask "why is my output flat?". Check the transcript appears, Edison answers, and the answer is spoken in the ElevenLabs voice. Then set `VOICE_PROVIDER=off`, restart, and check the browser voice works too.

- [ ] **Step 8: Commit and ship.**

```bash
git add Plugged/circuit3d/js/voice.js Plugged/circuit3d/js/chat.js Plugged/circuit3d/index.html Plugged/circuit3d/css/chat.css Plugged/circuit3d/css/theme-edison.css Plugged/test/voice-client.test.js Plugged/e2e/voice.spec.js
git commit -m "Hold to talk to Edison: speech in through ElevenLabs Scribe, replies spoken by Flash, Web Speech fallback (V2)"
```

Run `/ship`, with the full e2e.

---

### Task 3: Make the demo answer reliable (issue V3, demo-critical)

**Files:**
- Modify: the ai-eval case list. Find it with `grep -rn "only demo" Plugged/scripts` and add the case beside the existing demo case.
- Create: `Plugged/test/fixtures/circuits/lab2-no-vneg.sparky`: Lab 2's circuit (`circuit3d/labs/lab2.sparky`) with the wire to pin 4 (V−) removed.
- Test: the eval run itself, plus a Vitest pin that the fixture really has pin 4 floating.

**Interfaces:**
- Consumes: `npm run ai-eval -- --only <case>` (the existing harness), and `Readings.nets(load(file))` as used in `test/textbook-figures.test.js`.
- Produces: an eval case `lab2-flat`. The answer must name pin 4, V− or the negative supply, and the −12 V rail, in 3/3 runs.

- [ ] **Step 1: Write the failing pin** in `test/lab2-flat.test.js`. In `lab2-no-vneg.sparky`, U1's `vneg` pin shares a net with nothing else. Copy `load()` from `test/textbook-figures.test.js`.

```js
test('lab2-no-vneg.sparky: U1 pin 4 (vneg) is floating, everything else as Lab 2', () => {
  const nets = Readings.nets(load('test/fixtures/circuits/lab2-no-vneg.sparky'));
  const vneg = nets.find(n => n.pins.some(p => p.label === 'U1' && p.pin === 'vneg'));
  assert.strictEqual(vneg.pins.length, 1, 'only U1 vneg on its net');
});
```

The builder confirms the shape `Readings.nets` returns in `textbook-figures.test.js`, and adapts the field names to it.

- [ ] **Step 2: Make the fixture** by copying `lab2.sparky` and deleting the one wire whose end is the hole of U1's `vneg` pin. Then run the pin and confirm it passes.

- [ ] **Step 3: Add the eval case.** The board is `lab2-no-vneg.sparky`. The message is "Edison, why is my output flat?". The pass rule is that the reply mentions (`/pin ?4|V−|V-|negative supply/i`) and (`/−12|-12/`).

Run `npm run ai-eval -- --only lab2-flat`, 3 runs.
- **3/3:** done.
- **Fewer:** look at what Edison is told. The `/api/ask` board context should flag the floating op-amp supply pin, from the mistakes or readings. If it doesn't, add a mistake rule for "op-amp supply pin floating" in the mistake engine. That is circuit physics, so Aarmen decides, and it gets its own small issue if it's needed.

- [ ] **Step 4: Commit and ship** with the eval result in the commit message.

---

## After the plan

- **Order:** V1, then V2 (needs V1's routes), then V3, which can run alongside V2 since it's independent.
- **Aarmen, before V2's live check:** add `ELEVENLABS_API_KEY=…` to `Plugged/backend/.env` and restart the server. Optionally pick a voice and set `ELEVENLABS_VOICE_ID`.
- **The demo beat** (docs/DEMO.md beat 3) is ready when V2's live check and V3's 3/3 both pass.
