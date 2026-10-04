// 📷 the crop round (issue #160, Photo crops 2/2): after /api/photo answers
// with a box-round Reading (boxes, placeholder legs, 'leads' unsure), the
// page cuts one zoomed, labelled crop per resistor, LED and wire, sends them
// in one POST /api/photo/leads, and opens the confirm screen with the
// returned legs. /api/photo, /api/photo/leads and /api/ask are stubbed in
// the browser; no AI is called. Guest only; Google sign-in stays a manual QA
// case. The pure parts (items, window, scaleH, matrix, merge) are checked in
// test/photo-crops.test.js; this file checks the page.
//
// Every test uses Use sample photo, so the grid is the sample's:
// PhotoCapture.grid = PhotoGrid.homography(PhotoSamples['demo-board'].taps, 63)
// (j on top). The Readings here are built on that grid's hole centres.
//
// The page the builder matches:
//   - window.PhotoCrops       circuit3d/js/photo-crops.js (API in the header
//                             of test/photo-crops.test.js), plus the
//                             browser-only render(source, H, grid, win, rails)
//                             → a JPEG data URL of win.width × win.height: the
//                             inner area warped with matrix(H, win) from the
//                             downsized ORIGINAL photo and drawn at (padLeft,
//                             padTop) on a white canvas; column numbers above
//                             and below each column in view, row letters at
//                             the left and right of each row in view, the
//                             rail signs (+ red, − blue, from board.rails) at
//                             each rail row in view.
//   - photo.js, after /api/photo answers 200 with a Reading:
//       PhotoCrops.items(reading, PhotoCapture.grid) non-empty, the reply
//       has a `key` and its provider isn't 'deepseek' (#161) →
//         ONE POST /api/photo/leads
//         { key, items: [{ id, kind, type, value, image, window }] }, one
//         entry per item, window = PhotoCrops.window(grid, item.box).
//         (#173 changed what happens around it; see below.)
//       It waits at most window.PhotoCapture.leadsTimeoutMs (default 45000
//       since #173, was 35000; PHOTO_LEADS_PAGE_TIMEOUT_MS; read when the
//       request starts, so tests shorten it). A timeout, a non-200 or a
//       network failure keeps the box round's placeholders, no error message.
//       No items, or no key → no request: straight to the confirm screen.
//   - #173, the confirm screen opens after the box round and each part's
//     legs snap in as its crop answers:
//       PhotoConfirm.open(reading, …) right after /api/photo answers, with
//       the box round's placeholders ('?' snapped); then the crops go out
//       with the header `Accept: application/x-ndjson`, and the 200 body
//       (Content-Type application/x-ndjson) is read line by line as it
//       arrives (a line may come in pieces): one line per item,
//       { id, found, leads, conf } or { id, error }, in finish order, then a
//       last line { done: true, provider, model, ms }. Each item line goes to
//       PhotoConfirm.place(id, entry).
//       PhotoConfirm.place(id, entry): unless she has touched that item since
//       open() (moved one of its dots, ⇄, ×, or changed its value or colour),
//       merge it (PhotoCrops.merge with that one entry; found false drops the
//       item), snap its '?' holes, rebuild, relist and redraw. A touched item
//       ignores its line.
//       While crops are out: window.PhotoConfirm.placing (a Set or an array)
//       holds the ids still being placed (every cropped item at first; an id
//       leaves when its found line arrives); each of their rows in
//       #photo-parts has the class .photo-placing; #photo-confirm shows
//       "Placing legs N/M…" (N item lines answered, M crops sent). At
//       { done: true }, a timeout, a non-200, or a stream or network error:
//       every placing state and the count are cleared, no message. With no
//       round (no key, nothing to crop, a deepseek reading) there is no
//       placing state at all.
//       Cancel (and Build it, which closes the overlay) while crops are out
//       aborts the request; nothing is applied after. Build it works at any
//       time: PhotoImport.build of the Reading as it is (unplaced items keep
//       their placeholders).
//       How these tests stub the stream: page.route fulfils the whole NDJSON
//       body at once (fulfilLines); for lines that arrive one at a time,
//       streamLeads() replaces window.fetch for /api/photo/leads only with a
//       Response whose body the test writes chunk by chunk, and which errors
//       when the page aborts it, as a real fetch does.
//   - #161, the round never stalls, never oversends, and is Gemini's:
//       items() leaves out an item whose box lies wholly off the flattened
//       image (or whose crop would have a 0-px photo area): it is never
//       rendered or sent and keeps its placeholders. It returns at most
//       PhotoCrops.MAX_ITEMS (24, the contract's "1 to 24"), the first 24;
//       the rest keep their placeholders.
//       Any throw in the round (render, request, merge) opens the confirm
//       screen without that item's legs, no message, as for a timeout: no
//       page error and no console error (a console.warn is fine). photo.js
//       calls PhotoCrops.render through window.PhotoCrops at crop time, so
//       a test can make it throw.
//       The round runs unless /api/photo answered with provider 'deepseek'
//       (Gemini failed, deepseek read the boxes): 'gemini' and 'fixture'
//       run it, so a recorded sample replayed as 'fixture' still merges its
//       saved leads.
//   - #177, a landing line never eats her typing or closes her dropdown:
//       PhotoConfirm.place(id, entry) updates that item's row and the canvas
//       AT ONCE (its dots, its holes, its .photo-placing, the count, Build
//       it's state), but never replaces the control she is using: an input
//       or select in #photo-parts that has focus stays the same element,
//       keeps its focus, its typed value and (a select) its open picker,
//       while another item's line lands. (These tests choose "at once" over
//       the issue's other option, a full relist deferred to focusout.)
const fs   = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

// The demo board's saved reading: boxes, but real holes and nothing unsure.
const MOCK_READING = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'photo', 'demo-board.json'), 'utf8')).reading;

const KEY        = '3f9a'.repeat(16);          // an image hash, as /api/photo returns it
const MAX_PIXELS = 2000000;
const BB830      = { aOuter: '+', aInner: '-', jInner: '+', jOuter: '-' };

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`console: ${m.text()} @ ${(m.location() && m.location().url) || ''}`);
  });
  return errors;
}

async function openEditor(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

// The sample's grid, before it is sent: hole → flattened-image centre.
const sampleCentres = (page, holes) => page.evaluate(holes => {
  const s = window.PhotoSamples['demo-board'];
  const g = window.PhotoGrid.homography(s.taps, s.cols);
  return Object.fromEntries(holes.map(h => [h, g.holeCentre(h)]));
}, holes);

const HOLES = ['h10', 'h14', 'b40', 'b42', 'e50', 'f53', 'd20', 'd24', 'g15', 'rail:jOuter:20'];

// A box around its holes, placeholder legs at the midpoints of its short
// edges, as backend/photo-reader.js boxesToReading leaves them.
function boxed(c, holes) {
  const xs = holes.map(h => c[h][0]), ys = holes.map(h => c[h][1]);
  const box = [Math.min(...xs) - 15, Math.min(...ys) - 12, Math.max(...xs) + 15, Math.max(...ys) + 12];
  const [x0, y0, x1, y1] = box, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  return { box, pts: x1 - x0 >= y1 - y0 ? [[x0, my], [x1, my]] : [[mx, y0], [mx, y1]] };
}

// The box round: 2 resistors, an LED, an IC ('other') and a wire, every one
// with 'leads' unsure.
function boxRound(c) {
  const part = (id, type, value, holes) => {
    const { box, pts } = boxed(c, holes);
    return { id, type, what: type, value, bands: [], color: '', leads: pts.map(pt => ({ hole: '?', pt, role: 'unknown' })),
             box, confidence: 0.8, unsure: ['leads'] };
  };
  const { box, pts } = boxed(c, ['g15', 'rail:jOuter:20']);
  return {
    board: { visible: true, cols: 63, rails: Object.assign({}, BB830), split: false },
    parts: [
      part('R1', 'resistor', 470, ['h10', 'h14']),
      part('LED1', 'led', 0, ['b40', 'b42']),
      part('X1', 'other', 0, ['e50', 'f53']),
      part('R2', 'resistor', 1000, ['d20', 'd24']),
    ],
    wires: [{ id: 'W1', color: '', ends: pts.map(pt => ({ hole: '?', pt })), box, confidence: 0.9, unsure: ['leads'] }],
    power: [],
  };
}

// What the crop round sends, in order: parts then wires, never the IC.
const SENT = [['R1', 'part', 'resistor', 470], ['LED1', 'part', 'led', 0], ['R2', 'part', 'resistor', 1000], ['W1', 'wire', 'wire', 0]];

// /api/photo/leads' answers: a few px off each hole (well inside its 0.45
// pitch), the LED's cathode first; R2 timed out.
function answers(c) {
  const at = (h, dx, dy) => [c[h][0] + dx, c[h][1] + dy];
  return {
    R1:   { id: 'R1', found: true, conf: 0.9, leads: [{ pin: '1', pt: at('h10', 3, -2), role: 'none' }, { pin: '2', pt: at('h14', -2, 3), role: 'none' }] },
    LED1: { id: 'LED1', found: true, conf: 0.8, leads: [{ pin: 'cathode', pt: at('b40', -2, 3), role: 'cathode' }, { pin: 'anode', pt: at('b42', 3, -2), role: 'anode' }] },
    R2:   { id: 'R2', error: 'AI_TIMEOUT' },
    W1:   { id: 'W1', found: true, conf: 0.9, leads: [{ pin: '1', pt: at('g15', 2, 2), role: 'none' }, { pin: '2', pt: at('rail:jOuter:20', 2, 3), role: 'none' }] },
  };
}
// Where each answered leg should land.
const LANDS = { R1: ['h10', 'h14'], LED1: ['b40', 'b42'], W1: ['g15', 'rail:jOuter:20'] };

// 📷 → Use sample photo → the picker's demo-board tile (#182).
const openSample = async page => {
  await page.locator('#photo-btn').click();
  await page.locator('#photo-sample').click();
  const tile = page.locator('#photo-samples [data-sample="demo-board"]');
  await expect(tile, 'Use sample photo opens the sample picker (#182)').toBeVisible();
  await tile.click();
};

const confirmState = page => page.evaluate(() => {
  const c = window.PhotoConfirm;
  return { reading: c.reading, dots: c.dots() };
});
const dotOf = (s, id, i) => s.dots.find(d => d.id === id && d.end === i);

// ── The streamed answer (#173) ─────────────────────────────────────────────

const NDJSON = 'application/x-ndjson';
const DONE   = { done: true, provider: 'gemini', model: 'gemini-robotics-er-2-preview', ms: 9100 };
// An NDJSON body: one line per entry, then the done line.
const ndjson      = (entries, done = DONE) => [...entries, done].map(e => `${JSON.stringify(e)}\n`).join('');
const fulfilLines = (route, entries, done) => route.fulfill({ status: 200, contentType: NDJSON, body: ndjson(entries, done) });

// The placing states: PhotoConfirm.placing and the rows marked .photo-placing
// (both sorted), and the "Placing legs N/M…" count shown in #photo-confirm
// ('' when none).
const placingState = page => page.evaluate(() => ({
  placing: [...(window.PhotoConfirm.placing || [])].sort(),
  rows:    [...document.querySelectorAll('#photo-parts li.photo-placing')].map(li => li.dataset.id).sort(),
  count:   (/Placing legs[^\n]*/i.exec(document.getElementById('photo-confirm').innerText) || [''])[0],
}));
const NONE_PLACING = { placing: [], rows: [], count: '' };

// Waits until the confirm screen shows and nothing is still being placed
// (once `sent` has a request, when given: the round has started).
async function settled(page, sent) {
  if (sent) await expect.poll(() => sent.length, { message: 'the crops are sent' }).toBeGreaterThan(0);
  await expect(page.locator('#photo-confirm')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => placingState(page), { message: 'every placing state and the count clear' }).toEqual(NONE_PLACING);
}

// window.fetch for /api/photo/leads only (anything else, or everything once
// window.__leads.on is false, goes to the real fetch and so to page.route):
// a 200 application/x-ndjson Response whose body the test writes, chunk by
// chunk, with push(page, text). Aborting the request errors the body, as a
// real fetch does, and is recorded.
async function streamLeads(page) {
  await page.evaluate(() => {
    const real = window.fetch.bind(window);
    const T = window.__leads = { on: true, calls: [] };
    window.fetch = (url, opts = {}) => {
      if (!T.on || !String(url).includes('/api/photo/leads')) return real(url, opts);
      const call = { accept: new Headers(opts.headers || {}).get('accept') || '', ids: JSON.parse(opts.body).items.map(i => i.id), aborted: false, ctl: null };
      T.calls.push(call);
      const body = new ReadableStream({ start(ctl) { call.ctl = ctl; } });
      const abort = () => {
        call.aborted = true;
        try { call.ctl.error(new DOMException('The user aborted a request.', 'AbortError')); } catch { /* already closed */ }
      };
      if (opts.signal) {
        if (opts.signal.aborted) { abort(); return Promise.reject(new DOMException('The user aborted a request.', 'AbortError')); }
        opts.signal.addEventListener('abort', abort, { once: true });
      }
      return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }));
    };
  });
}
const leadsCalls = page => page.evaluate(() => window.__leads.calls.map(c => ({ accept: c.accept, ids: c.ids, aborted: c.aborted })));
// Writes text into the latest stubbed body; false when it is already closed or errored.
const push = (page, text) => page.evaluate(t => {
  const c = window.__leads.calls[window.__leads.calls.length - 1];
  try { c.ctl.enqueue(new TextEncoder().encode(t)); return true; } catch { return false; }
}, text);
const endStream = page => page.evaluate(() => {
  try { window.__leads.calls[window.__leads.calls.length - 1].ctl.close(); } catch { /* already closed */ }
});

// The points of an item's ends on the confirm screen, or null when it is gone.
const ptsOf = (page, id) => page.evaluate(id => {
  const r = window.PhotoConfirm.reading;
  const e = r && (r.parts.find(p => p.id === id) || r.wires.find(w => w.id === id));
  return e ? (e.leads || e.ends).map(x => x.pt) : null;
}, id);

const expectedBuild = (page, reading) => page.evaluate(r => window.PhotoImport.build(r, { components: [] }), reading);

// A tap on flattened pixel (fx, fy) of the confirm canvas.
async function tapFlat(page, [fx, fy]) {
  const box  = await page.locator('#photo-confirm-canvas').boundingBox();
  const size = await page.evaluate(() => ({ w: window.PhotoCapture.grid.width, h: window.PhotoCapture.grid.height }));
  await page.mouse.click(box.x + fx * box.width / size.w, box.y + fy * box.height / size.h);
}

// The canvas pixels in a 1-pitch square around a flattened point, for "the
// drawing changed there".
const patch = (page, [fx, fy]) => page.evaluate(([fx, fy]) => {
  const c = document.getElementById('photo-confirm-canvas');
  const g = window.PhotoCapture.grid;
  const k = c.width / g.width, r = Math.max(2, Math.round(g.pitch * k / 2));
  return Array.from(c.getContext('2d').getImageData(Math.round(fx * k) - r, Math.round(fy * k) - r, 2 * r, 2 * r).data);
}, [fx, fy]);
const patchDiff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

// The box round's own Reading as the confirm screen shows it: every '?'
// snapped from its placeholder pt, nothing else changed.
const placeholdersOf = (page, reading) => page.evaluate(r => {
  const g = window.PhotoCapture.grid, c = JSON.parse(JSON.stringify(r));
  for (const e of [...c.parts.flatMap(p => p.leads), ...c.wires.flatMap(w => w.ends)]) if (e.hole === '?') e.hole = g.snap(e.pt).hole;
  return c;
}, reading);

// Width and height of an image data URL, decoded by the browser.
const imageSize = (page, src) => page.evaluate(src => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
  img.onerror = () => reject(new Error('the image did not decode'));
  img.src = src;
}), src);

// A crop, decoded in the page, against the flattened image sent to /api/photo:
//   margins  ink pixels (some channel < 175) in each label margin, beside the photo area
//   corner   the top-left pixel (no label there: white)
//   same     mean |crop − flattened| (RGB summed) where a crop pixel and a
//            flattened pixel are the same point by the contract's window mapping
//   shifted  the same, with the flattened point half a pitch (15 px) to the
//            right: what a crop drawn half a pitch off would score
const cropCheck = (page, crop, flat, win) => page.evaluate(async ({ crop, flat, win }) => {
  const load = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('no decode')); im.src = src; });
  const pixels = im => {
    const c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    return x.getImageData(0, 0, c.width, c.height);
  };
  const C = pixels(await load(crop)), F = pixels(await load(flat));
  const px = (img, x, y) => { const i = 4 * (y * img.width + x); return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
  const ink = p => Math.min(...p) < 175;
  const count = (x0, y0, x1, y1) => {
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (ink(px(C, x, y))) n++;
    return n;
  };
  const { padLeft: pl, padTop: pt, width: W, height: H, scale: s } = win;
  const margins = { top: count(pl, 2, W - pl, pt - 2), bottom: count(pl, H - pt + 2, W - pl, H - 2),
                    left: count(2, pt, pl - 2, H - pt), right: count(W - pl + 2, pt, W - 2, H - pt) };
  const diff = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  let same = 0, shifted = 0, n = 0;
  for (let fy = Math.ceil(win.y) + 2; fy < win.y + (H - 2 * pt) / s - 2; fy += 2) {
    for (let fx = Math.ceil(win.x) + 2; fx < win.x + (W - 2 * pl) / s - 2; fx += 2) {
      const at = px(C, Math.round(pl + (fx - win.x) * s), Math.round(pt + (fy - win.y) * s));
      same += diff(at, px(F, fx, fy));
      shifted += diff(at, px(F, fx + 15, fy));
      n++;
    }
  }
  return { margins, corner: px(C, 3, 3), same: same / n, shifted: shifted / n, n };
}, { crop, flat, win });

// ── The crop round ─────────────────────────────────────────────────────────

test('a box-round Reading → one /api/photo/leads request with a labelled JPEG crop and its window per resistor, LED and wire (not the IC); the confirm screen\'s dots sit on the returned legs', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openEditor(page);
  const c = await sampleCentres(page, HOLES);
  const reading = boxRound(c), ANSWERS = answers(c);

  let photoBody = null;
  await page.route('**/api/photo', route => {
    photoBody = route.request().postDataJSON();
    return route.fulfill({ json: { reading, provider: 'gemini', model: 'gemini-robotics-er-2-preview', ms: 8200, key: KEY } });
  });
  const leadsSent = [];
  let release;
  const held = new Promise(r => { release = r; });
  await page.route('**/api/photo/leads', async route => {
    const body = route.request().postDataJSON();
    leadsSent.push(body);
    await held;                                        // the request's checks run meanwhile
    // #173: the answer is NDJSON lines (the page asks for them).
    await fulfilLines(route, body.items.map(i => ANSWERS[i.id] || { id: i.id, error: 'AI_FAILED' }));
  });

  await openSample(page);
  await expect.poll(() => leadsSent.length, { message: 'the page sends the crops to /api/photo/leads' }).toBe(1);
  // (#173: what the confirm screen shows while the crops are out is the #173 tests'.)

  // The request: the key, then one item per resistor, LED and wire, in Reading order.
  const body = leadsSent[0];
  expect(body.key, 'the key /api/photo returned').toBe(KEY);
  expect(body.items.map(i => [i.id, i.kind, i.type, i.value]), 'one item per boxed resistor, LED and wire; never the IC').toEqual(SENT);
  const wins = await page.evaluate(boxes => boxes.map(b => window.PhotoCrops.window(window.PhotoCapture.grid, b)),
    body.items.map(i => (reading.parts.find(p => p.id === i.id) || reading.wires.find(w => w.id === i.id)).box));
  for (const [k, item] of body.items.entries()) {
    const w = item.window;
    for (const f of ['x', 'y', 'scale', 'padLeft', 'padTop', 'width', 'height']) {
      expect(Number.isFinite(w[f]), `${item.id}: window.${f} is a finite number, got ${w[f]}`).toBe(true);
    }
    expect(w.scale, `${item.id}: scale`).toBeGreaterThan(0);
    expect(w, `${item.id}: the window is PhotoCrops.window(grid, its box)`).toEqual(wins[k]);
    expect(w.width * w.height, `${item.id}: at most 2 MP`).toBeLessThanOrEqual(MAX_PIXELS);
    expect(item.image.startsWith('data:image/jpeg;base64,'), `${item.id}: a JPEG data URL`).toBe(true);
    expect(await imageSize(page, item.image), `${item.id}: the crop is window.width × window.height`).toEqual({ width: w.width, height: w.height });
  }

  // R1's crop: labels in all four margins, white where there are none, and
  // its photo area is the flattened image's, point for point, by the window.
  const r1 = body.items[0];
  const check = await cropCheck(page, r1.image, photoBody.image, r1.window);
  for (const side of ['top', 'bottom', 'left', 'right']) {
    expect(check.margins[side], `R1's crop has labels in its ${side} margin (${JSON.stringify(check.margins)})`).toBeGreaterThan(20);
  }
  expect(Math.min(...check.corner), `R1's crop is white at its top-left corner, got rgb ${check.corner}`).toBeGreaterThan(225);
  expect(check.same, `R1's photo area lines up with the flattened image by the window (mean diff ${check.same.toFixed(1)}, half a pitch off: ${check.shifted.toFixed(1)}, ${check.n} points)`).toBeLessThan(20);
  expect(check.same, 'and clearly better than half a pitch off').toBeLessThan(0.6 * check.shifted);

  // The answers land on the confirm screen.
  release();
  await settled(page);
  const s = await confirmState(page);
  const pitch = await page.evaluate(() => window.PhotoCapture.grid.pitch);
  for (const [id, holes] of Object.entries(LANDS)) {
    const item = s.reading.parts.find(p => p.id === id) || s.reading.wires.find(w => w.id === id);
    const ends = item.leads || item.ends;
    holes.forEach((hole, i) => {
      const want = ANSWERS[id].leads[i].pt, d = dotOf(s, id, i);
      expect(ends[i].pt, `${id} end ${i} takes the returned point`).toEqual(want);
      expect(ends[i].hole, `${id} end ${i} snaps to ${hole}`).toBe(hole);
      expect(d, `a dot for ${id} end ${i}`).toBeTruthy();
      expect(Math.hypot(d.x - c[hole][0], d.y - c[hole][1]), `${id} end ${i} is drawn at ${hole}'s centre ${c[hole]}, got ${[d.x, d.y]}`).toBeLessThan(1);
      expect(Math.hypot(d.x - want[0], d.y - want[1]), `${id} end ${i}'s dot sits on the returned point ${want}`).toBeLessThan(0.45 * pitch);
    });
    expect(item.unsure, `${id}: 'leads' is no longer unsure`).not.toContain('leads');
  }
  const led = s.reading.parts.find(p => p.id === 'LED1');
  expect(led.leads.map(l => l.role), 'LED1 keeps the roles it came back with').toEqual(['cathode', 'anode']);
  expect(s.dots.filter(d => d.id === 'LED1' && d.plus).map(d => d.hole), 'the + sits on the anode, b42').toEqual(['b42']);
  await expect(page.locator('#photo-build'), 'the LED\'s + is known, so Build it is ready').toBeEnabled();

  // R2 timed out and the IC was never sent: their placeholders are kept.
  const kept = await placeholdersOf(page, reading);
  for (const id of ['R2', 'X1']) {
    expect(s.reading.parts.find(p => p.id === id), `${id} keeps its placeholder legs and its 'leads' flag`).toEqual(kept.parts.find(p => p.id === id));
  }

  await expect(page.locator('#photo-error-sample'), 'no error').toBeHidden();
  await expect(page.locator('#photo-status'), 'the status is cleared').toHaveText('');
  expect(leadsSent.length, 'one request for the whole round').toBe(1);
  expect(errors).toEqual([]);
});

// ── It never blocks the confirm screen ─────────────────────────────────────

// #173 rewrote this test (#160/#161's version): the confirm screen now opens
// before the crops answer, so Cancel closes it mid-round, and a failed round
// only has to clear the placing states.
test('#173: Cancel while the crops are out closes the overlay and aborts the request, and nothing lands after; a non-200, a network failure, or no answer within PhotoCapture.leadsTimeoutMs (default 45000) each clear every placing state and keep the placeholders, no message', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openEditor(page);
  expect(await page.evaluate(() => window.PhotoCapture && window.PhotoCapture.leadsTimeoutMs),
    'PHOTO_LEADS_PAGE_TIMEOUT_MS: 45 s, above the server\'s 40 s cutoff plus the upload').toBe(45000);

  const c = await sampleCentres(page, HOLES);
  const reading = boxRound(c), ANSWERS = answers(c);
  await page.route('**/api/photo', route => route.fulfill({ json: { reading, provider: 'gemini', model: 'gemini-robotics-er-2-preview', ms: 8200, key: KEY } }));
  const line = id => `${JSON.stringify(ANSWERS[id])}\n`;

  // Cancel mid-stream: W1's line has landed, the rest are still out.
  await streamLeads(page);
  await openSample(page);
  await expect.poll(() => leadsCalls(page).then(x => x.length), { message: 'the crops are sent' }).toBe(1);
  await expect(page.locator('#photo-confirm'), 'the confirm screen is open while the crops are out').toBeVisible();
  await push(page, line('W1'));
  await expect.poll(() => ptsOf(page, 'W1'), { message: 'W1\'s line lands' }).toEqual(ANSWERS.W1.leads.map(l => l.pt));
  const before = await page.evaluate(() => window.PhotoConfirm.reading);
  await page.locator('#photo-cancel').click();
  await expect(page.locator('#photo-modal'), 'Cancel closes the overlay mid-round').toBeHidden();
  await expect.poll(() => leadsCalls(page).then(x => x[0].aborted), { message: 'Cancel aborts the crop request' }).toBe(true);
  await push(page, line('R1') + line('LED1') + `${JSON.stringify(DONE)}\n`);   // too late
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.PhotoConfirm.reading);
  if (after !== null) expect(after, 'nothing lands after Cancel').toEqual(before);
  await expect(page.locator('#photo-modal'), 'still closed').toBeHidden();

  // A non-200, a network failure, no answer at all: through page.route now.
  await page.evaluate(() => { window.__leads.on = false; window.PhotoCapture.leadsTimeoutMs = 2500; });
  let mode = 'error';
  const sentAt = [];
  await page.route('**/api/photo/leads', route => {
    sentAt.push(Date.now());
    if (mode === 'error') return route.fulfill({ status: 400, json: { reply: 'Send 1 to 24 crops, each with an id, a JPEG or PNG image and its window.', code: 'BAD_ITEMS' } });
    if (mode === 'abort') return route.abort('failed');
    // 'hang': never answered
  });
  const want = await placeholdersOf(page, reading);
  for (const m of ['error', 'abort', 'hang']) {
    mode = m;
    const n = sentAt.length;
    if (await page.locator('#photo-modal').isVisible()) await page.locator('#photo-cancel').click();
    await openSample(page);
    await expect.poll(() => sentAt.length, { message: `${m}: the crops were sent` }).toBe(n + 1);
    await expect(page.locator('#photo-confirm'), `${m}: the confirm screen is open`).toBeVisible();
    if (m === 'hang') {
      expect((await placingState(page)).placing, 'hang: still placing while it waits').toEqual(['LED1', 'R1', 'R2', 'W1']);
    }
    await expect.poll(() => placingState(page), { message: `${m}: every placing state and the count clear`, timeout: 8000 }).toEqual(NONE_PLACING);
    if (m === 'hang') expect(Date.now() - sentAt[n], 'hang: it waited for leadsTimeoutMs first').toBeGreaterThanOrEqual(2000);
    expect(await page.evaluate(() => window.PhotoConfirm.reading), `${m}: the box round's placeholders, 'leads' flags kept`).toEqual(want);
    await expect(page.locator('#photo-error-sample'), `${m}: no error`).toBeHidden();
    await expect(page.locator('#photo-status'), `${m}: no message`).toHaveText('');
  }

  // Only the failed or aborted crop requests may complain.
  expect(errors.filter(e => !/\/api\/photo\/leads|status of 400|ERR_ABORTED|ERR_FAILED/.test(e)), 'an aborted round is caught: no page error').toEqual([]);
});

// ── No crop round when there is nothing to place ───────────────────────────

test('a Reading with no \'leads\' flags (the demo board\'s saved reading), or a reply with no key, sends no /api/photo/leads request; the same box round with a key does', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  const c = await sampleCentres(page, HOLES);
  let answer = { reading: MOCK_READING, provider: 'fixture', model: 'gemini-robotics-er-2-preview', ms: 3, key: 'demo-board' };
  await page.route('**/api/photo', route => route.fulfill({ json: answer }));
  const leadsSent = [];
  await page.route('**/api/photo/leads', route => {
    const body = route.request().postDataJSON();
    leadsSent.push(body);
    return fulfilLines(route, body.items.map(i => ({ id: i.id, error: 'AI_FAILED' })), { done: true, provider: 'fixture', model: null, ms: 1 });
  });

  await openSample(page);
  await expect(page.locator('#photo-confirm')).toBeVisible();
  expect(await page.evaluate(() => window.PhotoConfirm.reading), 'the saved reading as it is').toEqual(MOCK_READING);
  expect(leadsSent.length, 'real holes, nothing unsure: no crop round').toBe(0);
  expect(await placingState(page), '#173 pin: no round, so nothing is "placing…"').toEqual(NONE_PLACING);

  // A box round whose reply has no key (a sample that isn't a plain id): no round either.
  const reading = boxRound(c);
  answer = { reading, provider: 'gemini', model: 'gemini-robotics-er-2-preview', ms: 8200, key: null };
  await page.locator('#photo-cancel').click();
  await openSample(page);
  await expect(page.locator('#photo-confirm')).toBeVisible();
  expect(await page.evaluate(() => window.PhotoConfirm.reading), 'no key: the placeholders').toEqual(await placeholdersOf(page, reading));
  expect(leadsSent.length, 'no key: no crop round').toBe(0);
  expect(await placingState(page), '#173 pin: no key, no round, so nothing is "placing…"').toEqual(NONE_PLACING);

  // The control: the same box round with its key does send its crops, so the
  // two zeros above are the page choosing not to.
  answer = { reading, provider: 'gemini', model: 'gemini-robotics-er-2-preview', ms: 8200, key: KEY };
  await page.locator('#photo-cancel').click();
  await openSample(page);
  await expect.poll(() => leadsSent.length, { message: 'with \'leads\' flags and a key, the crops are sent' }).toBe(1);
  await expect(page.locator('#photo-confirm')).toBeVisible();
  expect(errors).toEqual([]);
});

// ── #161: never stall, never oversend, skip the round after deepseek ───────

// The sample grid's flattened image: width, height and pitch, flattened px.
const sampleSize = page => page.evaluate(() => {
  const s = window.PhotoSamples['demo-board'];
  const g = window.PhotoGrid.homography(s.taps, s.cols);
  return { width: g.width, height: g.height, pitch: g.pitch };
});

// /api/photo/leads answers each sent id from `answers` (else AI_FAILED), as
// NDJSON lines (#173); returns the request bodies, in order.
async function answerLeads(page, answers, provider = 'gemini') {
  const sent = [];
  await page.route('**/api/photo/leads', route => {
    const body = route.request().postDataJSON();
    sent.push(body);
    return fulfilLines(route, body.items.map(i => answers[i.id] || { id: i.id, error: 'AI_FAILED' }),
                       { done: true, provider, model: 'gemini-robotics-er-2-preview', ms: 900 });
  });
  return sent;
}

const itemOf = (reading, id) => reading.parts.find(p => p.id === id) || reading.wires.find(w => w.id === id);
const endsOf = e => e.leads || e.ends;

test('#161: a box-round Reading with a wire boxed just off the image (a 0-px crop) still opens the confirm screen, no error, status cleared; that wire is never sent and keeps its placeholder dots', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openEditor(page);
  const c = await sampleCentres(page, HOLES);
  const { width, pitch } = await sampleSize(page);
  const reading = boxRound(c), ANSWERS = answers(c);
  // W2 lies wholly right of the image, so close that its 1.5-pitch margin
  // leaves 0.1 flattened px of photo: 0 crop px (createImageData throws).
  const x0 = width + 1.5 * pitch - 0.1;
  reading.wires.push({ id: 'W2', color: '', ends: [[x0, 315], [x0 + 30, 315]].map(pt => ({ hole: '?', pt })),
                       box: [x0, 300, x0 + 30, 330], confidence: 0.6, unsure: ['leads'] });
  await page.route('**/api/photo', route => route.fulfill({ json: { reading, provider: 'gemini', model: 'gemini-robotics-er-2-preview', ms: 8200, key: KEY } }));
  const leadsSent = await answerLeads(page, ANSWERS);

  await openSample(page);
  await expect(page.locator('#photo-confirm'), 'the confirm screen opens: the page doesn\'t stall on "placing legs…"').toBeVisible({ timeout: 10_000 });
  await settled(page, leadsSent);   // #173: the legs land after it opens
  await expect(page.locator('#photo-error-sample'), 'no error').toBeHidden();
  await expect(page.locator('#photo-status'), 'the status is cleared').toHaveText('');
  expect(leadsSent.map(b => b.items.map(i => i.id)), 'one request with the other crops, never W2').toEqual([SENT.map(s => s[0])]);

  const s = await confirmState(page);
  const kept = itemOf(await placeholdersOf(page, reading), 'W2');
  expect(itemOf(s.reading, 'W2'), 'W2 keeps its placeholder ends and its \'leads\' flag').toEqual(kept);
  for (const i of [0, 1]) {
    const d = dotOf(s, 'W2', i);
    expect(d && [d.x, d.y], `W2 end ${i}'s dot is drawn at its placeholder ${kept.ends[i].pt}`).toEqual(kept.ends[i].pt);
  }
  expect(endsOf(itemOf(s.reading, 'R1')).map(l => l.pt), 'the rest of the round still lands: R1 takes its returned legs')
    .toEqual(ANSWERS.R1.leads.map(l => l.pt));
  expect(errors).toEqual([]);
});

test('#161: a crop that fails to render (PhotoCrops.render throws) still opens the confirm screen, no error, status cleared; that item keeps its placeholders', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openEditor(page);
  const c = await sampleCentres(page, HOLES);
  const reading = boxRound(c);
  await page.route('**/api/photo', route => route.fulfill({ json: { reading, provider: 'gemini', model: 'gemini-robotics-er-2-preview', ms: 8200, key: KEY } }));
  await answerLeads(page, answers(c));
  // The 2nd crop (LED1, by SENT's order) fails to draw.
  await page.evaluate(() => {
    const render = window.PhotoCrops.render;
    let n = 0;
    window.PhotoCrops.render = function (...args) {
      if (++n === 2) throw new Error('the crop did not render (test)');
      return render.apply(this, args);
    };
  });

  await openSample(page);
  await expect(page.locator('#photo-confirm'), 'the confirm screen opens anyway').toBeVisible({ timeout: 10_000 });
  await settled(page);   // #173: a throw mid-round clears the placing states too
  await expect(page.locator('#photo-error-sample'), 'no error').toBeHidden();
  await expect(page.locator('#photo-status'), 'the status is cleared').toHaveText('');
  const s = await confirmState(page);
  expect(itemOf(s.reading, 'LED1'), 'LED1 keeps its placeholder legs and its \'leads\' flag')
    .toEqual(itemOf(await placeholdersOf(page, reading), 'LED1'));
  expect(errors, 'the throw is caught: no page error').toEqual([]);
});

test('#161: the crop round runs after a \'fixture\' reading (a replayed sample\'s saved leads are merged) but never after \'deepseek\': no /api/photo/leads request, the placeholders at once', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openEditor(page);
  const c = await sampleCentres(page, HOLES);
  const reading = boxRound(c), ANSWERS = answers(c);
  let answer = { reading, provider: 'fixture', model: 'gemini-robotics-er-2-preview', ms: 3, key: 'demo-board' };
  await page.route('**/api/photo', route => route.fulfill({ json: answer }));
  const leadsSent = await answerLeads(page, ANSWERS, 'fixture');

  // Pin: a recorded sample replays as 'fixture' with 'leads' flags; its crop
  // round still runs and its saved answers are merged.
  await openSample(page);
  await settled(page, leadsSent);   // #173: the legs land after it opens
  expect(leadsSent.map(b => b.key), 'fixture: one crop round, with the sample\'s key').toEqual(['demo-board']);
  let s = await confirmState(page);
  expect(endsOf(itemOf(s.reading, 'R1')).map(l => l.pt), 'fixture: R1 takes its saved legs').toEqual(ANSWERS.R1.leads.map(l => l.pt));

  // deepseek read the boxes (Gemini had failed): no crop round at all.
  answer = { reading, provider: 'deepseek', model: 'deepseek-v4-flash', ms: 9000, key: KEY };
  await page.locator('#photo-cancel').click();
  await openSample(page);
  await expect(page.locator('#photo-confirm')).toBeVisible({ timeout: 10_000 });
  expect(leadsSent.length, 'deepseek: no /api/photo/leads request (still only the fixture round\'s)').toBe(1);
  s = await confirmState(page);
  expect(s.reading, 'deepseek: the box round\'s placeholders, \'leads\' flags kept').toEqual(await placeholdersOf(page, reading));
  expect(await placingState(page), '#173 pin: deepseek, no round, so nothing is "placing…"').toEqual(NONE_PLACING);
  await expect(page.locator('#photo-error-sample'), 'no error').toBeHidden();
  await expect(page.locator('#photo-status'), 'the status is cleared').toHaveText('');
  expect(errors).toEqual([]);
});

test('#161: 30 resistors, LEDs and wires to place → one /api/photo/leads request with exactly the first 24; the other 6 keep their placeholders', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openEditor(page);
  // 15 resistors on row c, 7 LEDs on row h, 8 wires from row i to row g.
  const R   = Array.from({ length: 15 }, (_, k) => [`R${k + 1}`, 'resistor', 100 * (k + 1), [`c${1 + 4 * k}`, `c${4 + 4 * k}`]]);
  const LED = Array.from({ length: 7 },  (_, k) => [`LED${k + 1}`, 'led', 0, [`h${1 + 4 * k}`, `h${2 + 4 * k}`]]);
  const W   = Array.from({ length: 8 },  (_, k) => [`W${k + 1}`, [`i${30 + 4 * k}`, `g${32 + 4 * k}`]]);
  const c = await sampleCentres(page, [...R, ...LED].flatMap(p => p[3]).concat(W.flatMap(w => w[1])));
  const reading = {
    board: { visible: true, cols: 63, rails: Object.assign({}, BB830), split: false },
    parts: [...R, ...LED].map(([id, type, value, holes]) => {
      const { box, pts } = boxed(c, holes);
      return { id, type, what: type, value, bands: [], color: '', leads: pts.map(pt => ({ hole: '?', pt, role: 'unknown' })),
               box, confidence: 0.8, unsure: ['leads'] };
    }),
    wires: W.map(([id, holes]) => {
      const { box, pts } = boxed(c, holes);
      return { id, color: '', ends: pts.map(pt => ({ hole: '?', pt })), box, confidence: 0.9, unsure: ['leads'] };
    }),
    power: [],
  };
  const holesOf = Object.fromEntries([...R, ...LED].map(p => [p[0], p[3]]).concat(W));
  // Every sent item comes back found, a px off its holes.
  const ANSWERS = Object.fromEntries(Object.entries(holesOf).map(([id, holes]) => [id, { id, found: true, conf: 0.9,
    leads: holes.map((h, i) => ({ pin: String(i + 1), pt: [c[h][0] + 1, c[h][1] - 1], role: id.startsWith('LED') ? ['anode', 'cathode'][i] : 'none' })) }]));
  await page.route('**/api/photo', route => route.fulfill({ json: { reading, provider: 'gemini', model: 'gemini-robotics-er-2-preview', ms: 8200, key: KEY } }));
  const leadsSent = await answerLeads(page, ANSWERS);

  const ids    = [...reading.parts, ...reading.wires].map(e => e.id);
  const first  = ids.slice(0, 24), rest = ids.slice(24);   // every part, W1 and W2; then W3–W8
  await openSample(page);
  await expect.poll(() => leadsSent.length, { message: 'the crops are sent' }).toBe(1);
  expect(leadsSent[0].items.length, 'one request of at most 24 crops (the server refuses more: BAD_ITEMS)').toBe(24);
  expect(leadsSent[0].items.map(i => i.id), 'the first 24 in Reading order: every part, then W1 and W2').toEqual(first);

  await settled(page, leadsSent);   // #173: the legs land after it opens
  const s = await confirmState(page);
  for (const id of first) {
    expect(endsOf(itemOf(s.reading, id)).map(e => e.pt), `${id}: sent, its returned legs land`).toEqual(ANSWERS[id].leads.map(l => l.pt));
  }
  const kept = await placeholdersOf(page, reading);
  for (const id of rest) {
    expect(itemOf(s.reading, id), `${id}: not sent, keeps its placeholders and its 'leads' flag`).toEqual(itemOf(kept, id));
  }
  await expect(page.locator('#photo-error-sample'), 'no error').toBeHidden();
  await expect(page.locator('#photo-status'), 'the status is cleared').toHaveText('');
  expect(errors).toEqual([]);
});

// ── #173: the confirm screen opens at once; legs snap in as they answer ────

// /api/photo answering a box round, Gemini's, with an image-hash key.
const fromBoxRound = ({ reading }) => route => route.fulfill({ json: { reading, provider: 'gemini', model: 'gemini-robotics-er-2-preview', ms: 8200, key: KEY } });

test('#173: the confirm screen opens as soon as /api/photo answers, with the crop request still pending: every cropped row "placing…" and "Placing legs 0/4"; a dot she moves first keeps her spot; when the lines arrive the others snap to their returned points and every placing state clears', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openEditor(page);
  const c = await sampleCentres(page, [...HOLES, 'i12']);
  const reading = boxRound(c), ANSWERS = answers(c);
  await page.route('**/api/photo', fromBoxRound({ reading }));
  const sent = [];
  let release;
  const held = new Promise(r => { release = r; });
  await page.route('**/api/photo/leads', async route => {
    sent.push({ ids: route.request().postDataJSON().items.map(i => i.id), accept: route.request().headers().accept || '' });
    await held;
    // In finish order: W1, LED1, R2's timeout, then R1, the part she moved first.
    await fulfilLines(route, ['W1', 'LED1', 'R2', 'R1'].map(id => ANSWERS[id])).catch(() => {});
  });

  await openSample(page);
  await expect.poll(() => sent.length, { message: 'the crops are sent' }).toBe(1);
  expect(sent[0].accept, 'the page asks for the stream').toContain(NDJSON);
  await expect(page.locator('#photo-confirm'), 'the confirm screen is open while the crop request is still pending').toBeVisible();
  const kept = await placeholdersOf(page, reading);
  expect(await page.evaluate(() => window.PhotoConfirm.reading), 'meanwhile: the box round\'s placeholders').toEqual(kept);
  expect(await placingState(page), 'every cropped item (never the IC) is placing…, and the count is at 0 of the 4 crops sent')
    .toEqual({ placing: ['LED1', 'R1', 'R2', 'W1'], rows: ['LED1', 'R1', 'R2', 'W1'], count: expect.stringMatching(/^Placing legs 0\/4/) });

  // She moves R1's first leg to i12 before R1's line arrives.
  const d0 = dotOf(await confirmState(page), 'R1', 0);
  await tapFlat(page, [d0.x, d0.y]);
  expect(await page.evaluate(() => window.PhotoConfirm.selected), 'her tap picked R1\'s first dot').toEqual({ id: 'R1', end: 0 });
  await tapFlat(page, c.i12);
  const mine = itemOf((await confirmState(page)).reading, 'R1');
  expect(mine.leads[0].hole, 'R1\'s first leg is now in i12').toBe('i12');

  release();
  await settled(page);
  const s = await confirmState(page);
  expect(itemOf(s.reading, 'R1'), 'R1, moved before its line arrived, keeps her position: its late line is ignored').toEqual(mine);
  for (const id of ['LED1', 'W1']) {
    const ends = endsOf(itemOf(s.reading, id));
    LANDS[id].forEach((hole, i) => {
      expect(ends[i].pt, `${id} end ${i} takes its returned point`).toEqual(ANSWERS[id].leads[i].pt);
      expect(ends[i].hole, `${id} end ${i} snaps to ${hole}`).toBe(hole);
      const d = dotOf(s, id, i);
      expect(Math.hypot(d.x - c[hole][0], d.y - c[hole][1]), `${id} end ${i}'s dot is drawn at ${hole}'s centre`).toBeLessThan(1);
    });
    await expect(page.locator(`#photo-parts [data-id="${id}"]`), `${id}'s row lists its new holes`).toContainText(LANDS[id].join(' → '));
  }
  expect(itemOf(s.reading, 'R2'), 'R2 timed out: its placeholders and \'leads\' flag stay').toEqual(itemOf(kept, 'R2'));
  expect(await page.evaluate(() => window.PhotoConfirm.result), 'the build is redone with the legs').toEqual(await expectedBuild(page, s.reading));
  await expect(page.locator('#photo-error-sample'), 'no error').toBeHidden();
  await expect(page.locator('#photo-status'), 'no message').toHaveText('');
  expect(errors).toEqual([]);
});

test('#173: streamed lines, delayed: each part\'s dots move when its own line arrives while the rest keep their placeholders; the count goes 1/4, 2/4; a line split across two chunks still lands; { done } clears every placing state', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openEditor(page);
  const c = await sampleCentres(page, HOLES);
  const reading = boxRound(c), ANSWERS = answers(c);
  await page.route('**/api/photo', fromBoxRound({ reading }));
  await streamLeads(page);
  const line = id => `${JSON.stringify(ANSWERS[id])}\n`;
  const want = id => ANSWERS[id].leads.map(l => l.pt);
  const now  = () => page.evaluate(() => window.PhotoConfirm.reading);

  await openSample(page);
  await expect.poll(() => leadsCalls(page).then(x => x.length), { message: 'the crops are sent' }).toBe(1);
  await expect(page.locator('#photo-confirm'), 'open before any line arrives').toBeVisible();
  const kept = await placeholdersOf(page, reading);
  await expect.poll(() => placingState(page).then(p => p.count), { message: 'the count starts at 0 of 4' }).toMatch(/^Placing legs 0\/4/);

  // W1's line: W1's dots move (the list and the canvas follow); nothing else does.
  const before = await patch(page, c.g15);
  expect(endsOf(itemOf(kept, 'W1'))[0].hole, 'test check: W1\'s placeholder is not already in g15').not.toBe('g15');
  await push(page, line('W1'));
  await expect.poll(() => ptsOf(page, 'W1'), { message: 'W1\'s dots move when its line arrives' }).toEqual(want('W1'));
  let r = await now();
  for (const id of ['R1', 'LED1', 'R2']) expect(itemOf(r, id), `${id}: no line yet, its placeholders stay`).toEqual(itemOf(kept, id));
  expect(await placingState(page), 'W1 is placed; the count is 1 of 4')
    .toEqual({ placing: ['LED1', 'R1', 'R2'], rows: ['LED1', 'R1', 'R2'], count: expect.stringMatching(/^Placing legs 1\/4/) });
  await expect(page.locator('#photo-parts [data-id="W1"]'), 'W1\'s row lists its new holes').toContainText(LANDS.W1.join(' → '));
  expect(patchDiff(before, await patch(page, c.g15)), 'the canvas redrew: W1\'s dot is at g15 now').toBeGreaterThan(1);

  // R1's line in two pieces: nothing until the second piece ends it.
  const r1 = line('R1'), cut = Math.floor(r1.length / 2);
  await push(page, r1.slice(0, cut));
  await page.waitForTimeout(300);
  expect(await ptsOf(page, 'R1'), 'half a line is not applied').toEqual(endsOf(itemOf(kept, 'R1')).map(e => e.pt));
  expect((await placingState(page)).count, 'half a line is not counted').toMatch(/^Placing legs 1\/4/);
  await push(page, r1.slice(cut));
  await expect.poll(() => ptsOf(page, 'R1'), { message: 'R1 lands once its line is whole' }).toEqual(want('R1'));
  expect(await placingState(page), 'R1 is placed; the count is 2 of 4')
    .toEqual({ placing: ['LED1', 'R2'], rows: ['LED1', 'R2'], count: expect.stringMatching(/^Placing legs 2\/4/) });

  // LED1's line and R2's timeout in one chunk; then done, still open.
  await push(page, line('LED1') + line('R2'));
  await expect.poll(() => ptsOf(page, 'LED1'), { message: 'LED1 lands' }).toEqual(want('LED1'));
  r = await now();
  expect(itemOf(r, 'R2'), 'R2 timed out: its placeholders and \'leads\' flag stay').toEqual(itemOf(kept, 'R2'));
  expect(itemOf(r, 'R1').leads.map(l => l.pt), 'R1 is left as its own line put it').toEqual(want('R1'));
  await push(page, `${JSON.stringify(DONE)}\n`);
  await expect.poll(() => placingState(page), { message: '{ done } clears every placing state and the count' }).toEqual(NONE_PLACING);
  await endStream(page);
  await expect(page.locator('#photo-build'), 'LED1 came back with its roles: Build it is ready').toBeEnabled();
  await expect(page.locator('#photo-error-sample'), 'no error').toBeHidden();
  expect(errors).toEqual([]);
});

// A part or wire of the box round, boxed round its holes as boxRound's are.
function boxedItem(c, id, holes, type) {
  const { box, pts } = boxed(c, holes);
  if (type === 'wire') return { id, color: '', ends: pts.map(pt => ({ hole: '?', pt })), box, confidence: 0.9, unsure: ['leads'] };
  return { id, type, what: type, value: type === 'resistor' ? 1000 : 0, bands: [], color: '', box, confidence: 0.8, unsure: ['leads'],
           leads: pts.map(pt => ({ hole: '?', pt, role: 'unknown' })) };
}
// An answer a px or two off each of its holes.
const foundAt = (c, id, holes) => ({ id, found: true, conf: 0.9, leads: holes.map((h, i) => ({ pin: String(i + 1), pt: [c[h][0] + 2, c[h][1] - 2], role: 'none' })) });

test('#173: PhotoConfirm.place(id, entry) with the crops still out: two calls at different times each update only their own item; found false drops one; an item she touched first (⇄, a value, a colour, ×) ignores its line; Build it works mid-placing', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openEditor(page);
  const MORE = { W2: ['c30', 'c34'], R3: ['f44', 'f48'], W3: ['i56', 'g59'] };
  const c = await sampleCentres(page, [...HOLES, ...Object.values(MORE).flat()]);
  const reading = boxRound(c), ANSWERS = answers(c);
  reading.parts.push(boxedItem(c, 'R3', MORE.R3, 'resistor'));
  reading.wires.push(boxedItem(c, 'W2', MORE.W2, 'wire'), boxedItem(c, 'W3', MORE.W3, 'wire'));
  const LINES = { ...ANSWERS, R2: foundAt(c, 'R2', ['d20', 'd24']), W2: foundAt(c, 'W2', MORE.W2), R3: foundAt(c, 'R3', MORE.R3),
                  W3: { id: 'W3', found: false, leads: [], conf: 0.3 } };
  await page.route('**/api/photo', fromBoxRound({ reading }));
  const sent = [];
  await page.route('**/api/photo/leads', route => { sent.push(route.request().postDataJSON().items.map(i => i.id)); });   // never answered

  await openSample(page);
  await expect.poll(() => sent.length, { message: 'the crops are sent' }).toBe(1);
  await expect(page.locator('#photo-confirm'), 'open while the crops are out').toBeVisible();
  expect(await page.evaluate(() => typeof window.PhotoConfirm.place), 'PhotoConfirm.place(id, entry)').toBe('function');
  const kept  = await placeholdersOf(page, reading);
  const now   = () => page.evaluate(() => window.PhotoConfirm.reading);
  const place = (id, entry) => page.evaluate(([id, e]) => { window.PhotoConfirm.place(id, e); }, [id, entry]);
  const row   = id => page.locator(`#photo-parts [data-id="${id}"]`);
  const legs  = (r, id) => endsOf(itemOf(r, id));

  // She touches four items first.
  await row('LED1').locator('.photo-swap').click();
  await row('R2').locator('select.photo-value').selectOption('470');
  await row('W2').locator('select.photo-color').selectOption('green');
  await row('R3').locator('.photo-del').click();
  await expect(row('R3'), '× removed R3').toHaveCount(0);
  const touched = await now();

  // Two lines at different times, each for an untouched item.
  await place('R1', LINES.R1);
  let r = await now();
  expect(legs(r, 'R1').map(e => e.pt), 'R1 takes its returned points').toEqual(LINES.R1.leads.map(l => l.pt));
  expect(legs(r, 'R1').map(e => e.hole), 'R1\'s holes are snapped').toEqual(LANDS.R1);
  expect(itemOf(r, 'R1').unsure, 'R1: \'leads\' is no longer unsure').not.toContain('leads');
  expect(itemOf(r, 'W1'), 'W1 has no line yet: its placeholders stay').toEqual(itemOf(kept, 'W1'));
  await expect(row('R1'), 'R1\'s row is relisted').toContainText(LANDS.R1.join(' → '));
  const r1 = itemOf(r, 'R1');
  await page.waitForTimeout(200);
  await place('W1', LINES.W1);
  r = await now();
  expect(legs(r, 'W1').map(e => e.hole), 'W1 lands, later, on its own').toEqual(LANDS.W1);
  expect(itemOf(r, 'R1'), 'R1 is left as its own line put it').toEqual(r1);
  expect(await page.evaluate(() => window.PhotoConfirm.result), 'each line redoes the build').toEqual(await expectedBuild(page, r));

  // The items she touched ignore their lines; the one she deleted stays gone.
  for (const id of ['LED1', 'R2', 'W2']) {
    await place(id, LINES[id]);
    expect(itemOf(await now(), id), `${id}: she touched it first, so its line is ignored`).toEqual(itemOf(touched, id));
  }
  await place('R3', LINES.R3);
  expect(itemOf(await now(), 'R3'), 'R3, deleted, stays deleted').toBeUndefined();
  await expect(row('R3')).toHaveCount(0);

  // found false drops an untouched item.
  await place('W3', LINES.W3);
  expect(itemOf(await now(), 'W3'), 'W3 came back found false: dropped').toBeUndefined();
  await expect(row('W3'), 'and its row').toHaveCount(0);

  // Build it with the crops still out: what is on screen now.
  const snap = await now();
  await expect(page.locator('#photo-build'), 'LED1\'s + was picked with ⇄, so Build it is ready, crops or not').toBeEnabled();
  await page.locator('#photo-build').click();
  await expect(page.locator('#photo-modal'), 'Build it closes the overlay').toBeHidden();
  expect(await page.evaluate(() => window.PhotoConfirm.built), 'Build it builds the Reading as it is').toEqual(await expectedBuild(page, snap));
  expect(errors.filter(e => !/\/api\/photo\/leads|ERR_ABORTED|ERR_FAILED/.test(e))).toEqual([]);
});

// ── #177: a landing line never eats her typing or closes her dropdown ──────

// The demo board's 9 V battery, + in rail:aOuter:3 and − in rail:aInner:3,
// added to a box round.
const BAT_HOLES = ['rail:aOuter:3', 'rail:aInner:3'];
function withBattery(c, reading) {
  reading.power = [{ kind: 'battery_9v', volts: 9, plus: { hole: BAT_HOLES[0], pt: c[BAT_HOLES[0]] },
                     minus: { hole: BAT_HOLES[1], pt: c[BAT_HOLES[1]] }, unsure: [] }];
  return reading;
}

// Keeps the control that has focus now as window.__mine.
const holdFocused = page => page.evaluate(() => { window.__mine = document.activeElement; return window.__mine.tagName; });
// That control: its value, whether it is still in the parts list (not
// replaced), whether it still has focus, and whether its picker is open
// (a select; :open, Chromium 133+).
const mine = page => page.evaluate(() => {
  const el = window.__mine;
  let open = null;
  try { open = el.matches(':open'); } catch { /* no :open here */ }
  return { value: el.value, inList: el.isConnected && document.getElementById('photo-parts').contains(el),
           focused: document.activeElement === el, open };
});

test('#177 bug: with the crops still out she types a battery\'s volts: "1", LED1\'s line lands, "2" → the field reads 12 (the same input, still focused) and Build it builds a 12 V battery; LED1\'s dots, row, the count and the canvas update at once', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openEditor(page);
  const c = await sampleCentres(page, [...HOLES, ...BAT_HOLES]);
  const reading = withBattery(c, boxRound(c)), ANSWERS = answers(c);
  await page.route('**/api/photo', fromBoxRound({ reading }));
  await streamLeads(page);
  const line = id => `${JSON.stringify(ANSWERS[id])}\n`;
  const row  = id => page.locator(`#photo-parts [data-id="${id}"]`);

  await openSample(page);
  await expect.poll(() => leadsCalls(page).then(x => x.length), { message: 'the crops are sent' }).toBe(1);
  await expect(page.locator('#photo-confirm'), 'open while the crops are out').toBeVisible();
  const volts = row('power:0').locator('input.photo-volts');
  await expect(volts, 'the battery\'s volts as read').toHaveValue('9');
  await expect(page.locator('#photo-build'), 'test check: LED1\'s + is unknown until its line lands').toBeDisabled();

  // She types 12 over the 9: the "1" first.
  await volts.focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('1');
  expect(await holdFocused(page), 'test check: the volts input has focus').toBe('INPUT');
  expect(await mine(page), 'test check: she has typed "1"').toEqual({ value: '1', inList: true, focused: true, open: false });

  // LED1's line lands meanwhile. Its row, its dots, the count, Build it and
  // the canvas update at once, while she is still in the volts field.
  const kept = await placeholdersOf(page, reading);
  const spot = LANDS.LED1.find(h => !endsOf(itemOf(kept, 'LED1')).some(e => e.hole === h));
  expect(spot, 'test check: a hole LED1\'s line lands in that its placeholder is not in').toBeTruthy();
  const before = await patch(page, c[spot]);
  await push(page, line('LED1'));
  await expect.poll(() => ptsOf(page, 'LED1'), { message: 'LED1\'s dots move when its line lands' }).toEqual(ANSWERS.LED1.leads.map(l => l.pt));
  await expect(row('LED1'), 'LED1\'s row lists its new holes at once').toContainText(LANDS.LED1.join(' → '));
  expect(await placingState(page), 'LED1 is placed at once; the other crops are still out: 1 of 4')
    .toEqual({ placing: ['R1', 'R2', 'W1'], rows: ['R1', 'R2', 'W1'], count: expect.stringMatching(/^Placing legs 1\/4/) });
  await expect(page.locator('#photo-build'), 'LED1 came back with its roles: Build it is ready at once').toBeEnabled();
  expect(patchDiff(before, await patch(page, c[spot])), `the canvas redrew at once: LED1's dot is at ${spot} now`).toBeGreaterThan(1);

  // The "2".
  await page.keyboard.type('2');
  expect(await volts.inputValue(), 'the volts field reads 12: LED1\'s line did not replace the input she was typing in (her "2" was lost, leaving a valid 1 V)').toBe('12');
  expect(await mine(page), 'the volts input is the one she typed in, still in the list and focused').toEqual({ value: '12', inList: true, focused: true, open: false });
  expect(await page.evaluate(() => window.PhotoConfirm.reading.power[0].volts), 'the Reading has the 12 V she typed').toBe(12);

  // Build it, the crops still out: a 12 V battery.
  await page.locator('#photo-build').click();
  await expect(page.locator('#photo-modal'), 'Build it closes the overlay').toBeHidden();
  const built = await page.evaluate(() => window.PhotoConfirm.built);
  expect(built.actions.filter(a => a.tool === 'place_battery').map(a => a.voltage), 'Build it builds the 12 V battery she typed').toEqual([12]);
  await expect.poll(() => page.evaluate(() => App.state.components.filter(p => p.type === 'battery').map(p => p.values.voltage)),
    { message: 'the board\'s battery is 12 V' }).toEqual([12]);
  expect(errors.filter(e => !/\/api\/photo\/leads|ERR_ABORTED|ERR_FAILED/.test(e))).toEqual([]);
});

test('#177 bug: with the crops still out, an open colour dropdown (W1) and an open value dropdown (R2) each stay open, focused and the same element while another item\'s line lands (R1, then LED1); that item\'s dots and row update at once; what she then picks reaches the Reading and the build', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openEditor(page);
  const c = await sampleCentres(page, HOLES);
  const reading = boxRound(c), ANSWERS = answers(c);
  await page.route('**/api/photo', fromBoxRound({ reading }));
  await streamLeads(page);
  const line = id => `${JSON.stringify(ANSWERS[id])}\n`;
  const row  = id => page.locator(`#photo-parts [data-id="${id}"]`);

  await openSample(page);
  await expect.poll(() => leadsCalls(page).then(x => x.length), { message: 'the crops are sent' }).toBe(1);
  await expect(page.locator('#photo-confirm'), 'open while the crops are out').toBeVisible();

  // [what, its item, the select, the item whose line lands, the count after, what she picks, the Reading's field]
  const cases = [
    ['W1\'s colour dropdown', 'W1', 'select.photo-color', 'R1', 'Placing legs 1/4', 'green', 'color'],
    ['R2\'s value dropdown', 'R2', 'select.photo-value', 'LED1', 'Placing legs 2/4', '470', 'value'],   // W1 is hers now
  ];
  for (const [what, owner, sel, other, count, pick, field] of cases) {
    await row(owner).locator(sel).click();   // opens its picker
    expect(await holdFocused(page), `test check: ${what} has focus`).toBe('SELECT');
    const held = await mine(page);
    expect(held, `test check: ${what} is open and focused`).toEqual({ value: held.value, inList: true, focused: true, open: true });
    expect(held.value, `test check: ${what} does not already read ${pick}`).not.toBe(pick);

    await push(page, line(other));
    await expect.poll(() => ptsOf(page, other), { message: `${other}'s dots move when its line lands` }).toEqual(ANSWERS[other].leads.map(l => l.pt));
    await expect(row(other), `${other}'s row lists its new holes at once`).toContainText(LANDS[other].join(' → '));
    await expect(row(other), `${other}'s row is no longer "placing…"`).not.toHaveClass(/photo-placing/);
    expect((await placingState(page)).count, `the count: ${count}`).toMatch(new RegExp(`^${count}`));
    expect(await mine(page), `${what} is still open, focused, the same element and unchanged after ${other}'s line landed`).toEqual(held);

    // She picks from the dropdown that stayed open: it reaches the Reading
    // and the build (not a copy the landing line left behind).
    await page.evaluate(() => window.__mine.setAttribute('data-mine', ''));
    await page.locator('#photo-parts select[data-mine]').selectOption(pick);
    const r = await page.evaluate(() => window.PhotoConfirm.reading);
    expect(String(itemOf(r, owner)[field]), `${what}: her pick, ${pick}, is in the Reading`).toBe(pick);
    expect(await page.evaluate(() => window.PhotoConfirm.result), `${what}: the build is redone with her pick`).toEqual(await expectedBuild(page, r));
  }
  expect(errors).toEqual([]);
});
