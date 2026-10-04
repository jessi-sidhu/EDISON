// ─────────────────────────────────────────────────────────────
//  photo-leads.js — where each lead enters the board, for /api/photo/leads
//
//  readLeads({ key, items }, opts) asks Gemini once per labelled crop (the
//  page cuts them, photo-crops.js), all at once, and resolves
//  { items, provider, model, ms, resent }: one entry per item, in order,
//  { id, found, leads: [{ pin, pt, role }], conf } or
//  { id, error: 'AI_TIMEOUT' | 'AI_FAILED' }. It never rejects. `resent`
//  (items that got a second call) is for the route's log only.
//
//  An item with no good answer after PHOTO_HEDGE_MS (default 12 s) gets a
//  second identical call; the first good answer wins and the other call is
//  aborted. At PHOTO_LEADS_TIMEOUT_MS (default 25 s) every call is aborted
//  and the unanswered items are AI_TIMEOUT. Gemini only: deepseek can't
//  point. Timers are the global setTimeout, so fake timers drive them.
//
//  Saved leads (test/fixtures/photo/leads/<key>.json = { key, model, items },
//  points already in flattened pixels):
//    a sample id with a file   answered from it straight away
//    an image hash (64 hex)    live; an item that fails takes its saved answer
//    PHOTO_PROVIDERS=fixture   replays only, never a fetch
//    PHOTO_RECORD=1            always live; saves the answered items
//  Never logs the key, a crop or a reply.
// ─────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');
const { GEMINI_BASE, photoGeminiModel, photoProviders, geminiImagePart, geminiText, postJSON,
        loadFixture, parseLooseJSON, isSafeId, failed, num, obj, list } = require('./photo-reader');
const { PHOTO_CROP_PROMPT, PHOTO_CROP_SCHEMA } = require('./photo-prompt');

const LEADS_DIR  = path.join(__dirname, '..', 'test', 'fixtures', 'photo', 'leads');
const IMAGE_HASH = /^[0-9a-f]{64}$/;
const ROLES      = ['anode', 'cathode', 'none', 'unknown'];

// Read per request, so a test (or a restart-free tweak) can change them.
const msFrom   = (v, fallback) => (Number(v) > 0 ? Number(v) : fallback);
const hedgeMs  = () => msFrom(process.env.PHOTO_HEDGE_MS, 12000);
const cutoffMs = () => msFrom(process.env.PHOTO_LEADS_TIMEOUT_MS, 25000);

const round1 = v => Math.round(v * 10) / 10 || 0;   // || 0: never -0
const isPt   = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

// Gemini's [y, x] on 0–1000 over the whole crop → crop pixels → the
// flattened image's pixels [x, y], through the crop's window.
function toFlattened([y, x], w) {
  const u = x / 1000 * w.width, v = y / 1000 * w.height;
  return [round1(w.x + (u - w.padLeft) / w.scale), round1(w.y + (v - w.padTop) / w.scale)];
}

// Resistor and wire legs have no direction; an LED's has one when Gemini
// named it.
function roleOf(item, pin) {
  if (item.kind === 'wire' || item.type === 'wire' || item.type === 'resistor') return 'none';
  const p = pin.trim().toLowerCase();
  return p === 'anode' || p === 'cathode' ? p : 'unknown';
}

// One reply's JSON → the item's entry. A bare list is taken: [{...}] is its
// first object, [["1", [y, x]], …] the leads. Throws when it isn't an answer.
function toEntry(item, answer) {
  let a = answer;
  if (Array.isArray(a)) a = a.some(Array.isArray) ? { leads: a } : a.find(x => x && typeof x === 'object');
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw failed('the reply is not an answer');
  if (!Array.isArray(a.leads) && a.found !== false) throw failed('the reply has no leads');
  const leads = list(a.leads).filter(Array.isArray).map(([pin, at]) => {
    const name = typeof pin === 'string' || typeof pin === 'number' ? String(pin) : '?';
    return { pin: name, pt: isPt(at) ? toFlattened(at, item.window) : null, role: roleOf(item, name) };
  });
  return { id: item.id, found: typeof a.found === 'boolean' ? a.found : leads.length > 0, leads, conf: num(a.conf) };
}

// That id's saved answer, or null.
function savedEntry(file, id) {
  const e = file && list(file.items).find(x => obj(x).id === id && Array.isArray(x.leads));
  if (!e) return null;
  return { id, found: e.found !== false, conf: num(e.conf),
    leads: e.leads.map(obj).map(l => ({ pin: String(l.pin), pt: isPt(l.pt) ? [l.pt[0], l.pt[1]] : null, role: ROLES.includes(l.role) ? l.role : 'unknown' })) };
}

// One item's race: a call now, an identical one at the resend if there's
// still no good answer, the first good answer wins. A bad request or key
// (fatal) isn't resent. stop() ends it as AI_TIMEOUT. Every way out aborts
// the calls still running.
function raceItem(item, call, resendMs) {
  const controllers = [];
  let settled = false, pending = 0, resolve, resend;
  const run = { resent: false, why: '', result: new Promise(r => { resolve = r; }) };
  const finish = entry => {
    if (settled) return;
    settled = true;
    clearTimeout(resend);
    for (const c of controllers) c.abort();
    resolve(entry);
  };
  const send = () => {
    const ctrl = new AbortController();
    controllers.push(ctrl);
    pending++;
    call(ctrl.signal).then(finish, e => {
      pending--;
      if (settled) return;
      run.why = String(e && e.message);
      if ((e && e.fatal) || (pending === 0 && controllers.length === 2)) finish({ id: item.id, error: 'AI_FAILED' });
    });
  };
  resend = setTimeout(() => {
    if (settled || controllers.length >= 2) return;
    run.resent = true;
    send();
  }, resendMs);
  send();
  run.stop = () => finish({ id: item.id, error: 'AI_TIMEOUT' });
  return run;
}

// Every item live, at once. Resolves { entries, resent, ok }.
async function askGemini(items, model, fetch) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('photo-leads: GEMINI_API_KEY is not set');
    return { entries: items.map(it => ({ id: it.id, error: 'AI_FAILED' })), resent: 0, ok: 0 };
  }
  const who = `gemini ${model}`, url = `${GEMINI_BASE}${model}:generateContent`;
  const runs = items.map(item => {
    const body = {
      contents: [{ role: 'user', parts: [{ text: PHOTO_CROP_PROMPT(item) }, geminiImagePart(item.image)] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: PHOTO_CROP_SCHEMA, temperature: 1, maxOutputTokens: 32768 },
    };
    const call = async signal => {
      const data = await postJSON({ fetch }, signal, who, url, { 'x-goog-api-key': apiKey }, body);
      return toEntry(item, parseLooseJSON(geminiText(data, who)));
    };
    return raceItem(item, call, hedgeMs());
  });
  const cutoff  = setTimeout(() => runs.forEach(r => r.stop()), cutoffMs());
  const entries = await Promise.all(runs.map(r => r.result));
  clearTimeout(cutoff);

  const whys = [...new Set(runs.filter((r, i) => entries[i].error && r.why).map(r => r.why))];
  if (whys.length) console.warn(`photo-leads: ${entries.filter(e => e.error).length} item(s) unanswered: ${whys.join('; ')}`);
  return { entries, resent: runs.filter(r => r.resent).length, ok: entries.filter(e => !e.error).length };
}

function record(dir, key, model, items) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${key}.json`), `${JSON.stringify({ key, model, items }, null, 2)}\n`);
  } catch (e) {
    console.warn('photo-leads: could not save the leads:', e.message);
  }
}

// body: { key, items: [{ id, kind, type, value, image, window }] }, already
// checked by the route. opts: { fetch, fixturesDir }.
async function readLeads(body, opts = {}) {
  const started     = Date.now();
  const { key }     = obj(body);
  const items       = list(obj(body).items);
  const fixturesDir = opts.fixturesDir || LEADS_DIR;
  const file        = isSafeId(key) ? loadFixture(fixturesDir, key) : null;
  const names       = photoProviders();
  const replayOnly  = names.length === 1 && names[0] === 'fixture';
  const recording   = process.env.PHOTO_RECORD === '1';
  const done = (out, provider, model, resent = 0) => ({ items: out, provider, model, ms: Date.now() - started, resent });

  if (replayOnly || (file && !IMAGE_HASH.test(key) && !recording)) {
    return done(items.map(it => savedEntry(file, it.id) || { id: it.id, error: 'AI_FAILED' }), 'fixture', file ? file.model : null);
  }

  const model = photoGeminiModel();
  const live  = await askGemini(items, model, opts.fetch || globalThis.fetch);
  let fromFile = 0;
  const out = live.entries.map(e => {
    const saved = e.error && savedEntry(file, e.id);
    if (saved) fromFile++;
    return saved || e;
  });
  if (recording && live.ok && isSafeId(key)) record(fixturesDir, key, model, out.filter(e => !e.error));
  return live.ok === 0 && fromFile ? done(out, 'fixture', file.model, live.resent) : done(out, 'gemini', model, live.resent);
}

module.exports = { readLeads };
