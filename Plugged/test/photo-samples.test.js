// Tests for circuit3d/samples/samples.js (issue #182): the photo samples the
// 📷 overlay's sample picker offers. window.PhotoSamples is loaded the way
// the page loads it (a plain script setting window.PhotoSamples), in a fake
// window.
// Contract: docs/API-CONTRACT.md → "Page additions" (window.PhotoSamples).
//
// Shapes these tests assume (stated so the builder matches them):
// - window.PhotoSamples has 'demo-board' (the default, kept) plus 'piranha',
//   'resistors', 'multimeter' and 'timer555'.
// - Every entry, demo-board included, is
//     { file, cols, taps: { a1, aN, jN, j1 }, title, credit }
//   file      a path under samples/ (relative to circuit3d/), on disk
//   cols      30 or 63
//   taps      exactly the 4 corner holes of a cols-column board, [x, y] in
//             the file's own pixels (a corner may lie off the image)
//   title     its tile's name in the sample picker, e.g. "Piranha LEDs"
//             (demo-board's is like "Demo: LED in backwards")
//   credit    the photo's credit line, e.g. "Photo: lungstruck, CC BY 2.0",
//             shown on its tile and its confirm screen (demo-board is a tile
//             too, and lungstruck's photo until #144)
// - Each new sample is one of the web eval photos (test/fixtures/photo/web/):
//     piranha → p6_piranha, resistors → p1_resistors,
//     multimeter → p5_multimeter, timer555 → p3_bjornr
//   Its cols is that photo's ncols; its 4 corners put the photo's labelled
//   holes (photos.json taps) back where they were labelled; its credit names
//   the photo's author and licence from ATTRIBUTION.md. The file may be the
//   same image or a resized copy: the labelled taps are scaled to its size.
// - Each new sample has its live recording (step 3), replayed with no AI call:
//     test/fixtures/photo/<id>.json        { sample: id, sha256, reading,
//                                            provider, model } (photo-reader.js)
//     test/fixtures/photo/leads/<id>.json  { key: id, model, items }
//                                            (photo-leads.js)
//   The reading is a valid Reading v1 (validateReading leaves it as it is)
//   for the sample's board size; readPhoto answers the sample from it with
//   the default (live) provider list and never calls fetch; the leads file
//   has a saved answer for every crop the page sends for that reading
//   (PhotoCrops.items on the sample's grid), and readLeads replays them all
//   with no fetch.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const ROOT      = path.join(__dirname, '..');
const CIRCUIT3D = path.join(ROOT, 'circuit3d');
const SAMPLES   = path.join(CIRCUIT3D, 'samples', 'samples.js');
const WEB       = path.join(__dirname, 'fixtures', 'photo', 'web');
const PHOTOS    = require('./fixtures/photo/web/photos.json');
const PhotoGrid  = require('../circuit3d/js/photo-grid.js');
const PhotoCrops = require('../circuit3d/js/photo-crops.js');
const { isSafeId, validateReading, readPhoto } = require('../backend/photo-reader.js');
const { readLeads } = require('../backend/photo-leads.js');

const RECORDINGS = path.join(__dirname, 'fixtures', 'photo');

// The new samples and the eval photo each one is (issue #182 → Context).
const SOURCES = { piranha: 'p6_piranha', resistors: 'p1_resistors', multimeter: 'p5_multimeter', timer555: 'p3_bjornr' };
const DEFAULT = 'demo-board';
const IDS     = [DEFAULT, ...Object.keys(SOURCES)];

// A corner may sit up to this many hole pitches from where the photo's
// labelled holes put it: beyond a quarter pitch the dots fall between holes.
const MAX_OFF_PITCH = 0.25;

// samples.js as the page runs it: a plain script on a window. JSON round trip:
// plain objects of this realm, so deepStrictEqual compares values only.
function loadSamples() {
  const window = {};
  vm.runInNewContext(fs.readFileSync(SAMPLES, 'utf8'), { window }, { filename: SAMPLES });
  assert.ok(window.PhotoSamples && typeof window.PhotoSamples === 'object', 'samples.js sets window.PhotoSamples');
  return JSON.parse(JSON.stringify(window.PhotoSamples));
}

// Width and height of a JPEG (its SOF marker) or PNG (its IHDR).
function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  assert.ok(b[0] === 0xff && b[1] === 0xd8, `${file} is a JPEG or PNG`);
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error(`${file}: no JPEG size marker`);
}

// ATTRIBUTION.md's table: file → { author, licence }, links and "(site)" notes stripped.
function attributions() {
  const out = {};
  for (const line of fs.readFileSync(path.join(WEB, 'ATTRIBUTION.md'), 'utf8').split('\n')) {
    const m = /^\|\s*`([^`]+)`\s*\|[^|]*\|([^|]*)\|([^|]*)\|/.exec(line);
    if (!m) continue;
    const plain = s => s.trim().replace(/^\[([^\]]+)\]\([^)]*\)$/, '$1');
    out[m[1]] = { author: plain(m[2]).replace(/\s*\(.*\)$/, ''), licence: plain(m[3]) };
  }
  return out;
}

// ── Every sample's shape ───────────────────────────────────────

test('PhotoSamples holds demo-board plus piranha, resistors, multimeter and timer555, each a plain lowercase id', () => {
  const samples = loadSamples();
  const keys = Object.keys(samples);
  for (const id of IDS) assert.ok(keys.includes(id), `PhotoSamples has '${id}': got ${JSON.stringify(keys)}`);
  for (const id of keys) {
    assert.ok(isSafeId(id) && id === id.toLowerCase(), `'${id}' is a plain lowercase id (the server keys its recording by it)`);
  }
});

test.each(IDS)('PhotoSamples[%s] is { file under samples/ and on disk, cols 30 or 63, the 4 corner taps, title, credit }, and its taps build a grid', id => {
  const s = loadSamples()[id];
  assert.ok(s, `PhotoSamples has '${id}'`);

  assert.equal(typeof s.file, 'string', `${id}.file is a string`);
  assert.match(s.file, /^samples\/[^/]+\.(jpe?g|png)$/, `${id}.file is an image under samples/: ${s.file}`);
  assert.ok(fs.existsSync(path.join(CIRCUIT3D, s.file)), `${id}.file exists: circuit3d/${s.file}`);

  assert.ok(s.cols === 30 || s.cols === 63, `${id}.cols is 30 or 63, got ${s.cols}`);
  const corners = ['a1', `a${s.cols}`, `j${s.cols}`, 'j1'];
  assert.deepStrictEqual(Object.keys(s.taps || {}).sort(), [...corners].sort(),
    `${id}.taps are exactly the corners ${corners.join(', ')} of a ${s.cols}-column board`);
  for (const h of corners) {
    const p = s.taps[h];
    assert.ok(Array.isArray(p) && p.length === 2 && p.every(Number.isFinite), `${id}.taps.${h} is [x, y], got ${JSON.stringify(p)}`);
  }

  for (const k of ['title', 'credit']) {
    assert.ok(typeof s[k] === 'string' && s[k].trim() !== '', `${id}.${k} is a non-empty string, got ${JSON.stringify(s[k])}`);
  }

  let grid = null;
  assert.doesNotThrow(() => { grid = PhotoGrid.homography(s.taps, s.cols); }, `${id}: PhotoGrid.homography(taps, ${s.cols})`);
  assert.equal(grid.cols, s.cols, `${id}: a ${s.cols}-column grid`);
});

test('every sample has its own title (the picker names them apart)', () => {
  const samples = loadSamples();
  const titles = IDS.map(id => samples[id] && samples[id].title);
  assert.equal(new Set(titles).size, IDS.length, `titles: ${JSON.stringify(titles)}`);
});

// ── The four eval photos ───────────────────────────────────────

test.each(Object.entries(SOURCES))('PhotoSamples.%s is %s: its board size, corners that put the labelled holes back, and a credit naming its author and licence', (id, web) => {
  const s = loadSamples()[id];
  assert.ok(s, `PhotoSamples has '${id}'`);
  const photo = PHOTOS[web];
  assert.equal(s.cols, photo.ncols, `${id}: the photo's board has ${photo.ncols} columns`);

  // The labelled holes, scaled to the sample file's own pixels.
  const file = path.join(CIRCUIT3D, s.file);
  assert.ok(fs.existsSync(file), `${id}.file exists: circuit3d/${s.file}`);
  const size = imageSize(file);
  const sx = size.width / photo.width, sy = size.height / photo.height;
  assert.ok(Math.abs(sx / sy - 1) < 0.01,
    `${id}: circuit3d/${s.file} (${size.width} × ${size.height}) is ${photo.file} (${photo.width} × ${photo.height}) or a resized copy`);

  const grid = PhotoGrid.homography(s.taps, s.cols);
  for (const [hole, [lx, ly]] of Object.entries(photo.taps)) {
    const want = [lx * sx, ly * sy];
    const got  = grid.toPhoto(grid.holeCentre(hole));
    const col  = Number(hole.slice(1));
    const next = grid.toPhoto(grid.holeCentre(hole[0] + (col < s.cols ? col + 1 : col - 1)));
    const pitch = Math.hypot(next[0] - got[0], next[1] - got[1]);
    const off   = Math.hypot(got[0] - want[0], got[1] - want[1]) / pitch;
    assert.ok(off <= MAX_OFF_PITCH,
      `${id}: ${hole} labelled at ${want.map(v => v.toFixed(1))}, the sample's corners put it at ${got.map(v => v.toFixed(1))} (${off.toFixed(2)} pitch off)`);
  }

  const by = attributions()[photo.file];
  assert.ok(by, `ATTRIBUTION.md lists ${photo.file}`);
  const credit = String(s.credit || '').toLowerCase();
  assert.ok(credit.includes(by.author.toLowerCase()), `${id}.credit names the author "${by.author}": ${JSON.stringify(s.credit)}`);
  assert.ok(credit.includes(by.licence.toLowerCase()), `${id}.credit names the licence "${by.licence}": ${JSON.stringify(s.credit)}`);
});

// ── The recordings (step 3) ───────────────────────────────────

// A 1 × 1 PNG: any image will do, a sample is keyed by its id.
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
// The env readPhoto and readLeads read per request: unset, so the defaults
// apply (PHOTO_PROVIDERS gemini, live, not recording).
const ENV_KEYS = ['PHOTO_PROVIDERS', 'PHOTO_RECORD'];

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

test.each(Object.keys(SOURCES))('the %s recording replays with no AI call: its Reading is valid for its board, /api/photo\'s reader answers from it, and every crop the page sends has a saved answer', async id => {
  const s = loadSamples()[id];
  assert.ok(s, `PhotoSamples has '${id}'`);
  const file = path.join(RECORDINGS, `${id}.json`), leadsFile = path.join(RECORDINGS, 'leads', `${id}.json`);
  assert.ok(fs.existsSync(file), `test/fixtures/photo/${id}.json exists`);
  assert.ok(fs.existsSync(leadsFile), `test/fixtures/photo/leads/${id}.json exists`);
  const saved = readJson(file), leads = readJson(leadsFile);

  assert.equal(saved.sample, id, `${id}.json's sample`);
  assert.deepStrictEqual(validateReading(saved.reading).reading, saved.reading, `${id}.json holds a Reading v1 that validateReading leaves as it is`);
  assert.equal(saved.reading.board.cols, s.cols, `${id}.json was read on the sample's ${s.cols}-column board`);

  const grid  = PhotoGrid.homography(s.taps, s.cols);
  const sent  = { cols: grid.cols, pitch: grid.pitch, x0: grid.x0, y0: grid.y0, width: grid.width, height: grid.height };
  const calls = [];
  const fetch = async url => { calls.push(String(url)); throw new Error('no AI in this test'); };
  const savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  try {
    const out = await readPhoto({ sample: id, image: TINY_PNG, grid: sent }, { fetch });
    assert.equal(out.provider, 'fixture', `${id}: answered by ${out.provider} (${out.model}), not its recording`);
    assert.equal(out.key, id, `${id}: the fixture key`);
    assert.deepStrictEqual(out.reading, saved.reading, `${id}: the recorded Reading`);
    assert.deepStrictEqual(calls, [], `${id}: no AI call`);

    // The crop round: the page's items for this Reading on this grid, all saved.
    assert.equal(leads.key, id, `leads/${id}.json's key`);
    const items = PhotoCrops.items(saved.reading, grid);
    assert.ok(items.length > 0, `${id}: the recording has crops to place`);
    const savedIds = new Set((leads.items || []).filter(e => e && Array.isArray(e.leads) && e.leads.length).map(e => e.id));
    const missing  = items.map(it => it.id).filter(i => !savedIds.has(i));
    assert.deepStrictEqual(missing, [], `${id}: leads/${id}.json has a saved answer for every crop the page sends`);

    const body   = { key: id, items: items.map(it => ({ ...it, image: TINY_PNG, window: PhotoCrops.window(grid, it.box) })) };
    const placed = await readLeads(body, { fetch });
    assert.equal(placed.provider, 'fixture', `${id}: the crops answered by ${placed.provider}, not the saved leads`);
    assert.deepStrictEqual(placed.items.filter(e => e.error).map(e => e.id), [], `${id}: every crop answered from leads/${id}.json`);
    assert.deepStrictEqual(calls, [], `${id}: no AI call for the crops`);
  } finally {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
