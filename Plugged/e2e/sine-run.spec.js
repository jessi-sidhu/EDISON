// The sine source in the page, issue #119: a board whose only source is a
// sine (no capacitor) starts the clock on Run like a capacitor board does
// (#103). The "t = … s" clock counts in #sim-results, plugged:sim fires
// every frame, and its readings of the source's node swing + and − at 1 Hz.
// Stop ends the loop and clears the clock. /api/ask is stubbed; no AI is
// called. Guest only; Google sign-in stays a manual QA case.
//
// The function generator (#120) isn't built yet, so after the page loads
// this spec defines the test-only stand-in test/fixtures/parts/
// test_wave_source.js (1 Hz; amp and offset as values) with Parts.define,
// giving it a simple view.build, the way e2e/time-run.spec.js defines its
// test capacitor. It is ai: false and never loaded by the app.
//
// Shapes this spec assumes (stated so the builder matches them):
// - The clock is text matching /t = <seconds> s/ inside #sim-results (#103).
// - Each frame's plugged:sim has detail.readings, Readings.from that frame's
//   result, so readings.voltage('c10') is the sine's plus node in volts.
// - TW1's minus pin is its ref (ground), so that node is
//   offset + amp·sin(2π·1·t): 5 sin(2πt) here.
const { test, expect } = require('@playwright/test');
const fs   = require('node:fs');
const path = require('node:path');

const WAVE_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'parts', 'test_wave_source.js'), 'utf8');
const CLOCK = /t = (\d+(?:\.\d+)?) s/;

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// Loads the editor and defines the stand-in sine source with a test view:
// one small box per leg.
async function openEditor(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  await page.evaluate(code => {
    const module = { exports: {} };
    new Function('module', 'exports', code)(module, module.exports);
    const def = module.exports();
    def.view = {
      build(ctx, values, controls, legs) {
        const T = ctx.THREE;
        const group = new T.Group();
        const pinPositions = legs.map(l => {
          const p = ctx.holeWorld(l.col, l.row);
          const box = new T.Mesh(new T.BoxGeometry(0.18, 0.3, 0.18), ctx.mat.body(0x338833));
          box.position.set(p.x, 0.2, p.z);
          group.add(box);
          return new T.Vector3(p.x, 0.08, p.z);
        });
        return { group, pinPositions };
      },
    };
    if (!Parts.get(def.type)) Parts.define(def);
  }, WAVE_SOURCE);
}

// TW1 5 Vp, offset 0 (plus a10, minus a14) with R1 1 kΩ across it (b10–b14).
// No battery and no capacitor: the sine is the board's only source.
async function buildSineBoard(page) {
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('test_wave_source', [hole('a10'), hole('a14')], { amp: 5, offset: 0 });
    App.placePart('resistor', [hole('b10'), hole('b14')], { resistance: 1000 });
  });
}

// Records every plugged:sim (wall time, the source's node, the clock shown)
// and every plugged:sim-stop.
async function listen(page) {
  await page.evaluate(clock => {
    const re = new RegExp(clock);
    window.__sims = [];
    window.__stops = [];
    document.addEventListener('plugged:sim', e => {
      const readings = e.detail && e.detail.readings;
      const box = document.getElementById('sim-results');
      const m = box ? box.textContent.match(re) : null;
      window.__sims.push({
        at:     performance.now(),
        status: e.detail && e.detail.result && e.detail.result.status,
        v:      readings ? readings.voltage('c10') : null,
        clock:  m ? Number(m[1]) : null,
      });
    });
    document.addEventListener('plugged:sim-stop', () => window.__stops.push(performance.now()));
  }, CLOCK.source);
}

const sims = page => page.evaluate(() => window.__sims);
const shownClock = page => page.evaluate(clock => {
  const box = document.getElementById('sim-results');
  if (!box || getComputedStyle(box).display === 'none') return null;
  const m = box.textContent.match(new RegExp(clock));
  return m ? Number(m[1]) : null;
}, CLOCK.source);

test('a sine-only board: Run starts the clock, the source\'s node swings + and − at 1 Hz, Stop clears the clock', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await buildSineBoard(page);
  await listen(page);

  await page.locator('#sim-run-btn').click();
  // Setup check: the stand-in part is placed and the board solves (passes
  // today, so a failure below is about the clock, not the board).
  await expect.poll(async () => (await sims(page)).some(s => s.status === 'ok' && s.v != null),
    { message: 'Run solves the sine board (status ok, a reading at c10)', timeout: 3000 }).toBe(true);
  await expect.poll(() => shownClock(page), { message: 'a clock line "t = <s> s" appears in #sim-results after Run (the board has a wave source)', timeout: 3000 })
    .not.toBeNull();
  await expect.poll(() => shownClock(page), { message: 'the clock counts past 1.5 s', timeout: 8000 })
    .toBeGreaterThanOrEqual(1.5);

  // Over 1.5 s of a 1 Hz, 5 Vp sine the node goes up near +5 V and down
  // near −5 V, so readings change sign across frames.
  const all = (await sims(page)).filter(s => s.v != null && s.clock != null);
  expect(all.length, `plugged:sim fires every frame with readings and a clock (got ${all.length})`).toBeGreaterThan(10);
  const vs = all.map(s => s.v);
  const hi = Math.max(...vs), lo = Math.min(...vs);
  expect(hi, `the node reaches near +5 V (max ${hi.toFixed(2)} V over ${all.length} frames)`).toBeGreaterThan(4);
  expect(lo, `the node reaches near −5 V (min ${lo.toFixed(2)} V over ${all.length} frames)`).toBeLessThan(-4);
  // And it follows 5 sin(2πt) with t read off each frame's clock.
  for (const s of [all[Math.floor(all.length / 3)], all[Math.floor(2 * all.length / 3)], all[all.length - 1]]) {
    const want = 5 * Math.sin(2 * Math.PI * s.clock);
    expect(Math.abs(s.v - want), `at t = ${s.clock} s: expected about ${want.toFixed(2)} V, got ${s.v}`).toBeLessThan(0.5);
  }

  await page.locator('#sim-stop-btn').click();
  await expect.poll(() => page.evaluate(() => window.__stops.length)).toBe(1);
  const stoppedAt = await page.evaluate(() => window.__stops[0]);
  await page.waitForTimeout(400);
  const after = (await sims(page)).filter(s => s.at > stoppedAt);
  expect(after.length, 'no plugged:sim fires after Stop (the loop is cancelled)').toBe(0);
  expect(await shownClock(page), 'no clock shown after Stop').toBeNull();
  expect(errors).toEqual([]);
});
