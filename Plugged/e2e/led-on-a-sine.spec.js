// An LED on a sine that crosses 0 V, in the page (bug, issue #2): the
// generator at 5 Vp, 1 Hz → 470 Ω → a correctly placed red LED → COM, then
// Run. Through the trough the results panel says "LED1 dark: the sine
// reverses it on this half.", never "LED is backwards…", and not "Circuit
// open". The numbers (both halves, the back-to-back pair, the boards that
// keep the warning) are test/led-on-a-sine.test.js. /api/ask is stubbed; no
// AI is called. Guest only; Google sign-in stays a manual QA case.
//
// The board is built through window.App, the calls the mouse handlers make
// (as e2e/scope.spec.js does); placing the generator by hand is covered by
// e2e/function-generator.spec.js. Each frame's plugged:sim carries its sim
// time (detail.t), and #sim-results is drawn just before it fires, so a
// frame's panel lines belong to that t.
const { test, expect } = require('@playwright/test');

const TYPE = 'function_generator';

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

// FG1 5 Vp, 1 Hz, 0 V offset: OUT → tp_63, COM → tn_63; tp_2 → a2;
// R1 470 Ω b2–b6; LED1 anode c6, cathode c8; a8 → tn_8.
async function buildBoard(page) {
  const L = await page.evaluate(type => {
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
    const fg = App.placePart(type, App.batterySpot(), { amplitude: 5, frequency: 1, offset: 0 });
    const L = (fg && fg.label) || Parts.get(type).prefix + '1';
    App.placePart('resistor', [hole('b2'), hole('b6')], { resistance: 470 });
    App.placePart('led', [hole('c8'), hole('c6')]);
    for (const [a, b] of [[`${L}.0`, 'tp_63'], [`${L}.1`, 'tn_63'], ['tp_2', 'a2'], ['a8', 'tn_8']]) {
      App.state.wireStart = end(a);
      App.finishWire(end(b));
    }
    return L;
  }, TYPE);
  expect(await page.evaluate(() => App.state.components.map(c => c.label))).toEqual([L, 'R1', 'LED1']);
  expect(await page.evaluate(() => App.state.wires.length)).toBe(4);
}

// Within one period of the 1 Hz sine: the trough's middle, where OUT is
// below −3.4 V (the LED reverse-biased well past its 2.0 V), and the peak's.
const phase = t => t - Math.floor(t);
const inTrough = t => phase(t) >= 0.62 && phase(t) <= 0.88;
const inPeak   = t => phase(t) >= 0.12 && phase(t) <= 0.38;

test('a correctly placed LED on a 5 Vp, 1 Hz sine: through the trough the panel says "LED1 dark: the sine reverses it on this half.", never "LED is backwards"', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await buildBoard(page);

  // Every time-run frame: its sim time and the panel's lines then.
  await page.evaluate(() => {
    window.__frames = [];
    document.addEventListener('plugged:sim', e => {
      const t = e.detail && e.detail.t;
      if (typeof t !== 'number') return;
      const lines = [...document.querySelectorAll('#sim-results .sim-line')].map(d => d.textContent.trim());
      window.__frames.push({ t, lines });
    });
  });

  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();

  // Sim time, not wall time: at least one full period, with frames in the
  // trough's middle and the peak's (a slow machine still gets there).
  await expect.poll(() => page.evaluate(() => {
    const fr = window.__frames, ph = t => t - Math.floor(t);
    return Math.max(0, ...fr.map(f => f.t)) >= 1.0 && fr.filter(f => ph(f.t) >= 0.62 && ph(f.t) <= 0.88).length >= 3 &&
           fr.filter(f => ph(f.t) >= 0.12 && ph(f.t) <= 0.38).length >= 3;
  }), { message: 'a full 1 Hz period of time-run frames, ≥ 3 in the trough and ≥ 3 at the peak', timeout: 30_000 }).toBe(true);
  await page.locator('#sim-stop-btn').click();

  const frames = await page.evaluate(() => window.__frames);
  const at = f => `t = ${f.t.toFixed(2)} s: ${JSON.stringify(f.lines)}`;

  // Setup check (passes today): the LED lights on the positive half.
  const peak = frames.filter(f => inPeak(f.t));
  expect(peak.filter(f => !f.lines.some(l => /^💡 LED ON {2}\(\d+\.\d mA\)$/u.test(l))).map(at),
    'every peak frame shows the LED ON line').toEqual([]);

  // The bug: never "backwards" on a correctly placed LED.
  expect(frames.filter(f => f.lines.some(l => /backwards/i.test(l))).map(at),
    `frames that call the LED backwards (of ${frames.length})`).toEqual([]);

  // Through the trough: the info line, and not "Circuit open".
  const trough = frames.filter(f => inTrough(f.t));
  expect(trough.filter(f => !f.lines.includes('LED1 dark: the sine reverses it on this half.')).map(at),
    `trough frames without "LED1 dark: the sine reverses it on this half." (of ${trough.length})`).toEqual([]);
  expect(trough.filter(f => f.lines.some(l => l.includes('Circuit open'))).map(at),
    'trough frames that say "Circuit open"').toEqual([]);

  expect(errors).toEqual([]);
});
