// The lab sheet in the Lab HUD, and a wider view when a lab opens (issue
// #194). In Edison (?ui=edison) #lab-sheet is the black HUD panel instead of
// the light-green pad, and ?lab= frames the starter from further back, so the
// board and the graphite mat show around the parts (today Lab 2 opens on a
// close-up of U1: App.frameCircuit's minDistance 6, and only U1 is on the
// board). What needs a real page: the computed look of the sheet laid out
// over the editor, a step turning Passed on a real click, and the camera
// after the real ?lab= load and the sheet's reframe. The failed (pink) tag is
// in e2e/lab-sheet.spec.js's Edison case: a Lab 2 check never fails (its part
// and peak steps only go Not yet → Passed), a Lab 1 measure step does.
// The camera maths is test/camera-frame.test.js. The stylesheet rules (caps
// only in edison-hud*.css, no gradients, shadows or purple) are
// test/edison-design-guard.test.js.
// /api/ask is stubbed and never called. Guest only; sign-in is a manual QA case.
//
// The page the builder matches (chosen here, stated so it can be built to),
// with ?ui=edison:
// - #lab-sheet: background #101010 with no background image (no pad grid),
//   ink #F4F4F4, DM Mono first, no box shadow.
// - The code row is caps: .lab-sheet-week shows "WEEK 4" while its DOM text
//   stays as labs/sheets.js writes it ("Week 4"). The title, .lab-sheet-title,
//   stays in sentence case.
// - .lab-step-status is a square tag (border-radius 0). Not yet: a grey 1 px
//   (or wider) outline on a transparent background. Passed: background the
//   HUD blue #3D7BFF. Check failed: the HUD pink #FF3D7F.
// - .lab-stepper-dot: the same colours; a Not yet dot is grey or transparent
//   (no green), a Passed dot blue.
// - .lab-sheet-close is square (border-radius 0).
// - Once ?lab= has loaded and the sheet's reframe has run, the camera is at
//   least 9 from its target (the issue expects about 9 to 12; the builder
//   picks it from a screenshot), and well short of the home view's 37.2.
// - Only labs frame wider: the same circuit opened as a saved file (through
//   App.loadCircuitData, the path File → Open takes) keeps minDistance 6.
// With ?ui=classic the sheet keeps its old look (the last case, a pin).
const fs   = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 1440, height: 900 } });   // the laptop the demo runs on

const LAB2_FILE = path.join(__dirname, '..', 'circuit3d', 'labs', 'lab2.sparky');

const HUD_BLACK = 'rgb(16, 16, 16)';      // #101010, the HUD's chrome (edison-hud.css --hud-k)
const HUD_INK   = 'rgb(244, 244, 244)';   // #F4F4F4, --hud-ink
const HUD_BLUE  = 'rgb(61, 123, 255)';    // #3D7BFF, --hud-blue: Passed
const CLEAR     = 'rgba(0, 0, 0, 0)';     // a transparent background, as computed

const WIDE_MIN  = 9;    // the closest a lab may open (U1's close-up today is 6)
const WIDE_MAX  = 16;   // the issue's ~9-12 with room; the home view is 37.2
const OPEN_DIST = 6;    // App.frameCircuit's default, kept for saved circuits and AI builds

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openLab2(page, ui) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto(`/circuit3d/index.html?lab=lab2&ui=${ui}`);
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.breadboard);
  await expect.poll(() => page.evaluate(() => App.state.components.map(c => c.label).sort()),
    { message: '?lab=lab2 loads the starter (U1, PS1, FG1)' }).toEqual(expect.arrayContaining(['FG1', 'PS1', 'U1']));
  await expect(page.locator('#lab-sheet'), 'the lab sheet opens').toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.ui), '<html data-ui>').toBe(ui);
}

const firstFamily = font => font.split(',')[0].trim().replace(/^["']|["']$/g, '');
const rgb = s => (/^rgba?\((\d+), (\d+), (\d+)/.exec(s) || []).slice(1).map(Number);
// A neutral grey (r = g = b), between the HUD's #676767 and #8A8A8A with room.
const isGrey = s => { const [r, g, b] = rgb(s); return r === g && g === b && r >= 80 && r <= 160; };

const pending = page => page.locator('#lab-sheet .lab-step[data-status="pending"]');

// The camera's distance to its target, once it has stopped moving: two
// animation frames after the load (the sheet's ResizeObserver reframe), then
// the same reading three times running, 150 ms apart.
async function settledDistance(page) {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const read = () => page.evaluate(() => App.camera.position.distanceTo(App.controls.target));
  let prev = await read(), same = 0;
  for (let i = 0; i < 40 && same < 3; i++) {
    await page.waitForTimeout(150);
    const cur = await read();
    same = Math.abs(cur - prev) < 1e-4 ? same + 1 : 0;
    prev = cur;
  }
  expect(same, `the camera settles (last distance ${prev.toFixed(3)})`).toBe(3);
  return prev;
}

test('?lab=lab2&ui=edison: the lab sheet is the black HUD (#101010, ink #F4F4F4, DM Mono, a caps code row over a sentence-case title), square tags (Not yet a grey outline, Passed blue once a manual step is ticked) and dots to match, a square close button', async ({ page }) => {
  const errors = watchErrors(page);
  await openLab2(page, 'edison');
  const sheet = await page.evaluate(() => LabSheets.get('lab2'));

  // The panel: black, light ink, DM Mono, no pad grid and no shadow.
  const look = await page.locator('#lab-sheet').evaluate(el => {
    const s = getComputedStyle(el);
    return { background: s.backgroundColor, image: s.backgroundImage, ink: s.color, font: s.fontFamily, shadow: s.boxShadow };
  });
  expect.soft({ ...look, font: firstFamily(look.font) }, 'the sheet is the HUD black panel (was the pad: rgb(233, 239, 226) under a grid)')
    .toEqual({ background: HUD_BLACK, image: 'none', ink: HUD_INK, font: 'DM Mono', shadow: 'none' });

  // The code row in caps from CSS; the title as written.
  const head = await page.evaluate(() => {
    const t = s => document.querySelector(`#lab-sheet ${s}`);
    return { code: t('.lab-sheet-code').innerText, week: t('.lab-sheet-week').innerText, weekDom: t('.lab-sheet-week').textContent,
             title: t('.lab-sheet-title').innerText };
  });
  expect.soft(head, 'a caps code row ("LAB-02  WEEK 4", the DOM text unchanged) over a sentence-case title')
    .toEqual({ code: sheet.code.toUpperCase(), week: sheet.week.toUpperCase(), weekDom: sheet.week, title: sheet.title });

  // Not yet: a square tag, a grey outline on a transparent background.
  const tag = await pending(page).first().locator('.lab-step-status').evaluate(el => {
    const s = getComputedStyle(el);
    return { radius: s.borderRadius, background: s.backgroundColor, border: parseFloat(s.borderTopWidth), borderColour: s.borderTopColor };
  });
  expect.soft({ radius: tag.radius, background: tag.background, outlined: tag.border >= 1, greyOutline: isGrey(tag.borderColour) },
    `a Not yet tag is a square grey outline (computed: ${JSON.stringify(tag)})`)
    .toEqual({ radius: '0px', background: CLEAR, outlined: true, greyOutline: true });

  // A Not yet dot: grey or transparent, never the pad's green.
  const dot = await page.locator('#lab-sheet .lab-stepper-dot[data-status="pending"]').first()
    .evaluate(el => getComputedStyle(el).backgroundColor);
  expect.soft(dot === CLEAR || isGrey(dot), `a Not yet stepper dot is grey or transparent (computed: ${dot})`).toBe(true);

  // The close button is square.
  await expect.soft(page.locator('#lab-sheet .lab-sheet-close'), 'the close button is square').toHaveCSS('border-radius', '0px', { timeout: 2000 });

  // Passed: tick the first manual step, the way a student does.
  const manual = sheet.steps.find(s => s.check.kind === 'manual');
  expect(manual, 'Lab 2 has a manual step').toBeTruthy();
  const li = page.locator('#lab-sheet ol > li').nth(manual.n - 1);
  await li.click();
  await expect(li.locator('.lab-step-status'), 'the click ticks the manual step').toHaveText(/^\s*Passed\s*$/);
  await expect.soft(li.locator('.lab-step-status'), 'a Passed tag is HUD blue').toHaveCSS('background-color', HUD_BLUE, { timeout: 2000 });
  await expect.soft(li.locator('.lab-step-status'), 'a Passed tag is square').toHaveCSS('border-radius', '0px', { timeout: 2000 });
  await expect.soft(page.locator('#lab-sheet .lab-stepper-dot').nth(manual.n - 1), 'its stepper dot is HUD blue')
    .toHaveCSS('background-color', HUD_BLUE, { timeout: 2000 });

  expect(errors).toEqual([]);
});

test('?lab=lab2&ui=edison opens on a wider view: once the sheet\'s reframe settles the camera is at least 9 from its target (not U1\'s close-up at 6) and well short of home; pin: the same circuit opened as a saved file still frames at 6', async ({ page }) => {
  const errors = watchErrors(page);
  await openLab2(page, 'edison');

  const homeD = await page.evaluate(() => {
    const { pos, target } = App.CAMERA.home;
    return Math.hypot(pos[0] - target[0], pos[1] - target[1], pos[2] - target[2]);
  });
  const lab = await settledDistance(page);
  expect.soft(lab, `the lab opens at distance ${lab.toFixed(3)}: wide enough to show the board and mat around U1 (a close-up is ${OPEN_DIST})`)
    .toBeGreaterThanOrEqual(WIDE_MIN);
  expect.soft(lab, `and still framed on the parts: at most ${WIDE_MAX}, the home view is ${homeD.toFixed(1)}`).toBeLessThanOrEqual(Math.min(WIDE_MAX, homeD - 1));

  // Pin: only labs frame wider. Close the sheet, then open the same starter as
  // a saved circuit (App.loadCircuitData, File → Open's path): minDistance 6.
  await page.locator('#lab-sheet .lab-sheet-close').click();
  await expect(page.locator('#lab-sheet'), 'the close button closes the sheet').toHaveCount(0);
  const data = JSON.parse(fs.readFileSync(LAB2_FILE, 'utf8'));
  await page.evaluate(d => App.loadCircuitData(d), data);
  const opened = await settledDistance(page);
  expect(opened, `a saved circuit (only U1 on the board) frames at App.frameCircuit's default, ${OPEN_DIST}`).toBeCloseTo(OPEN_DIST, 2);

  expect(errors).toEqual([]);
});

// Pin: passes today. The builder drops lab-sheet.css's Edison block and adds
// edison-hud-lab.css; classic must keep the sheet exactly as it was.
test('pin: classic ?lab=lab2 keeps the old lab sheet (#FAF9F6, Inter, round pills: Not yet #ECE8E1, Passed #DCFCE7)', async ({ page }) => {
  const errors = watchErrors(page);
  await openLab2(page, 'classic');
  const sheet = await page.evaluate(() => LabSheets.get('lab2'));

  const look = await page.locator('#lab-sheet').evaluate(el => {
    const s = getComputedStyle(el);
    return { background: s.backgroundColor, image: s.backgroundImage, font: s.fontFamily };
  });
  expect({ ...look, font: firstFamily(look.font) }, 'classic\'s sheet: the sidebar colour, no grid, Inter')
    .toEqual({ background: 'rgb(250, 249, 246)', image: 'none', font: 'Inter' });
  const notYet = pending(page).first().locator('.lab-step-status');
  await expect(notYet, 'a Not yet pill stays round').toHaveCSS('border-radius', '999px');
  await expect(notYet, 'a Not yet pill stays #ECE8E1').toHaveCSS('background-color', 'rgb(236, 232, 225)');
  await expect(page.locator('#lab-sheet .lab-sheet-close'), 'the close button keeps its 6 px corners').toHaveCSS('border-radius', '6px');

  const manual = sheet.steps.find(s => s.check.kind === 'manual');
  const li = page.locator('#lab-sheet ol > li').nth(manual.n - 1);
  await li.click();
  await expect(li.locator('.lab-step-status')).toHaveText(/^\s*Passed\s*$/);
  await expect(li.locator('.lab-step-status'), 'a Passed pill stays #DCFCE7').toHaveCSS('background-color', 'rgb(220, 252, 231)');

  expect(errors).toEqual([]);
});
