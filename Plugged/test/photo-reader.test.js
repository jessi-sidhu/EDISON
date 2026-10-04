// The live photo readers behind /api/photo (issue #139): Gemini first,
// deepseek-flash as the fallback, both converted to Reading v1. Every test
// uses a fake fetch: no network, no key.
//
// Shapes these tests assume (stated so the builder matches them):
// - backend/photo-reader.js exports PROVIDERS.gemini and PROVIDERS.deepseek,
//   each { name, read(input, ctx) } using ctx.fetch and ctx.signal, and
//   parseLooseJSON(text) → the parsed JSON value (object or array as written;
//   a bare list stays an array), throwing when there is no JSON in it.
//   The prompt and schema live in backend/photo-prompt.js; nothing here
//   requires it directly (the golden test reads what is sent).
// - Gemini: POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent,
//   model = PHOTO_GEMINI_MODEL || 'gemini-robotics-er-2-preview', key in the
//   x-goog-api-key header only. The answer's text is JSON:
//     { visible?: false, rails?: { aOuter, aInner, jInner, jOuter }, items: [
//       { type, value, conf, box_2d: [ymin, xmin, ymax, xmax] } ] }
//   (or a bare list of items), box_2d on 0–1000 over the whole flattened
//   image: pixel x = xn / 1000 · grid.width, y = yn / 1000 · grid.height.
// - DeepSeek: Chat Completions, model 'deepseek-flash' always, the image as
//   an image_url data URL part, response_format json_object; it answers the
//   same JSON in choices[0].message.content.
// - Conversion: each part's 2 leads and each wire's 2 ends sit at the two
//   ends of the box's long side (in pixels), hole '?', with 'leads' in the
//   item's unsure. box = the pixel box [x0, y0, x1, y1]; confidence = conf.
// - Fallback to the next provider on 5xx, 429, a network error, a timeout,
//   an empty reply, or invalid JSON. Never on 400/401/403: readPhoto rejects
//   AI_FAILED and the next provider is never asked.
//
// Every test runs with DEEPSEEK_MODEL and DEEPSEEK_FALLBACK_MODEL set to
// deepseek-v4-pro, the /api/ask settings that must never reach photos (that
// model has no vision).

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');
const util   = require('node:util');

const ASK_ENV = { DEEPSEEK_MODEL: 'deepseek-v4-pro', DEEPSEEK_FALLBACK_MODEL: 'deepseek-v4-pro' };
Object.assign(process.env, ASK_ENV);   // before the require: ai-providers reads DEEPSEEK_MODEL at load
const Reader = require('../backend/photo-reader.js');

const GEMINI_KEY   = 'test-gemini-key-123';
const DEEPSEEK_KEY = 'test-deepseek-key-456';
const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models/';
const DEFAULT_MODEL = 'gemini-robotics-er-2-preview';

// The demo board's flattened frame: 2040 × 710 for 63 columns.
const GRID = { cols: 63, pitch: 30, x0: 90, y0: 190, width: 2040, height: 710 };
const B64  = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(600, 'p')]).toString('base64');
const IMG  = `data:image/jpeg;base64,${B64}`;

const GOLDEN = path.join(__dirname, 'fixtures', 'prompts', 'photo.txt');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

// ── Environment ─────────────────────────────────────────────────────────────

const ENV_KEYS = ['GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'PHOTO_GEMINI_MODEL', 'PHOTO_RECORD', 'PHOTO_PROVIDERS',
  'PHOTO_TIMEOUT_MS', 'DEEPSEEK_MODEL', 'DEEPSEEK_FALLBACK_MODEL'];
let savedEnv, emptyDir;
beforeAll(() => { emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-reader-')); });
afterAll(() => fs.rmSync(emptyDir, { recursive: true, force: true }));
beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  process.env.GEMINI_API_KEY = GEMINI_KEY;
  process.env.DEEPSEEK_API_KEY = DEEPSEEK_KEY;
  delete process.env.PHOTO_GEMINI_MODEL;
  delete process.env.PHOTO_RECORD;
  delete process.env.PHOTO_PROVIDERS;
  delete process.env.PHOTO_TIMEOUT_MS;
  Object.assign(process.env, ASK_ENV);
  for (const m of ['log', 'info', 'warn', 'error']) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

// ── A fake fetch for both AI services ───────────────────────────────────────

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const text = a => (typeof a === 'string' ? a : JSON.stringify(a));
const geminiSays   = answer => json(200, { candidates: [{ content: { role: 'model', parts: [{ text: text(answer) }] }, finishReason: 'STOP' }] });
const deepseekSays = answer => json(200, { choices: [{ index: 0, message: { role: 'assistant', content: text(answer) }, finish_reason: 'stop' }] });
const status = n => json(n, { error: { code: n, message: `upstream ${n}` } });

// handlers: { gemini(call), deepseek(call) } → a Response, or throw. Every
// call is kept, per service, as { url, method, headers, body, signal }.
function fakeFetch(handlers) {
  const calls = { gemini: [], deepseek: [] };
  const fetch = async (url, opts = {}) => {
    const u = String(url);
    const service = u.startsWith('https://generativelanguage.googleapis.com/') ? 'gemini'
      : u.startsWith('https://api.deepseek.com/') ? 'deepseek' : null;
    if (!service) throw new Error(`the photo reader called an unexpected URL: ${u}`);
    const call = { url: u, method: opts.method, headers: new Headers(opts.headers), body: JSON.parse(opts.body), signal: opts.signal };
    calls[service].push(call);
    if (!handlers[service]) throw new Error(`no fake ${service} answer in this test`);
    return handlers[service](call);
  };
  return { fetch, calls };
}

function provider(name) {
  const p = Reader.PROVIDERS[name];
  assert.ok(p && typeof p.read === 'function', `photo-reader.js has no PROVIDERS.${name} with a read(input, ctx)`);
  return p;
}

// readPhoto with these providers and this fake, and no fixture to fall back on.
function read(names, fake, input = {}) {
  for (const n of names) provider(n);
  return Reader.readPhoto({ image: IMG, grid: GRID, ...input }, { providers: names, fetch: fake.fetch, fixturesDir: emptyDir });
}

const close = (actual, expected, what, tol = 1) => {
  assert.ok(Array.isArray(actual) && actual.length === expected.length, `${what}: got ${JSON.stringify(actual)}, expected ≈ ${JSON.stringify(expected)}`);
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= tol, `${what}: got ${JSON.stringify(actual)}, expected ≈ ${JSON.stringify(expected)}`));
};
// The two lead points, in either order.
const byXY = pts => pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
function assertEnds(ends, expected, what) {
  assert.equal(ends.length, 2, `${what}: ${ends.length} ends`);
  const got = byXY(ends.map(e => e.pt));
  byXY(expected).forEach((pt, i) => close(got[i], pt, `${what} end ${i + 1}`));
  for (const e of ends) assert.equal(e.hole, '?', `${what}: the server can't name the hole, the page snaps it; got ${e.hole}`);
}

const RAILS = { aOuter: '+', aInner: '-', jInner: '+', jOuter: '-' };

// ── 1. The Gemini request ───────────────────────────────────────────────────

test('gemini request: POST to the pinned model, key in x-goog-api-key and never in the URL, image inline, JSON schema, temperature 1, 32768 tokens, ULTRA_HIGH', async () => {
  const fake = fakeFetch({ gemini: () => geminiSays({ rails: RAILS, items: [] }) });
  const out = await read(['gemini'], fake);

  assert.equal(fake.calls.gemini.length, 1, `gemini was called ${fake.calls.gemini.length} times`);
  const c = fake.calls.gemini[0];
  assert.equal(c.url, `${GEMINI_BASE}${DEFAULT_MODEL}:generateContent`);
  assert.equal(c.method, 'POST');
  assert.equal(c.headers.get('x-goog-api-key'), GEMINI_KEY);
  assert.ok(!c.url.includes(GEMINI_KEY) && !/[?&]key=/.test(c.url), `the key is in the URL: ${c.url}`);
  assert.ok(c.signal instanceof AbortSignal, 'the request has no AbortSignal, so the deadline cannot cancel it');

  const parts = (c.body.contents || []).flatMap(m => m.parts || []);
  const img = parts.map(p => p.inline_data || p.inlineData).filter(Boolean);
  assert.equal(img.length, 1, `expected one inline image part: ${JSON.stringify(parts).slice(0, 300)}`);
  assert.equal(img[0].mime_type || img[0].mimeType, 'image/jpeg');
  assert.equal(img[0].data, B64, 'the image part is the data URL\'s base64, without the data: prefix');
  const prompt = parts.filter(p => typeof p.text === 'string').map(p => p.text).join('\n');
  assert.match(prompt, /box_2d/, 'the prompt asks for a box_2d per item');
  assert.match(prompt, /rail/i, 'the prompt asks for the rails\' printed signs');

  const gc = c.body.generationConfig || {};
  assert.equal(gc.responseMimeType, 'application/json');
  assert.ok(gc.responseSchema && typeof gc.responseSchema === 'object', `no responseSchema: ${JSON.stringify(gc).slice(0, 300)}`);
  const schema = JSON.stringify(gc.responseSchema);
  for (const word of ['items', 'box_2d', 'rails']) assert.ok(schema.includes(word), `the response schema has no ${word}: ${schema.slice(0, 300)}`);
  assert.equal(gc.temperature, 1);
  assert.equal(gc.maxOutputTokens, 32768, 'Robotics-ER\'s thinking counts toward maxOutputTokens; 8k cut answers off');
  assert.ok(JSON.stringify(c.body).includes('MEDIA_RESOLUTION_ULTRA_HIGH'), 'the image is not sent at MEDIA_RESOLUTION_ULTRA_HIGH');

  assert.equal(out.provider, 'gemini');
  assert.equal(out.model, DEFAULT_MODEL);
});

test('gemini request: PHOTO_GEMINI_MODEL picks the model, in the URL and in the answer', async () => {
  process.env.PHOTO_GEMINI_MODEL = 'gemini-test-pinned-001';
  const fake = fakeFetch({ gemini: () => geminiSays({ rails: RAILS, items: [] }) });
  const out = await read(['gemini'], fake);
  assert.equal(fake.calls.gemini[0].url, `${GEMINI_BASE}gemini-test-pinned-001:generateContent`);
  assert.equal(out.model, 'gemini-test-pinned-001');
});

// ── 2. Boxes → starting legs ────────────────────────────────────────────────

test('each part\'s 2 leads and each wire\'s 2 ends start at the ends of the box\'s long side, in pixels, hole ?, unsure leads', async () => {
  // 2040 × 710: x = xn · 2.04, y = yn · 0.71.
  const items = [
    { type: 'resistor', value: '470', conf: 0.8, box_2d: [300, 100, 400, 250] },   // 306 × 71 px: horizontal
    { type: 'led',      value: null,  conf: 0.6, box_2d: [100, 500, 500, 520] },   // 40.8 × 284 px: vertical
    // 100 wide and 200 tall on 0–1000, but 204 × 142 px: the long side is judged in pixels.
    { type: 'resistor', value: null,  conf: 0.5, box_2d: [200, 600, 400, 700] },
    { type: 'wire',     value: null,  conf: 0.9, box_2d: [600, 800, 700, 900] },   // 204 × 71 px: horizontal
  ];
  const fake = fakeFetch({ gemini: () => geminiSays({ rails: RAILS, items }) });
  const { reading } = await read(['gemini'], fake);

  assert.deepStrictEqual(reading.parts.map(p => p.type), ['resistor', 'led', 'resistor'], 'the parts, in the answer\'s order');
  const [r1, led, r2] = reading.parts;

  close(r1.box, [204, 213, 510, 284], 'R box');
  assertEnds(r1.leads, [[204, 248.5], [510, 248.5]], 'horizontal resistor');
  close(led.box, [1020, 71, 1060.8, 355], 'LED box');
  assertEnds(led.leads, [[1040.4, 71], [1040.4, 355]], 'vertical LED');
  close(r2.box, [1224, 142, 1428, 284], 'wide-in-pixels box');
  assertEnds(r2.leads, [[1224, 213], [1428, 213]], 'box tall on 0–1000 but wide in pixels');

  assert.deepStrictEqual(reading.parts.map(p => p.confidence), [0.8, 0.6, 0.5]);
  assert.equal(r1.value, 470, 'a value guess of "470" is 470 Ω');
  assert.equal(r2.value, 0, 'no value guess is 0');
  for (const p of reading.parts) assert.ok(p.unsure.includes('leads'), `${p.id}: the starting legs are placeholders, so unsure has 'leads': ${JSON.stringify(p.unsure)}`);
  const ids = reading.parts.map(p => p.id);
  assert.ok(ids.every(id => typeof id === 'string' && id) && new Set(ids).size === ids.length, `part ids must be unique: ${JSON.stringify(ids)}`);

  assert.equal(reading.wires.length, 1, `wires: ${JSON.stringify(reading.wires)}`);
  const w = reading.wires[0];
  assertEnds(w.ends, [[1632, 461.5], [1836, 461.5]], 'wire');
  assert.equal(w.confidence, 0.9);
  assert.ok(w.unsure.includes('leads'), `the wire's ends are placeholders too: ${JSON.stringify(w.unsure)}`);
});

test('item types: resistor and led keep theirs, wire is a wire, every other component is a part of type other', async () => {
  const others = ['capacitor', 'ic', 'button', 'diode', 'transistor', 'potentiometer', 'other'];
  const box = i => [100 + i * 50, 100, 130 + i * 50, 200];
  const items = ['resistor', 'led', 'wire', ...others].map((type, i) => ({ type, value: null, conf: 0.7, box_2d: box(i) }));
  const fake = fakeFetch({ gemini: () => geminiSays({ rails: RAILS, items }) });
  const { reading } = await read(['gemini'], fake);
  assert.deepStrictEqual(reading.parts.map(p => p.type), ['resistor', 'led', ...others.map(() => 'other')]);
  assert.equal(reading.wires.length, 1);
});

// ── 3. Rails and the board ──────────────────────────────────────────────────

test('rails: each printed sign by side goes to board.rails; anything else or missing is ?; cols from the grid; visible false kept', async () => {
  const cases = [
    ['all four signs', { rails: { aOuter: '+', aInner: '-', jInner: '-', jOuter: '+' }, items: [] }, GRID,
      { visible: true, cols: 63, rails: { aOuter: '+', aInner: '-', jInner: '-', jOuter: '+' } }],
    ['a bad sign and a missing one', { rails: { aOuter: '-', aInner: 'minus', jOuter: '?' }, items: [] }, GRID,
      { visible: true, cols: 63, rails: { aOuter: '-', aInner: '?', jInner: '?', jOuter: '?' } }],
    ['no rails, a 30-column board', { items: [] }, { ...GRID, cols: 30, width: 1050 },
      { visible: true, cols: 30, rails: { aOuter: '?', aInner: '?', jInner: '?', jOuter: '?' } }],
    ['the model sees no board', { visible: false, items: [] }, GRID,
      { visible: false, cols: 63, rails: { aOuter: '?', aInner: '?', jInner: '?', jOuter: '?' } }],
  ];
  for (const [what, answer, grid, want] of cases) {
    const fake = fakeFetch({ gemini: () => geminiSays(answer) });
    const { reading } = await read(['gemini'], fake, { grid });
    const { visible, cols, rails } = reading.board;
    assert.deepStrictEqual({ visible, cols, rails }, want, what);
  }
});

// ── 4. The forgiving parser ─────────────────────────────────────────────────

test('parseLooseJSON: a fence, prose around it, stray closing braces, trailing commas, a bare list', () => {
  assert.equal(typeof Reader.parseLooseJSON, 'function', 'photo-reader.js does not export parseLooseJSON');
  const item = { type: 'led', value: null, box_2d: [1, 2, 3, 4], conf: 0.8 };
  const cases = [
    ['plain', '{"items":[{"type":"led","value":null,"box_2d":[1,2,3,4],"conf":0.8}]}', { items: [item] }],
    ['a markdown fence', '```json\n{"items":[{"type":"led","value":null,"box_2d":[1,2,3,4],"conf":0.8}]}\n```', { items: [item] }],
    ['prose before and after', 'Here is the board:\n{"items":[{"type":"led","value":null,"box_2d":[1,2,3,4],"conf":0.8}]}\nHope that helps!', { items: [item] }],
    ['stray closing braces', '{"items":[{"type":"led","value":null,"box_2d":[1,2,3,4],"conf":0.8}]}}\n}', { items: [item] }],
    ['trailing commas', '{"items":[{"type":"led","value":null,"box_2d":[1,2,3,4,],"conf":0.8,},],}', { items: [item] }],
    ['a bare list', '[{"type":"led","value":null,"box_2d":[1,2,3,4],"conf":0.8}]', [item]],
    ['all at once', 'Sure!\n```json\n[{"type":"led","value":null,"box_2d":[1,2,3,4],"conf":0.8,},]\n```\n}', [item]],
  ];
  for (const [what, input, want] of cases) {
    let got;
    try { got = Reader.parseLooseJSON(input); } catch (e) { assert.fail(`${what}: threw ${e.message}`); }
    assert.deepStrictEqual(got, want, what);
  }
  assert.throws(() => Reader.parseLooseJSON('I could not see a breadboard.'), 'no JSON at all throws');
});

test('gemini answering a bare list in a fence still gives a Reading with its parts', async () => {
  const answer = '```json\n[{"type":"resistor","value":"220","conf":0.7,"box_2d":[300,100,400,250]},]\n```';
  const fake = fakeFetch({ gemini: () => geminiSays(answer) });
  const out = await read(['gemini'], fake);
  assert.equal(out.provider, 'gemini');
  assert.deepStrictEqual(out.reading.parts.map(p => [p.type, p.value]), [['resistor', 220]]);
  assertEnds(out.reading.parts[0].leads, [[204, 248.5], [510, 248.5]], 'bare-list resistor');
});

// ── 5. Fallback to deepseek-flash ───────────────────────────────────────────

test('gemini 503 → deepseek-flash answers: image_url data URL, json_object, an example in the prompt; never deepseek-v4-pro', async () => {
  const items = [{ type: 'led', value: null, conf: 0.6, box_2d: [100, 500, 500, 520] }];
  const fake = fakeFetch({ gemini: () => status(503), deepseek: () => deepseekSays({ rails: RAILS, items }) });
  const out = await read(['gemini', 'deepseek'], fake);

  assert.equal(fake.calls.gemini.length, 1);
  assert.equal(fake.calls.deepseek.length, 1, `deepseek was called ${fake.calls.deepseek.length} times`);
  const c = fake.calls.deepseek[0];
  assert.match(c.url, /^https:\/\/api\.deepseek\.com\/(v1\/)?chat\/completions$/);
  assert.equal(c.method, 'POST');
  assert.equal(c.headers.get('authorization'), `Bearer ${DEEPSEEK_KEY}`);
  assert.equal(c.body.model, 'deepseek-flash', `DEEPSEEK_MODEL/DEEPSEEK_FALLBACK_MODEL are deepseek-v4-pro here and must not apply; got ${c.body.model}`);
  assert.deepStrictEqual(c.body.response_format, { type: 'json_object' });
  const content = (c.body.messages || []).flatMap(m => (Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }]));
  const images = content.filter(p => p && p.type === 'image_url');
  assert.equal(images.length, 1, `expected one image_url part: ${JSON.stringify(content).slice(0, 300)}`);
  assert.equal(images[0].image_url && images[0].image_url.url, IMG, 'the image goes as its data URL');
  const prompt = content.filter(p => p && p.type === 'text').map(p => p.text).join('\n');
  assert.match(prompt, /json/i, 'json_object mode needs the word JSON in the prompt');
  assert.match(prompt, /\{\s*"items"\s*:\s*\[\s*\{[^\]]*"box_2d"\s*:\s*\[/, 'the prompt carries one compact JSON example with items and box_2d');

  assert.equal(out.provider, 'deepseek');
  assert.equal(out.model, 'deepseek-flash');
  assert.equal(out.fallback, true);
  assert.deepStrictEqual(out.reading.board.rails, RAILS);
  assertEnds(out.reading.parts[0].leads, [[1040.4, 71], [1040.4, 355]], 'deepseek LED (same conversion as Gemini)');
});

test('gemini falls back to deepseek-flash on 500, 503, 429, a network error, a timeout, an empty reply, invalid or cut-off JSON', async () => {
  const items = [{ type: 'resistor', value: '470', conf: 0.8, box_2d: [300, 100, 400, 250] }];
  const timeout = () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); };
  const cases = [
    ['500', () => status(500)],
    ['503', () => status(503)],
    ['429', () => status(429)],
    ['a network error', () => { throw new TypeError('fetch failed'); }],
    ['a timeout', timeout],
    ['no candidates', () => json(200, { candidates: [] })],
    ['an empty text', () => geminiSays('')],
    ['invalid JSON', () => geminiSays('I am not sure what I am looking at.')],
    ['JSON cut off at the token limit', () => json(200, { candidates: [{ content: { parts: [{ text: '{"items":[{"type":"led","box_2d":[1' }] }, finishReason: 'MAX_TOKENS' }] })],
  ];
  for (const [what, gemini] of cases) {
    const fake = fakeFetch({ gemini, deepseek: () => deepseekSays({ rails: RAILS, items }) });
    let out;
    try { out = await read(['gemini', 'deepseek'], fake); } catch (e) { assert.fail(`${what}: readPhoto rejected (${e.code || e.message}) instead of asking deepseek-flash`); }
    assert.equal(fake.calls.deepseek.length, 1, `${what}: deepseek called ${fake.calls.deepseek.length} times`);
    assert.equal(fake.calls.deepseek[0].body.model, 'deepseek-flash', what);
    assert.equal(out.provider, 'deepseek', what);
    assert.deepStrictEqual(out.reading.parts.map(p => p.value), [470], what);
  }
});

test('gemini 400, 401 or 403 is a bad request or key: no fallback, deepseek is never asked, AI_FAILED', async () => {
  for (const code of [400, 401, 403]) {
    const fake = fakeFetch({ gemini: () => status(code), deepseek: () => deepseekSays({ rails: RAILS, items: [] }) });
    await assert.rejects(read(['gemini', 'deepseek'], fake), e => e.code === 'AI_FAILED', `gemini ${code}: should reject AI_FAILED`);
    assert.equal(fake.calls.gemini.length, 1, `gemini ${code}: gemini called ${fake.calls.gemini.length} times`);
    assert.equal(fake.calls.deepseek.length, 0, `gemini ${code}: a bad request or key must not fall back, but deepseek was called`);
  }
});

test('both failing → AI_FAILED, and deepseek is tried once, on deepseek-flash only (no deepseek-v4-pro retry)', async () => {
  const fake = fakeFetch({ gemini: () => status(503), deepseek: () => status(503) });
  await assert.rejects(read(['gemini', 'deepseek'], fake), e => e.code === 'AI_FAILED');
  assert.equal(fake.calls.gemini.length, 1);
  assert.deepStrictEqual(fake.calls.deepseek.map(c => c.body.model), ['deepseek-flash']);
});

test('stage safety: a fatal Gemini 400 or 401 still falls back to a recorded fixture for the key, without asking deepseek', async () => {
  const sha = crypto.createHash('sha256').update(Buffer.from(B64, 'base64')).digest('hex');
  const reading = {
    board: { visible: true, cols: 63, rails: { aOuter: '+', aInner: '-', jInner: '+', jOuter: '-' }, split: false },
    parts: [{ id: 'R1', type: 'resistor', what: '470 Ω resistor', value: 470, bands: [], color: '',
      leads: [{ hole: 'a14', pt: [480, 190], role: 'none' }, { hole: 'a18', pt: [600, 190], role: 'none' }],
      box: [465, 175, 615, 205], confidence: 0.8, unsure: [] }],
    wires: [], power: [],
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-reader-fixture-'));
  try {
    fs.writeFileSync(path.join(dir, `${sha}.json`), JSON.stringify({ sample: null, sha256: sha, reading, provider: 'gemini', model: 'gemini-recorded' }));
    for (const code of [400, 401]) {
      const fake = fakeFetch({ gemini: () => status(code), deepseek: () => deepseekSays({ rails: RAILS, items: [] }) });
      provider('gemini');
      const out = await Reader.readPhoto({ image: IMG, grid: GRID }, { providers: ['gemini', 'deepseek'], fetch: fake.fetch, fixturesDir: dir });
      assert.equal(out.provider, 'fixture', `gemini ${code}`);
      assert.equal(out.fallback, true, `gemini ${code}`);
      assert.equal(out.key, sha, `gemini ${code}: key`);
      assert.deepStrictEqual(out.reading, reading, `gemini ${code}: the fixture's Reading`);
      assert.equal(fake.calls.gemini.length, 1, `gemini ${code}`);
      assert.equal(fake.calls.deepseek.length, 0, `gemini ${code}: a bad request or key must not fall back to deepseek`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('log hygiene: no logged line carries an API key, the image, or the models\' reply text', async () => {
  const logs = [];
  for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
    vi.spyOn(console, m).mockImplementation((...args) => { logs.push(args.map(a => (typeof a === 'string' ? a : util.inspect(a))).join(' ')); });
  }
  // Short markers: Node's JSON.parse error quotes only ~10 characters around
  // the bad token, so a longer one would be cut and slip past the check.
  const MARKERS = ['ZQXPRIV1', 'ZQXHTML', 'ZQXDEEP3'];
  const html = () => new Response('<html>ZQXHTML</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  const cases = [
    ['gemini invalid JSON, deepseek invalid JSON', () => geminiSays('{"items":[ ZQXPRIV1 ]}'), () => deepseekSays('{"items":[ ZQXDEEP3 ]}')],
    ['gemini 200 with an HTML body, deepseek 503', html, () => status(503)],
    ['gemini 503, deepseek 200 with an HTML body', () => status(503), html],
  ];
  for (const [what, gemini, deepseek] of cases) {
    const fake = fakeFetch({ gemini, deepseek });
    await assert.rejects(read(['gemini', 'deepseek'], fake), e => e.code === 'AI_FAILED', what);
    assert.equal(fake.calls.deepseek.length, 1, `${what}: deepseek was not asked`);
  }
  for (const line of logs) {
    for (const secret of [GEMINI_KEY, DEEPSEEK_KEY, B64.slice(0, 40), ...MARKERS]) {
      assert.ok(!line.includes(secret), `a log line carries ${secret === B64.slice(0, 40) ? 'the image' : secret}: ${line.slice(0, 200)}`);
    }
  }
});

// ── 6. The golden prompt ────────────────────────────────────────────────────

// What Gemini is sent, as the golden file holds it.
function renderPrompt(body) {
  const parts = (body.contents || []).flatMap(m => m.parts || []);
  return [
    '--- prompt ---',
    parts.filter(p => typeof p.text === 'string').map(p => p.text).join('\n'),
    '--- responseSchema ---',
    JSON.stringify((body.generationConfig || {}).responseSchema, null, 2),
  ].join('\n') + '\n';
}

test('the Gemini photo prompt and schema are exactly the golden (fixtures/prompts/photo.txt)', async () => {
  const fake = fakeFetch({ gemini: () => geminiSays({ rails: RAILS, items: [] }) });
  await read(['gemini'], fake);
  const actual = renderPrompt(fake.calls.gemini[0].body);
  if (UPDATE) {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, actual);
    return;
  }
  if (!fs.existsSync(GOLDEN)) {
    assert.fail('The golden file test/fixtures/prompts/photo.txt is missing. Run UPDATE_GOLDEN=1 npm test to create it, review it, and commit it.');
  }
  const expected = fs.readFileSync(GOLDEN, 'utf8');
  const exp = expected.split('\n'), act = actual.split('\n');
  let i = 0;
  while (i < exp.length && i < act.length && exp[i] === act[i]) i++;
  if (expected !== actual) {
    assert.fail('The photo prompt changed. If this is intended, run UPDATE_GOLDEN=1 npm test and review the diff.\n'
      + `photo.txt line ${i + 1}:\n  golden: ${exp[i]}\n  sent:   ${act[i]}`);
  }
});
