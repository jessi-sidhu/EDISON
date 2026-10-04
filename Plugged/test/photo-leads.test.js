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
//   (default 25000), read per call and measured from readLeads' start, run on
//   the global setTimeout/clearTimeout (vi.useFakeTimers drives those; it
//   can't drive AbortSignal.timeout). Every call gets an AbortSignal, and
//   aborting it makes the fake fetch reject, as a real fetch does.
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
const TIMEOUT_MS    = 25000;

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
function fakeGemini(items, answerFor) {
  const idOf = new Map(items.map(it => [b64(it.image), it.id]));
  const calls = [], other = [];
  let inFlight = 0, maxInFlight = 0;
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
      headers: new Headers(opts.headers), body, part, signal: opts.signal };
    calls.push(call);
    maxInFlight = Math.max(maxInFlight, ++inFlight);
    return new Promise((resolve, reject) => {
      const signal = opts.signal;
      const abort = () => reject(signal.reason || new DOMException('This operation was aborted', 'AbortError'));
      if (signal && signal.aborted) return abort();
      if (signal) signal.addEventListener('abort', abort, { once: true });
      let out;
      try { out = answerFor(call); } catch (e) { return reject(e); }
      if (out !== HANG) Promise.resolve(out).then(resolve, reject);
    }).finally(() => { inFlight--; });
  };
  return { fetch, calls, other, of: id => calls.filter(c => c.id === id), get maxInFlight() { return maxInFlight; } };
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
  'PHOTO_HEDGE_MS', 'PHOTO_LEADS_TIMEOUT_MS'];
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
  for (const k of ['PHOTO_GEMINI_MODEL', 'PHOTO_RECORD', 'PHOTO_PROVIDERS', 'PHOTO_HEDGE_MS', 'PHOTO_LEADS_TIMEOUT_MS']) delete process.env[k];
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
  for (const it of items) assert.ok(fake.of(it.id).length <= 2, `${it.id}: ${fake.of(it.id).length} calls, at most 2`);
  assert.deepStrictEqual(fake.other, [], 'only Gemini is asked for leads, never deepseek');
});

test('a 400, 401 or 403 from Gemini is never resent: that item is AI_FAILED after exactly 1 call, past the 12 s resend and up to the cutoff (a 503, for contrast, is resent)', async () => {
  for (const [code, calls] of [[400, 1], [401, 1], [403, 1], [503, 2]]) {
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

test('.env.example lists PHOTO_HEDGE_MS and PHOTO_LEADS_TIMEOUT_MS', () => {
  const text = fs.readFileSync(path.join(__dirname, '../../.env.example'), 'utf8');
  for (const name of ['PHOTO_HEDGE_MS', 'PHOTO_LEADS_TIMEOUT_MS']) assert.match(text, new RegExp(`^${name}=`, 'm'), `.env.example has no ${name}=`);
});
