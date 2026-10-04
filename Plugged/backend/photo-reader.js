// ─────────────────────────────────────────────────────────────
//  photo-reader.js — reads a flattened board photo for /api/photo
//
//  readPhoto({ image, grid, sample }, opts) tries each provider in
//  PHOTO_PROVIDERS (default gemini,deepseek) under one overall
//  deadline, PHOTO_TIMEOUT_MS (default 45 s), and resolves
//  { reading, provider, model, key }. It rejects with code AI_FAILED or
//  AI_TIMEOUT.
//
//  A provider is { name, read(input, ctx) }: ctx has { signal, fetch }
//  and read resolves { reading, model }; throwing means it failed, and
//  the next one is tried, unless the error is .fatal (a 400/401/403: a
//  bad request or key, which the next provider can't fix). Every reading
//  goes through validateReading().
//
//  Fixtures (test/fixtures/photo/<key>.json, key = the sample id, else
//  the SHA-256 of the image bytes):
//    PHOTO_PROVIDERS=fixture   replays only.
//    a sample with a fixture   answered from it straight away, no
//                              provider call (fallback false) (#157).
//    live mode, an image       its fixture answers only after every
//                              provider failed, a fatal error, or the
//                              deadline passed. So does a sample with
//                              no fixture: it goes live.
//    PHOTO_RECORD=1            sends a sample live too, and saves each
//                              live Reading.
//
//  The live readers (#139) ask for a box per part and wire (photo-prompt.js)
//  and start each one's 2 legs at the ends of its box, hole '?', for the
//  page to snap. gemini: PHOTO_GEMINI_MODEL, 25 s per attempt. deepseek:
//  deepseek-flash only, never deepseek-v4-pro: it has no vision.
// ─────────────────────────────────────────────────────────────

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const { withDeadline } = require('./ai-providers');
const { PHOTO_PROMPT, PHOTO_SCHEMA } = require('./photo-prompt');

const FIXTURES_DIR = path.join(__dirname, '..', 'test', 'fixtures', 'photo');

// Read per request, so a test (or a restart-free tweak) can change them.
const photoProviders = () => (process.env.PHOTO_PROVIDERS || 'gemini,deepseek').split(',').map(s => s.trim()).filter(Boolean);
const photoTimeoutMs = () => Number(process.env.PHOTO_TIMEOUT_MS) || 45000;

const failed = msg => Object.assign(new Error(msg), { code: 'AI_FAILED' });

// ── Fixtures ─────────────────────────────────────────────────
// A sample id is a key, never a path: anything but a plain id has no fixture.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const isSafeId = s => typeof s === 'string' && SAFE_ID.test(s);

function imageSha256(image) {
  const comma = String(image).indexOf(',');
  return crypto.createHash('sha256').update(Buffer.from(String(image).slice(comma + 1), 'base64')).digest('hex');
}

// The fixture key: the sample id, else the image's hash. null = no fixture.
function fixtureKey({ image, sample }) {
  if (sample === undefined || sample === null || sample === '') return imageSha256(image);
  return isSafeId(sample) ? sample : null;
}

function loadFixture(dir, key) {
  if (!key) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, `${key}.json`), 'utf8'));
  } catch {
    return null;
  }
}

const fixtureProvider = {
  name: 'fixture',
  read: async (input, ctx) => {
    const file = loadFixture(ctx.fixturesDir, ctx.key);
    if (!file) throw failed('no fixture for this photo');
    return { reading: file.reading, model: file.model };
  },
};

// ── The live readers' answer ─────────────────────────────────
// The JSON in a model's reply, forgiving what the models write around it:
// a markdown fence, prose before or after, stray closing braces, trailing
// commas. A bare list stays a list. Throws when there is no JSON, or it
// is cut off (that isn't repaired). Its errors never quote the reply: they
// end up in the logs.
function parseLooseJSON(text) {
  let s = String(text == null ? '' : text);
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence) s = fence[1];
  const start = s.search(/[[{]/);
  if (start < 0) throw failed('no JSON in the reply');
  let out = '', depth = 0, inString = false, escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') { out = out.replace(/,\s*$/, ''); depth--; }
    out += ch;
    if (depth === 0) {
      try { return JSON.parse(out); } catch { throw failed('the reply is not valid JSON'); }
    }
  }
  throw failed('the JSON in the reply is cut off');
}

const round1 = v => Math.round(v * 10) / 10;

// A resistor's value guess in Ω: 470, "470", "4.7k", "1M". Else 0.
function ohms(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const m = /^\s*(\d+(?:\.\d+)?)\s*([kKM]?)/.exec(typeof v === 'string' ? v : '');
  return m ? Number(m[1]) * ({ k: 1e3, K: 1e3, M: 1e6 }[m[2]] || 1) : 0;
}

// The box answer → Reading v1. box_2d [ymin, xmin, ymax, xmax] on 0–1000
// over the flattened image → a pixel box [x0, y0, x1, y1]; the 2 legs (or
// wire ends) start at the midpoints of its short edges, hole '?', and
// 'leads' goes in unsure: placeholders the page and the next step replace.
function boxesToReading(answer, grid) {
  const items = Array.isArray(answer) ? answer : obj(answer).items;
  if (!Array.isArray(items)) throw failed('the reply has no items');
  const parts = [], wires = [], count = {};
  const nextId = prefix => `${prefix}${(count[prefix] = (count[prefix] || 0) + 1)}`;

  for (const it of items.map(obj)) {
    const b = it.box_2d;
    if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isFinite)) continue;
    const x0 = round1(Math.min(b[1], b[3]) / 1000 * grid.width),  x1 = round1(Math.max(b[1], b[3]) / 1000 * grid.width);
    const y0 = round1(Math.min(b[0], b[2]) / 1000 * grid.height), y1 = round1(Math.max(b[0], b[2]) / 1000 * grid.height);
    const mx = round1((x0 + x1) / 2), my = round1((y0 + y1) / 2);
    const ends = x1 - x0 >= y1 - y0 ? [[x0, my], [x1, my]] : [[mx, y0], [mx, y1]];
    const type = str(it.type).trim().toLowerCase();
    const said  = typeof it.value === 'number' ? String(it.value) : str(it.value).trim();
    const guess = /^null$/i.test(said) ? '' : said;

    if (type === 'wire') {
      wires.push({ id: nextId('W'), color: '', ends: ends.map(pt => ({ hole: '?', pt })), box: [x0, y0, x1, y1],
                   confidence: num(it.conf), unsure: ['leads'] });
      continue;
    }
    const kind = type === 'resistor' || type === 'led' ? type : 'other';
    parts.push({
      id: nextId({ resistor: 'R', led: 'LED', other: 'X' }[kind]), type: kind,
      what: guess ? `${guess} ${type || 'part'}` : type || 'part', value: kind === 'resistor' ? ohms(it.value) : 0,
      bands: [], color: '', leads: ends.map(pt => ({ hole: '?', pt, role: 'unknown' })),
      box: [x0, y0, x1, y1], confidence: num(it.conf), unsure: ['leads'],
    });
  }

  const rails = obj(obj(answer).rails);
  const sign  = v => oneOf(v, RAIL_SIGNS, '?');
  return {
    board: { visible: obj(answer).visible !== false, cols: grid.cols,
             rails: { aOuter: sign(rails.aOuter), aInner: sign(rails.aInner), jInner: sign(rails.jInner), jOuter: sign(rails.jOuter) },
             split: false },
    parts, wires, power: [],
  };
}

// POSTs JSON; a non-2xx throws, fatal on 400/401/403 (a bad request or key).
// No error quotes the upstream body: they end up in the logs.
async function postJSON(ctx, signal, who, url, headers, body) {
  const res = await ctx.fetch(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  if (!res.ok) {
    const e = failed(`${who} ${res.status}`);
    if ([400, 401, 403].includes(res.status)) e.fatal = true;
    throw e;
  }
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw failed(`${who}: the reply is not JSON`); }
}

// ── gemini ───────────────────────────────────────────────────
const GEMINI_BASE       = 'https://generativelanguage.googleapis.com/v1beta/models/';
const GEMINI_ATTEMPT_MS = 25000;
const photoGeminiModel  = () => process.env.PHOTO_GEMINI_MODEL || 'gemini-robotics-er-2-preview';

// A data URL as a Gemini image part, read at ULTRA_HIGH.
function geminiImagePart(dataUrl) {
  const image = String(dataUrl);
  const mime  = (/^data:([^;,]+)/.exec(image) || [])[1] || 'image/jpeg';
  return { inline_data: { mime_type: mime, data: image.slice(image.indexOf(',') + 1) }, mediaResolution: { level: 'MEDIA_RESOLUTION_ULTRA_HIGH' } };
}

// A generateContent reply's text, thoughts left out. Throws when it was
// cut off or is empty.
function geminiText(data, who) {
  const cand = (data && data.candidates && data.candidates[0]) || {};
  if (cand.finishReason === 'MAX_TOKENS') throw failed(`${who}: the answer was cut off`);
  const text = list(obj(cand.content).parts).filter(p => p && typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
  if (!text.trim()) throw failed(`${who}: empty reply`);
  return text;
}

const geminiProvider = {
  name: 'gemini',
  read: async (input, ctx) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw failed('GEMINI_API_KEY is not set');
    const model = photoGeminiModel();
    const body  = {
      contents: [{ role: 'user', parts: [{ text: PHOTO_PROMPT }, geminiImagePart(input.image)] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: PHOTO_SCHEMA, temperature: 1, maxOutputTokens: 32768 },
    };
    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(GEMINI_ATTEMPT_MS)].filter(Boolean));
    const data = await postJSON(ctx, signal, `gemini ${model}`, `${GEMINI_BASE}${model}:generateContent`, { 'x-goog-api-key': apiKey }, body);
    return { reading: boxesToReading(parseLooseJSON(geminiText(data, `gemini ${model}`)), input.grid), model };
  },
};

// ── deepseek (deepseek-flash only) ───────────────────────────
const DEEPSEEK_URL         = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_PHOTO_MODEL = 'deepseek-flash';   // never DEEPSEEK_MODEL / the #130 fallback: deepseek-v4-pro has no vision

const deepseekProvider = {
  name: 'deepseek',
  read: async (input, ctx) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw failed('DEEPSEEK_API_KEY is not set');
    const body = {
      model:    DEEPSEEK_PHOTO_MODEL,
      messages: [{ role: 'user', content: [
        { type: 'text', text: PHOTO_PROMPT },
        { type: 'image_url', image_url: { url: input.image } },
      ] }],
      response_format: { type: 'json_object' },
      max_tokens:      4096,
    };
    const data = await postJSON(ctx, ctx.signal, DEEPSEEK_PHOTO_MODEL, DEEPSEEK_URL, { Authorization: `Bearer ${apiKey}` }, body);
    const text = str(obj(obj(list(obj(data).choices)[0]).message).content);
    if (!text.trim()) throw failed(`${DEEPSEEK_PHOTO_MODEL}: empty reply`);
    return { reading: boxesToReading(parseLooseJSON(text), input.grid), model: DEEPSEEK_PHOTO_MODEL };
  },
};

// Name → provider.
const PROVIDERS = { fixture: fixtureProvider, gemini: geminiProvider, deepseek: deepseekProvider };

// ── Reading v1 ───────────────────────────────────────────────
const RAIL_SIGNS  = ['+', '-', '?'];
const PART_TYPES  = ['resistor', 'led', 'other'];
const LEAD_ROLES  = ['anode', 'cathode', 'none', 'unknown'];
const POWER_KINDS = ['battery_9v', 'bench_supply', 'unknown'];
const HOLE        = /^(?:[a-j]\d{1,2}|rail:(?:aOuter|aInner|jInner|jOuter):\d{1,2}|gap|off|\?)$/;

const num    = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str    = v => (typeof v === 'string' ? v : '');
const strs   = v => (Array.isArray(v) ? v.filter(s => typeof s === 'string') : []);
const nums   = (v, n) => Array.from({ length: n }, (_, i) => num(Array.isArray(v) ? v[i] : undefined));
const oneOf  = (v, list, other) => (list.includes(v) ? v : other);
const obj    = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const list   = v => (Array.isArray(v) ? v : []);
const hole   = v => (typeof v === 'string' && HOLE.test(v) ? v : '?');
const endOf  = v => ({ hole: hole(obj(v).hole), pt: nums(obj(v).pt, 2) });

// Coerces raw to Reading v1 (unknown enum → other/unknown/?, missing number
// → 0, missing array → []) and drops what it can't repair, noting why.
// Throws when raw isn't a Reading at all, so its provider counts as failed.
function validateReading(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw failed('the reply is not a Reading');
  const notes = [];
  const b = obj(raw.board), rails = obj(b.rails);
  const board = {
    visible: b.visible !== false,
    cols:    b.cols === 30 ? 30 : 63,
    rails:   { aOuter: oneOf(rails.aOuter, RAIL_SIGNS, '?'), aInner: oneOf(rails.aInner, RAIL_SIGNS, '?'),
               jInner: oneOf(rails.jInner, RAIL_SIGNS, '?'), jOuter: oneOf(rails.jOuter, RAIL_SIGNS, '?') },
    split:   b.split === true,
  };

  const parts = [];
  for (const p of list(raw.parts).map(obj)) {
    if (!list(p.leads).length) { notes.push(`dropped part ${str(p.id) || '?'}: no leads`); continue; }
    parts.push({
      id: str(p.id), type: oneOf(p.type, PART_TYPES, 'other'), what: str(p.what), value: num(p.value),
      bands: strs(p.bands), color: str(p.color),
      leads: p.leads.map(l => ({ ...endOf(l), role: oneOf(obj(l).role, LEAD_ROLES, 'unknown') })),
      box: nums(p.box, 4), confidence: num(p.confidence), unsure: strs(p.unsure),
    });
  }

  const wires = [];
  for (const w of list(raw.wires).map(obj)) {
    if (list(w.ends).length !== 2) { notes.push(`dropped wire ${str(w.id) || '?'}: needs 2 ends`); continue; }
    wires.push({ id: str(w.id), color: str(w.color), ends: w.ends.map(endOf), box: list(w.box).length ? nums(w.box, 4) : [],
                 confidence: num(w.confidence), unsure: strs(w.unsure) });
  }

  const power = list(raw.power).map(obj).map(s => ({
    kind: oneOf(s.kind, POWER_KINDS, 'unknown'), volts: num(s.volts), plus: endOf(s.plus), minus: endOf(s.minus), unsure: strs(s.unsure),
  }));

  return { reading: { board, parts, wires, power }, notes };
}

// ── readPhoto ────────────────────────────────────────────────
function record(dir, key, input, out) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const sample = isSafeId(input.sample) ? input.sample : null;
    fs.writeFileSync(path.join(dir, `${key}.json`),
      `${JSON.stringify({ sample, sha256: imageSha256(input.image), reading: out.reading, provider: out.provider, model: out.model }, null, 2)}\n`);
  } catch (e) {
    console.warn('photo: could not record the fixture:', e.message);
  }
}

// Resolves { reading, provider, model, fallback, notes, key }; fallback is
// true when the answer didn't come from the first provider listed, and key
// is the fixture key (null when the sample isn't a plain id).
async function readPhoto(input, opts = {}) {
  const names       = opts.providers || photoProviders();
  const fixturesDir = opts.fixturesDir || FIXTURES_DIR;
  const key         = fixtureKey(input);
  const replayOnly  = names.length === 1 && (names[0] === 'fixture' || names[0] === fixtureProvider);
  const ctxBase     = { fetch: opts.fetch || globalThis.fetch, fixturesDir, key };

  const fromFixture = fallback => {
    const file = loadFixture(fixturesDir, key);
    if (!file) return null;
    const { reading, notes } = validateReading(file.reading);
    return { reading, provider: 'fixture', model: file.model, fallback, notes, key };
  };

  // Use sample photo (the demo's photo beat, and the button on every photo
  // error) replays its recording at once, never the AI, unless re-recording.
  // A sample is input.sample being a plain id, never the key's shape (#157).
  if (isSafeId(input.sample) && process.env.PHOTO_RECORD !== '1') {
    const saved = fromFixture(false);
    if (saved) return saved;
  }

  let out;
  try {
    out = await withDeadline(opts.deadlineMs || photoTimeoutMs(), async signal => {
      for (let i = 0; i < names.length; i++) {
        const p = typeof names[i] === 'string' ? PROVIDERS[names[i]] : names[i];
        if (!p || typeof p.read !== 'function') continue;   // unknown name: a failed provider
        try {
          const got = await p.read(input, { ...ctxBase, signal });
          const { reading, notes } = validateReading(got && got.reading);
          return { reading, provider: p.name, model: got.model, fallback: i > 0, notes, key };
        } catch (e) {
          console.warn(`photo: ${p.name} failed: ${e.message}`);
          if (signal.aborted || e.fatal) throw e;
        }
      }
      return null;
    });
  } catch (e) {
    // Past the deadline, or after a bad request or key, a live read still
    // falls back to a recording, for the stage.
    const fixed = (e.code === 'AI_TIMEOUT' || e.fatal) && !replayOnly && fromFixture(true);
    if (fixed) return fixed;
    throw e;
  }

  if (out) {
    if (process.env.PHOTO_RECORD === '1' && out.provider !== 'fixture' && key) record(fixturesDir, key, input, out);
    return out;
  }
  const fixed = !replayOnly && fromFixture(true);
  if (fixed) return fixed;
  throw failed('every photo provider failed');
}

module.exports = {
  readPhoto, validateReading, parseLooseJSON, PROVIDERS, isSafeId,
  // Shared with photo-leads.js (#159).
  GEMINI_BASE, photoGeminiModel, photoProviders, geminiImagePart, geminiText, postJSON, loadFixture, failed, num, obj, list,
};
