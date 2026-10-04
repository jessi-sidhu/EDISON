// ─────────────────────────────────────────────────────────────
//  photo-reader.js — reads a flattened board photo for /api/photo
//
//  readPhoto({ image, grid, sample }, opts) tries each provider in
//  PHOTO_PROVIDERS (default gemini,deepseek) under one overall
//  deadline, PHOTO_TIMEOUT_MS (default 45 s), and resolves
//  { reading, provider, model }. It rejects with code AI_FAILED or
//  AI_TIMEOUT.
//
//  A provider is { name, read(input, ctx) }: ctx has { signal, fetch }
//  and read resolves { reading, model }; throwing means it failed.
//  Every reading goes through validateReading().
//
//  Fixtures (test/fixtures/photo/<key>.json, key = the sample id, else
//  the SHA-256 of the image bytes):
//    PHOTO_PROVIDERS=fixture   replays only.
//    live mode                 a fixture answers only after every
//                              provider failed or the deadline passed.
//    PHOTO_RECORD=1            saves each live Reading.
//  The live Gemini/DeepSeek readers are #139; until then those names
//  have no entry here and count as failed. Never deepseek-v4-pro: it
//  has no vision.
// ─────────────────────────────────────────────────────────────

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const { withDeadline } = require('./ai-providers');

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

// Name → provider. #139 adds gemini and deepseek.
const PROVIDERS = { fixture: fixtureProvider };

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
    wires.push({ id: str(w.id), color: str(w.color), ends: w.ends.map(endOf), confidence: num(w.confidence), unsure: strs(w.unsure) });
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

// Resolves { reading, provider, model, fallback, notes }; fallback is true
// when the answer didn't come from the first provider listed.
async function readPhoto(input, opts = {}) {
  const names       = opts.providers || photoProviders();
  const fixturesDir = opts.fixturesDir || FIXTURES_DIR;
  const key         = fixtureKey(input);
  const replayOnly  = names.length === 1 && (names[0] === 'fixture' || names[0] === fixtureProvider);
  const ctxBase     = { fetch: opts.fetch || globalThis.fetch, fixturesDir, key };

  const fromFixture = () => {
    const file = loadFixture(fixturesDir, key);
    if (!file) return null;
    const { reading, notes } = validateReading(file.reading);
    return { reading, provider: 'fixture', model: file.model, fallback: true, notes };
  };

  let out;
  try {
    out = await withDeadline(opts.deadlineMs || photoTimeoutMs(), async signal => {
      for (let i = 0; i < names.length; i++) {
        const p = typeof names[i] === 'string' ? PROVIDERS[names[i]] : names[i];
        if (!p || typeof p.read !== 'function') continue;   // unknown name: a failed provider
        try {
          const got = await p.read(input, { ...ctxBase, signal });
          const { reading, notes } = validateReading(got && got.reading);
          return { reading, provider: p.name, model: got.model, fallback: i > 0, notes };
        } catch (e) {
          if (signal.aborted) throw e;
        }
      }
      return null;
    });
  } catch (e) {
    // Past the deadline a live read still falls back to a recording, for the stage.
    const fixed = e.code === 'AI_TIMEOUT' && !replayOnly && fromFixture();
    if (fixed) return fixed;
    throw e;
  }

  if (out) {
    if (process.env.PHOTO_RECORD === '1' && out.provider !== 'fixture' && key) record(fixturesDir, key, input, out);
    return out;
  }
  const fixed = !replayOnly && fromFixture();
  if (fixed) return fixed;
  throw failed('every photo provider failed');
}

module.exports = { readPhoto, validateReading, PROVIDERS, isSafeId };
