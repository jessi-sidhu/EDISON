// The Lab HUD chrome in the editor (issue #189, Lab HUD 1/4; the mockup and
// its source are in docs/design/editor-hud/). What needs a real page: the top
// bar's height as laid out, the toggles' status LEDs following real clicks
// while the Lab 2 starter simulates, the sidebar's caps coming from CSS over
// the text sidebar.js writes, and classic showing none of it. The stylesheet
// rules (uppercase only in edison-hud*.css, every HUD rule scoped to
// html[data-ui="edison"], DM Mono in edison/fonts.css) are
// test/edison-design-guard.test.js; the body font and top-bar colour pins are
// e2e/edison-skin.spec.js. Matching the mockup is the side-by-side stills.
// /api/ask is stubbed; no AI is called. Guest only; sign-in is a manual QA case.
//
// The page the builder matches, with ?ui=edison only:
// - #topbar is the 40 px instrument strip; #sidebar is the HUD black #101010.
// - #colouring-toggle, #flow-dots-toggle and #scope-toggle each hold one
//   .hud-led: a 6 x 6 px square, background the HUD blue #3D7BFF while the
//   toggle is on (aria-pressed="true") and not blue while it is off. The tools
//   relabel a toggle on every click (they set its textContent), and the LED is
//   there again after each one. The toggle's text stays "Colours on",
//   "Colours off" and so on: the LED holds no text.
// - Every .comp-group-label and .sidebar-section-label computes
//   text-transform: uppercase, and its DOM text stays as sidebar.js and
//   index.html write it ("Passives", "Tools"): caps from CSS only. A count
//   may follow a group's name.
// - Each part's .comp-item-icon is still the part file's own SVG.
// With ?ui=classic: no .hud-led shows, and the top bar and sidebar keep
// classic's height and colours.
const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 1440, height: 900 } });   // the mockup's size

const HUD_BLACK = 'rgb(16, 16, 16)';     // --k in the mockup's hud.css, #101010
const HUD_BLUE  = 'rgb(61, 123, 255)';   // --blue, #3D7BFF: a toggle's LED when on
const STRIP_H   = 40;                    // the instrument strip, px
const LED_PX    = 6;
// The toggles beside Stop, and the name their text starts with ("Colours on").
const TOGGLES = [
  { id: 'colouring-toggle', name: 'Colours' },
  { id: 'flow-dots-toggle', name: 'Dots' },
  { id: 'scope-toggle',     name: 'Scope' },
];

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// The Lab 2 starter (U1, PS1, FG1), loaded and simulating: FG1 makes it a
// time run, so all three toggles show.
async function runLab2(page, ui) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto(`/circuit3d/index.html?ui=${ui}&lab=lab2`);
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.breadboard);
  await expect.poll(() => page.evaluate(() => App.state.components.length), { message: '?lab=lab2 loads the starter' })
    .toBeGreaterThan(0);
  await page.locator('#sim-run-btn').click();
  for (const { id } of TOGGLES)
    await expect(page.locator('#' + id), `#${id} shows while the Lab 2 starter simulates`).toBeVisible({ timeout: 20_000 });
}

const chrome = (page, sel) => page.locator(sel).evaluate(el => ({
  h: Math.round(el.getBoundingClientRect().height),
  bg: getComputedStyle(el).backgroundColor,
}));

// A toggle as the user sees it: on or off, its text, and its LED.
const toggleState = (page, id) => page.evaluate(id => {
  const t = document.getElementById(id);
  const leds = t ? [...t.querySelectorAll('.hud-led')] : [];
  const r = leds[0] && leds[0].getBoundingClientRect();
  return {
    pressed: t ? t.getAttribute('aria-pressed') : null,
    text:    t ? t.textContent.trim() : null,
    leds:    leds.length,
    bg:      leds[0] ? getComputedStyle(leds[0]).backgroundColor : null,
    size:    r ? [Math.round(r.width), Math.round(r.height)] : [0, 0],
  };
}, id);

// The LED follows the toggle: one 6 px .hud-led, blue exactly when it is on,
// with the toggle's text unchanged ("Colours on" / "Colours off").
async function expectLed(page, id, name, on) {
  await expect.poll(async () => {
    const s = await toggleState(page, id);
    return { pressed: s.pressed, text: s.text, leds: s.leds, lit: s.bg === HUD_BLUE, size: s.size };
  }, { message: `#${id} ${on ? 'on' : 'off'}: one ${LED_PX} px .hud-led, ${on ? `lit ${HUD_BLUE}` : 'not blue'}` })
    .toEqual({ pressed: String(on), text: `${name} ${on ? 'on' : 'off'}`, leds: 1, lit: on, size: [LED_PX, LED_PX] });
}

test('?ui=edison&lab=lab2: a 40 px top strip, toggle LEDs that follow Colours, Dots and Scope, caps headers over unchanged text, the same part icons; ?ui=classic shows none of it', async ({ page }) => {
  test.setTimeout(90_000);   // two Lab 2 time runs on software WebGL
  const errors = watchErrors(page);

  // Pin (passes today): classic first. No status LED, and classic's own top
  // bar, sidebar and toggle text.
  await test.step('?ui=classic: none of the HUD chrome', async () => {
    await runLab2(page, 'classic');
    await expect(page.locator('#topbar .hud-led:visible'), 'no status LED shows in classic').toHaveCount(0);
    const bar = await chrome(page, '#topbar');
    expect(Math.abs(bar.h - STRIP_H), `classic keeps its own top bar height, got ${bar.h} px`).toBeGreaterThan(1);
    expect(bar.bg, 'classic top bar is not the HUD black').not.toBe(HUD_BLACK);
    expect((await chrome(page, '#sidebar')).bg, 'classic sidebar is not the HUD black').not.toBe(HUD_BLACK);
    for (const { id, name } of TOGGLES)
      await expect(page.locator('#' + id), `#${id} keeps classic's text`).toHaveText(new RegExp(`^${name} (on|off)$`));
  });

  await runLab2(page, 'edison');

  // The chrome: a 40 px black strip over a black parts sidebar. Soft, like
  // the headers below: a style miss still lets the icon and LED checks run
  // and report.
  const bar = await chrome(page, '#topbar');
  expect.soft(Math.abs(bar.h - STRIP_H), `the top bar is the ${STRIP_H} px strip, got ${bar.h} px`).toBeLessThanOrEqual(1);
  expect.soft((await chrome(page, '#sidebar')).bg, 'the parts sidebar is the HUD black').toBe(HUD_BLACK);

  // Sidebar headers: caps on screen, the DOM text as written. A group's label
  // holds its category as sidebar.js writes it (data-category); the static
  // section labels ("Tools", "Wire Color") keep their lower-case letters.
  const headers = await page.evaluate(() =>
    [...document.querySelectorAll('#sidebar .comp-group-label, #sidebar .sidebar-section-label')].map(el => {
      const group = el.closest('.comp-group');
      return { text: el.textContent.trim(), category: group ? group.dataset.category : null,
        transform: getComputedStyle(el).textTransform };
    }));
  expect(headers.length, 'the sidebar has section headers').toBeGreaterThan(1);
  expect.soft(headers.map(h => [h.text, h.transform]), 'every section header renders in caps')
    .toEqual(headers.map(h => [h.text, 'uppercase']));
  for (const h of headers) {
    if (h.category) expect.soft(h.text, `the ${h.category} header keeps its DOM text`).toContain(h.category);
    else expect.soft(h.text, `"${h.text}" keeps its DOM text: the caps come from CSS`).toMatch(/[a-z]/);
  }

  // Pin: the part icons are untouched, each the part file's own SVG.
  const icons = await page.evaluate(() => {
    const own = svg => { const t = document.createElement('span'); t.innerHTML = svg; return t.innerHTML.trim(); };
    return Parts.all().map(def => {
      const item = document.querySelector(`#sidebar .comp-item[data-type="${def.type}"] .comp-item-icon`);
      return { type: def.type, same: !!item && item.innerHTML.trim() === own(def.icon) && !!item.querySelector('svg') };
    });
  });
  expect(icons.length, 'the registry has parts').toBeGreaterThan(0);
  expect(icons.filter(i => !i.same).map(i => i.type), 'parts whose sidebar icon changed').toEqual([]);

  // Each toggle's LED shows its state, then follows a click. Colours is
  // clicked once more, so its LED is seen both lighting and going out.
  for (const { id, name } of TOGGLES) {
    const on = (await toggleState(page, id)).pressed === 'true';
    await expectLed(page, id, name, on);
    await page.locator('#' + id).click();
    await expectLed(page, id, name, !on);
  }
  const colours = TOGGLES[0];
  const nowOn = (await toggleState(page, colours.id)).pressed === 'true';
  await page.locator('#' + colours.id).click();
  await expectLed(page, colours.id, colours.name, !nowOn);

  expect(errors).toEqual([]);
});

test('EDISON, top left, goes home to the Edison landing (edison/index.html), not the classic dashboard; classic keeps its dashboard', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html?ui=edison');
  const brand = page.locator('#topbar .topbar-brand');
  await expect(brand).toHaveAttribute('href', '../edison/index.html');
  await brand.click();
  await expect(page).toHaveURL(/\/edison\/index\.html$/);
  await expect(page.locator('.ed-mark'), 'the Edison landing\'s wordmark').toBeVisible();

  await page.goto('/circuit3d/index.html?ui=classic');
  await expect(page.locator('#topbar .topbar-brand'), 'classic keeps the dashboard').toHaveAttribute('href', '../dashboard.html');
  expect(errors).toEqual([]);
});
