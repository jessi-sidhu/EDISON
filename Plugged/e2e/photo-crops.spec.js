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
//         #photo-status "Found N parts · placing legs…" (the confirm screen
//         stays hidden meanwhile), then ONE POST /api/photo/leads
//         { key, items: [{ id, kind, type, value, image, window }] }, one
//         entry per item, window = PhotoCrops.window(grid, item.box);
//         the answer's `items` → PhotoCrops.merge → PhotoConfirm.open.
//       It waits at most window.PhotoCapture.leadsTimeoutMs (default 35000,
//       PHOTO_LEADS_PAGE_TIMEOUT_MS; read when the request starts, so tests
//       shorten it). A timeout, a non-200 or a network failure opens the
//       confirm screen with the box round's placeholders, no error message.
//       No items, or no key → no request: straight to the confirm screen.
//       Cancel while the legs are being placed drops the round (the job
//       pattern): the confirm screen never opens behind her back.
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

const openSample = async page => {
  await page.locator('#photo-btn').click();
  await page.locator('#photo-sample').click();
};

const confirmState = page => page.evaluate(() => {
  const c = window.PhotoConfirm;
  return { reading: c.reading, dots: c.dots() };
});
const dotOf = (s, id, i) => s.dots.find(d => d.id === id && d.end === i);

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
    await held;                                        // "placing legs…" shows meanwhile
    await route.fulfill({ json: { items: body.items.map(i => ANSWERS[i.id] || { id: i.id, error: 'AI_FAILED' }),
                                  provider: 'gemini', model: 'gemini-robotics-er-2-preview', ms: 9100 } });
  });

  await openSample(page);
  await expect.poll(() => leadsSent.length, { message: 'the page sends the crops to /api/photo/leads' }).toBe(1);
  await expect(page.locator('#photo-status')).toContainText(/Found \d+ parts? · placing legs/);
  await expect(page.locator('#photo-confirm'), 'the confirm screen opens once, after the legs').toBeHidden();

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

  // The answers land: the confirm screen opens with the returned legs.
  release();
  await expect(page.locator('#photo-confirm'), 'the confirm screen opens after the legs come back').toBeVisible();
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

test('a crop round that hangs, fails or can\'t connect still opens the confirm screen with the placeholders, no error; Cancel while placing legs drops it', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openEditor(page);
  expect(await page.evaluate(() => window.PhotoCapture && window.PhotoCapture.leadsTimeoutMs), 'PHOTO_LEADS_PAGE_TIMEOUT_MS').toBe(35000);
  await page.evaluate(() => { window.PhotoCapture.leadsTimeoutMs = 1000; });

  const c = await sampleCentres(page, HOLES);
  const reading = boxRound(c);
  await page.route('**/api/photo', route => route.fulfill({ json: { reading, provider: 'gemini', model: 'gemini-robotics-er-2-preview', ms: 8200, key: KEY } }));
  let mode = 'hang';
  const sentAt = [];
  await page.route('**/api/photo/leads', route => {
    sentAt.push(Date.now());
    if (mode === 'error') return route.fulfill({ status: 400, json: { reply: 'Send 1 to 24 crops, each with an id, a JPEG or PNG image and its window.', code: 'BAD_ITEMS' } });
    if (mode === 'abort') return route.abort('failed');
    // 'hang': never answered
  });

  // Cancel while the legs are being placed: the round is dropped, and the
  // confirm screen doesn't open behind her back when the timeout fires.
  await openSample(page);
  await expect.poll(() => sentAt.length, { message: 'the crops were sent' }).toBe(1);
  await page.locator('#photo-cancel').click();
  await expect(page.locator('#photo-modal')).toBeHidden();
  await page.waitForTimeout(1600);                     // past leadsTimeoutMs
  await expect(page.locator('#photo-modal'), 'still closed').toBeHidden();
  expect(await page.evaluate(() => window.PhotoConfirm.reading), 'the confirm screen never opened').toBe(null);

  const want = await placeholdersOf(page, reading);
  for (const m of ['hang', 'error', 'abort']) {
    mode = m;
    const n = sentAt.length;
    if (await page.locator('#photo-modal').isVisible()) await page.locator('#photo-cancel').click();
    await openSample(page);
    await expect.poll(() => sentAt.length, { message: `${m}: the crops were sent` }).toBe(n + 1);
    await expect(page.locator('#photo-confirm'), `${m}: the confirm screen opens anyway`).toBeVisible({ timeout: 5000 });
    if (m === 'hang') expect(Date.now() - sentAt[n], 'hang: it waited for leadsTimeoutMs first').toBeGreaterThanOrEqual(900);
    expect(await page.evaluate(() => window.PhotoConfirm.reading), `${m}: the box round's placeholders, 'leads' flags kept`).toEqual(want);
    await expect(page.locator('#photo-error-sample'), `${m}: no error`).toBeHidden();
    await expect(page.locator('#photo-status'), `${m}: no message`).toHaveText('');
  }

  // Only the failed crop requests may complain.
  expect(errors.filter(e => !/\/api\/photo\/leads|status of 400|ERR_ABORTED|ERR_FAILED/.test(e))).toEqual([]);
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
    leadsSent.push(route.request().postDataJSON());
    return route.fulfill({ json: { items: [], provider: 'fixture', model: null, ms: 1 } });
  });

  await openSample(page);
  await expect(page.locator('#photo-confirm')).toBeVisible();
  expect(await page.evaluate(() => window.PhotoConfirm.reading), 'the saved reading as it is').toEqual(MOCK_READING);
  expect(leadsSent.length, 'real holes, nothing unsure: no crop round').toBe(0);

  // A box round whose reply has no key (a sample that isn't a plain id): no round either.
  const reading = boxRound(c);
  answer = { reading, provider: 'gemini', model: 'gemini-robotics-er-2-preview', ms: 8200, key: null };
  await page.locator('#photo-cancel').click();
  await openSample(page);
  await expect(page.locator('#photo-confirm')).toBeVisible();
  expect(await page.evaluate(() => window.PhotoConfirm.reading), 'no key: the placeholders').toEqual(await placeholdersOf(page, reading));
  expect(leadsSent.length, 'no key: no crop round').toBe(0);

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

// /api/photo/leads answers each sent id from `answers` (else AI_FAILED);
// returns the request bodies, in order.
async function answerLeads(page, answers, provider = 'gemini') {
  const sent = [];
  await page.route('**/api/photo/leads', route => {
    const body = route.request().postDataJSON();
    sent.push(body);
    return route.fulfill({ json: { items: body.items.map(i => answers[i.id] || { id: i.id, error: 'AI_FAILED' }),
                                   provider, model: 'gemini-robotics-er-2-preview', ms: 900 } });
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
  await expect(page.locator('#photo-confirm')).toBeVisible({ timeout: 10_000 });
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

  await expect(page.locator('#photo-confirm')).toBeVisible({ timeout: 10_000 });
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
