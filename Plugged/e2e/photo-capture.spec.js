// 📷 photo capture, issue #140: choose, drop or sample a photo, tap the
// board's 4 corner holes, see the labelled grid, and send the flattened image
// to /api/photo. /api/photo and /api/ask are stubbed in the browser; no AI is
// called. Guest only; Google sign-in stays a manual QA case.
//
// e2e/fixtures/photo.jpg is test/fixtures/photo/web/p6_piranha.jpg (1024 × 697).
// Its taps in photos.json are a1, a24, j24, j1; here they are tapped as the
// corners of the default 63-column board (a1, a63, j63, j1), which gives a
// valid (stretched) grid. Only the capture is under test, not the reading.
//
// The page the builder matches (chosen here):
//   - #photo-btn          a <button> with 📷 inside #sparky-input-row. A click
//                         shows #photo-menu.
//   - #photo-menu         the small menu: #photo-choose ("Choose photo") and
//                         #photo-sample ("Use sample photo").
//   - #photo-file         the hidden <input type="file" accept="image/*">;
//                         #photo-choose clicks it (opens the file chooser).
//   - #sparky-panel       dropping an image file on it (a `drop` event that
//                         reaches #sparky-panel) does the same as Choose.
//   - #photo-modal        the overlay, like #load-preview-modal: hidden
//                         (display:none) when closed, visible while open.
//   - #photo-corners      the corner step, inside #photo-modal; visible only
//                         while tapping corners, never for the sample.
//       #photo-prompt     names the next corner to tap: a1, then a63, j63, j1
//                         (a30, j30 with the toggle on 30).
//       #photo-canvas     the photo, the tap dots and the live grid, all drawn
//                         on this one canvas. The photo fills the canvas's
//                         whole box (no border, padding or letterbox): a click
//                         at box.x + px · box.width / photoWidth (same for y)
//                         is a tap on photo pixel (px, py). The whole canvas
//                         fits in the 1280 × 720 viewport. Not mirrored.
//       #photo-cols       the 63/30 toggle (default 63).
//       #photo-ok         "Looks right": disabled until 4 taps.
//       #photo-redo       "Redo": clears the taps (Looks right disabled again).
//   - #photo-status       inside #photo-modal: "Reading your board…" while
//                         /api/photo runs; on an error the reply's text, or the
//                         AI_TIMEOUT reply when the page timeout fires.
//   - #photo-error-sample "Use sample photo", shown with an error; opens the
//                         sample picker (#182, below).
//   - #photo-cancel       closes the overlay.
//   - window.PhotoCapture
//       .timeoutMs        PHOTO_PAGE_TIMEOUT_MS, default 60000, read when each
//                         /api/photo request starts (tests shorten it).
//       .grid             the PhotoGrid grid of the current 4 taps (taps in the
//                         photo's own pixels), null before the 4th tap / after
//                         Redo.
//       .lastReading      the Reading the confirm screen, #photo-confirm
//                         (#141), opened with: the last /api/photo Reading
//                         with the crop round's legs merged in (#160). With
//                         no crop round (no 'leads' flags, no key, or a
//                         deepseek reading, #161) it is /api/photo's Reading
//                         as returned, as for MOCK_READING here.
//   - window.PhotoSamples['demo-board'] from samples/samples.js:
//                         { file: 'samples/demo-board.jpg', cols: 63, taps }.
//   - #182, the sample picker. window.PhotoSamples also holds 'piranha',
//     'resistors', 'multimeter' and 'timer555'; every entry, demo-board
//     included, has a title and a credit (test/photo-samples.test.js checks
//     their shape).
//       #photo-sample       still "Use sample photo" in #photo-menu, but it
//                           sends nothing itself: it opens the picker.
//       #photo-samples      the picker, inside #photo-modal (#photo-corners
//                           and #photo-confirm hidden): one tile per
//                           PhotoSamples key, demo-board included (titled
//                           like "Demo: LED in backwards").
//       [data-sample="<id>"] a tile inside #photo-samples: an <img> of the
//                           sample's file (its src is that file), its title
//                           and its credit as text. A click hides the picker
//                           and does what Use sample photo did before, for
//                           that sample: no corner step, POST /api/photo with
//                           sample '<id>' and that sample's cols.
//       Escape or #photo-cancel closes the picker; nothing is sent.
//       #photo-error-sample opens the same picker (demo-board among it).
//     A sample's confirm screen shows its credit (PhotoSamples[id].credit) as
//     visible text inside #photo-confirm, and no other sample's credit.
//   - While #photo-modal is open, keydown is swallowed in the capture phase:
//     Backspace and Ctrl+Z never reach the board.
const fs   = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const PHOTO_FILE = path.join(__dirname, 'fixtures', 'photo.jpg');
const PHOTO_B64  = fs.readFileSync(PHOTO_FILE).toString('base64');
const WEB        = require('../test/fixtures/photo/web/photos.json').p6_piranha;
const PHOTO      = { width: WEB.width, height: WEB.height };
// The photo's tapped holes, in the order the page asks for the 63-column corners.
const CORNERS    = [['a1', WEB.taps.a1], ['a63', WEB.taps.a24], ['j63', WEB.taps.j24], ['j1', WEB.taps.j1]];

const MOCK_READING = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'photo', 'demo-board.json'), 'utf8')).reading;
const MOCK_RESPONSE = { reading: MOCK_READING, provider: 'fixture', model: 'deepseek-flash', ms: 12 };
// docs/API-CONTRACT.md → "POST /api/photo" → Errors.
const TIMEOUT_REPLY  = 'Reading the photo took too long. Try again, or use the sample photo.';
const NO_BOARD_REPLY = "I couldn't find a breadboard in that photo. Try one from straight above with the whole board in view, or use the sample photo.";

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

// A click on photo pixel (px, py) of the corner-step canvas.
async function tapPhoto(page, [px, py]) {
  const box = await page.locator('#photo-canvas').boundingBox();
  await page.mouse.click(box.x + px * box.width / PHOTO.width, box.y + py * box.height / PHOTO.height);
}

async function tapCorners(page) {
  for (const [name, at] of CORNERS) {
    await expect(page.locator('#photo-prompt'), `the page asks for ${name}`).toContainText(new RegExp(`\\b${name}\\b`));
    await tapPhoto(page, at);
  }
}

// Width and height of an image data URL, decoded by the browser.
const imageSize = (page, src) => page.evaluate(src => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
  img.onerror = () => reject(new Error('the image did not decode'));
  img.src = src;
}), src);

// The sample picker (#182): Use sample photo or the error card opens it; a tile sends its sample.
const NEW_SAMPLES = ['piranha', 'resistors', 'multimeter', 'timer555'];
const samplesOf   = page => page.evaluate(() => JSON.parse(JSON.stringify(window.PhotoSamples || {})));
const tile        = (page, id) => page.locator(`#photo-samples [data-sample="${id}"]`);
async function pickSample(page, id) {
  await expect(tile(page, id), `the sample picker (#182) shows the ${id} tile`).toBeVisible();
  await tile(page, id).click();
}

// ── Choose a photo, tap the corners, send ──────────────────────────────────

test('Choose photo → tap a1, a63, j63, j1 → the grid appears; Redo; Looks right → /api/photo gets the flattened JPEG and the grid, then the confirm screen opens', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  let sent = null, answer;
  const answered = new Promise(r => { answer = r; });
  await page.route('**/api/photo', async route => {
    sent = route.request().postDataJSON();
    await answered;                                    // held: "Reading your board…" shows meanwhile
    await route.fulfill({ json: MOCK_RESPONSE });
  });
  await openEditor(page);
  await expect(page.locator('#photo-btn'), 'the 📷 button').toBeVisible();
  await expect(page.locator('#photo-modal')).toBeHidden();

  await page.locator('#photo-btn').click();
  await expect(page.locator('#photo-menu')).toBeVisible();
  await expect(page.locator('#photo-choose')).toHaveText(/Choose photo/);
  await expect(page.locator('#photo-sample')).toHaveText(/Use sample photo/);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#photo-choose').click()]);
  await chooser.setFiles(PHOTO_FILE);

  await expect(page.locator('#photo-modal')).toBeVisible();
  await expect(page.locator('#photo-corners')).toBeVisible();
  await expect(page.locator('#photo-ok'), 'Looks right waits for 4 taps').toBeDisabled();

  // Redo throws the taps away.
  await tapCorners(page);
  await expect(page.locator('#photo-ok')).toBeEnabled();
  await page.locator('#photo-redo').click();
  await expect(page.locator('#photo-ok'), 'Redo: Looks right waits for 4 taps again').toBeDisabled();
  expect(await page.evaluate(() => window.PhotoCapture.grid), 'Redo clears the grid').toBe(null);

  // Three taps, then the 4th draws the grid over the photo, well beyond the 4th dot.
  // The pixels stay in the page (returning ~1.6M numbers through evaluate took
  // up to 90 s under full-suite load); only the sizes and the count come back.
  for (const [name, at] of CORNERS.slice(0, 3)) {
    await expect(page.locator('#photo-prompt')).toContainText(new RegExp(`\\b${name}\\b`));
    await tapPhoto(page, at);
  }
  expect(await page.evaluate(() => window.PhotoCapture.grid), 'no grid before the 4th tap').toBe(null);
  await page.evaluate(() => {
    const c = document.getElementById('photo-canvas');
    window.__photoBefore = { w: c.width, h: c.height, data: c.getContext('2d').getImageData(0, 0, c.width, c.height).data.slice() };
  });
  await expect(page.locator('#photo-prompt')).toContainText(/\bj1\b/);
  await tapPhoto(page, CORNERS[3][1]);
  await expect(page.locator('#photo-ok')).toBeEnabled();
  const diff = await page.evaluate(({ tap, photo }) => {
    const c = document.getElementById('photo-canvas');
    const before = window.__photoBefore;
    delete window.__photoBefore;
    const w = c.width, h = c.height;
    const after = c.getContext('2d').getImageData(0, 0, w, h).data;
    const [jx, jy] = [tap[0] * w / photo.width, tap[1] * h / photo.height];
    const near = 0.06 * w;                             // the 4th dot's neighbourhood
    let changed = 0;
    if (before.w === w && before.h === h) {
      for (let i = 0; i < after.length; i += 4) {
        const p = i / 4, x = p % w, y = Math.floor(p / w);
        if (Math.hypot(x - jx, y - jy) < near) continue;
        if (Math.abs(after[i] - before.data[i]) + Math.abs(after[i + 1] - before.data[i + 1]) + Math.abs(after[i + 2] - before.data[i + 2]) > 30) changed++;
      }
    }
    return { before: [before.w, before.h], after: [w, h], changed };
  }, { tap: CORNERS[3][1], photo: PHOTO });
  expect(diff.after).toEqual(diff.before);
  expect(diff.changed, 'the 4th tap draws the grid across the photo').toBeGreaterThan(1000);

  // The taps landed on the photo pixels that were clicked.
  const grid = await page.evaluate(names => {
    const g = window.PhotoCapture.grid;
    return { cols: g.cols, pitch: g.pitch, x0: g.x0, y0: g.y0, width: g.width, height: g.height, H: g.H,
             taps: names.map(n => g.toPhoto(g.holeCentre(n))) };
  }, CORNERS.map(c => c[0]));
  expect(grid.cols, 'a full 63-column board by default').toBe(63);
  CORNERS.forEach(([name, at], i) => {
    expect(Math.hypot(grid.taps[i][0] - at[0], grid.taps[i][1] - at[1]), `${name} tapped at photo ${at}, got ${grid.taps[i]}`).toBeLessThan(2.5);
  });

  await page.locator('#photo-ok').click();
  await expect(page.locator('#photo-status')).toContainText('Reading your board');
  await expect(page.locator('#photo-corners')).toBeHidden({ timeout: 15_000 });   // waits on the warp
  await expect.poll(() => sent, { message: 'Looks right posts to /api/photo' }).not.toBe(null);
  answer();
  await expect(page.locator('#photo-confirm'), 'the Reading opens the confirm screen (#141)').toBeVisible();
  expect(await page.evaluate(() => window.PhotoCapture.lastReading)).toEqual(MOCK_READING);

  // The request: { image, grid }, no sample.
  expect(sent.sample, 'a chosen photo sends no sample').toBeUndefined();
  const { cols, pitch, x0, y0, width, height } = grid;
  expect(sent.grid).toEqual({ cols, pitch, x0, y0, width, height });
  expect(sent.image.startsWith('data:image/jpeg;base64,'), 'image is a JPEG data URL').toBe(true);
  const size = await imageSize(page, sent.image);
  expect(size.width, 'at most 2,048 px wide').toBeLessThanOrEqual(2048);
  expect(size, 'the flattened image is the grid\'s size').toEqual({ width, height });

  // …and it is the photo flattened through the grid (PhotoGrid.warp with grid.H).
  // Compared over the two body-hole blocks only (a–e and f–j, column 1 to N):
  // the label bands, end letters and centre-channel numbers may be drawn on it.
  const meanDiff = await page.evaluate(async ({ sentImage, photo, H, g }) => {
    const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const pixels = img => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      return x.getImageData(0, 0, c.width, c.height);
    };
    const got = pixels(await load(sentImage));
    const src = pixels(await load('data:image/jpeg;base64,' + photo));
    const want = window.PhotoGrid.warp(src, H, { width: got.width, height: got.height, data: new Uint8ClampedArray(got.data.length) });
    const xs = [g.x0, g.x0 + g.pitch * (g.cols - 1)];
    const blocks = [[g.y0, g.y0 + 4 * g.pitch], [g.y0 + 7 * g.pitch, g.y0 + 11 * g.pitch]];
    let d = 0, n = 0;
    for (const [ya, yb] of blocks) {
      for (let y = ya; y <= yb; y++) {
        for (let x = xs[0]; x <= xs[1]; x++) {
          const i = 4 * (y * got.width + x);
          for (let k = 0; k < 3; k++) d += Math.abs(got.data[i + k] - want.data[i + k]);
          n += 3;
        }
      }
    }
    return d / n;
  }, { sentImage: sent.image, photo: PHOTO_B64, H: grid.H, g: grid });
  expect(meanDiff, 'the sent image matches PhotoGrid.warp(photo, grid.H) up to JPEG noise (about 1.4)').toBeLessThan(4);

  expect(errors).toEqual([]);
});

// ── The sample ─────────────────────────────────────────────────────────────

test('Use sample photo → the picker\'s demo-board tile → /api/photo gets sample "demo-board" with its flattened image, the corner step never shows, and its credit is on the confirm screen', async ({ page }) => {
  const errors = watchErrors(page);
  const sent = [];
  await page.route('**/api/photo', route => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: MOCK_RESPONSE });
  });
  await openEditor(page);
  const sample = await page.evaluate(() => window.PhotoSamples && window.PhotoSamples['demo-board']);
  expect(sample, 'samples/samples.js defines PhotoSamples["demo-board"]').toBeTruthy();
  expect(sample.file).toBe('samples/demo-board.jpg');
  expect(Object.keys(sample.taps).sort()).toEqual([`a${sample.cols}`, 'a1', `j${sample.cols}`, 'j1'].sort());

  await page.locator('#photo-btn').click();
  await page.locator('#photo-sample').click();
  await pickSample(page, 'demo-board');
  await expect.poll(() => sent.length, { message: 'the sample is sent with no taps and no Looks right' }).toBe(1);
  await expect(page.locator('#photo-corners'), 'the sample skips the corner step').toBeHidden();
  await expect(page.locator('#photo-confirm'), 'the Reading opens the confirm screen (#141)').toBeVisible();
  expect(await page.evaluate(() => window.PhotoCapture.lastReading)).toEqual(MOCK_READING);
  await expect(page.locator('#photo-confirm'), 'the sample\'s credit shows on its confirm screen').toContainText(sample.credit, { useInnerText: true });

  const body = sent[0];
  expect(body.sample).toBe('demo-board');
  expect(body.grid.cols).toBe(sample.cols);
  expect(body.image.startsWith('data:image/jpeg;base64,')).toBe(true);
  expect(await imageSize(page, body.image)).toEqual({ width: body.grid.width, height: body.grid.height });
  expect(body.grid.width).toBeLessThanOrEqual(2048);
  expect(errors).toEqual([]);
});

// ── The sample picker (#182) ───────────────────────────────────────────────

test('Use sample photo opens a picker with a tile per sample (its photo, title and credit), sending nothing; Escape and Cancel close it; a tile sends its own sample and board size, and its confirm screen shows its credit and no other', async ({ page }) => {
  const errors = watchErrors(page);
  const sent = [];
  await page.route('**/api/photo', route => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: MOCK_RESPONSE });
  });
  await openEditor(page);
  const samples = await samplesOf(page);
  const ids = Object.keys(samples);
  expect(ids, 'PhotoSamples holds demo-board and the 4 new samples').toEqual(expect.arrayContaining(['demo-board', ...NEW_SAMPLES]));

  const openPicker = async () => {
    await page.locator('#photo-btn').click();
    await expect(page.locator('#photo-menu')).toBeVisible();
    await expect(page.locator('#photo-sample'), 'the menu keeps Use sample photo').toHaveText(/Use sample photo/);
    await page.locator('#photo-sample').click();
    await expect(page.locator('#photo-samples'), 'Use sample photo opens the sample picker').toBeVisible();
  };

  await openPicker();
  await expect(page.locator('#photo-modal'), 'the picker is in the 📷 overlay').toBeVisible();
  await expect(page.locator('#photo-corners')).toBeHidden();
  await expect(page.locator('#photo-confirm')).toBeHidden();
  const listed = await page.locator('#photo-samples [data-sample]').evaluateAll(ts => ts.map(t => t.dataset.sample));
  expect(listed.sort(), 'one tile per sample, demo-board included').toEqual([...ids].sort());
  for (const id of ids) {
    await expect(tile(page, id), `the ${id} tile`).toBeVisible();
    await expect(tile(page, id), `the ${id} tile shows its title`).toContainText(samples[id].title);
    await expect(tile(page, id), `the ${id} tile shows its credit`).toContainText(samples[id].credit);
    const img = tile(page, id).locator('img').first();
    await expect(img, `the ${id} tile shows its photo`).toBeVisible();
    await expect.poll(() => img.evaluate(el => ({ path: new URL(el.src).pathname, loaded: el.complete && el.naturalWidth > 0 })),
      { message: `the ${id} tile's photo is its file, loaded` }).toEqual({ path: `/circuit3d/${samples[id].file}`, loaded: true });
  }
  expect(sent, 'opening the picker sends nothing').toEqual([]);

  await page.keyboard.press('Escape');
  await expect(page.locator('#photo-samples'), 'Escape closes the picker').toBeHidden();
  await openPicker();
  await page.locator('#photo-cancel').click();
  await expect(page.locator('#photo-samples'), 'Cancel closes the picker').toBeHidden();
  expect(sent, 'closing the picker sends nothing').toEqual([]);

  // One tile through to its confirm screen (63 columns, its own credit). The
  // unstubbed Piranha test below does another; photo-samples.test.js checks
  // every sample's taps and credit.
  const id = 'resistors';
  await openPicker();
  await pickSample(page, id);
  await expect.poll(() => sent.length, { message: `${id}: one request, with no taps and no Looks right` }).toBe(1);
  await expect(page.locator('#photo-samples'), `${id}: the picker closes`).toBeHidden();
  await expect(page.locator('#photo-corners'), `${id}: a sample skips the corner step`).toBeHidden();
  await expect(page.locator('#photo-confirm'), `${id}: the Reading opens the confirm screen`).toBeVisible();
  const body = sent[0];
  expect(body.sample, `${id}: the request names the chosen sample`).toBe(id);
  expect(body.grid.cols, `${id}: its own board size`).toBe(samples[id].cols);
  expect(body.image.startsWith('data:image/jpeg;base64,')).toBe(true);
  expect(await imageSize(page, body.image), `${id}: the flattened image is the grid's size`).toEqual({ width: body.grid.width, height: body.grid.height });
  await expect(page.locator('#photo-confirm'), `${id}: its credit shows on the confirm screen`).toContainText(samples[id].credit, { useInnerText: true });
  for (const other of ids) {
    if (samples[other].credit === samples[id].credit) continue;
    await expect(page.locator('#photo-confirm'), `${id}: not ${other}'s credit`).not.toContainText(samples[other].credit, { useInnerText: true });
  }
  expect(errors).toEqual([]);
});

// Unstubbed: the e2e server runs PHOTO_PROVIDERS=fixture, so /api/photo and
// /api/photo/leads replay test/fixtures/photo/piranha.json and
// leads/piranha.json (recorded live, step 3) and never reach an AI.
test('"Piranha LEDs", unstubbed: /api/photo replays its recording (provider fixture, key piranha), the confirm screen lists its recorded parts and wires with its credit, and the crop round lands the recorded legs', async ({ page }) => {
  const errors = watchErrors(page);
  const recorded = name => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'photo', name), 'utf8'));
  const reading  = recorded('piranha.json').reading;
  const legs     = recorded(path.join('leads', 'piranha.json')).items;
  const isPath   = p => r => new URL(r.url()).pathname === p && r.request().method() === 'POST';
  await openEditor(page);                              // stubs /api/ask only
  const credit = await page.evaluate(() => window.PhotoSamples.piranha.credit);

  await page.locator('#photo-btn').click();
  await page.locator('#photo-sample').click();
  const photoReply = page.waitForResponse(isPath('/api/photo'));
  const leadsReply = page.waitForResponse(isPath('/api/photo/leads'));
  await page.locator('#photo-samples [data-sample]').filter({ hasText: /Piranha LEDs/ }).click();

  const res = await photoReply;
  expect(res.status()).toBe(200);
  const answer = await res.json();
  expect({ provider: answer.provider, key: answer.key }, 'answered from the recording, no AI').toEqual({ provider: 'fixture', key: 'piranha' });
  await expect(page.locator('#photo-confirm')).toBeVisible();
  await expect(page.locator('#photo-confirm'), 'its credit under the photo').toContainText(credit, { useInnerText: true });
  const ids = [...reading.parts, ...reading.wires].map(e => e.id);
  await expect(page.locator('#photo-parts li[data-id]'), 'a row per recorded part and wire').toHaveCount(ids.length + reading.power.length);
  const rows = await page.locator('#photo-parts li[data-id]').evaluateAll(lis => lis.map(li => li.dataset.id));
  expect(rows.filter(r => !r.startsWith('power:')).sort()).toEqual([...ids].sort());

  // The crop round: replayed from leads/piranha.json, then done.
  const lr = await leadsReply;
  expect(lr.status()).toBe(200);
  const sentIds = lr.request().postDataJSON().items.map(it => it.id);
  const lines = (await lr.text()).split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  expect(lines.find(l => l.done), 'the crop round ends with its done line').toMatchObject({ done: true, provider: 'fixture' });
  await expect.poll(() => page.evaluate(() => window.PhotoConfirm.placing.size), { message: 'every crop answered' }).toBe(0);

  // Each crop sent with a recorded 2-leg answer (what PhotoCrops.merge places;
  // most piranha LEDs came back with 4 legs and keep their placeholders): each
  // end at its recorded point, in the hole under it; an end recorded with no
  // point is 'off'.
  const now = await page.evaluate(() => {
    const r = window.PhotoConfirm.reading, g = window.PhotoCapture.grid;
    return Object.fromEntries([...r.parts.map(p => [p.id, p.leads]), ...r.wires.map(w => [w.id, w.ends])]
      .map(([id, ends]) => [id, ends.map(e => ({ pt: e.pt, hole: e.hole, under: g.snap(e.pt).hole }))]));
  });
  const landed = legs.filter(e => e.found === true && Array.isArray(e.leads) && e.leads.length === 2 && sentIds.includes(e.id));
  expect(landed.length, 'the round placed recorded legs').toBeGreaterThan(0);
  for (const e of landed) {
    expect(now[e.id], `${e.id} is on the confirm screen`).toBeTruthy();
    e.leads.forEach((l, i) => {
      const end = now[e.id][i];
      if (!Array.isArray(l.pt)) return expect(end.hole, `${e.id} end ${i + 1}: recorded with no point`).toBe('off');
      expect(end.pt, `${e.id} end ${i + 1}: at the recorded point`).toEqual(l.pt);
      expect(end.hole, `${e.id} end ${i + 1}: in the hole under it`).toBe(end.under);
    });
  }
  expect(errors).toEqual([]);
});

test('a sample that fails shows the error card; its Use sample photo opens the same picker, and the demo-board tile sends the default sample', async ({ page }) => {
  const errors = watchErrors(page);
  const sent = [];
  await page.route('**/api/photo', route => {
    sent.push(route.request().postDataJSON());
    if (sent.length === 1) return route.fulfill({ status: 504, json: { reply: TIMEOUT_REPLY, code: 'AI_TIMEOUT' } });
    return route.fulfill({ json: MOCK_RESPONSE });
  });
  await openEditor(page);
  const ids = Object.keys(await samplesOf(page));

  await page.locator('#photo-btn').click();
  await page.locator('#photo-sample').click();
  await pickSample(page, 'piranha');
  await expect(page.locator('#photo-status')).toContainText(TIMEOUT_REPLY);
  expect(sent[0].sample).toBe('piranha');
  await expect(page.locator('#photo-error-sample')).toBeVisible();
  await expect(page.locator('#photo-error-sample')).toHaveText(/Use sample photo/);

  await page.locator('#photo-error-sample').click();
  await expect(page.locator('#photo-samples'), 'the error card\'s Use sample photo opens the picker').toBeVisible();
  const listed = await page.locator('#photo-samples [data-sample]').evaluateAll(ts => ts.map(t => t.dataset.sample));
  expect(listed.sort(), 'the same picker: every sample').toEqual([...ids].sort());
  expect(sent.length, 'nothing sent until a tile is chosen').toBe(1);
  await pickSample(page, 'demo-board');
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1].sample, 'the default sample, from the error card').toBe('demo-board');
  await expect(page.locator('#photo-confirm')).toBeVisible();
  expect(errors.filter(e => !/\/api\/photo|status of 504/.test(e))).toEqual([]);
});

// ── Errors ────────────────────────────────────────────────────────────────

test('an error shows the reply with Use sample photo; a stalled /api/photo gives up after PhotoCapture.timeoutMs with the friendly message', async ({ page }) => {
  const errors = watchErrors(page);
  const sent = [];
  await page.route('**/api/photo', route => {
    sent.push(route.request().postDataJSON());
    if (sent.length === 1) return route.fulfill({ status: 504, json: { reply: TIMEOUT_REPLY, code: 'AI_TIMEOUT' } });
    if (sent.length === 2) return route.fulfill({ status: 422, json: { reply: NO_BOARD_REPLY, code: 'NO_BOARD' } });
    // 3rd: the stalled reader, never answered
  });
  await openEditor(page);
  expect(await page.evaluate(() => window.PhotoCapture && window.PhotoCapture.timeoutMs), 'PHOTO_PAGE_TIMEOUT_MS').toBe(60000);

  await page.locator('#photo-btn').click();
  await page.locator('#photo-sample').click();
  await pickSample(page, 'demo-board');
  await expect(page.locator('#photo-status')).toContainText(TIMEOUT_REPLY);
  await expect(page.locator('#photo-error-sample')).toBeVisible();
  await expect(page.locator('#photo-error-sample')).toHaveText(/Use sample photo/);

  // The page shows whatever reply the server sends.
  await page.locator('#photo-error-sample').click();
  await pickSample(page, 'demo-board');
  await expect(page.locator('#photo-status')).toContainText(NO_BOARD_REPLY);
  expect(sent[1].sample).toBe('demo-board');
  await expect(page.locator('#photo-error-sample')).toBeVisible();

  // A hang: the page's own timeout, shortened, ends it with the AI_TIMEOUT message.
  await page.evaluate(() => { window.PhotoCapture.timeoutMs = 500; });
  await page.locator('#photo-error-sample').click();
  await pickSample(page, 'demo-board');
  await expect(page.locator('#photo-status')).toContainText('Reading your board');
  await expect(page.locator('#photo-status')).toContainText(TIMEOUT_REPLY, { timeout: 5000 });
  await expect(page.locator('#photo-error-sample')).toBeVisible();
  await expect.poll(() => sent.length, { message: 'the 3rd (stalled) request was sent' }).toBe(3);

  // Only the failed requests may complain.
  expect(errors.filter(e => !/\/api\/photo|status of (504|422)|ERR_ABORTED/.test(e))).toEqual([]);
});

// ── Keys stay in the overlay ───────────────────────────────────────────────

test('a photo dropped on the chat opens the corner step; with it open, Backspace and Ctrl+Z leave the selected part alone', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('resistor', [hole('c30'), hole('c34')]);
  });
  await page.keyboard.press('Escape');                 // select mode
  const at = await page.evaluate(() => {
    const c = App.state.components.find(x => x.label === 'R1');
    const box = new THREE.Box3().setFromObject(c.group);
    const p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  });
  await page.mouse.click(at.x, at.y);
  const selected = () => page.evaluate(() => (App.state.selected ? App.state.selected.item.label : null));
  const labels = () => page.evaluate(() => App.state.components.map(c => c.label));
  expect(await selected(), 'the click selected R1').toBe('R1');

  await page.evaluate(b64 => {
    const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'my-board.jpg', { type: 'image/jpeg' }));
    const panel = document.getElementById('sparky-panel');
    for (const type of ['dragenter', 'dragover', 'drop']) {
      panel.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
  }, PHOTO_B64);
  await expect(page.locator('#photo-modal')).toBeVisible();
  await expect(page.locator('#photo-corners'), 'a dropped photo goes to the corner step').toBeVisible();

  await page.locator('#photo-cols').focus();          // a focused <select> in the overlay: not an INPUT, so interaction.js would act
  await page.keyboard.press('Backspace');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await labels(), 'Backspace and Ctrl+Z did not reach the board').toEqual(['R1']);
  expect(await selected()).toBe('R1');

  // Closed again, the same key does reach the board.
  await page.locator('#photo-cancel').click();
  await expect(page.locator('#photo-modal')).toBeHidden();
  await page.keyboard.press('Backspace');
  expect(await labels(), 'with the overlay closed, Backspace deletes R1').toEqual([]);
  expect(errors).toEqual([]);
});
