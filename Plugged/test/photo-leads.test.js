// POST /api/photo/leads and backend/photo-leads.js (issue #159, Photo crops
// 1/2): one Gemini call per labelled crop, all at once, resent at 12 s, cut
// off at 25 s, the answers converted to flattened-image pixels. Every test
// uses a fake fetch: no network, no key, never a real AI.
//
// Shapes these tests assume (stated so the builder matches them):
// - backend/photo-leads.js exports readLeads(body, opts):
//     body  { key, items: [{ id, kind, type, value, image, window }] }, a
//           request the route has already checked
//     opts  fetch        default the global fetch
//           fixturesDir  the saved-leads folder itself, holding <key>.json;
//                        default Plugged/test/fixtures/photo/leads
//   It resolves { items, provider, model, ms } and never rejects for a valid
//   body: one entry per requested id, in request order, either
//   { id, found, leads: [{ pin, pt, role }], conf } or
//   { id, error: 'AI_TIMEOUT' | 'AI_FAILED' } (exactly those keys).
// - Gemini only (no deepseek): POST <GEMINI_BASE><model>:generateContent,
//   model PHOTO_GEMINI_MODEL || 'gemini-robotics-er-2-preview', the key in
//   the x-goog-api-key header only. The contents' parts are the prompt text,
//   PHOTO_CROP_PROMPT(item) from backend/photo-prompt.js, and the crop as
//   inline_data (or inlineData) on a part carrying mediaResolution
//   MEDIA_RESOLUTION_ULTRA_HIGH. generationConfig: responseMimeType
//   'application/json', a responseSchema, temperature 1, maxOutputTokens
//   32768. The fake tells the items' calls apart by their image.
// - Timers: PHOTO_HEDGE_MS (default 12000) and PHOTO_LEADS_TIMEOUT_MS
//   (default 40000 since #173; it was 25000), read per call and measured from readLeads' start, run on
//   the global setTimeout/clearTimeout (vi.useFakeTimers drives those; it
//   can't drive AbortSignal.timeout). Every call gets an AbortSignal, and
//   aborting it makes the fake fetch reject, as a real fetch does.
// - Retries and the cap in flight (#172, section 8): an item's call that
//   fails at once (503, 429, other 5xx, network error, empty reply, invalid
//   JSON) is retried, the same request, 1–2 s later instead of waiting for
//   the 12 s resend; a silent stall still gets one resend at PHOTO_HEDGE_MS,
//   measured from when that call went out; at most 3 calls per item; a
//   400/401/403 is never retried. At most PHOTO_LEADS_CONCURRENCY (new env,
//   default 16) first calls and retries are in flight across all items; the
//   rest queue and start in item order as those calls end. A stall resend is
//   never queued and never counts toward that cap: it goes out at
//   PHOTO_HEDGE_MS even when the cap is full (the live check had 9 of 13
//   crops time out when resends queued behind waiting items). An item still
//   queued or unanswered at the cutoff is AI_TIMEOUT. The route's
//   [photo-leads] line gains retries=N.
// - Points: Gemini's [y, x] is 0–1000 over the whole crop image, so crop
//   pixel (u, v) = (x/1000·width, y/1000·height), and the flattened pixel is
//   (win.x + (u − padLeft)/scale, win.y + (v − padTop)/scale), each rounded
//   to 0.1. "off" → pt null.
// - Saved leads, <fixturesDir>/<key>.json = { key, model, items } (items as
//   readLeads answers them, points already in flattened pixels). A key of 64
//   hex digits is an image hash (what /api/photo returns for a photo with no
//   sample); any other plain id (isSafeId) is a sample id. A sample id with a
//   file is replayed straight away, unless PHOTO_RECORD=1.
//
// - #173 (section 9), the confirm screen opens after the box round and each
//   part's legs snap in as its crop answers:
//   readLeads(body, opts) takes opts.onItem(entry): called exactly once per
//   requested id, as that item settles, in finish order: an answer, an
//   AI_FAILED, and an AI_TIMEOUT at the cutoff. The entry is the one the
//   resolved `items` holds for that id (so an image-hash item that failed
//   live and takes its saved answer reports the saved answer). Replays (a
//   sample id with a file, PHOTO_PROVIDERS=fixture) and the no-key path call
//   it too. The resolved { items, provider, model, ms, … } is unchanged.
//   The route streams only when the request's Accept header includes
//   application/x-ndjson: 200, Content-Type application/x-ndjson, one line
//   per item as it settles ({ id, found, leads, conf } or { id, error }),
//   then a last line { done: true, provider, model, ms }. Every requested id
//   gets exactly one line. Without that Accept the JSON answer is unchanged;
//   errors before the stream (400 BAD_ITEMS, 413, 429) stay JSON.
//   PHOTO_LEADS_TIMEOUT_MS defaults to 40000 (was 25000): the page no longer
//   waits on the cutoff. The tests that time the 25 s cutoff set
//   PHOTO_LEADS_TIMEOUT_MS=25000 themselves (cutoffAt25()).
//
// - #177 (section 10), the round stops when nobody is listening:
//   readLeads(body, opts) takes opts.signal (an AbortSignal). Aborting it ends
//   the round at once, as the cutoff does but without waiting for it: every
//   call in flight is aborted; no call goes out after (no queued first call,
//   no pending retry, no stall resend); readLeads resolves without the clock
//   moving, with its timers cleared; an item already answered keeps its
//   answer and every other item (in flight, waiting on a retry, or still
//   queued) is { id, error: 'AI_TIMEOUT' }; onItem is still called exactly
//   once per id. The route aborts that signal when the client closes the
//   request before the response has finished (the page's Cancel, close or
//   Build it aborting its fetch); the [photo-leads] line is still written,
//   and the server keeps answering.
//
// The golden, test/fixtures/prompts/photo-crop.txt, was written by hand from
// the issue's Step 4. It holds what is sent for a resistor (value 470) and a
// wire, laid out as:
//   --- resistor ---
//   <the resistor's prompt>
//   --- wire ---
//   <the wire's prompt>
// A prompt is the request's text parts joined by '\n': the Step 4 paragraph
// on one line (sentences joined by single spaces), then a second line,
// 'Short JSON only: ' and the JSON shape, as in the box prompt and the spike's
// prompt_s5_crop. The schema is the builder's choice, so it isn't in the
// golden; the request test checks its key properties instead.
//
// Route tests: the real HTTP server, as in photo-route.test.js, with no
// GEMINI_API_KEY and a global fetch that records and fails, so no AI is ever
// reached. Each request comes from its own X-Forwarded-For address
// (TRUST_PROXY=1), so the 6-a-minute limit only bites in its own test.

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs     = require('node:fs');
const http   = require('node:http');
const os     = require('node:os');
const path   = require('node:path');
const util   = require('node:util');

process.env.AI_PROVIDER = 'fixture';   // /api/ask needs no key and never calls out
process.env.RECORD_FIXTURES = '0';
process.env.TRUST_PROXY = '1';
const Server = require('../backend/server.js');

// Required per test: photo-leads.js doesn't exist before #159.
function Leads() {
  let mod;
  try {
    mod = require('../backend/photo-leads.js');
  } catch (e) {
    assert.fail(`backend/photo-leads.js can't be loaded: ${String(e.message).split('\n')[0]}`);
  }
  assert.equal(typeof mod.readLeads, 'function', 'backend/photo-leads.js does not export readLeads(body, opts)');
  return mod;
}
function cropPrompt() {
  const P = require('../backend/photo-prompt.js');
  assert.equal(typeof P.PHOTO_CROP_PROMPT, 'function', 'backend/photo-prompt.js does not export PHOTO_CROP_PROMPT(item)');
  return P.PHOTO_CROP_PROMPT;
}

const GEMINI_KEY    = 'test-gemini-key-159';
const DEEPSEEK_KEY  = 'test-deepseek-key-159';
const GEMINI_BASE   = 'https://generativelanguage.googleapis.com/v1beta/models/';
const DEFAULT_MODEL = 'gemini-robotics-er-2-preview';
const HEDGE_MS      = 12000;
const TIMEOUT_MS    = 25000;   // the cutoff the #159/#172 tests time; they set it (cutoffAt25)
const DEFAULT_CUTOFF_MS = 40000;   // #173: PHOTO_LEADS_TIMEOUT_MS's default (was 25000)
// #173 moved the default cutoff to 40 s; a test that times the 25 s cutoff
// sets it, so it times the same thing as before.
const cutoffAt25 = () => { process.env.PHOTO_LEADS_TIMEOUT_MS = String(TIMEOUT_MS); };

const GOLDEN = path.join(__dirname, 'fixtures', 'prompts', 'photo-crop.txt');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

// ── Crops ───────────────────────────────────────────────────────────────────

// A crop as a JPEG- or PNG-looking data URL; `seed` makes it unique.
function crop(seed, mime = 'image/jpeg', bytes = 600) {
  const head = mime === 'image/png' ? [0x89, 0x50, 0x4e, 0x47] : [0xff, 0xd8, 0xff, 0xe0];
  return `data:${mime};base64,${Buffer.concat([Buffer.from(head), Buffer.alloc(bytes, seed)]).toString('base64')}`;
}
const b64 = dataUrl => dataUrl.slice(dataUrl.indexOf(',') + 1);

// R1's crop: padded 60 × 40 px, scale 3, 900 × 600 px.
const WIN_R1 = { x: 400, y: 150, scale: 3, padLeft: 60, padTop: 40, width: 900, height: 600 };
// W1's crop: padded 45 × 45 px, scale 2.5, 700 × 1000 px (taller than wide).
const WIN_W1 = { x: 1200.5, y: 80, scale: 2.5, padLeft: 45, padTop: 45, width: 700, height: 1000 };
// No padding and scale 1: crop pixels are flattened pixels moved by (x, y).
const WIN_X1 = { x: 10, y: 20, scale: 1, padLeft: 0, padTop: 0, width: 300, height: 200 };
// Any other item. x and y are 0: a crop at the board's top-left corner.
const WIN    = { x: 0, y: 0, scale: 3, padLeft: 27, padTop: 27, width: 600, height: 400 };

// A request item: the kind and type follow the id (R resistor, LED led,
// W wire, else other).
function item(id, extra = {}) {
  const kind = /^W/.test(id) ? 'wire' : 'part';
  const type = kind === 'wire' ? 'wire' : /^LED/.test(id) ? 'led' : /^R/.test(id) ? 'resistor' : 'other';
  return { id, kind, type, value: type === 'resistor' ? 470 : 0, image: crop(`${id}|`), window: { ...WIN }, ...extra };
}

// Two answers for R1, and what they are in R1's window.
const P1 = [['1', [500, 250]], ['2', [500, 750]]];
const P2 = [['1', [400, 250]], ['2', [400, 750]]];
const R1_P1 = [{ pin: '1', pt: [455, 236.7], role: 'none' }, { pin: '2', pt: [605, 236.7], role: 'none' }];
const R1_P2 = [{ pin: '1', pt: [455, 216.7], role: 'none' }, { pin: '2', pt: [605, 216.7], role: 'none' }];

// ── A fake Gemini ───────────────────────────────────────────────────────────

// A fetch Response stand-in (a plain object, so fake timers can't stall it).
function reply(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, statusText: '', headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => text, json: async () => JSON.parse(text) };
}
const geminiSays = answer => reply(200, { candidates: [{ content: { role: 'model', parts: [{ text: typeof answer === 'string' ? answer : JSON.stringify(answer) }] }, finishReason: 'STOP' }] });
const answer = (leads, extra = {}) => geminiSays({ found: true, type: '...', leads, conf: 0.8, ...extra });
const status = n => reply(n, { error: { code: n, message: `upstream ${n}` } });
const HANG   = Symbol('never answers; only an abort ends it');
const after  = (ms, res) => new Promise(r => setTimeout(() => r(res), ms));   // on the fake clock

const imagePart = body => ((body && body.contents) || []).flatMap(m => (m && m.parts) || []).find(p => p && (p.inline_data || p.inlineData));
const sentText  = body => ((body && body.contents) || []).flatMap(m => (m && m.parts) || [])
  .filter(p => p && typeof p.text === 'string').map(p => p.text).join('\n');

// answerFor(call) → a reply, a promise of one, HANG, or throws (a network
// error). Each Gemini call is kept as { id, n, url, method, headers, body,
// part, signal }: id is the item whose crop it carries, n its call number
// for that item. Any other URL is kept in `other` and fails.
// #172: a call sent while another call for the same item is still in flight
// is a stall resend (call.resend true); maxCapped is the most of the others
// (first calls and retries) in flight at once, the calls that
// PHOTO_LEADS_CONCURRENCY caps. (A retry sent while a resend is still in
// flight would also read as a resend; the cap tests have none.)
function fakeGemini(items, answerFor) {
  const idOf = new Map(items.map(it => [b64(it.image), it.id]));
  const calls = [], other = [];
  const busy = new Map();   // item id → its calls in flight
  let inFlight = 0, maxInFlight = 0, capped = 0, maxCapped = 0;
  const fetch = (url, opts = {}) => {
    const u = String(url);
    if (!u.startsWith(GEMINI_BASE)) {
      other.push(u);
      return Promise.reject(new Error(`readLeads called an unexpected URL: ${u}`));
    }
    let body = null;
    try { body = JSON.parse(opts.body); } catch { /* the request test reports it */ }
    const part = imagePart(body);
    const id   = part ? idOf.get((part.inline_data || part.inlineData).data) : undefined;
    const call = { id, n: calls.filter(c => c.id === id).length + 1, url: u, method: opts.method,
      headers: new Headers(opts.headers), body, part, signal: opts.signal, resend: (busy.get(id) || 0) > 0 };
    calls.push(call);
    busy.set(id, (busy.get(id) || 0) + 1);
    maxInFlight = Math.max(maxInFlight, ++inFlight);
    if (!call.resend) maxCapped = Math.max(maxCapped, ++capped);
    return new Promise((resolve, reject) => {
      const signal = opts.signal;
      const abort = () => reject(signal.reason || new DOMException('This operation was aborted', 'AbortError'));
      if (signal && signal.aborted) return abort();
      if (signal) signal.addEventListener('abort', abort, { once: true });
      let out;
      try { out = answerFor(call); } catch (e) { return reject(e); }
      if (out !== HANG) Promise.resolve(out).then(resolve, reject);
    }).finally(() => {
      inFlight--;
      busy.set(id, busy.get(id) - 1);
      if (!call.resend) capped--;
    });
  };
  return { fetch, calls, other, of: id => calls.filter(c => c.id === id),
    get maxInFlight() { return maxInFlight; }, get maxCapped() { return maxCapped; } };
}

// ── Running readLeads on the fake clock ─────────────────────────────────────

const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] };
const flush = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setImmediate(r)); };
const advance = async ms => { await vi.advanceTimersByTimeAsync(ms); await flush(); };
// Waits up to a real second (setImmediate and performance aren't faked) for
// cond, without moving the fake clock.
async function until(cond, what) {
  const end = performance.now() + 1000;
  while (!cond() && performance.now() < end) await new Promise(r => setImmediate(r));
  assert.ok(cond(), typeof what === 'function' ? what() : `still waiting for ${what}`);
}

let emptyDir;

// Starts readLeads on the fake clock; s.done, s.value, s.error follow it.
function start(body, fake, opts = {}) {
  const { readLeads } = Leads();
  if (!vi.isFakeTimers()) vi.useFakeTimers(FAKE);
  const s = { done: false };
  s.promise = readLeads(body, { fetch: fake.fetch, fixturesDir: emptyDir, ...opts });
  Promise.resolve(s.promise).then(v => { s.done = true; s.value = v; }, e => { s.done = true; s.error = e; });
  return s;
}
function result(s) {
  if (s.error) assert.fail(`readLeads rejected (${s.error.code || s.error.message}); a valid request always resolves`);
  assert.ok(s.value && Array.isArray(s.value.items), `readLeads resolved without items: ${JSON.stringify(s.value)}`);
  return s.value;
}
// Runs the clock until readLeads settles, at most `limit` ms of fake time.
async function finish(s, limit = 40000) {
  for (let t = 0; t < limit && !s.done; t += 500) await advance(500);
  await flush();
  assert.ok(s.done, `readLeads had not resolved after ${limit / 1000} s`);
  return result(s);
}
const readAll = (body, fake, opts) => finish(start(body, fake, opts));

const byId = (out, id) => out.items.find(x => x.id === id);

// ── Saved leads ─────────────────────────────────────────────────────────────

const SAVED_ITEMS = [   // stored W1 first: the answer follows the request's order
  { id: 'W1', found: true, leads: [{ pin: '1', pt: [570, 220], role: 'none' }, { pin: '2', pt: [630, 103], role: 'none' }], conf: 0.9 },
  { id: 'R1', found: true, leads: [{ pin: '1', pt: [360, 73], role: 'none' }, { pin: '2', pt: [480, 190], role: 'none' }], conf: 0.8 },
];
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const tempDir = what => fs.mkdtempSync(path.join(os.tmpdir(), `photo-leads-${what}-`));
function save(dir, key, file) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(file, null, 2));
}
const readSaved = (dir, key) => JSON.parse(fs.readFileSync(path.join(dir, `${key}.json`), 'utf8'));

// ── Environment ─────────────────────────────────────────────────────────────

const ENV_KEYS = ['GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'PHOTO_GEMINI_MODEL', 'PHOTO_RECORD', 'PHOTO_PROVIDERS',
  'PHOTO_HEDGE_MS', 'PHOTO_LEADS_TIMEOUT_MS', 'PHOTO_LEADS_CONCURRENCY'];
let savedEnv, logs, port;

beforeAll(() => new Promise(r => {
  emptyDir = tempDir('empty');
  Server.server.listen(0, '127.0.0.1', () => { port = Server.server.address().port; r(); });
}));
afterAll(() => new Promise(r => {
  fs.rmSync(emptyDir, { recursive: true, force: true });
  Server.server.close(r);
}));
beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  process.env.GEMINI_API_KEY = GEMINI_KEY;
  process.env.DEEPSEEK_API_KEY = DEEPSEEK_KEY;
  for (const k of ['PHOTO_GEMINI_MODEL', 'PHOTO_RECORD', 'PHOTO_PROVIDERS', 'PHOTO_HEDGE_MS', 'PHOTO_LEADS_TIMEOUT_MS', 'PHOTO_LEADS_CONCURRENCY']) delete process.env[k];
  logs = [];
  for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
    vi.spyOn(console, m).mockImplementation((...args) => { logs.push(args.map(a => (typeof a === 'string' ? a : util.inspect(a))).join(' ')); });
  }
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// ── 1. The Gemini request ───────────────────────────────────────────────────

test('the Gemini request: one per item to the pinned model, key in x-goog-api-key and never the URL, the crop inline at ULTRA_HIGH, PHOTO_CROP_PROMPT(item), JSON with a schema, temperature 1, 32768 tokens', async () => {
  const items = [item('R1', { image: crop('R1|', 'image/png'), window: WIN_R1 }), item('W1', { window: WIN_W1 })];
  const fake = fakeGemini(items, () => answer(P1));
  const out = await readAll({ key: 'no-saved-leads', items }, fake);

  assert.deepStrictEqual(fake.calls.map(c => c.id).sort(), ['R1', 'W1'], `one call per item, each carrying its crop: ${JSON.stringify(fake.calls.map(c => c.id))}`);
  const PROMPT = cropPrompt();
  for (const it of items) {
    const c = fake.of(it.id)[0];
    assert.equal(c.url, `${GEMINI_BASE}${DEFAULT_MODEL}:generateContent`);
    assert.equal(c.method, 'POST');
    assert.equal(c.headers.get('x-goog-api-key'), GEMINI_KEY);
    assert.ok(!c.url.includes(GEMINI_KEY) && !/[?&]key=/.test(c.url), `the key is in the URL: ${c.url}`);
    assert.ok(c.signal instanceof AbortSignal, `${it.id}: no AbortSignal, so the resend and the cutoff can't cancel it`);

    const img = c.part.inline_data || c.part.inlineData;
    assert.equal(img.mime_type || img.mimeType, it.image.slice(5, it.image.indexOf(';')), `${it.id}: the image's mime type`);
    assert.equal(img.data, b64(it.image), `${it.id}: the image part is the data URL's base64, without the data: prefix`);
    const partWithoutData = JSON.stringify({ ...c.part, inline_data: undefined, inlineData: undefined });
    assert.ok(partWithoutData.includes('MEDIA_RESOLUTION_ULTRA_HIGH'), `${it.id}: the image part is not sent at MEDIA_RESOLUTION_ULTRA_HIGH: ${partWithoutData}`);
    assert.equal(sentText(c.body), PROMPT(it), `${it.id}: the text sent is not PHOTO_CROP_PROMPT(item)`);

    const gc = c.body.generationConfig || {};
    assert.equal(gc.responseMimeType, 'application/json');
    assert.ok(gc.responseSchema && typeof gc.responseSchema === 'object', `no responseSchema: ${JSON.stringify(gc).slice(0, 300)}`);
    const schema = JSON.stringify(gc.responseSchema);
    for (const word of ['found', 'leads']) assert.ok(schema.includes(word), `the crop schema has no ${word}: ${schema.slice(0, 300)}`);
    assert.equal(gc.temperature, 1);
    assert.equal(gc.maxOutputTokens, 32768, 'Robotics-ER\'s thinking counts toward maxOutputTokens');
  }
  assert.equal(out.provider, 'gemini');
  assert.equal(out.model, DEFAULT_MODEL);
  assert.equal(typeof out.ms, 'number', `ms: ${out.ms}`);
});

test('PHOTO_GEMINI_MODEL picks the model, in the URL and in the answer', async () => {
  process.env.PHOTO_GEMINI_MODEL = 'gemini-test-pinned-159';
  const items = [item('R1', { window: WIN_R1 })];
  const fake = fakeGemini(items, () => answer(P1));
  const out = await readAll({ key: 'no-saved-leads', items }, fake);
  assert.equal(fake.calls[0].url, `${GEMINI_BASE}gemini-test-pinned-159:generateContent`);
  assert.equal(out.model, 'gemini-test-pinned-159');
});

test('every item\'s call starts at once: all are in flight before any answers', async () => {
  const items = ['R1', 'R2', 'LED1', 'W1', 'W2'].map(id => item(id));
  const fake = fakeGemini(items, () => after(1000, answer(P1)));
  const s = start({ key: 'no-saved-leads', items }, fake);
  await until(() => fake.calls.length === items.length, () => `${fake.calls.length} of ${items.length} calls started before any answered: the items must go out in parallel`);
  const out = await finish(s);
  assert.equal(fake.maxInFlight, items.length, `at most ${fake.maxInFlight} calls were in flight at once`);
  for (const it of items) assert.equal(fake.of(it.id).length, 1, `${it.id} answered in 1 s and must not be resent`);
  assert.ok(out.items.every(x => x.found === true), JSON.stringify(out.items));
});

// ── 2. The answers ──────────────────────────────────────────────────────────

test('points: [y, x] on 0–1000 over the crop → crop pixels → flattened pixels through window (padding, scale 3, 2.5 and 1), rounded to 0.1; "off" → null', async () => {
  const items = [
    item('R1', { window: WIN_R1 }),
    item('W1', { window: WIN_W1 }),
    item('X1', { window: WIN_X1 }),
  ];
  const leads = {
    R1: P1,                                    // (225, 300) and (675, 300) in the crop
    W1: [['1', [100, 500]], ['2', 'off']],     // (350, 100); the other end leaves the crop
    X1: [['1', [250, 100]], ['2', [750, 900]]],// (30, 50) and (270, 150)
  };
  const fake = fakeGemini(items, c => answer(leads[c.id]));
  const out = await readAll({ key: 'no-saved-leads', items }, fake);

  assert.deepStrictEqual(byId(out, 'R1'), { id: 'R1', found: true, leads: R1_P1, conf: 0.8 },
    'R1: x = 400 + (225 − 60) / 3 = 455 and 605, y = 150 + (300 − 40) / 3 = 236.67 → 236.7');
  assert.deepStrictEqual(byId(out, 'W1'), { id: 'W1', found: true, conf: 0.8,
    leads: [{ pin: '1', pt: [1322.5, 102], role: 'none' }, { pin: '2', pt: null, role: 'none' }] },
    'W1: x = 1200.5 + (350 − 45) / 2.5 = 1322.5, y = 80 + (100 − 45) / 2.5 = 102; "off" is null');
  assert.deepStrictEqual(byId(out, 'X1'), { id: 'X1', found: true, conf: 0.8,
    leads: [{ pin: '1', pt: [40, 70], role: 'unknown' }, { pin: '2', pt: [280, 170], role: 'unknown' }] },
    'X1: no padding and scale 1, so the crop pixel plus (10, 20)');
});

test('roles: an LED pin Gemini names anode or cathode keeps it; "?" or a number is unknown; resistor and wire pins are none; other parts unknown', async () => {
  const pts = [[300, 300], [700, 700]];
  const named = (a, b) => [[a, pts[0]], [b, pts[1]]];
  const cases = {
    LED1: [named('anode', 'cathode'),   ['anode', 'cathode']],
    LED2: [named('cathode', 'anode'),   ['cathode', 'anode']],
    LED3: [named('?', '2'),             ['unknown', 'unknown']],
    R1:   [named('1', '2'),             ['none', 'none']],
    W1:   [named('1', '2'),             ['none', 'none']],
    X1:   [named('1', '2'),             ['unknown', 'unknown']],
  };
  const items = Object.keys(cases).map(id => item(id));
  const fake = fakeGemini(items, c => answer(cases[c.id][0]));
  const out = await readAll({ key: 'no-saved-leads', items }, fake);
  for (const [id, [given, roles]] of Object.entries(cases)) {
    const got = byId(out, id);
    assert.ok(got && Array.isArray(got.leads), `${id}: ${JSON.stringify(got)}`);
    assert.deepStrictEqual(got.leads.map(l => l.pin), given.map(g => g[0]), `${id}: each lead keeps the pin Gemini named`);
    assert.deepStrictEqual(got.leads.map(l => l.role), roles, `${id} (${items.find(i => i.id === id).type})`);
  }
});

test('bare-list answers: [{...}] is its first object, [["1",[y,x]], …] is the leads; found false comes through', async () => {
  const items = [item('R1', { window: WIN_R1 }), item('R2', { window: WIN_R1 }), item('X1')];
  const said = {
    R1: '```json\n[{"found":true,"type":"resistor","leads":[["1",[500,250]],["2",[500,750]]],"conf":0.7},]\n```',
    R2: '[["1",[500,250]],["2",[500,750]]]',
    X1: '{"found":false,"type":"other","leads":[],"conf":0.3}',
  };
  const fake = fakeGemini(items, c => geminiSays(said[c.id]));
  const out = await readAll({ key: 'no-saved-leads', items }, fake);
  assert.deepStrictEqual(byId(out, 'R1'), { id: 'R1', found: true, leads: R1_P1, conf: 0.7 }, 'a list holding the answer object, in a fence, with a trailing comma');
  const r2 = byId(out, 'R2');
  assert.ok(r2 && !r2.error, `a bare list of [pin, [y, x]] pairs is an answer, got ${JSON.stringify(r2)}`);
  assert.deepStrictEqual(r2.leads, R1_P1, 'a bare list of pairs is the leads');
  assert.deepStrictEqual(byId(out, 'X1'), { id: 'X1', found: false, leads: [], conf: 0.3 });
});

test('the answer: one entry per requested id, in request order, even when the replies arrive in reverse', async () => {
  const items = [item('R1', { window: WIN_R1 }), item('LED1'), item('W1', { window: WIN_W1 })];
  const wait = { R1: 3000, LED1: 2000, W1: 1000 };
  const fake = fakeGemini(items, c => after(wait[c.id], answer(P1)));
  const out = await readAll({ key: 'no-saved-leads', items }, fake);
  assert.deepStrictEqual(out.items.map(x => x.id), ['R1', 'LED1', 'W1']);
  assert.deepStrictEqual(out.items[0], { id: 'R1', found: true, leads: R1_P1, conf: 0.8 });
});

// ── 3. Resend and cutoff ────────────────────────────────────────────────────

test('resend: an item with no answer at 12 s gets a second identical call; the first good answer wins, the other call is aborted; at most 2 calls', async () => {
  const cases = [
    ['the resend answers first', n => (n === 1 ? HANG : answer(P2)), R1_P2, 1],
    ['the first call answers at 13 s, after the resend went out', n => (n === 1 ? after(13000, answer(P1)) : HANG), R1_P1, 2],
    ['the first call fails at 13 s and the resend answers at 14 s', n => (n === 1 ? after(13000, status(503)) : after(2000, answer(P2))), R1_P2, null],
  ];
  for (const [what, r1, want, loser] of cases) {
    const items = [item('R1', { window: WIN_R1 }), item('W1', { window: WIN_W1 })];
    const fake = fakeGemini(items, c => (c.id === 'R1' ? r1(c.n) : answer(P1)));
    const s = start({ key: 'no-saved-leads', items }, fake);
    await until(() => fake.calls.length === 2, `${what}: R1's and W1's first calls`);

    await advance(HEDGE_MS - 1);
    assert.equal(fake.of('R1').length, 1, `${what}: R1 was resent before ${HEDGE_MS / 1000} s`);
    assert.equal(s.done, false, `${what}: readLeads answered while R1 had no answer`);
    await advance(1);
    assert.equal(fake.of('R1').length, 2, `${what}: R1 had no answer at ${HEDGE_MS / 1000} s and was not resent`);
    assert.deepStrictEqual(fake.of('R1')[1].body, fake.of('R1')[0].body, `${what}: the resend is not identical`);

    const out = await finish(s);
    await advance(TIMEOUT_MS);
    assert.equal(fake.of('R1').length, 2, `${what}: at most 2 calls per item`);
    assert.equal(fake.of('W1').length, 1, `${what}: W1 answered at once and must not be resent`);
    assert.deepStrictEqual(byId(out, 'R1'), { id: 'R1', found: true, leads: want, conf: 0.8 }, what);
    if (loser) {
      const c = fake.of('R1')[loser - 1];
      assert.ok(c.signal && c.signal.aborted, `${what}: R1's call ${loser} lost the race and was not aborted`);
    }
    vi.useRealTimers();
  }
});

test('cutoff: at 25 s an unanswered item is AI_TIMEOUT and both its calls are aborted, while the other items keep their answers', async () => {
  cutoffAt25();   // #173: the default is 40 s now
  const items = [item('R1', { window: WIN_R1 }), item('LED1'), item('W1', { window: WIN_W1 })];
  const fake = fakeGemini(items, c => (c.id === 'LED1' ? HANG : answer(P1)));
  const s = start({ key: 'no-saved-leads', items }, fake);
  await until(() => fake.calls.length === 3, 'the 3 first calls');

  await advance(HEDGE_MS);
  assert.equal(fake.of('LED1').length, 2, 'LED1 had no answer at 12 s and was not resent');
  await advance(TIMEOUT_MS - HEDGE_MS - 1);
  assert.equal(s.done, false, 'readLeads gave up on LED1 before 25 s');
  await advance(1);
  assert.ok(s.done, 'readLeads had not answered at 25 s: the cutoff must end it');
  const out = result(s);

  assert.deepStrictEqual(out.items.map(x => x.id), ['R1', 'LED1', 'W1']);
  assert.deepStrictEqual(out.items[1], { id: 'LED1', error: 'AI_TIMEOUT' });
  assert.deepStrictEqual(out.items[0], { id: 'R1', found: true, leads: R1_P1, conf: 0.8 }, 'R1 answered in time');
  assert.equal(out.items[2].found, true, `W1 answered in time: ${JSON.stringify(out.items[2])}`);
  assert.equal(fake.of('LED1').length, 2, 'at most 2 calls per item');
  for (const c of fake.of('LED1')) assert.ok(c.signal && c.signal.aborted, `LED1's call ${c.n} was not aborted at the cutoff`);
});

test('PHOTO_HEDGE_MS and PHOTO_LEADS_TIMEOUT_MS move the resend and the cutoff', async () => {
  process.env.PHOTO_HEDGE_MS = '3000';
  process.env.PHOTO_LEADS_TIMEOUT_MS = '8000';
  const items = [item('R1', { window: WIN_R1 }), item('W1', { window: WIN_W1 })];
  const fake = fakeGemini(items, c => (c.id === 'R1' ? HANG : answer(P1)));
  const s = start({ key: 'no-saved-leads', items }, fake);
  await until(() => fake.calls.length === 2, 'the 2 first calls');
  await advance(2999);
  assert.equal(fake.of('R1').length, 1, 'R1 was resent before PHOTO_HEDGE_MS');
  await advance(1);
  assert.equal(fake.of('R1').length, 2, 'R1 was not resent at PHOTO_HEDGE_MS (3 s)');
  await advance(4999);
  assert.equal(s.done, false, 'readLeads ended before PHOTO_LEADS_TIMEOUT_MS');
  await advance(1);
  assert.ok(s.done, 'readLeads had not answered at PHOTO_LEADS_TIMEOUT_MS (8 s)');
  assert.deepStrictEqual(byId(result(s), 'R1'), { id: 'R1', error: 'AI_TIMEOUT' });
});

// ── 4. Failures ─────────────────────────────────────────────────────────────

test('a reply that fails (503, a network error, not JSON, cut off) → that item AI_FAILED while the others succeed; deepseek is never asked', async () => {
  const items = [item('R1', { window: WIN_R1 }), item('R2'), item('LED1'), item('X1'), item('W1')];
  const fails = {
    R2:   () => status(503),
    LED1: () => { throw new TypeError('fetch failed'); },
    X1:   () => geminiSays('I can not see any leads in this crop.'),
    W1:   () => reply(200, { candidates: [{ content: { parts: [{ text: '{"found":true,"leads":[["1",[5' }] }, finishReason: 'MAX_TOKENS' }] }),
  };
  const fake = fakeGemini(items, c => (fails[c.id] ? fails[c.id]() : answer(P1)));
  const out = await readAll({ key: 'no-saved-leads', items }, fake);
  assert.deepStrictEqual(out.items, [
    { id: 'R1', found: true, leads: R1_P1, conf: 0.8 },
    { id: 'R2', error: 'AI_FAILED' },
    { id: 'LED1', error: 'AI_FAILED' },
    { id: 'X1', error: 'AI_FAILED' },
    { id: 'W1', error: 'AI_FAILED' },
  ]);
  // #172: retries count too, so at most 3 (was 2: the first call and the 12 s resend).
  for (const it of items) assert.ok(fake.of(it.id).length <= 3, `${it.id}: ${fake.of(it.id).length} calls, at most 3`);
  assert.deepStrictEqual(fake.other, [], 'only Gemini is asked for leads, never deepseek');
});

// #172 changed the 503 row from 2 calls (resent at 12 s) to 3 (retried 1–2 s
// after each failure, up to 3 calls).
test('a 400, 401 or 403 from Gemini is never resent: that item is AI_FAILED after exactly 1 call, past the 12 s resend and up to the cutoff (a 503, for contrast, is retried up to 3 calls)', async () => {
  cutoffAt25();   // #173: the default is 40 s now
  for (const [code, calls] of [[400, 1], [401, 1], [403, 1], [503, 3]]) {
    const items = [item('R1', { window: WIN_R1 }), item('W1', { window: WIN_W1 })];
    // W1 hangs, so readLeads stays open until the cutoff and R1's resend timer has every chance to fire.
    const fake = fakeGemini(items, c => (c.id === 'R1' ? status(code) : HANG));
    const s = start({ key: 'no-saved-leads', items }, fake);
    await until(() => fake.calls.length === 2, `${code}: R1's and W1's first calls`);

    await advance(HEDGE_MS);
    assert.equal(fake.of('W1').length, 2, `${code}: W1 had no answer at ${HEDGE_MS / 1000} s and was not resent`);
    assert.equal(fake.of('R1').length, calls, `${code}: R1 had ${fake.of('R1').length} call(s) by ${HEDGE_MS / 1000} s, expected ${calls}`
      + (calls === 1 ? ' (a bad request or key: a resend can\'t fix it)' : ''));
    await advance(TIMEOUT_MS - HEDGE_MS);
    assert.ok(s.done, `${code}: readLeads had not answered at the ${TIMEOUT_MS / 1000} s cutoff`);
    const out = result(s);
    assert.equal(fake.of('R1').length, calls, `${code}: R1 had ${fake.of('R1').length} call(s) by the cutoff, expected ${calls}`);
    assert.deepStrictEqual(out.items, [{ id: 'R1', error: 'AI_FAILED' }, { id: 'W1', error: 'AI_TIMEOUT' }],
      `${code}: R1 failed (not timed out); W1 hung to the cutoff`);
    vi.useRealTimers();
  }
});

test('no GEMINI_API_KEY → every item AI_FAILED, readLeads still resolves, and nothing is sent', async () => {
  delete process.env.GEMINI_API_KEY;
  const items = [item('R1', { window: WIN_R1 }), item('W1', { window: WIN_W1 })];
  const fake = fakeGemini(items, () => answer(P1));
  const out = await readAll({ key: 'no-saved-leads', items }, fake);
  assert.deepStrictEqual(out.items, [{ id: 'R1', error: 'AI_FAILED' }, { id: 'W1', error: 'AI_FAILED' }]);
  assert.equal(fake.calls.length + fake.other.length, 0, `with no key nothing is sent: ${JSON.stringify(fake.calls.map(c => c.url).concat(fake.other))}`);
});

test('log hygiene: no log line carries the API key, a crop, or Gemini\'s reply', async () => {
  // Short markers: Node's JSON.parse error quotes only ~10 characters around
  // the bad token, so a longer one would be cut and slip past the check.
  const MARKERS = ['ZQXLEAD1', 'ZQXHTML2', 'ZQX5033'];
  const items = [item('R1'), item('W1'), item('X1')];
  const said = {
    R1: () => geminiSays('{"leads":[ ZQXLEAD1 ]}'),
    W1: () => ({ ...reply(200, '<html>ZQXHTML2</html>'), headers: new Headers({ 'content-type': 'text/html' }) }),
    X1: () => reply(503, 'ZQX5033 upstream detail'),
  };
  const fake = fakeGemini(items, c => said[c.id]());
  const out = await readAll({ key: 'no-saved-leads', items }, fake);
  assert.ok(out.items.every(x => x.error === 'AI_FAILED'), JSON.stringify(out.items));
  for (const line of logs) {
    for (const secret of [GEMINI_KEY, ...items.map(it => b64(it.image).slice(0, 40)), ...MARKERS]) {
      assert.ok(!line.includes(secret), `a log line carries ${secret === GEMINI_KEY ? 'the API key' : MARKERS.includes(secret) ? `the reply (${secret})` : 'a crop'}: ${line.slice(0, 200)}`);
    }
  }
});

// ── 5. Saved leads ──────────────────────────────────────────────────────────

test('a sample key with a saved file is answered from it straight away: no fetch, provider fixture, its model, its points as saved, in request order', async () => {
  const dir = tempDir('replay');
  try {
    const file = { key: 'leads-sample', model: 'gemini-recorded-1', items: SAVED_ITEMS };
    save(dir, 'leads-sample', file);
    const before = fs.readFileSync(path.join(dir, 'leads-sample.json'), 'utf8');
    // Other windows than when it was recorded: saved points are already flattened pixels.
    const items = [item('R1', { window: WIN_R1 }), item('W1', { window: WIN_W1 }), item('X9')];
    const fake = fakeGemini(items, () => answer(P1));
    const out = await readAll({ key: 'leads-sample', items }, fake, { fixturesDir: dir });

    assert.equal(fake.calls.length + fake.other.length, 0, 'a sample with saved leads must not call the AI');
    assert.equal(out.provider, 'fixture');
    assert.equal(out.model, 'gemini-recorded-1', 'a saved answer comes back with the model it recorded');
    assert.deepStrictEqual(out.items, [SAVED_ITEMS[1], SAVED_ITEMS[0], { id: 'X9', error: 'AI_FAILED' }],
      'R1 and W1 as saved, in request order; an id the file lacks is AI_FAILED');
    assert.equal(fs.readFileSync(path.join(dir, 'leads-sample.json'), 'utf8'), before, 'a replay must not rewrite the file');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PHOTO_RECORD=1: a sample key with a saved file still goes to Gemini, and the file is rewritten as { key, model, items }; a new key gets a new file', async () => {
  const dir = tempDir('record');
  try {
    process.env.PHOTO_RECORD = '1';
    save(dir, 'leads-sample', { key: 'leads-sample', model: 'stale-model', items: [] });
    const items = [item('R1', { window: WIN_R1 }), item('W1', { window: WIN_W1 })];
    const fake = fakeGemini(items, () => answer(P1));
    const out = await readAll({ key: 'leads-sample', items }, fake, { fixturesDir: dir });
    assert.equal(fake.calls.length, 2, `PHOTO_RECORD=1 must ask Gemini even with a saved file; ${fake.calls.length} calls`);
    assert.equal(out.provider, 'gemini');
    await until(() => { try { return readSaved(dir, 'leads-sample').model !== 'stale-model'; } catch { return false; } }, 'the saved file to be rewritten');
    assert.deepStrictEqual(readSaved(dir, 'leads-sample'), { key: 'leads-sample', model: DEFAULT_MODEL, items: out.items });

    const hash = sha('a photo with no sample, recorded');
    const fresh = fakeGemini(items, () => answer(P2));
    const out2 = await readAll({ key: hash, items }, fresh, { fixturesDir: dir });
    await until(() => fs.existsSync(path.join(dir, `${hash}.json`)), () => `nothing recorded at <key>.json; the folder has: ${fs.readdirSync(dir).join(', ')}`);
    assert.deepStrictEqual(readSaved(dir, hash), { key: hash, model: DEFAULT_MODEL, items: out2.items });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PHOTO_PROVIDERS=fixture replays only: no file → every item AI_FAILED; a file → its answers; a key that climbs out of the folder finds nothing; never a fetch', async () => {
  process.env.PHOTO_PROVIDERS = 'fixture';
  const root = tempDir('fixture-only');
  const dir  = path.join(root, 'leads');
  try {
    const items = [item('R1', { window: WIN_R1 }), item('W1', { window: WIN_W1 })];
    const allFailed = [{ id: 'R1', error: 'AI_FAILED' }, { id: 'W1', error: 'AI_FAILED' }];
    const fake = fakeGemini(items, () => answer(P1));

    const none = await readAll({ key: 'no-such-sample', items }, fake, { fixturesDir: dir });
    assert.deepStrictEqual(none.items, allFailed, 'no saved file: every item AI_FAILED');

    const hash = sha('a recorded photo');
    save(dir, hash, { key: hash, model: 'gemini-recorded-1', items: SAVED_ITEMS });
    const saved = await readAll({ key: hash, items }, fake, { fixturesDir: dir });
    assert.deepStrictEqual(saved.items, [SAVED_ITEMS[1], SAVED_ITEMS[0]], 'fixture mode replays a saved file, whatever the key');
    assert.equal(saved.provider, 'fixture');

    // path.join(dir, '../escape.json') is a real file outside the folder.
    save(root, 'escape', { key: 'escape', model: 'gemini-recorded-1', items: SAVED_ITEMS });
    const escaped = await readAll({ key: '../escape', items }, fake, { fixturesDir: dir });
    assert.deepStrictEqual(escaped.items, allFailed, 'a key is an id, never a path');

    assert.equal(fake.calls.length + fake.other.length, 0, 'PHOTO_PROVIDERS=fixture never calls the AI');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('live, with a saved file for an image-hash key: the items Gemini answers are live, an item that fails takes that id\'s saved answer', async () => {
  const dir = tempDir('live-fallback');
  try {
    const hash = sha('a photo with no sample');
    save(dir, hash, { key: hash, model: 'gemini-recorded-1', items: SAVED_ITEMS });
    const items = [item('R1', { window: WIN_R1 }), item('W1', { window: WIN_W1 })];
    const fake = fakeGemini(items, c => (c.id === 'W1' ? status(503) : answer(P2)));
    const out = await readAll({ key: hash, items }, fake, { fixturesDir: dir });
    assert.equal(fake.of('R1').length, 1, 'an image hash with a saved file still goes live first');
    assert.deepStrictEqual(out.items, [{ id: 'R1', found: true, leads: R1_P2, conf: 0.8 }, SAVED_ITEMS[0]],
      'R1 live; W1 failed, so it takes its saved answer');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('live, with a saved file for an image-hash key: an item whose calls hang past the 25 s cutoff takes that id\'s saved answer, not AI_TIMEOUT; an item the file lacks is AI_TIMEOUT', async () => {
  cutoffAt25();   // #173: the default is 40 s now
  const dir = tempDir('timeout-fallback');
  try {
    const hash = sha('a photo with no sample, Gemini hangs');
    save(dir, hash, { key: hash, model: 'gemini-recorded-1', items: SAVED_ITEMS });
    const items = [item('R1', { window: WIN_R1 }), item('X9')];
    const fake = fakeGemini(items, () => HANG);
    const s = start({ key: hash, items }, fake, { fixturesDir: dir });
    await until(() => fake.calls.length === 2, 'R1\'s and X9\'s first calls: an image hash with a saved file still goes live first');

    await advance(TIMEOUT_MS - 1);
    assert.equal(s.done, false, 'readLeads answered before the cutoff while every call hung');
    await advance(1);
    assert.ok(s.done, `readLeads had not answered at the ${TIMEOUT_MS / 1000} s cutoff`);
    assert.deepStrictEqual(result(s).items, [SAVED_ITEMS[1], { id: 'X9', error: 'AI_TIMEOUT' }],
      'R1 timed out live, so it takes its saved answer; X9 has none, so it stays AI_TIMEOUT');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PHOTO_RECORD=1 with every live call failing writes nothing: a saved file is left byte-identical, and a new key gets no file', async () => {
  const dir = tempDir('record-nothing');
  try {
    process.env.PHOTO_RECORD = '1';
    const items = [item('R1', { window: WIN_R1 }), item('W1', { window: WIN_W1 })];
    const fail = c => {
      if (c.id === 'W1') throw new TypeError('fetch failed');
      return status(503);
    };

    save(dir, 'leads-sample', { key: 'leads-sample', model: 'gemini-recorded-1', items: SAVED_ITEMS });
    const file = path.join(dir, 'leads-sample.json');
    const before = fs.readFileSync(file);
    const fake = fakeGemini(items, fail);
    await readAll({ key: 'leads-sample', items }, fake, { fixturesDir: dir });
    assert.ok(fake.of('R1').length > 0 && fake.of('W1').length > 0, `PHOTO_RECORD=1 must go live even with a saved file; ${fake.calls.length} calls`);
    assert.ok(fs.readFileSync(file).equals(before),
      `the saved file was rewritten although no item was answered live:\n${fs.readFileSync(file, 'utf8').slice(0, 300)}`);

    const hash = sha('a photo with no sample, every call fails');
    const fresh = fakeGemini(items, fail);
    const out = await readAll({ key: hash, items }, fresh, { fixturesDir: dir });
    assert.ok(fresh.calls.length > 0, 'PHOTO_RECORD=1 must go live for a new key');
    assert.deepStrictEqual(out.items, [{ id: 'R1', error: 'AI_FAILED' }, { id: 'W1', error: 'AI_FAILED' }]);
    assert.deepStrictEqual(fs.readdirSync(dir), ['leads-sample.json'],
      `nothing is recorded when no item was answered live; the folder has: ${fs.readdirSync(dir).join(', ')}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── 6. The golden crop prompt ───────────────────────────────────────────────

// What Gemini is sent for each crop, as the golden file holds it.
function renderCropPrompts(fake) {
  const text = id => {
    const c = fake.of(id)[0];
    assert.ok(c, `no call carried ${id}'s crop`);
    return sentText(c.body);
  };
  return ['--- resistor ---', text('R1'), '--- wire ---', text('W1')].join('\n') + '\n';
}

test('the crop prompt is exactly the golden (fixtures/prompts/photo-crop.txt): a resistor (470) and a wire', async () => {
  const items = [
    { id: 'R1', kind: 'part', type: 'resistor', value: 470, image: crop('R1|'), window: WIN_R1 },
    { id: 'W1', kind: 'wire', type: 'wire', value: 0, image: crop('W1|'), window: WIN_W1 },
  ];
  const fake = fakeGemini(items, () => answer(P1));
  await readAll({ key: 'no-saved-leads', items }, fake);
  const actual = renderCropPrompts(fake);
  if (UPDATE) {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, actual);
    return;
  }
  if (!fs.existsSync(GOLDEN)) {
    assert.fail('The golden file test/fixtures/prompts/photo-crop.txt is missing. Run UPDATE_GOLDEN=1 npm test to create it, review it, and commit it.');
  }
  const expected = fs.readFileSync(GOLDEN, 'utf8');
  const exp = expected.split('\n'), act = actual.split('\n');
  let i = 0;
  while (i < exp.length && i < act.length && exp[i] === act[i]) i++;
  if (expected !== actual) {
    assert.fail('The crop prompt changed. If this is intended, run UPDATE_GOLDEN=1 npm test and review the diff.\n'
      + `photo-crop.txt line ${i + 1}:\n  golden: ${exp[i]}\n  sent:   ${act[i]}`);
  }
});

// ── 7. The route ────────────────────────────────────────────────────────────

let ipCount = 0;
const freshIp = () => `10.159.${Math.floor(++ipCount / 250)}.${ipCount % 250 + 1}`;

// POSTs `body` (an object, or a raw string) from `ip`. Destroyed after `ms`
// so a hung server fails the assertion, not the runner. `accept` (#173) sets
// the Accept header; none is sent by default.
function post(urlPath, body, { ip = freshIp(), ms = 5000, accept } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const started = Date.now();
  let req;
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text), 'X-Forwarded-For': ip };
    if (accept) headers.Accept = accept;
    req = http.request({ host: '127.0.0.1', port, path: urlPath, method: 'POST', headers }, res => {
      let out = '';
      res.on('data', c => { out += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(out); } catch { /* not JSON: a 404 page, say */ }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: out, ms: Date.now() - started });
      });
    });
    req.on('error', reject);
    const timer = setTimeout(() => { req.destroy(); reject(new Error(`${urlPath} had no answer after ${ms} ms`)); }, ms);
    req.on('close', () => clearTimeout(timer));
    req.end(text);
  });
}
const postLeads = (body, opts) => post('/api/photo/leads', body, opts);

// No key, and a global fetch that records and fails: no AI is reached.
function offline() {
  delete process.env.GEMINI_API_KEY;
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async url => { calls.push(String(url)); throw new TypeError('the test network is off'); }));
  return calls;
}

// A valid request: a JPEG resistor crop and a PNG wire crop, at the board's corner (x 0, y 0).
const validBody = (key = 'no-saved-leads') => ({ key, items: [
  { id: 'R1', kind: 'part', type: 'resistor', value: 470, image: crop('R1|', 'image/jpeg', 300), window: { ...WIN } },
  { id: 'W1', kind: 'wire', type: 'wire', value: 0, image: crop('W1|', 'image/png', 300), window: { ...WIN } },
] });
const manyItems = n => Array.from({ length: n }, (_, i) => ({ id: `R${i + 1}`, kind: 'part', type: 'resistor', value: 0,
  image: crop(`r${i}|`, 'image/jpeg', 120), window: { ...WIN } }));

function assertBadItems(res, what) {
  assert.equal(res.status, 400, `${what}: expected 400 BAD_ITEMS, got ${res.status}: ${res.raw.slice(0, 200)}`);
  assert.ok(res.body, `${what}: the 400 body isn't JSON: ${res.raw.slice(0, 200)}`);
  assert.equal(res.body.code, 'BAD_ITEMS', `${what}: ${JSON.stringify(res.body)}`);
  assert.equal(typeof res.body.reply, 'string', `${what}: an error body is { reply, code }: ${JSON.stringify(res.body)}`);
}

test('route: a valid request with no key → 200 { items, provider, model, ms }, every item AI_FAILED, in order, nothing sent', async () => {
  const calls = offline();
  const res = await postLeads(validBody());
  assert.equal(res.status, 200, `a valid request is always 200; got ${res.status}: ${res.raw.slice(0, 200)}`);
  assert.deepStrictEqual(res.body.items, [{ id: 'R1', error: 'AI_FAILED' }, { id: 'W1', error: 'AI_FAILED' }]);
  assert.ok('provider' in res.body && 'model' in res.body, `the 200 body has provider and model: ${JSON.stringify(res.body)}`);
  assert.equal(typeof res.body.ms, 'number', `ms: ${res.body.ms}`);
  assert.deepStrictEqual(calls, [], 'no key: nothing is sent');
});

test('route: 400 BAD_ITEMS for no items or more than 24; 24 are read', async () => {
  offline();
  const bad = [
    ['items missing', { key: 'no-saved-leads' }],
    ['items empty', { key: 'no-saved-leads', items: [] }],
    ['items not a list', { key: 'no-saved-leads', items: 'R1' }],
    ['25 items', { key: 'no-saved-leads', items: manyItems(25) }],
  ];
  for (const [what, body] of bad) assertBadItems(await postLeads(body), what);

  const ok = await postLeads({ key: 'no-saved-leads', items: manyItems(24) });
  assert.equal(ok.status, 200, `24 items got ${ok.status}: ${ok.raw.slice(0, 200)}`);
  assert.equal(ok.body.items.length, 24);
});

test('route: 400 BAD_ITEMS when an item\'s image is not a JPEG or PNG data URL', async () => {
  offline();
  const bad = [
    ['missing', undefined],
    ['a text data URL', 'data:text/plain;base64,aGVsbG8='],
    ['a GIF data URL', 'data:image/gif;base64,R0lGODlhAQABAAAAACw='],
    ['a plain URL', 'https://example.com/crop.jpg'],
    ['not a string', 42],
  ];
  for (const [what, image] of bad) {
    const body = validBody();
    body.items[1].image = image;   // the second item: every item is checked
    assertBadItems(await postLeads(body), `image ${what}`);
  }
});

test('route: 400 BAD_ITEMS when a window field is not a finite number or scale ≤ 0', async () => {
  offline();
  const without = k => { const w = { ...WIN }; delete w[k]; return w; };
  const bad = [
    ['no window', undefined],
    ['x a string', { ...WIN, x: '10' }],
    ['y null', { ...WIN, y: null }],
    ['padLeft missing', without('padLeft')],
    ['padTop a boolean', { ...WIN, padTop: true }],
    ['width missing', without('width')],
    ['height a string', { ...WIN, height: '400' }],
    ['scale 0', { ...WIN, scale: 0 }],
    ['scale negative', { ...WIN, scale: -3 }],
  ];
  for (const [what, window] of bad) {
    const body = validBody();
    body.items[1].window = window;
    assertBadItems(await postLeads(body), `window ${what}`);
  }
  // JSON's 1e999 parses to Infinity: a number, but not a finite one.
  const body = validBody();
  body.items[0].window = { ...WIN, x: 123456 };
  assertBadItems(await postLeads(JSON.stringify(body).replace('"x":123456', '"x":1e999')), 'window x Infinity');
});

test('route: a body over 6 MB → 413 TOO_LARGE; a 5 MB body (over /api/photo\'s 4 MB) is read', async () => {
  offline();
  const big = validBody();
  big.items[0].image = crop('big|', 'image/jpeg', Math.floor(4.8 * 1024 * 1024));   // ~6.4 MB as base64
  const tooLarge = await postLeads(big, { ms: 15000 });
  assert.equal(tooLarge.status, 413, `a ~6.4 MB body got ${tooLarge.status}: ${tooLarge.raw.slice(0, 200)}`);
  assert.equal(tooLarge.body && tooLarge.body.code, 'TOO_LARGE', JSON.stringify(tooLarge.body));

  const ok = validBody();
  ok.items[0].image = crop('ok|', 'image/jpeg', Math.floor(3.7 * 1024 * 1024));     // ~4.9 MB as base64
  const read = await postLeads(ok, { ms: 15000 });
  assert.equal(read.status, 200, `a ~4.9 MB body got ${read.status}: ${read.raw.slice(0, 200)}`);
});

test('route: 429 on the 7th request in a minute from one IP; other IPs, and /api/photo, keep their own count', async () => {
  offline();
  const ip = '10.159.250.7';
  for (let n = 1; n <= 6; n++) {
    const res = await postLeads(validBody(), { ip });
    assert.equal(res.status, 200, `request ${n} of 6 got ${res.status}: ${res.raw.slice(0, 200)}`);
  }
  const seventh = await postLeads(validBody(), { ip });
  assert.equal(seventh.status, 429, `the 7th request in a minute got ${seventh.status}`);
  assert.equal(typeof (seventh.body && seventh.body.reply), 'string', `the 429 body: ${seventh.raw.slice(0, 200)}`);

  assert.equal((await postLeads(validBody(), { ip: '10.159.250.8' })).status, 200, 'the limit is per IP');
  assert.notEqual((await post('/api/photo', { image: 'not an image' }, { ip })).status, 429, 'leads requests must not use up /api/photo\'s limit');

  const ip2 = '10.159.250.9';
  for (let n = 1; n <= 6; n++) await post('/api/photo', { image: 'not an image' }, { ip: ip2 });
  assert.equal((await postLeads(validBody(), { ip: ip2 })).status, 200, '/api/photo requests must not use up the leads limit');
});

test('route: one [photo-leads] log line per request, with the key and counts, never a crop', async () => {
  offline();
  const body = validBody('leads-log-test');
  const res = await postLeads(body);
  assert.equal(res.status, 200, `status ${res.status}: ${res.raw.slice(0, 200)}`);
  await new Promise(r => setTimeout(r, 20));   // a log written just after the reply
  const lines = logs.filter(l => l.startsWith('[photo-leads]'));
  assert.equal(lines.length, 1, `${lines.length} [photo-leads] lines: ${JSON.stringify(logs)}`);
  assert.match(lines[0], /\bkey=leads-log-test\b/);
  assert.match(lines[0], /\bitems=2\b/);
  assert.match(lines[0], /\bfailed=2\b/);
  for (const l of logs) {
    for (const it of body.items) assert.ok(!l.includes('data:image') && !l.includes(b64(it.image).slice(0, 60)), `a log line carries a crop: ${l.slice(0, 160)}`);
  }
});

test('.env.example lists PHOTO_HEDGE_MS, PHOTO_LEADS_TIMEOUT_MS and PHOTO_LEADS_CONCURRENCY (#172)', () => {
  const text = fs.readFileSync(path.join(__dirname, '../../.env.example'), 'utf8');
  for (const name of ['PHOTO_HEDGE_MS', 'PHOTO_LEADS_TIMEOUT_MS', 'PHOTO_LEADS_CONCURRENCY']) assert.match(text, new RegExp(`^${name}=`, 'm'), `.env.example has no ${name}=`);
});

// ── 8. Retries and the cap in flight (#172) ─────────────────────────────────
// 24 crops in flight drew 503s and some 429s from Gemini, and
// an early failure sat idle until the 12 s resend. Now it is retried 1–2 s
// later, and at most PHOTO_LEADS_CONCURRENCY (16) first calls and retries
// are out at once. The live check then had 9 of 13 crops time out with no
// 503 at all: the calls were slow, and with a cap of 10 their stall resends
// queued behind waiting items and never went out. So a resend is never
// queued and never counts toward the cap.

const ids  = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `R${from + i}`);
const LONG = 3600000;   // a post() guard the fake clock never reaches

test('#172 bug: an item whose first call fails at once (503, 500, 429, a network error, an empty reply, invalid JSON) is retried 1–2 s later, not at the 12 s resend, and its retry answers', async () => {
  const FAILS = [
    ['a 503', () => status(503)],
    ['a 500', () => status(500)],
    ['a 429', () => status(429)],
    ['a network error', () => { throw new TypeError('fetch failed'); }],
    ['an empty reply', () => geminiSays('')],
    ['invalid JSON', () => geminiSays('I can not see any leads in this crop.')],
  ];
  for (const [what, bad] of FAILS) {
    const items = [item('R1', { window: WIN_R1 }), item('W1', { window: WIN_W1 })];
    const fake = fakeGemini(items, c => (c.id !== 'R1' ? answer(P1) : c.n === 1 ? bad() : answer(P2)));
    const s = start({ key: 'no-saved-leads', items }, fake);
    await until(() => fake.calls.length === 2, `${what}: R1's and W1's first calls`);
    await advance(999);
    assert.equal(fake.of('R1').length, 1, `${what}: R1 was retried sooner than 1 s after the failure`);
    await advance(1001);
    assert.equal(fake.of('R1').length, 2, `${what}: R1's failure was not retried within 2 s (${fake.of('R1').length} call so far; an early failure no longer waits for the 12 s resend)`);
    assert.deepStrictEqual(fake.of('R1')[1].body, fake.of('R1')[0].body, `${what}: the retry is the same request`);
    const out = await finish(s);
    assert.deepStrictEqual(byId(out, 'R1'), { id: 'R1', found: true, leads: R1_P2, conf: 0.8 }, `${what}: the retry's answer`);
    assert.ok(out.ms <= 2500, `${what}: readLeads took ${out.ms} ms; R1's retry answered by 2 s`);
    assert.equal(fake.of('W1').length, 1, `${what}: W1 answered at once`);
    vi.useRealTimers();
  }
});

// #172 follow-up: the default cap went from 10 to 16.
test('#172 bug: with 24 items, only the first PHOTO_LEADS_CONCURRENCY (default 16) calls go out, and each queued item starts, in item order, the moment a call ends; never more than 16 in flight', async () => {
  const items = ids(1, 24).map(id => item(id));
  // Ri answers 5 s + i × 100 ms after its call went out: R1 at 5.1 s, R2 at 5.2 s, …
  const fake = fakeGemini(items, c => after(5000 + 100 * Number(c.id.slice(1)), answer(P1)));
  const s = start({ key: 'no-saved-leads', items }, fake);
  const sent = () => fake.calls.map(c => c.id);
  await until(() => fake.calls.length >= 16, () => `only ${fake.calls.length} calls went out at the start; the default PHOTO_LEADS_CONCURRENCY is 16`);
  await flush();
  assert.deepStrictEqual(sent(), ids(1, 16), `at the start only R1–R16 go out, in item order; ${fake.calls.length} calls went out`);
  await advance(5099);
  assert.deepStrictEqual(sent(), ids(1, 16), 'no call has ended before 5.1 s, so no queued item goes out');
  await advance(1);
  assert.deepStrictEqual(sent(), ids(1, 17), 'R1 answered at 5.1 s, and R17, next in item order, went out at once');
  await advance(700);
  assert.deepStrictEqual(sent(), ids(1, 24), 'by 5.8 s R2–R8 answered one at a time, and R18–R24 went out in item order');
  const out = await finish(s);
  assert.equal(fake.maxInFlight, 16, `${fake.maxInFlight} calls were in flight at once; at most PHOTO_LEADS_CONCURRENCY (16), and the cap is used`);
  assert.deepStrictEqual(out.items.map(x => x.id), ids(1, 24), 'one entry per item, in request order');
  assert.ok(out.items.every(x => x.found === true), `unanswered: ${JSON.stringify(out.items.filter(x => x.found !== true))}`);
  for (const it of items) assert.equal(fake.of(it.id).length, 1, `${it.id}: answered within 12 s of its call going out, so no resend (its 12 s run from when its call went out)`);
});

// #172 follow-up: was "never more than the cap in flight, resends included".
// Now a stall resend goes out on time even when the cap is full, while the
// queued items keep waiting for a first-call slot.
test('#172 bug: with 24 items whose calls all hang, the first PHOTO_LEADS_CONCURRENCY calls (default 16, or 3 when set) go out; at 12 s each gets its stall resend at once although the cap is full, while the queued items still wait; at the 25 s cutoff every item is AI_TIMEOUT, in order, with every call aborted', async () => {
  cutoffAt25();   // #173: the default is 40 s now
  for (const [what, env, cap] of [['default', undefined, 16], ['PHOTO_LEADS_CONCURRENCY=3', '3', 3]]) {
    if (env === undefined) delete process.env.PHOTO_LEADS_CONCURRENCY;
    else process.env.PHOTO_LEADS_CONCURRENCY = env;
    const items = ids(1, 24).map(id => item(id));
    const fake = fakeGemini(items, () => HANG);
    const s = start({ key: 'no-saved-leads', items }, fake);
    const sent = () => fake.calls.map(c => c.id);
    await until(() => fake.calls.length >= cap, () => `${what}: only ${fake.calls.length} calls went out at the start, expected ${cap}`);
    await flush();
    assert.deepStrictEqual(sent(), ids(1, cap), `${what}: at the start only R1–R${cap} go out, in item order; ${fake.calls.length} calls went out`);
    await advance(HEDGE_MS - 1);
    assert.deepStrictEqual(sent(), ids(1, cap), `${what}: nothing else went out before 12 s`);
    await advance(1);
    assert.deepStrictEqual(sent(), [...ids(1, cap), ...ids(1, cap)],
      `${what}: at 12 s R1–R${cap} had no answer and each got its stall resend at once, although the cap was full; R${cap + 1}–R24 still wait for a first-call slot. Sent: ${sent().join(' ')}`);
    for (const id of ids(1, cap)) assert.deepStrictEqual(fake.of(id)[1].body, fake.of(id)[0].body, `${what}: ${id}'s resend is not identical`);
    assert.equal(fake.maxCapped, cap, `${what}: ${fake.maxCapped} first calls and retries were in flight at once; the cap is ${cap}, resends aside`);
    await advance(TIMEOUT_MS - HEDGE_MS - 1);
    assert.equal(s.done, false, `${what}: readLeads ended before the cutoff`);
    assert.equal(fake.calls.length, 2 * cap, `${what}: only the ${cap} first calls and their ${cap} resends go out before the cutoff; sent: ${sent().join(' ')}`);
    await advance(1);
    assert.ok(s.done, `${what}: readLeads had not answered at the ${TIMEOUT_MS / 1000} s cutoff`);
    assert.deepStrictEqual(result(s).items, items.map(it => ({ id: it.id, error: 'AI_TIMEOUT' })), `${what}: every item unanswered or still queued at the cutoff is AI_TIMEOUT, in request order`);
    for (const c of fake.calls) assert.ok(c.signal && c.signal.aborted, `${what}: ${c.id}'s call ${c.n} was not aborted at the cutoff`);
    vi.useRealTimers();
  }
});

// A resend that went out on time but still took a slot would hold back the
// queued items: here R3 must start when R2's first call ends, with R1's first
// call and resend both still in flight.
test('#172 bug: a stall resend never counts toward PHOTO_LEADS_CONCURRENCY: when a first call ends, the next queued item starts at once even with resends in flight', async () => {
  process.env.PHOTO_LEADS_CONCURRENCY = '2';
  const items = ['R1', 'R2', 'R3'].map(id => item(id));
  // R1 never answers. R2's first call answers at 13 s, after its 12 s resend
  // (which hangs) went out. R3 answers at once.
  const fake = fakeGemini(items, c => (c.id === 'R1' ? HANG : c.id === 'R3' ? answer(P1) : c.n === 1 ? after(13000, answer(P1)) : HANG));
  const s = start({ key: 'no-saved-leads', items }, fake);
  const sent = () => fake.calls.map(c => c.id);
  await until(() => fake.calls.length >= 2, 'R1\'s and R2\'s first calls');
  await flush();
  assert.deepStrictEqual(sent(), ['R1', 'R2'], 'with the cap at 2, R3 waits');
  await advance(HEDGE_MS);
  assert.deepStrictEqual(sent(), ['R1', 'R2', 'R1', 'R2'],
    `at 12 s R1 and R2 each got their stall resend at once, although the cap was full, and R3 still waits; sent: ${sent().join(' ')}`);
  await advance(1000);
  assert.deepStrictEqual(sent(), ['R1', 'R2', 'R1', 'R2', 'R3'],
    `at 13 s R2 answered, freeing its first-call slot, so R3 went out at once, although R1's first call and resend are still in flight; sent: ${sent().join(' ')}`);
  assert.ok(fake.of('R2')[1].signal && fake.of('R2')[1].signal.aborted, 'R2\'s resend lost the race and was not aborted');
  const out = await finish(s);
  assert.deepStrictEqual(out.items.map(x => x.error || (x.found ? 'found' : 'not found')), ['AI_TIMEOUT', 'found', 'found'],
    `R1 hung to the cutoff; R2 and R3 answered: ${JSON.stringify(out.items)}`);
  assert.equal(fake.maxCapped, 2, `${fake.maxCapped} first calls were in flight at once; the cap is 2, resends aside`);
});

test('#172: at most 3 calls per item, retries and the stall resend together: an item that fails every time is AI_FAILED after exactly 3 calls; with stalls in the mix, never more than 3', async () => {
  const always = [
    ['503 every time', () => status(503)],
    ['429 every time', () => status(429)],
    ['a network error every time', () => { throw new TypeError('fetch failed'); }],
  ];
  for (const [what, bad] of always) {
    const items = [item('R1', { window: WIN_R1 }), item('W1', { window: WIN_W1 })];
    const fake = fakeGemini(items, c => (c.id === 'R1' ? bad() : answer(P1)));
    const s = start({ key: 'no-saved-leads', items }, fake);
    await until(() => fake.calls.length === 2, `${what}: R1's and W1's first calls`);
    for (let t = 0; t < 10000; t += 500) await advance(500);
    assert.equal(fake.of('R1').length, 3, `${what}: R1 had ${fake.of('R1').length} call(s) in 10 s; each failure is retried 1–2 s later, up to 3 calls`);
    assert.ok(s.done, `${what}: R1's 3rd call failed, so it is AI_FAILED and readLeads answers`);
    assert.deepStrictEqual(byId(result(s), 'R1'), { id: 'R1', error: 'AI_FAILED' }, what);
    await advance(TIMEOUT_MS);
    assert.equal(fake.of('R1').length, 3, `${what}: R1 had ${fake.of('R1').length} calls; at most 3`);
    vi.useRealTimers();
  }

  cutoffAt25();   // #173: the default is 40 s now; these end at the cutoff, within finish()'s 40 s
  const mixed = [
    ['the first call hangs, every other one is a 503', c => (c.n === 1 ? HANG : status(503))],
    ['every call answers a 503 after 13 s', () => after(13000, status(503))],
    ['every call hangs', () => HANG],
  ];
  for (const [what, r1] of mixed) {
    const items = [item('R1', { window: WIN_R1 }), item('W1', { window: WIN_W1 })];
    const fake = fakeGemini(items, c => (c.id === 'R1' ? r1(c) : answer(P1)));
    const out = await readAll({ key: 'no-saved-leads', items }, fake);
    assert.ok(fake.of('R1').length <= 3, `${what}: R1 had ${fake.of('R1').length} calls; at most 3`);
    assert.ok(byId(out, 'R1').error, `${what}: R1 never answered: ${JSON.stringify(byId(out, 'R1'))}`);
    vi.useRealTimers();
  }
});

// Runs the fake clock in 250 ms steps until the request answers, letting the
// real socket I/O through between steps.
async function drive(pending, limitMs = 60000) {
  let done = false, res, err;
  pending.then(r => { done = true; res = r; }, e => { done = true; err = e; });
  for (let t = 0; t < limitMs && !done; t += 250) await advance(250);
  await until(() => done, `no response after ${limitMs / 1000} s on the fake clock`);
  if (err) throw err;
  return res;
}

test('#172: route: the [photo-leads] line counts retries: R1\'s first call a 503 and its retry answering → retries=1; a round with no failure → retries=0', async () => {
  const cases = [
    ['R1 retried once', c => (c.id === 'R1' && c.n === 1 ? status(503) : answer(P1)), 1],
    ['no failure', () => answer(P1), 0],
  ];
  for (const [what, answerFor, retries] of cases) {
    const body = validBody(`leads-retry-${retries}`);
    const fake = fakeGemini(body.items, answerFor);
    vi.stubGlobal('fetch', fake.fetch);
    vi.useFakeTimers(FAKE);
    logs.length = 0;
    const res = await drive(postLeads(body, { ms: LONG }));
    const line = logs.find(l => l.startsWith('[photo-leads]')) || '(no [photo-leads] line)';
    assert.match(line, new RegExp(`\\bretries=${retries}\\b`), `${what}: the [photo-leads] line has no retries=${retries}: ${line}`);
    assert.equal(res.status, 200, `${what}: status ${res.status}: ${res.raw.slice(0, 200)}`);
    assert.ok(res.body.items.every(x => x.found === true), `${what}: ${JSON.stringify(res.body.items)}`);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

// Review fix: a first call that loses to its resend ends by being aborted (a
// rejected promise). Its slot must still be freed, or the queued items wait
// for the cutoff.
test('#172: PHOTO_LEADS_CONCURRENCY=1: R1\'s first call stalls, its resend wins at 12 s and the first call is aborted; that frees the slot, so R2\'s first call goes out right then (not at the cutoff), and both items are answered', async () => {
  process.env.PHOTO_LEADS_CONCURRENCY = '1';
  const items = [item('R1', { window: WIN_R1 }), item('R2', { window: WIN_R1 })];
  const fake = fakeGemini(items, c => (c.id === 'R1' ? (c.n === 1 ? HANG : answer(P2)) : answer(P1)));
  const s = start({ key: 'no-saved-leads', items }, fake);
  const sent = () => fake.calls.map(c => c.id);
  await until(() => fake.calls.length >= 1, 'R1\'s first call');
  await flush();
  assert.deepStrictEqual(sent(), ['R1'], 'with the cap at 1, R2 waits');
  await advance(HEDGE_MS - 1);
  assert.deepStrictEqual(sent(), ['R1'], 'nothing else went out before 12 s');
  await advance(1);
  assert.ok(fake.of('R1')[0].signal && fake.of('R1')[0].signal.aborted, 'R1\'s first call lost to its resend and was not aborted');
  assert.deepStrictEqual(sent(), ['R1', 'R1', 'R2'],
    `at 12 s R1's resend answered and its aborted first call freed the slot, so R2's first call went out at once; sent: ${sent().join(' ')}`);
  assert.ok(s.done, `readLeads had not answered at 12 s, though R2 answered at once: ${JSON.stringify(s.value || s.error || 'still running')}`);
  const out = result(s);
  assert.deepStrictEqual(out.items, [{ id: 'R1', found: true, leads: R1_P2, conf: 0.8 }, { id: 'R2', found: true, leads: R1_P1, conf: 0.8 }],
    'R1 answered by its resend, R2 by its first call');
  assert.ok(out.ms < TIMEOUT_MS, `readLeads took ${out.ms} ms`);
});

// ── 9. Answers as they come: onItem and the streamed route (#173) ───────────
// The page waited for the whole crop round (up to 25 s, often all of it)
// behind "placing legs…" before showing anything. Now the confirm screen
// opens after the box round and each part's legs snap in as its crop
// answers: readLeads reports each item as it settles (opts.onItem), and the
// route streams those as NDJSON lines when the page asks for them.

const NDJSON = 'application/x-ndjson';
// W1's P1 in WIN_W1: x = 1200.5 + (250/1000·700 − 45) / 2.5 = 1252.5 and
// 1200.5 + (750/1000·700 − 45) / 2.5 = 1392.5; y = 80 + (500/1000·1000 − 45) / 2.5 = 262.
const W1_P1 = [{ pin: '1', pt: [1252.5, 262], role: 'none' }, { pin: '2', pt: [1392.5, 262], role: 'none' }];

// The complete lines of an NDJSON body so far, parsed (a line still being
// written is left out until the body ends).
function lines(s) {
  const done = s.ended ? s.raw : s.raw.slice(0, s.raw.lastIndexOf('\n') + 1);
  return done.split('\n').filter(l => l.trim()).map(l => {
    try { return JSON.parse(l); } catch { return assert.fail(`a streamed line is not JSON: ${l.slice(0, 200)}`); }
  });
}

// POSTs `body` and keeps what has arrived so far, for watching a stream on
// the fake clock: s.status and s.headers once the head arrives, s.raw, s.ended.
function openPost(urlPath, body, { ip = freshIp(), accept } = {}) {
  const text = JSON.stringify(body);
  const s = { status: null, headers: null, raw: '', ended: false, error: null };
  const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text), 'X-Forwarded-For': ip };
  if (accept) headers.Accept = accept;
  const req = http.request({ host: '127.0.0.1', port, path: urlPath, method: 'POST', headers }, res => {
    s.status = res.statusCode;
    s.headers = res.headers;
    res.setEncoding('utf8');
    res.on('data', c => { s.raw += c; });
    res.on('end', () => { s.ended = true; });
  });
  req.on('error', e => { s.error = e; s.ended = true; });
  req.end(text);
  s.destroy = () => req.destroy();
  return s;
}

test('#173: PHOTO_LEADS_TIMEOUT_MS defaults to 40 s (was 25 s; the confirm screen no longer waits on it): every call hanging, readLeads is still open just before 40 s and every item is AI_TIMEOUT at 40 s', async () => {
  const items = [item('R1', { window: WIN_R1 }), item('W1', { window: WIN_W1 })];
  const fake = fakeGemini(items, () => HANG);
  const s = start({ key: 'no-saved-leads', items }, fake);
  await until(() => fake.calls.length === 2, 'R1\'s and W1\'s first calls');
  await advance(DEFAULT_CUTOFF_MS - 1);
  assert.equal(s.done, false, `readLeads gave up before the ${DEFAULT_CUTOFF_MS / 1000} s default cutoff (${s.value ? JSON.stringify(s.value.items) : ''}); the old default was 25 s`);
  await advance(1);
  assert.ok(s.done, `readLeads had not answered at the ${DEFAULT_CUTOFF_MS / 1000} s default cutoff`);
  assert.deepStrictEqual(result(s).items, [{ id: 'R1', error: 'AI_TIMEOUT' }, { id: 'W1', error: 'AI_TIMEOUT' }]);
});

test('#173: readLeads calls opts.onItem(entry) once per id as each item settles, in finish order (X1\'s 400 AI_FAILED at once, W1 at 1 s, R1 at 3 s, LED1 AI_TIMEOUT at the cutoff), each before readLeads resolves and each the entry `items` holds; the resolved items stay in request order', async () => {
  process.env.PHOTO_LEADS_TIMEOUT_MS = '8000';   // under the 12 s resend: one call an item
  const items = [item('R1', { window: WIN_R1 }), item('LED1'), item('W1', { window: WIN_W1 }), item('X1')];
  const says = { R1: () => after(3000, answer(P1)), W1: () => after(1000, answer(P1)), X1: () => status(400), LED1: () => HANG };
  const fake = fakeGemini(items, c => says[c.id]());
  vi.useFakeTimers(FAKE);
  const t0 = Date.now(), seen = [], run = {};
  const s = start({ key: 'no-saved-leads', items }, fake, {
    onItem: e => seen.push({ at: Date.now() - t0, resolved: run.s ? run.s.done : false, entry: JSON.parse(JSON.stringify(e)) }),
  });
  run.s = s;
  const ids = () => seen.map(x => x.entry && x.entry.id);
  await until(() => fake.calls.length === 4, 'the 4 first calls');
  await flush();
  assert.deepStrictEqual(ids(), ['X1'], `X1's 400 settles it at once (AI_FAILED, never resent), so onItem reports it first and alone; onItem got ${JSON.stringify(ids())}`);
  await advance(1000);
  assert.deepStrictEqual(ids(), ['X1', 'W1'], 'W1 answered at 1 s: reported then');
  await advance(2000);
  assert.deepStrictEqual(ids(), ['X1', 'W1', 'R1'], 'R1 answered at 3 s: reported then');
  await advance(4999);
  assert.deepStrictEqual(ids(), ['X1', 'W1', 'R1'], 'LED1 is still out before the 8 s cutoff');
  assert.equal(s.done, false, 'readLeads is still open while LED1 is out');
  await advance(1);
  await flush();
  assert.deepStrictEqual(ids(), ['X1', 'W1', 'R1', 'LED1'], 'LED1 is reported at the cutoff');
  const out = result(s);

  assert.deepStrictEqual(seen.map(x => x.at), [0, 1000, 3000, 8000], 'each reported as it settled, on the fake clock');
  for (const x of seen.slice(0, 3)) assert.equal(x.resolved, false, `${x.entry.id}: reported as it settled, before readLeads resolved`);
  assert.deepStrictEqual(seen.map(x => x.entry), [
    { id: 'X1', error: 'AI_FAILED' },
    { id: 'W1', found: true, leads: W1_P1, conf: 0.8 },
    { id: 'R1', found: true, leads: R1_P1, conf: 0.8 },
    { id: 'LED1', error: 'AI_TIMEOUT' },
  ], 'the shapes are the response\'s, unchanged');
  for (const x of seen) assert.deepStrictEqual(x.entry, byId(out, x.entry.id), `${x.entry.id}: onItem's entry is the one the resolved items hold`);
  assert.deepStrictEqual(out.items.map(x => x.id), ['R1', 'LED1', 'W1', 'X1'], 'the resolved items stay in request order');
  await advance(DEFAULT_CUTOFF_MS);
  assert.equal(seen.length, 4, `exactly once per id; onItem got ${JSON.stringify(ids())}`);
});

test('#173: replays and the no-key path call onItem too, once per id, each the entry `items` holds: a sample key with a saved file (an id it lacks AI_FAILED), PHOTO_PROVIDERS=fixture with and without a file, no GEMINI_API_KEY; and live with an image-hash file, a failed item reports its saved answer', async () => {
  const dir = tempDir('onitem-replay');
  try {
    const hash = sha('a photo with no sample, #173');
    save(dir, 'leads-sample', { key: 'leads-sample', model: 'gemini-recorded-1', items: SAVED_ITEMS });
    save(dir, hash, { key: hash, model: 'gemini-recorded-1', items: SAVED_ITEMS });
    const items = [item('R1', { window: WIN_R1 }), item('W1', { window: WIN_W1 }), item('X9')];
    const failedAll = items.map(it => ({ id: it.id, error: 'AI_FAILED' }));
    const cases = [
      ['a sample key with a saved file', 'leads-sample', () => {}, [SAVED_ITEMS[1], SAVED_ITEMS[0], { id: 'X9', error: 'AI_FAILED' }]],
      ['PHOTO_PROVIDERS=fixture, no file', 'no-such-sample', () => { process.env.PHOTO_PROVIDERS = 'fixture'; }, failedAll],
      ['PHOTO_PROVIDERS=fixture, a file', hash, () => { process.env.PHOTO_PROVIDERS = 'fixture'; }, [SAVED_ITEMS[1], SAVED_ITEMS[0], { id: 'X9', error: 'AI_FAILED' }]],
      ['no GEMINI_API_KEY', 'no-saved-leads', () => { delete process.env.GEMINI_API_KEY; }, failedAll],
      ['live with an image-hash file: R1 answers, W1 and X9 fail every call', hash, () => {},
        [{ id: 'R1', found: true, leads: R1_P2, conf: 0.8 }, SAVED_ITEMS[0], { id: 'X9', error: 'AI_FAILED' }]],
    ];
    for (const [what, key, setup, want] of cases) {
      delete process.env.PHOTO_PROVIDERS;
      process.env.GEMINI_API_KEY = GEMINI_KEY;
      setup();
      const fake = fakeGemini(items, c => (c.id === 'R1' ? answer(P2) : status(503)));
      const seen = [];
      const out = await readAll({ key, items }, fake, { fixturesDir: dir, onItem: e => seen.push(JSON.parse(JSON.stringify(e))) });
      assert.deepStrictEqual(out.items, want, `${what}: the resolved items are unchanged`);
      assert.deepStrictEqual(seen.map(e => e && e.id).sort(), ['R1', 'W1', 'X9'], `${what}: onItem once per requested id; it got ${JSON.stringify(seen.map(e => e && e.id))}`);
      for (const e of seen) assert.deepStrictEqual(e, byId(out, e.id), `${what}: ${e.id}'s onItem entry is the one the resolved items hold`);
      vi.useRealTimers();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('#173: route: with Accept application/x-ndjson the answer streams: 200 application/x-ndjson, one line per item as it settles (X1\'s 400 at once, W1 at 1 s, R1 at 5 s, each on the wire before the next answers), then { done: true, provider, model, ms }', async () => {
  const items = [item('R1', { window: WIN_R1 }), item('W1', { window: WIN_W1 }), item('X1')];
  const wait = { R1: 5000, W1: 1000 };
  const fake = fakeGemini(items, c => (c.id === 'X1' ? status(400) : after(wait[c.id], answer(P1))));
  vi.stubGlobal('fetch', fake.fetch);
  vi.useFakeTimers(FAKE);
  const s = openPost('/api/photo/leads', { key: 'no-saved-leads', items }, { accept: NDJSON });
  try {
    await until(() => fake.calls.length === 3, 'the 3 first calls');
    await until(() => lines(s).length >= 1,
      () => `no line on the wire after X1's 400 settled it at once (status ${s.status}, body so far ${JSON.stringify(s.raw.slice(0, 200))}): the route must write each item as it settles`);
    assert.equal(s.status, 200, `status ${s.status}`);
    assert.match(String(s.headers['content-type']), /^application\/x-ndjson/, `Content-Type ${s.headers['content-type']}`);
    assert.deepStrictEqual(lines(s), [{ id: 'X1', error: 'AI_FAILED' }], 'X1 settled first, so its line is first');

    await advance(1000);
    await until(() => lines(s).length >= 2, () => `no W1 line after it answered at 1 s: ${JSON.stringify(s.raw.slice(0, 300))}`);
    assert.deepStrictEqual(lines(s)[1], { id: 'W1', found: true, leads: W1_P1, conf: 0.8 }, 'W1\'s line, in the response\'s shape');
    assert.equal(s.ended, false, 'the stream stays open while R1 is out');
    await advance(3999);
    await flush();
    assert.equal(lines(s).length, 2, `no more lines before R1 answers at 5 s: ${JSON.stringify(lines(s))}`);

    await advance(1);
    await until(() => s.ended, 'the stream to end after the last item');
    const all = lines(s);
    assert.deepStrictEqual(all.slice(0, 3), [
      { id: 'X1', error: 'AI_FAILED' },
      { id: 'W1', found: true, leads: W1_P1, conf: 0.8 },
      { id: 'R1', found: true, leads: R1_P1, conf: 0.8 },
    ], 'one line per item, in finish order');
    assert.equal(all.length, 4, `then exactly one more line, done: ${JSON.stringify(all)}`);
    const last = all[3];
    assert.equal(last.done, true, `the last line is { done: true, … }: ${JSON.stringify(last)}`);
    assert.equal(last.provider, 'gemini', `done.provider: ${JSON.stringify(last)}`);
    assert.equal(last.model, DEFAULT_MODEL, `done.model: ${JSON.stringify(last)}`);
    assert.equal(typeof last.ms, 'number', `done.ms: ${JSON.stringify(last)}`);
  } finally {
    s.destroy();
  }
});

test('#173: route: a replay streams too: PHOTO_PROVIDERS=fixture with no file → one { id, error: AI_FAILED } line per id, then done (provider fixture, model null); a sample key with a saved file → its saved answers, one line per id (an id it lacks AI_FAILED), then done with its recorded model; never a fetch', async () => {
  const LEADS_DIR = path.join(__dirname, 'fixtures', 'photo', 'leads');
  const key = 'zz-test-173-stream-replay';
  const madeDir = !fs.existsSync(LEADS_DIR);
  save(LEADS_DIR, key, { key, model: 'gemini-recorded-1', items: SAVED_ITEMS });
  try {
    const calls = offline();
    const items = [item('R1', { window: WIN_R1 }), item('W1', { window: WIN_W1 }), item('X9')];
    const cases = [
      ['PHOTO_PROVIDERS=fixture, no file', 'no-such-sample-173', 'fixture', items.map(it => ({ id: it.id, error: 'AI_FAILED' })), null],
      ['a sample key with a saved file', key, undefined, [SAVED_ITEMS[1], SAVED_ITEMS[0], { id: 'X9', error: 'AI_FAILED' }], 'gemini-recorded-1'],
    ];
    for (const [what, k, providers, want, model] of cases) {
      if (providers) process.env.PHOTO_PROVIDERS = providers;
      else delete process.env.PHOTO_PROVIDERS;
      const res = await postLeads({ key: k, items }, { accept: NDJSON });
      assert.equal(res.status, 200, `${what}: status ${res.status}: ${res.raw.slice(0, 200)}`);
      assert.match(String(res.headers['content-type']), /^application\/x-ndjson/, `${what}: a replay streams too; Content-Type ${res.headers['content-type']}`);
      const all = lines({ raw: res.raw, ended: true });
      const itemLines = all.filter(l => !l.done);
      assert.deepStrictEqual(itemLines.map(l => l.id).sort(), ['R1', 'W1', 'X9'], `${what}: one line per requested id: ${JSON.stringify(all)}`);
      for (const w of want) assert.deepStrictEqual(itemLines.find(l => l.id === w.id), w, `${what}: ${w.id}'s line`);
      const last = all[all.length - 1];
      assert.ok(last && last.done === true, `${what}: the last line is { done: true, … }: ${JSON.stringify(last)}`);
      assert.equal(last.provider, 'fixture', `${what}: done.provider`);
      assert.equal(last.model, model, `${what}: done.model`);
    }
    assert.deepStrictEqual(calls, [], 'a replay never calls out');
  } finally {
    fs.rmSync(path.join(LEADS_DIR, `${key}.json`), { force: true });
    if (madeDir) fs.rmSync(LEADS_DIR, { recursive: true, force: true });
  }
});

// Pin: the JSON answer and the errors are what tests, recording and an older
// page rely on; the stream is opt-in.
test('#173 pin: route: without Accept application/x-ndjson (none, application/json, */*) the answer is the one JSON body { items, provider, model, ms } as before; with it, errors before the stream (400 BAD_ITEMS, 429) stay JSON', async () => {
  offline();
  for (const accept of [undefined, 'application/json', '*/*']) {
    const res = await postLeads(validBody(), { accept });
    assert.equal(res.status, 200, `Accept ${accept}: status ${res.status}: ${res.raw.slice(0, 200)}`);
    assert.match(String(res.headers['content-type']), /^application\/json/, `Accept ${accept}: Content-Type ${res.headers['content-type']}`);
    assert.ok(res.body, `Accept ${accept}: one JSON body, not lines: ${res.raw.slice(0, 200)}`);
    assert.deepStrictEqual(res.body.items, [{ id: 'R1', error: 'AI_FAILED' }, { id: 'W1', error: 'AI_FAILED' }], `Accept ${accept}`);
    assert.ok('provider' in res.body && 'model' in res.body && typeof res.body.ms === 'number', `Accept ${accept}: ${JSON.stringify(res.body)}`);
  }

  const bad = await postLeads({ key: 'no-saved-leads', items: [] }, { accept: NDJSON });
  assertBadItems(bad, 'no items, with Accept application/x-ndjson');
  assert.match(String(bad.headers['content-type']), /^application\/json/, `the 400 stays JSON: ${bad.headers['content-type']}`);

  const ip = '10.173.250.7';
  for (let n = 1; n <= 6; n++) {
    const res = await postLeads(validBody(), { ip, accept: NDJSON });
    assert.equal(res.status, 200, `request ${n} of 6 got ${res.status}`);
  }
  const seventh = await postLeads(validBody(), { ip, accept: NDJSON });
  assert.equal(seventh.status, 429, `the 7th request in a minute got ${seventh.status}`);
  assert.match(String(seventh.headers['content-type']), /^application\/json/, `the 429 stays JSON: ${seventh.headers['content-type']}`);
  assert.equal(typeof (seventh.body && seventh.body.reply), 'string', `the 429 body: ${seventh.raw.slice(0, 200)}`);
});

// ── 10. Stopping the round when nobody is listening (#177) ──────────────────
// The page aborts its NDJSON request on Cancel, close or Build it, but the
// route kept up to 24 Gemini calls running to the 40 s cutoff (with resends
// and retries), their lines going nowhere: quota spent on a free-tier key.

test('#177: readLeads(body, { signal }): aborting the signal mid-round ends it at once: the calls in flight are aborted, readLeads resolves without the clock moving, R1 keeps its answer and every other item (in flight, waiting on a retry, or still queued) is AI_TIMEOUT, onItem once per id, no timer left, and no call goes out after (no queued first call, no retry, no 12 s resend)', async () => {
  process.env.PHOTO_LEADS_CONCURRENCY = '2';
  const items = [item('R1', { window: WIN_R1 }), item('LED1'), item('W1', { window: WIN_W1 }), item('X1'), item('R2')];
  // R1 answers at once; LED1's first call is a 503 (its retry is due 1–2 s
  // later); their slots go to W1 and X1, which hang; R2 waits for a slot.
  const fake = fakeGemini(items, c => (c.id === 'R1' ? answer(P1) : c.id === 'LED1' && c.n === 1 ? status(503) : HANG));
  const ac = new AbortController();
  const seen = [];
  const s = start({ key: 'no-saved-leads', items }, fake, { signal: ac.signal, onItem: e => seen.push(e.id) });
  const sent = () => fake.calls.map(c => c.id);
  await until(() => fake.calls.length === 4, () => `the first 4 calls; sent: ${sent().join(' ')}`);
  await advance(500);
  assert.deepStrictEqual(sent(), ['R1', 'LED1', 'W1', 'X1'], 'test check: R1 answered and LED1 failed at once, so W1 and X1 took their slots; R2 waits; LED1\'s retry is not due before 1 s');
  assert.deepStrictEqual(seen, ['R1'], 'test check: only R1 has settled');
  assert.equal(s.done, false, 'test check: the round is still open at 0.5 s');

  ac.abort();
  await until(() => s.done, () => `readLeads had not resolved after its signal was aborted (the clock did not move): it keeps going toward its ${DEFAULT_CUTOFF_MS / 1000} s cutoff. `
    + `Calls still running: ${fake.calls.filter(c => !c.signal.aborted && c.id !== 'R1').map(c => `${c.id}#${c.n}`).join(' ') || 'none'}`);
  const out = result(s);
  for (const c of fake.calls.filter(c => c.id !== 'R1')) assert.ok(c.signal && c.signal.aborted, `${c.id}'s call ${c.n} was still running after the abort`);
  assert.deepStrictEqual(out.items, [
    { id: 'R1', found: true, leads: R1_P1, conf: 0.8 },
    { id: 'LED1', error: 'AI_TIMEOUT' },
    { id: 'W1', error: 'AI_TIMEOUT' },
    { id: 'X1', error: 'AI_TIMEOUT' },
    { id: 'R2', error: 'AI_TIMEOUT' },
  ], 'R1 answered before the abort; LED1 (waiting on its retry), W1 and X1 (in flight) and R2 (queued) are AI_TIMEOUT, in request order');
  assert.equal(vi.getTimerCount(), 0, `${vi.getTimerCount()} timer(s) left after the abort: the cutoff, a resend or LED1's retry would still fire`);
  assert.deepStrictEqual([...seen].sort(), items.map(it => it.id).sort(), `onItem once per id; it got ${JSON.stringify(seen)}`);

  await advance(DEFAULT_CUTOFF_MS + HEDGE_MS);
  assert.deepStrictEqual(sent(), ['R1', 'LED1', 'W1', 'X1'], 'no call went out after the abort: not R2 (queued), not LED1\'s retry, no 12 s resend');
  assert.equal(seen.length, items.length, `onItem exactly once per id; it got ${JSON.stringify(seen)}`);
});

test('#177 bug: route: the page closes the NDJSON request mid-stream (Cancel, close, Build it) → every Gemini call in flight is aborted at once and none goes out after (no 12 s resend); the [photo-leads] line is still written; the server answers the next request', async () => {
  const items = [item('R1', { window: WIN_R1 }), item('LED1'), item('W1', { window: WIN_W1 })];
  const fake = fakeGemini(items, c => (c.id === 'R1' ? after(1000, answer(P1)) : HANG));
  vi.stubGlobal('fetch', fake.fetch);
  vi.useFakeTimers(FAKE);
  const s = openPost('/api/photo/leads', { key: 'leads-close-177', items }, { accept: NDJSON });
  const running = () => fake.calls.filter(c => c.id !== 'R1' && !c.signal.aborted).map(c => `${c.id}'s call ${c.n}`);
  try {
    await until(() => fake.calls.length === 3, 'the 3 first calls');
    await advance(1000);
    await until(() => lines(s).length >= 1, () => `no R1 line after it answered at 1 s: ${JSON.stringify(s.raw.slice(0, 300))}`);
    assert.deepStrictEqual(lines(s), [{ id: 'R1', found: true, leads: R1_P1, conf: 0.8 }],
      'test check: R1\'s line is on the wire (the round was not stopped when the request body was read)');
    assert.deepStrictEqual(running(), ['LED1\'s call 1', 'W1\'s call 1'], 'test check: LED1 and W1 are still out');

    logs.length = 0;
    s.destroy();   // the page aborted its fetch
    await until(() => running().length === 0,
      () => `the client closed the stream, but ${running().join(' and ')} kept running (the route must abort readLeads' signal when the request closes before the response finished)`);
    await until(() => logs.some(l => l.startsWith('[photo-leads]')), () => `no [photo-leads] line after the close: ${JSON.stringify(logs)}`);
    const line = logs.find(l => l.startsWith('[photo-leads]'));
    for (const want of [/\bkey=leads-close-177\b/, /\bitems=3\b/, /\bok=1\b/, /\btimeout=2\b/]) assert.match(line, want, `the [photo-leads] line: ${line}`);

    await advance(DEFAULT_CUTOFF_MS);
    assert.deepStrictEqual(fake.calls.map(c => c.id), ['R1', 'LED1', 'W1'], 'no call went out after the close (no 12 s resend)');
    assert.equal(logs.filter(l => l.startsWith('[photo-leads]')).length, 1, `one [photo-leads] line per request: ${JSON.stringify(logs)}`);
    assert.deepStrictEqual(logs.filter(l => /uncaught|unhandled/i.test(l)), [], 'the close threw nothing');
  } finally {
    s.destroy();
    vi.useRealTimers();
  }

  // The server is still up: the next streamed request is answered in full.
  offline();
  const next = await postLeads(validBody(), { accept: NDJSON });
  assert.equal(next.status, 200, `the next request got ${next.status}: ${next.raw.slice(0, 200)}`);
  const all = lines({ raw: next.raw, ended: true });
  assert.deepStrictEqual(all.filter(l => !l.done), [{ id: 'R1', error: 'AI_FAILED' }, { id: 'W1', error: 'AI_FAILED' }], 'one line per id (no key: AI_FAILED)');
  assert.equal(all[all.length - 1].done, true, `then done: ${JSON.stringify(all)}`);
});
