// ─────────────────────────────────────────────────────────────
//  backend/voice.js: ElevenLabs speech for Edison (V1, #12).
//  Speech to text: Scribe v2, multipart. Text to speech: Flash v2.5,
//  a streamed mp3. The key stays on the server. VOICE_PROVIDER=fixture
//  replays test/fixtures/voice/, so tests never reach ElevenLabs.
//  Node built-ins only: the global fetch, FormData and Blob (Node 20).
// ─────────────────────────────────────────────────────────────
const fs   = require('node:fs');
const path = require('node:path');

const API           = 'https://api.elevenlabs.io/v1';
const DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb';
const FIXTURES      = path.join(__dirname, '..', 'test', 'fixtures', 'voice');
// A browser recording as a base64 data URL. Firefox writes "; codecs=".
const AUDIO_URL = /^data:audio\/(webm|ogg|mp4|mpeg|wav|x-wav)(?:; ?codecs=[\w.]+)?;base64,([A-Za-z0-9+/]+={0,2})$/;
const EXT       = { webm: 'webm', ogg: 'ogg', mp4: 'm4a', mpeg: 'mp3', wav: 'wav', 'x-wav': 'wav' };

const VOICE_REPLY = {
  BAD_AUDIO:     'That recording could not be read. Try again.',
  BAD_TEXT:      'Nothing to say.',
  VOICE_OFF:     'Voice is off on this server.',
  VOICE_TIMEOUT: "I didn't catch that in time. Try again.",
  VOICE_FAILED:  'Voice failed. Try again or type your question.',
};

// { mime, ext, buf } for a base64 audio clip of a listed type, else null.
function parseAudioDataUrl(s) {
  const m = typeof s === 'string' ? AUDIO_URL.exec(s) : null;
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  return buf.length ? { mime: `audio/${m[1]}`, ext: EXT[m[1]], buf } : null;
}

// 'fixture' | 'elevenlabs' | 'off'. A key with VOICE_PROVIDER unset or blank is elevenlabs.
function voiceMode(env = process.env) {
  const provider = String(env.VOICE_PROVIDER || '').trim().toLowerCase();
  if (provider === 'fixture') return 'fixture';
  if (provider === 'off' || !env.ELEVENLABS_API_KEY) return 'off';
  return 'elevenlabs';
}

const timeoutMs = env => { const n = Number(env.VOICE_TIMEOUT_MS); return n > 0 ? n : 10000; };
const fail      = (code, msg) => Object.assign(new Error(msg || code), { code });

// One deadline per call (VOICE_TIMEOUT_MS), on setTimeout and an AbortController.
// `read` turns the answer into the result inside the deadline. An upstream
// error body is never read or passed on: it can carry account detail.
async function call(url, init, env, f, read) {
  const ac    = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs(env));
  try {
    const res = await f(url, { ...init, signal: ac.signal });
    if (!res.ok) {
      if (res.body) res.body.cancel().catch(() => {});
      throw fail('VOICE_FAILED', `elevenlabs ${res.status}`);
    }
    return await read(res);
  } catch (e) {
    if (e && (e.code === 'VOICE_FAILED' || e.code === 'VOICE_TIMEOUT')) throw e;
    throw fail(ac.signal.aborted ? 'VOICE_TIMEOUT' : 'VOICE_FAILED', `elevenlabs ${e && e.name}`);
  } finally {
    clearTimeout(timer);
  }
}

function guard(env) {
  const mode = voiceMode(env);
  if (mode === 'off') throw fail('VOICE_OFF');
  return mode;
}

// The transcript of `clip` (from parseAudioDataUrl). ctx: { env, fetch }.
async function transcribe(clip, ctx = {}) {
  const env = ctx.env || process.env;
  if (guard(env) === 'fixture') return JSON.parse(fs.readFileSync(path.join(FIXTURES, 'stt.json'), 'utf8')).text;
  const form = new FormData();
  form.append('model_id', env.ELEVENLABS_STT_MODEL || 'scribe_v2');
  form.append('file', new Blob([clip.buf], { type: clip.mime }), `speech.${clip.ext}`);
  // No Content-Type: fetch writes the multipart one, with its boundary.
  return call(`${API}/speech-to-text`, { method: 'POST', headers: { 'xi-api-key': env.ELEVENLABS_API_KEY }, body: form },
    env, ctx.fetch || fetch, async res => String((await res.json()).text || '').trim());
}

// A Response whose body (a web ReadableStream) is the mp3. The deadline ends
// once the audio starts. ctx: { env, fetch }.
async function speak(text, ctx = {}) {
  const env = ctx.env || process.env;
  if (guard(env) === 'fixture') {
    return new Response(fs.readFileSync(path.join(FIXTURES, 'tts.mp3')), { headers: { 'Content-Type': 'audio/mpeg' } });
  }
  const voice = env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  return call(`${API}/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_128`, {
    method:  'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text, model_id: env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5' }),
  }, env, ctx.fetch || fetch, async res => res);
}

module.exports = { parseAudioDataUrl, voiceMode, transcribe, speak, VOICE_REPLY };
