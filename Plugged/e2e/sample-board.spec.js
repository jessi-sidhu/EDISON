// 📷 a sample with a hard-coded board (issue #15): the LEDs-and-buttons tile
// shows its photo with "Reading your board…" for about 7 seconds, then builds
// the sample's own `board` exactly, with no confirm screen, no /api/photo
// and no AI reading. /api/ask is stubbed (the build asks Edison), so nothing
// reaches an AI. Guest only; Google sign-in stays a manual QA case.
// test/sample-boards.test.js checks the board itself (its parts, holes and
// wires, and that each button lights only its own LED); this walks it in
// the page.
//
// The page the builder matches:
//   - Use sample photo opens the picker (#photo-samples, #182): one tile
//     [data-sample=<id>] per offered sample, demo-board, leds-buttons and
//     (#16) ensc-lab.
//   - The leds-buttons tile: #photo-modal shows the sample's own photo as it
//     is, not flattened (a visible <img> of its file, or a canvas drawn with
//     it at the photo's own aspect ratio), and #photo-status reads "Reading
//     your board…". The board stays as it was; no confirm screen.
//   - SAMPLE_READ_MS (7000, #19) later, photo.js's built({ actions: s.board,
//     flags: [], labels: {}, skipped: [] }): the overlay closes,
//     SparkyChat.applyBuild puts the board on (one note, one undo step), the
//     simulation runs, and Edison is asked "What's wrong with my circuit?"
//     (nothing typed). Nothing is posted to /api/photo.
//   - Escape (or Cancel) during those 7 seconds closes the overlay and builds
//     nothing (photo.js's job guard).
//   - The ensc-lab tile (#16), Aarmen's ENSC 220 bench photo, builds its
//     board the same way: U1 (a TL072), PS1, FG1 and R1–R3. Its wire ends on
//     PS1 and FG1 may be written by pin name or index (PS1.pos or PS1.0);
//     the page exports indices, so the board is compared by pin name.
const fs   = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const Board = require('../circuit3d/js/board-model.js');
const Parts = require('../circuit3d/js/parts');

const ID        = 'leds-buttons';
const LAB       = 'ensc-lab';                             // issue #16
const READING   = 'Reading your board…';                // photo.js READING
const DEFAULT_Q = "What's wrong with my circuit?";
const READ_MS   = 7000;                                   // photo.js SAMPLE_READ_MS (#19)
const BUILT_NOTE = n => `Built ${n} parts from your photo. Undo (Ctrl+Z) brings back the empty board.`;
// Photo 2's own size: the sample file is a byte copy of it (test/sample-boards.test.js).
// A photo of her own, for the corner step after a board sample.
const CHOSEN = path.join(__dirname, 'fixtures', 'photo.jpg');
const PHOTO = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'photo', 'web', 'photos.json'), 'utf8')).p2_leds_buttons;

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`console: ${m.text()} @ ${(m.location() && m.location().url) || ''}`);
  });
  return errors;
}

// Every request to /api/photo or /api/photo/leads, and every /api/ask body.
async function watchApi(page) {
  const photo = [], asks = [];
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/photo')) photo.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await page.route('**/api/ask', route => {
    asks.push(route.request().postDataJSON());
    return route.fulfill({ json: { reply: 'Press a button to light its LED.', actions: [] } });
  });
  return { photo, asks };
}

async function openEditor(page) {
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

async function openPicker(page) {
  await page.locator('#photo-btn').click();
  await page.locator('#photo-sample').click();
  await expect(page.locator('#photo-samples'), 'Use sample photo opens the sample picker').toBeVisible();
}

const tile = (page, id) => page.locator(`#photo-samples [data-sample="${id}"]`);
const samplesOf = page => page.evaluate(() => JSON.parse(JSON.stringify(window.PhotoSamples || {})));

// A wire end with an off-board part's pin by name: PS1.0 and PS1.pos are the
// same end (the page exports the index).
function endName(board, end) {
  const m = /^([A-Z]+\d+)\.(\w+)$/.exec(String(end));
  const part = m && board.parts.find(p => p.label === m[1]);
  if (!part) return String(end);
  const pins = Parts.get(part.type).pins;
  return `${m[1]}.${/^\d+$/.test(m[2]) ? pins[Number(m[2])] : m[2]}`;
}

// The board as [label, type, holes sorted] and each wire's ends sorted.
const shape = board => ({
  parts: board.parts.map(p => [p.label, p.type, (p.holes || []).slice().sort()]).sort((x, y) => x[0].localeCompare(y[0])),
  wires: board.wires.map(w => [endName(board, w.from), endName(board, w.to)].sort().join(' ~ ')).sort(),
});
const boardNow = page => page.evaluate(() => App.exportBoard()).then(shape);

// ── The picker ─────────────────────────────────────────────────────────────

test('Use sample photo shows a picker of 4 tiles, demo-board, ensc-lab, leds-buttons and thandi-blinker, each with its photo, title and credit; Escape while leds-buttons reads builds nothing', async ({ page }) => {
  test.setTimeout(60_000 + READ_MS);   // software WebGL, and the read
  const errors = watchErrors(page);
  const api = await watchApi(page);
  await openEditor(page);
  const samples = await samplesOf(page);

  await openPicker(page);
  const listed = await page.locator('#photo-samples [data-sample]').evaluateAll(ts => ts.map(t => t.dataset.sample));
  expect(listed.sort(), 'a tile each for demo-board, ensc-lab, leds-buttons and thandi-blinker (#17)').toEqual(['demo-board', LAB, ID, 'thandi-blinker']);
  for (const id of listed) {
    await expect(tile(page, id), `the ${id} tile shows its title`).toContainText(samples[id].title);
    await expect(tile(page, id), `the ${id} tile shows its credit`).toContainText(samples[id].credit);
    const img = tile(page, id).locator('img').first();
    await expect(img, `the ${id} tile shows its photo`).toBeVisible();
    await expect.poll(() => img.evaluate(el => ({ path: new URL(el.src).pathname, loaded: el.complete && el.naturalWidth > 0 })),
      { message: `the ${id} tile's photo is its file, loaded` }).toEqual({ path: `/circuit3d/${samples[id].file}`, loaded: true });
  }

  // Escape during the reading: nothing is built, Edison isn't asked.
  await tile(page, ID).click();
  await expect(page.locator('#photo-status'), 'the tile shows the reading status').toHaveText(READING);
  await expect(page.locator('#photo-corners'), 'its photo is up: the reading has begun').toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#photo-modal'), 'Escape closes the overlay').toBeHidden();
  await page.waitForTimeout(READ_MS + 3000);             // well past the reading
  expect(await boardNow(page), 'Escape while reading builds nothing').toEqual({ parts: [], wires: [] });
  expect(api.asks, 'and asks Edison nothing').toEqual([]);
  expect(api.photo, 'a board sample never posts to /api/photo').toEqual([]);
  expect(errors).toEqual([]);
});

// ── Photo, then board ──────────────────────────────────────────────────────

test('the leds-buttons tile shows its photo with "Reading your board…", then builds its board (3 LEDs, 3 buttons, R1 and the battery) with no /api/photo and no console error; Edison is asked; one Ctrl+Z empties the board; a photo chosen next gets its corner step back', async ({ page }) => {
  test.setTimeout(90_000 + READ_MS);   // software WebGL, and the read
  const errors = watchErrors(page);
  const api = await watchApi(page);
  await openEditor(page);
  const sample = (await samplesOf(page))[ID];
  expect(sample && Array.isArray(sample.board), `PhotoSamples['${ID}'] has a board`).toBe(true);
  const { board: want, errors: wrong } = Board.apply(Board.empty(), sample.board);
  expect(wrong, 'the sample\'s board applies in Node').toEqual([]);
  const placed = sample.board.filter(a => typeof a.tool === 'string' && a.tool.startsWith('place_')).length;

  await openPicker(page);
  await expect(tile(page, ID)).toBeVisible();

  // What the overlay shows, every 25 ms from the tile's click: the status, the
  // photo it shows (if any), whether the confirm screen is up, and how many
  // parts are on the board.
  await page.evaluate(({ id, file, max }) => {
    const seen = window.__seen = [];
    let clicked = null;
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest(`[data-sample="${id}"]`)) clicked = performance.now(); }, true);
    const want = new URL(file, location.href).pathname;
    const drawn = c => {
      try {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0 && (d[i - 3] + d[i - 2] + d[i - 1]) > 30) return true;
      } catch { /* not a 2d canvas */ }
      return false;
    };
    const photo = () => {
      for (const el of document.querySelectorAll('#photo-modal img, #photo-modal canvas')) {
        if (el.closest('#photo-samples')) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 100 || r.height < 50 || !el.checkVisibility()) continue;
        if (el.tagName === 'IMG' && el.complete && el.naturalWidth > 0 && new URL(el.src, location.href).pathname === want) {
          return { kind: 'img', aspect: el.naturalWidth / el.naturalHeight };
        }
        if (el.tagName === 'CANVAS' && drawn(el)) return { kind: 'canvas', aspect: el.width / el.height };
      }
      return null;
    };
    const tick = () => {
      if (clicked !== null) {
        seen.push({ t: Math.round(performance.now() - clicked), open: document.getElementById('photo-modal').style.display !== 'none',
                    status: document.getElementById('photo-status').textContent, photo: photo(),
                    confirm: !document.getElementById('photo-confirm').hidden, parts: App.state.components.length });
      }
      if (seen.length < max) setTimeout(tick, 25);
    };
    tick();
  }, { id: ID, file: `/circuit3d/${sample.file}`, max: Math.ceil((READ_MS + 9000) / 25) });   // the read and 9 s more

  await tile(page, ID).click();
  await expect(page.locator('#photo-status'), 'the tile shows the reading status').toHaveText(READING);
  await expect(page.locator('#photo-modal'), 'then the overlay closes for the board').toBeHidden({ timeout: READ_MS + 15_000 });
  await expect.poll(() => boardNow(page), { message: 'the page builds the sample\'s board exactly' }).toEqual(shape(want));

  // Photo, then board: the photo with the status while the board is still empty.
  const seen = await page.evaluate(() => window.__seen);
  const summary = JSON.stringify(seen.filter((s, i) => i === 0 || JSON.stringify({ ...s, t: 0 }) !== JSON.stringify({ ...seen[i - 1], t: 0 })));
  const reading = seen.filter(s => s.open && s.status === READING && s.parts === 0);
  const shown = reading.filter(s => s.photo);
  expect(shown.length, `the photo shows under "${READING}" before the board is built: ${summary}`).toBeGreaterThan(0);
  for (const s of shown) {
    expect(Math.abs(s.photo.aspect / (PHOTO.width / PHOTO.height) - 1), `the photo as it is (${PHOTO.width} × ${PHOTO.height}), not flattened: ${JSON.stringify(s.photo)}`).toBeLessThan(0.02);
  }
  expect(seen.filter(s => s.confirm), 'no confirm screen for a board sample').toEqual([]);
  // The reading lasts about SAMPLE_READ_MS: the empty board is still seen
  // under the status well into it. (The build itself can hold the page for
  // seconds on software WebGL, so when the parts show up proves nothing.)
  expect(seen.some(s => s.parts > 0), `the board was built: ${summary}`).toBe(true);
  expect(reading[reading.length - 1].t, `the status and the empty board last about ${READ_MS} ms: ${summary}`).toBeGreaterThanOrEqual(READ_MS - 2000);

  // The 3D board: the sample's parts, each drawn in the scene.
  const types = await page.evaluate(() => App.state.components.map(c => c.type).sort());
  expect(types, '1 battery, 3 buttons, 3 LEDs and 1 resistor').toEqual(['battery', 'button', 'button', 'button', 'led', 'led', 'led', 'resistor']);
  expect(await page.evaluate(() => App.state.components.every(c => c.group && c.group.parent === App.scene)), 'every part is in the 3D scene').toBe(true);
  await expect(page.locator('#sparky-messages .chat-msg.system'), 'one note for the build, no refusal notes').toHaveText([BUILT_NOTE(placed)]);
  await expect.poll(() => page.evaluate(() => App.simRunning === true), { message: 'the simulation is running' }).toBe(true);

  // Edison answers the default question; no photo route was called.
  await expect.poll(() => api.asks.length, { message: 'Edison is asked once' }).toBe(1);
  expect(api.asks[0].message.startsWith(DEFAULT_Q), api.asks[0].message).toBe(true);
  expect(api.photo, 'no /api/photo request').toEqual([]);

  // One undo step brings back the empty board.
  await page.locator('#canvas').click({ position: { x: 5, y: 5 } });   // focus the board, not the chat box
  await page.keyboard.press('ControlOrMeta+z');
  expect(await boardNow(page), 'one Ctrl+Z empties the board').toEqual({ parts: [], wires: [] });

  // A photo chosen next gets its whole corner step back: the board sample's
  // photo hid the prompt and the Redo / Looks right buttons (photo.js showPhoto).
  await page.locator('#photo-btn').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#photo-choose').click()]);
  await chooser.setFiles(CHOSEN);
  await expect(page.locator('#photo-corners'), 'a chosen photo opens the corner step').toBeVisible();
  await expect(page.locator('#photo-prompt'), 'the prompt is back').toBeVisible();
  await expect(page.locator('#photo-prompt'), 'it asks for a1 first').toContainText(/\ba1\b/);
  await expect(page.locator('#photo-redo'), 'Redo is back').toBeVisible();
  await expect(page.locator('#photo-ok'), 'Looks right is back').toBeVisible();
  await expect(page.locator('#photo-ok'), 'Looks right waits for 4 taps').toBeDisabled();
  expect(errors).toEqual([]);
});

// ── ensc-lab (#16) ─────────────────────────────────────────────────────────

test('the ensc-lab tile builds its board (U1 the TL072, PS1, FG1 and R1–R3, each in the 3D scene) with no /api/photo and no console error; Edison is asked', async ({ page }) => {
  test.setTimeout(90_000 + READ_MS);   // software WebGL, and the read
  const errors = watchErrors(page);
  const api = await watchApi(page);
  await openEditor(page);
  const sample = (await samplesOf(page))[LAB];
  expect(sample && Array.isArray(sample.board), `PhotoSamples['${LAB}'] has a board`).toBe(true);
  const { board: want, errors: wrong } = Board.apply(Board.empty(), sample.board);
  expect(wrong, 'the sample\'s board applies in Node').toEqual([]);
  const placed = sample.board.filter(a => typeof a.tool === 'string' && a.tool.startsWith('place_')).length;

  await openPicker(page);
  await tile(page, LAB).click();
  await expect(page.locator('#photo-status'), 'the tile shows the reading status').toHaveText(READING);
  await expect(page.locator('#photo-modal'), 'then the overlay closes for the board').toBeHidden({ timeout: READ_MS + 15_000 });
  await expect.poll(() => boardNow(page), { message: 'the page builds the sample\'s board exactly' }).toEqual(shape(want));

  const parts = await page.evaluate(() => App.exportBoard().parts.map(p => [p.label, p.type]).sort((x, y) => x[0].localeCompare(y[0])));
  expect(parts, 'the TL072, the bench supply, the function generator and 3 resistors')
    .toEqual([['FG1', 'function_generator'], ['PS1', 'bench_supply'], ['R1', 'resistor'], ['R2', 'resistor'], ['R3', 'resistor'], ['U1', 'tl072']]);
  expect(await page.evaluate(() => App.state.components.every(c => c.group && c.group.parent === App.scene)), 'every part is in the 3D scene').toBe(true);
  await expect(page.locator('#sparky-messages .chat-msg.system'), 'one note for the build, no refusal notes').toHaveText([BUILT_NOTE(placed)]);
  await expect.poll(() => page.evaluate(() => App.simRunning === true), { message: 'the simulation is running' }).toBe(true);

  await expect.poll(() => api.asks.length, { message: 'Edison is asked once' }).toBe(1);
  expect(api.asks[0].message.startsWith(DEFAULT_Q), api.asks[0].message).toBe(true);
  expect(api.photo, 'no /api/photo request').toEqual([]);
  expect(errors).toEqual([]);
});
