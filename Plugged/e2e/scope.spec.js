// The mini scope in the browser (issue #121): a function generator into a
// 10 kΩ + 10 kΩ divider, the real Run, Probe, Esc, toggle and Stop buttons
// and real clicks on the canvas. While the clock runs a small graph shows
// CH1 (the generator's OUT) and, once a hole is probed, CH2, each with its
// Vpp and frequency. /api/ask is stubbed; no AI is called. Guest only. The
// maths (the window, Vpp and frequency from irregular frames, the scale,
// "—" when frames are too sparse, CH1's source on real solves) is
// test/scope.test.js.
//
// Why 0.25 Hz, not the issue's 1 Hz: the scope records one sample per
// plugged:sim, i.e. per frame, and CI renders ~3 fps. At 1 Hz that's ~3
// samples a period, where no scope can read 2.0 Vpp (and ours rightly shows
// "—" for the frequency; test/scope.test.js pins both). At 0.25 Hz CI still
// gets ~12 a period. The path from the frame to the readout is the same at
// any frequency; 1 Hz itself is proven in test/scope.test.js on real solves.
// The waits are on the sim clock (#sim-results "t = … s") and on what the
// readouts show, never on wall time.
//
// Shapes this spec assumes (stated so the builder matches them):
// - #scope            the panel, bottom-right; shown while the clock runs,
//                     hidden before Run, by the toggle, and after Stop.
// - #scope-canvas     a <canvas> inside it; the traces are drawn on it.
// - #scope-ch1, #scope-ch2  the readouts. Text holds "<n.nn> Vpp" and
//                     "<f> Hz" with f as the generator's panel prints it
//                     (≥ 1 Hz one decimal, below 1 Hz two significant
//                     digits: "0.25 Hz"), or "—" in place of a number it
//                     can't measure. #scope-ch2 is hidden until a hole is
//                     probed.
// - #scope-probe-btn  "Probe": the next click on a hole sets CH2 (and opens
//                     no equation card); Esc cancels a pending probe.
// - #scope-toggle     a button beside Stop, shown while the clock runs; a
//                     click hides #scope, another shows it again.
// - Stop clears the scope: its traces and the probe. The next Run starts
//   with no history (no frequency until two new crossings) and no CH2.
const { test, expect } = require('@playwright/test');

const TYPE  = 'function_generator';
const FREQ  = 0.25;                       // Hz, see above
const CLOCK = /t = (\d+(?:\.\d+)?) s/;
const QUIET = 1;                          // as render-on-demand.spec.js

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openEditor(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

// FG1 (1 Vp, 0.25 Hz) OUT → tp_63, COM → tn_63; tp_10 → c10; R1 10 kΩ
// a10–a14; R2 10 kΩ b14–b18; c18 → tn_18. OUT reads 1 Vp × 20 000 / 20 050
// = 0.9975 Vp (1.995 Vpp), the middle (e14) half of it, 0.998 Vpp.
// Built through window.App, the calls the mouse handlers make.
async function buildDivider(page) {
  const L = await page.evaluate(([type, freq]) => {
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
    const fg = App.placePart(type, App.batterySpot(), { amplitude: 1, frequency: freq, offset: 0 });
    const L = (fg && fg.label) || Parts.get(type).prefix + '1';
    App.placePart('resistor', [hole('a10'), hole('a14')], { resistance: 10000 });
    App.placePart('resistor', [hole('b14'), hole('b18')], { resistance: 10000 });
    for (const [a, b] of [[`${L}.0`, 'tp_63'], [`${L}.1`, 'tn_63'], ['tp_10', 'c10'], ['c18', 'tn_18']]) {
      App.state.wireStart = end(a);
      App.finishWire(end(b));
    }
    return L;
  }, [TYPE, FREQ]);
  expect(await page.evaluate(() => App.state.wires.length)).toBe(4);
  return L;
}

// A board hole, clicked where it is on screen.
async function clickHole(page, name) {
  const at = await page.evaluate(s => {
    const { col, row } = App.parseHole(s);
    const p = App.state.breadboard.getHole(col, row).world.clone();
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, name);
  await page.mouse.click(at.x, at.y);
}

// The sim clock shown in #sim-results, or -1 before there is one.
const simClock = page => page.evaluate(re => {
  const box = document.getElementById('sim-results');
  const m = box ? box.textContent.match(new RegExp(re)) : null;
  return m ? Number(m[1]) : -1;
}, CLOCK.source);

// A readout's numbers: { vpp, hz } (null where it shows "—"), and its text.
async function readout(page, id) {
  const el = page.locator(id);
  if (!(await el.count())) return { vpp: null, hz: null, text: null };
  const text = (await el.textContent()) || '';
  const vpp = text.match(/(\d+(?:\.\d+)?)\s*Vpp/);
  const hz  = text.match(/(\d+(?:\.\d+)?)\s*Hz/);
  return { vpp: vpp ? Number(vpp[1]) : null, hz: hz ? Number(hz[1]) : null, text };
}

// Pixels on #scope-canvas that differ from its corner (the background).
const drawnPixels = page => page.evaluate(() => {
  const c = document.getElementById('scope-canvas');
  if (!c || !c.width || !c.height || !c.getContext) return 0;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4)
    if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) + Math.abs(d[i + 3] - d[3]) > 24) n++;
  return n;
});

// Frames the 3D view draws over `ms` (render-on-demand.spec.js).
async function framesOver(page, ms) {
  const frame = () => page.evaluate(() => App.renderer.info.render.frame);
  const before = await frame();
  await page.waitForTimeout(ms);
  return (await frame()) - before;
}

test('generator 1 Vp into a divider, Run: the scope shows CH1 ≈ 2.0 Vpp at the generator\'s frequency; Probe e14 adds CH2 ≈ 1.0 Vpp; Esc cancels a probe; the toggle hides it; Stop clears it', async ({ page }) => {
  test.setTimeout(120_000);   // ~10 s of sim clock on a slow CI runner, twice the window's start
  const errors = watchErrors(page);
  await openEditor(page);
  await buildDivider(page);

  const scope = page.locator('#scope');
  const ch2   = page.locator('#scope-ch2');
  const probe = page.locator('#scope-probe-btn');
  const eq    = page.locator('#equation-card');
  await expect(scope, 'no scope before Run').toBeHidden();

  // Run: the clock starts and the scope appears, CH1 only.
  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-stop-btn')).toBeVisible();
  await expect(scope, 'the scope shows while the clock runs').toBeVisible();
  await expect(page.locator('#scope-ch1'), 'CH1\'s readout').toBeVisible();
  await expect(ch2, 'no CH2 until a hole is probed').toBeHidden();

  // Esc cancels a pending probe: the next hole click is an ordinary one
  // again (it opens the equation card) and sets no CH2.
  await expect(probe, 'the Probe button').toBeVisible();
  await probe.click();
  await page.keyboard.press('Escape');
  await clickHole(page, 'e14');
  await expect(eq, 'after Esc a hole click opens the equation card again').toBeVisible();
  await expect(ch2, 'a cancelled probe sets no CH2').toBeHidden();
  await page.keyboard.press('Escape');
  await expect(eq).toBeHidden();

  // Probe, then the divider's middle: CH2 appears; the pick opens no card.
  await probe.click();
  await clickHole(page, 'e14');
  await expect(ch2, 'probing e14 shows CH2').toBeVisible();
  await expect(eq, 'a probe click does not open the equation card').toBeHidden();

  // Two periods of sim time (8 s at 0.25 Hz) and a little more, then the
  // readouts. Polled: on a slow runner a frame can miss a peak by a few %.
  await expect.poll(() => simClock(page), { message: 'the sim clock passes 2 periods (8 s)', timeout: 60_000 })
    .toBeGreaterThanOrEqual(8.5);
  const within = (r, vpp, tol) => r.vpp !== null && Math.abs(r.vpp - vpp) <= tol && r.hz !== null && Math.abs(r.hz - FREQ) <= 0.011;
  await expect.poll(async () => { const r = await readout(page, '#scope-ch1'); return within(r, 1.995, 0.08) ? 'ok' : r.text; },
    { message: 'CH1 reads ≈ 2.00 Vpp (1.995) at 0.25 Hz', timeout: 30_000 }).toBe('ok');
  await expect.poll(async () => { const r = await readout(page, '#scope-ch2'); return within(r, 0.998, 0.05) ? 'ok' : r.text; },
    { message: 'CH2 (e14, the divider\'s middle) reads ≈ 1.00 Vpp (0.998) at 0.25 Hz', timeout: 30_000 }).toBe('ok');
  expect(await drawnPixels(page), 'the traces are drawn on #scope-canvas').toBeGreaterThan(50);

  // The toggle hides the scope and shows it again.
  const toggle = page.locator('#scope-toggle');
  await expect(toggle, 'the scope toggle shows while the clock runs').toBeVisible();
  await toggle.click();
  await expect(scope, 'toggled off: hidden').toBeHidden();
  await toggle.click();
  await expect(scope, 'toggled on again').toBeVisible();

  // Stop: the scope goes, and the 3D view goes quiet (render on demand,
  // #109: nothing keeps asking for frames).
  await page.locator('#sim-stop-btn').click();
  await expect(scope, 'Stop hides the scope').toBeHidden();
  await expect(toggle, 'and its toggle').toBeHidden();
  await expect.poll(() => framesOver(page, 500), { message: `after Stop the view goes quiet (allowed: ${QUIET} frame in 500 ms)`, timeout: 5000, intervals: [250] })
    .toBeLessThanOrEqual(QUIET);

  // Stop cleared it: a new Run starts with no history and no probe. The
  // first rising crossing after t = 0 is at 4 s and a frequency needs two,
  // so for the first seconds CH1's frequency is "—".
  await page.locator('#sim-run-btn').click();
  await expect(scope).toBeVisible();
  await expect(ch2, 'Stop cleared the probe').toBeHidden();
  const fresh = await readout(page, '#scope-ch1');
  const t = await simClock(page);
  expect(t, 'still early in the new run').toBeLessThan(4);
  expect(fresh.hz, `a fresh run has no frequency yet (old samples gone): "${fresh.text}" at t = ${t} s`).toBeNull();
  await page.locator('#sim-stop-btn').click();

  expect(errors).toEqual([]);
});
