// Time runs while simulating, issue #103: a board with a capacitor keeps
// simulating after Run. A clock line ("t = 1.23 s") counts up in the results
// panel, the results re-render and plugged:sim fires every frame with the
// latest result, a button click mid-run keeps the capacitor's charge, and
// Stop ends the loop and resets the clock. A board with no capacitor (the
// demo) still solves once, with no clock. /api/ask is stubbed; no AI is
// called. Guest only; Google sign-in stays a manual QA case.
//
// The capacitor (#104) isn't built yet, so after the page loads this spec
// defines the test-only stand-in test/fixtures/parts/test_capacitor.js with
// Parts.define, giving it a simple view.build (the pattern
// e2e/footprint.spec.js uses). It is ai: false and never loaded by the app.
//
// Shapes this spec assumes (stated so the builder matches them):
// - The clock is text matching /t = <seconds> s/ (e.g. "t = 1.23 s",
//   optionally followed by "(slowed)") inside #sim-results, and it is
//   rendered before that frame's plugged:sim fires (the order
//   runSimulation already uses: showResults, then dispatch).
// - Each frame's plugged:sim detail.result is that frame's analyze result,
//   with result.state['CT1.c'] the capacitor's volts (#102).
// - Sim time is the clock: V_C follows 9 (1 − e^(−t/τ)) with t read off the
//   clock, τ = 1 kΩ × 1000 µF = 1 s, and it never runs ahead of real time.
// - After Stop no plugged:sim fires, and no clock is shown.
const { test, expect } = require('@playwright/test');
const fs   = require('node:fs');
const path = require('node:path');

const CAP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'parts', 'test_capacitor.js'), 'utf8');
const CLOCK = /t = (\d+(?:\.\d+)?) s/;

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// Loads the editor and defines the stand-in capacitor with a test view: one
// pin sphere and one small box per leg.
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
          const box = new T.Mesh(new T.BoxGeometry(0.18, 0.3, 0.18), ctx.mat.body(0x223388));
          box.position.set(p.x, 0.2, p.z);
          group.add(box);
          return new T.Vector3(p.x, 0.08, p.z);
        });
        return { group, pinPositions };
      },
    };
    if (!Parts.get(def.type)) Parts.define(def);
  }, CAP_SOURCE);
}

// Builds through window.App (the calls the mouse handlers make). parts:
// [type, [holeA, holeB], values]; wires: [holeA, holeB]. BAT1 + → tp_2,
// − → tn_18.
async function build(page, parts, wires) {
  await page.evaluate(({ parts, wires }) => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    const end  = s => { const h = hole(s); return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null }; };
    const wireBat = (k, b) => {
      const bat = App.state.components.find(c => c.type === 'battery');
      const pm  = bat.pinMeshes[k];
      App.state.wireStart = { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
      App.finishWire(end(b));
    };
    App.placePart('battery', { x: 13, z: 0 });
    wireBat(0, 'tp_2');
    wireBat(1, 'tn_18');
    for (const [type, [a, b], values] of parts) App.placePart(type, [hole(a), hole(b)], values);
    for (const [a, b] of wires) { App.state.wireStart = end(a); App.finishWire(end(b)); }
  }, { parts, wires });
}

// 9 V → R1 1 kΩ (a10–a14) → CT1 1000 µF (b14–b17) → −. τ = 1 s.
const RC = {
  parts: [['resistor', ['a10', 'a14'], { resistance: 1000 }],
          ['test_capacitor', ['b14', 'b17'], { farads: 1e-3 }]],
  wires: [['tp_10', 'c10'], ['c17', 'tn_17']],
};

// 9 V → SW1 button (a6–a9) → R1 1 kΩ (b9–b13) → CT1 1000 µF (c13–c16) → −.
// Released, CT1 has no path and holds its charge.
const BUTTON_RC = {
  parts: [['button', ['a6', 'a9']],
          ['resistor', ['b9', 'b13'], { resistance: 1000 }],
          ['test_capacitor', ['c13', 'c16'], { farads: 1e-3 }]],
  wires: [['tp_6', 'c6'], ['d16', 'tn_16']],
};

// Records every plugged:sim (wall time, V_C, the clock shown, SW1's press)
// and every plugged:sim-stop.
async function listen(page) {
  await page.evaluate(clock => {
    const re = new RegExp(clock);
    window.__sims = [];
    window.__stops = [];
    document.addEventListener('plugged:sim', e => {
      const result = e.detail && e.detail.result;
      const box = document.getElementById('sim-results');
      const m = box ? box.textContent.match(re) : null;
      const sw = App.state.components.find(c => c.type === 'button');
      window.__sims.push({
        at:      performance.now(),
        status:  result && result.status,
        v:       result && result.state ? result.state['CT1.c'] : null,
        clock:   m ? Number(m[1]) : null,
        pressed: sw ? !!(sw.controls && sw.controls.pressed) : null,
      });
    });
    document.addEventListener('plugged:sim-stop', () => window.__stops.push(performance.now()));
  }, CLOCK.source);
}

const sims  = page => page.evaluate(() => window.__sims);
const last  = page => page.evaluate(() => window.__sims[window.__sims.length - 1] || null);
const shownClock = page => page.evaluate(clock => {
  const box = document.getElementById('sim-results');
  if (!box || getComputedStyle(box).display === 'none') return null;
  const m = box.textContent.match(new RegExp(clock));
  return m ? Number(m[1]) : null;
}, CLOCK.source);
const now = page => page.evaluate(() => performance.now());

// The cap of the button on screen (as e2e/button.spec.js clicks it).
async function clickButtonCap(page) {
  const at = await page.evaluate(() => {
    const c = App.state.components.find(x => x.type === 'button');
    const box = new THREE.Box3().setFromObject(c.group);
    const p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  });
  await page.mouse.click(at.x, at.y);
}

const charge = t => 9 * (1 - Math.exp(-t));   // V_C at t seconds, τ = 1 s

test('a capacitor board keeps simulating: the clock counts up in real time, plugged:sim fires each frame, V_C charges along 9(1 − e^(−t))', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await build(page, RC.parts, RC.wires);
  await listen(page);

  const start = await now(page);
  await page.locator('#sim-run-btn').click();
  await expect.poll(() => shownClock(page), { message: 'a clock line "t = <s> s" appears in #sim-results after Run', timeout: 3000 })
    .not.toBeNull();
  const early = await shownClock(page);
  await expect.poll(() => shownClock(page), { message: 'the clock counts up to 1 s', timeout: 8000 })
    .toBeGreaterThanOrEqual(1);
  const later = await shownClock(page);
  expect(later, 'the clock counts up').toBeGreaterThan(early);

  const all = await sims(page);
  const timed = all.filter(s => s.v != null && s.clock != null);
  expect(timed.length, `plugged:sim fires every frame with result.state (got ${all.length} events, ${timed.length} with V_C and a clock)`)
    .toBeGreaterThan(10);
  const firstHalfSecond = all.filter(s => s.at - all[0].at <= 500);
  expect(firstHalfSecond.length, 'more than one plugged:sim in the first 0.5 s').toBeGreaterThan(1);

  // V_C rises, and matches the closed form at the clock's time.
  const a = timed[Math.floor(timed.length / 3)];
  const b = timed[timed.length - 1];
  expect(b.v, `V_C rises: ${a.v} V at t = ${a.clock} s, ${b.v} V at t = ${b.clock} s`).toBeGreaterThan(a.v);
  for (const s of [a, b]) {
    expect(Math.abs(s.v - charge(s.clock)), `V_C at t = ${s.clock} s: expected ${charge(s.clock).toFixed(2)} V, got ${s.v}`)
      .toBeLessThan(0.35);
  }

  // 1× real time at most: the clock never runs ahead of the wall clock.
  const wall = (b.at - start) / 1000;
  expect(b.clock, `the clock (${b.clock} s) is not ahead of real time (${wall.toFixed(2)} s since Run)`).toBeLessThanOrEqual(wall + 0.25);
  expect(errors).toEqual([]);
});

test('a button click mid-run keeps the capacitor charge: released it holds, pressed again it carries on', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await build(page, BUTTON_RC.parts, BUTTON_RC.wires);
  await listen(page);

  await page.locator('#sim-run-btn').click();
  await expect.poll(() => shownClock(page), { message: 'the clock runs with the button released', timeout: 3000 }).not.toBeNull();

  // Press: CT1 charges through R1.
  await clickButtonCap(page);
  await expect.poll(async () => (await last(page) || {}).v, { message: 'V_C passes 2 V with the button pressed', timeout: 5000 })
    .toBeGreaterThan(2);

  // Release: CT1 has no path, so it holds (no reset to 0).
  await clickButtonCap(page);
  await expect.poll(async () => (await last(page) || {}).pressed, { message: 'a frame after release', timeout: 3000 }).toBe(false);
  const held = await last(page);
  await page.waitForTimeout(400);
  const still = await last(page);
  expect(still.v, `released: V_C holds at ${held.v} V (got ${still.v} V)`).toBeGreaterThan(held.v - 0.05);
  expect(still.v, `released: V_C holds at ${held.v} V (got ${still.v} V)`).toBeLessThan(held.v + 0.05);
  expect(still.clock, 'the clock keeps counting through the clicks').toBeGreaterThan(held.clock);

  // Press again: it carries on from the held charge, not from 0 V.
  const mark = (await sims(page)).length;
  await clickButtonCap(page);
  await expect.poll(async () => (await sims(page)).slice(mark).some(s => s.pressed && s.v != null),
    { message: 'a frame after the second press', timeout: 3000 }).toBe(true);
  const again = (await sims(page)).slice(mark).find(s => s.pressed && s.v != null);
  expect(again.v, `the first frame after pressing again starts from the held ${still.v} V`).toBeGreaterThan(still.v - 0.05);
  await expect.poll(async () => (await last(page) || {}).v, { message: 'V_C rises again', timeout: 5000 })
    .toBeGreaterThan(still.v + 0.5);
  expect(errors).toEqual([]);
});

test('Stop ends the loop and resets: no plugged:sim after Stop, no clock, and a new Run starts at t = 0 and 0 V', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await build(page, RC.parts, RC.wires);
  await listen(page);

  await page.locator('#sim-run-btn').click();
  await expect.poll(() => shownClock(page), { message: 'the clock passes 0.5 s', timeout: 5000 }).toBeGreaterThanOrEqual(0.5);
  expect((await last(page)).v, 'charged a little before Stop').toBeGreaterThan(2);

  await page.locator('#sim-stop-btn').click();
  await expect.poll(() => page.evaluate(() => window.__stops.length)).toBe(1);
  const stoppedAt = await page.evaluate(() => window.__stops[0]);
  await page.waitForTimeout(400);
  const after = (await sims(page)).filter(s => s.at > stoppedAt);
  expect(after.length, 'no plugged:sim fires after Stop (the loop is cancelled)').toBe(0);
  expect(await shownClock(page), 'no clock shown after Stop').toBeNull();

  const mark = (await sims(page)).length;
  await page.locator('#sim-run-btn').click();
  await expect.poll(async () => (await sims(page)).slice(mark).some(s => s.v != null && s.clock != null),
    { message: 'the new run shows a clock and V_C', timeout: 3000 }).toBe(true);
  const first = (await sims(page)).slice(mark).find(s => s.v != null && s.clock != null);
  expect(first.clock, 'the clock restarts from 0').toBeLessThan(0.3);
  expect(first.v, 'the capacitor restarts discharged (state cleared)').toBeLessThan(1);
  expect(errors).toEqual([]);
});

// Pin (passes today): the demo path. No capacitor, so Run is one solve.
test('pin: the demo circuit (no capacitor) solves once per Run, with no clock', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/landing.html');
  await page.getByRole('button', { name: /Try it out/ }).click();
  await page.waitForURL('**/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.components.length === 4);
  await listen(page);

  await page.locator('#sim-run-btn').click();
  await expect.poll(() => page.evaluate(() => window.__sims.length)).toBe(1);
  await page.waitForTimeout(600);
  const all = await sims(page);
  expect(all.length, 'one plugged:sim per Run').toBe(1);
  expect(all[0].status).toBe('ok');
  expect(await page.locator('#sim-results').textContent(), 'no clock line').not.toMatch(CLOCK);
  expect(errors).toEqual([]);
});
