// Render on demand, issue #109: the 3D view draws a frame only when something
// changed (input, a running animation, or a change the code asks to show with
// App.requestRender()), so an idle editor costs almost no CPU.
// /api/ask is stubbed with page.route; no AI is called. Guest only.
//
// Frames are counted with App.renderer.info.render.frame: three.js (r128)
// adds one to it on every renderer.render() call and never resets it.
//
// "Quiet" means at most 1 frame over the window measured (QUIET = 1): one
// trailing frame from whatever came just before is allowed. The quiet checks
// poll: the view must reach a quiet window within a few seconds, so a busy
// machine (late input, slow frames) doesn't fail them. The "it renders"
// checks stay strict.
const { test, expect } = require('@playwright/test');

const QUIET = 1;

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const frames = page => page.evaluate(() => App.renderer.info.render.frame);

// Frames drawn over `ms` with nothing happening on the test's side.
async function framesOver(page, ms) {
  const before = await frames(page);
  await page.waitForTimeout(ms);
  return (await frames(page)) - before;
}

// The view reaches a window of `ms` with at most QUIET frames within `timeout`.
function goesQuiet(page, message, ms = 500, timeout = 5000) {
  return expect.poll(() => framesOver(page, ms), { message: `${message} (allowed: ${QUIET} frame in ${ms} ms)`, timeout, intervals: [250] })
    .toBeLessThanOrEqual(QUIET);
}

// The "Try it out" demo (BAT1, R1, LED1, SW1), loaded and given 1 s to settle.
async function openDemo(page, reply = { reply: '', actions: [] }) {
  await page.route('**/api/ask', route => route.fulfill({ json: reply }));
  await page.goto('/landing.html');
  await page.getByRole('button', { name: /Try it out/ }).click();
  await page.waitForURL('**/circuit3d/index.html', { timeout: 20_000 });
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.components.length === 4, null, { timeout: 20_000 });
  await page.waitForTimeout(1000);
}

test('an idle editor with the demo loaded draws no frames over 1.5 s', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  await goesQuiet(page, 'with no input the idle editor draws no frames for 1.5 s', 1500, 8000);
  expect(errors).toEqual([]);
});

test('moving the mouse over the canvas draws frames; soon after the last move it stops again', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  const box = await page.locator('#canvas').boundingBox();
  const before = await frames(page);
  for (let i = 0; i <= 10; i++) {
    await page.mouse.move(box.x + box.width * (0.2 + 0.06 * i), box.y + box.height * (0.4 + 0.02 * i));
    await page.waitForTimeout(30);
  }
  await expect.poll(() => frames(page), { message: 'mouse moves over the canvas draw frames' }).toBeGreaterThan(before);

  await goesQuiet(page, 'after the last mouse move the view goes quiet');
  expect(errors).toEqual([]);
});

test('a spinning DC motor keeps drawing frames with no input; after Stop the view goes quiet', async ({ page }) => {
  test.setTimeout(60_000);   // slow CI runner (software WebGL)
  const errors = watchErrors(page);
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer, null, { timeout: 20_000 });

  // 3 V straight across the 10 Ω motor (pin 1 c30, pin 2 c34): 300 mA, spinning.
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    const end = s => {
      const m = /^([A-Z]+\d+)\.(\d+)$/.exec(s);
      if (m) {
        const pm = App.state.components.find(c => c.label === m[1]).pinMeshes[Number(m[2])];
        return { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
      }
      const h = hole(s);
      return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null };
    };
    App.placePart('motor', [hole('c30'), hole('c34')]);
    App.placePart('battery', App.batterySpot(), { voltage: 3 });
    for (const [a, b] of [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_30', 'a30'], ['a34', 'tn_34']]) {
      App.state.wireStart = end(a);
      App.finishWire(end(b));
    }
  });
  expect(await page.evaluate(() => App.state.wires.length)).toBe(4);

  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toContainText(/spinning/i);
  await page.waitForTimeout(1000);   // let the click's own frames pass
  const spinning = await framesOver(page, 1000);
  expect(spinning, 'the motor\'s animation draws frames with no input').toBeGreaterThan(10);

  await page.locator('#sim-stop-btn').click();
  await goesQuiet(page, 'after Stop the view goes quiet');
  expect(errors).toEqual([]);
});

test('an AI preview arriving with no input draws a frame (App.requestRender)', async ({ page }) => {
  test.setTimeout(90_000);   // demo load + settle + quiet poll + held reply; slow under full-suite load
  const errors = watchErrors(page);
  // The reply is held until the page has gone quiet, so the frame that shows
  // the preview can't come from the message being sent.
  let release;
  const held = new Promise(r => { release = r; });
  let asked = false;
  const LED_BUILD = {
    reply: 'Built a single LED with a current-limiting resistor.',
    actions: [
      { tool: 'delete_all' },
      { tool: 'place_battery' },
      { tool: 'add_wire', from: 'BAT1.0', to: 'tp_63', color: 'red' },
      { tool: 'add_wire', from: 'BAT1.1', to: 'tn_63', color: 'black' },
      { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
      { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
      { tool: 'add_wire', from: 'tp_3', to: 'a2', color: 'red' },
      { tool: 'add_wire', from: 'a8', to: 'tn_8', color: 'black' },
    ],
  };
  await openDemo(page);
  await page.unroute('**/api/ask');
  await page.route('**/api/ask', async route => { asked = true; await held; await route.fulfill({ json: LED_BUILD }); });

  expect(await page.evaluate(() => typeof App.requestRender), 'App.requestRender is a function').toBe('function');

  // Sent from code, not typed: no input events reach the page.
  await page.evaluate(() => { window.sparkyAsk('Build a complete working LED circuit'); });
  await expect.poll(() => asked, { message: 'the page asked /api/ask' }).toBe(true);
  await goesQuiet(page, 'waiting on the reply, the view goes quiet');

  const before = await frames(page);
  release();
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await expect.poll(() => frames(page), { message: 'the preview arriving draws a frame', timeout: 2000 }).toBeGreaterThan(before);
  expect(errors).toEqual([]);
});
