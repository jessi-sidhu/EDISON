// Bug #59 (QA AI-11, AI-09): the scroll wheel over a slider part while
// simulating. A real pointer is moved over the part's face on screen and a
// real wheel tick sent there (page.mouse.wheel), the way a person scrolls;
// no WheelEvent is dispatched by hand. /api/ask is stubbed; no AI is called.
// Guest only; Google sign-in stays a manual QA case.
//
// What the builder must match:
// - While simulating, a wheel tick over a part with gestures.scroll moves its
//   control by one tick (1/20 of its range, clamped) and the camera does NOT
//   zoom: App.camera.position.distanceTo(App.controls.target) is unchanged.
//   This holds for span parts (the LDR, 2 leads) and footprint parts (the pot).
// - With the simulation stopped, or over empty board, the wheel zooms as
//   before, and no control moves.
// - (Bug #59, the agreed fix) While simulating, a wheel ON or within ~15 px
//   of a scroll-gesture part's on-screen outline (its Box3 projected through
//   App.camera) turns that part, the nearest one when two are near; the
//   camera zooms only when no scrollable part is that near. The pick is
//   Gestures.pickScrollPart(pointer, candidates, maxPx) (test/scroll-pick.test.js).
// - (Bug #59) While simulating, hovering a scrollable part shows the hint
//   (#hint-text, #hint-box not .hint-hidden) "Scroll to change <control> ·
//   <value> <unit>", e.g. "Scroll to change light · 300 lux". Moving off the
//   part takes that hint away.
// - Every test first puts the camera back at the home view (App.resetCamera),
//   the zoomed-out view the bug was reproduced at; #67 frames the circuit
//   after an AI build, which would otherwise make the parts bigger.
//
// Circuits (as in e2e/ldr.spec.js and e2e/potentiometer.spec.js):
// - Night light at C = 2: tp_3 → a2; R 4.7 kΩ b2–b6; LED anode c6, cathode
//   c8; LDR d6 (pin 1) – d9 (pin 2); a8 → tn_8; a9 → tn_9. 300 lux → LED off;
//   1 lux → "LED ON  (1.4 mA)".
// - Dimmer at C = 2: pot 1 kΩ c2 c3 c4; tp_4 → a4; a2 → tn_2; R b3–b7; LED
//   anode c7, cathode c9; a9 → tn_9. 50 % → "LED ON  (3.5 mA)".
const { test, expect } = require('@playwright/test');

// The window size the bug was reproduced at (issue #59): at the home view
// the LDR is only about 38 × 21 px on screen.
test.use({ viewport: { width: 1440, height: 800 } });

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

const simText = async page => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | ');
const controlOf = (page, type, key) => page.evaluate(([type, key]) => {
  const c = App.state.components.find(x => x.type === type);
  return c && c.controls ? c.controls[key] : null;
}, [type, key]);
const camDistance = page => page.evaluate(() => App.camera.position.distanceTo(App.controls.target));

// Settle: a few animation frames, so OrbitControls' damping and any
// pending update have run before the camera is measured.
const frames = (page, n = 10) => page.evaluate(n => new Promise(res => {
  let i = 0;
  const step = () => (++i >= n ? res() : requestAnimationFrame(step));
  requestAnimationFrame(step);
}), n);

function toScreen(page, world) {
  return page.evaluate(w => {
    const p = new THREE.Vector3(w.x, w.y, w.z);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, world);
}

// The top centre of a part's model (the LDR's face, the pot's knob), where a
// person points at it, in page pixels.
async function partTop(page, label) {
  const w = await page.evaluate(l => {
    const c = App.state.components.find(x => x.label === l);
    c.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c.group);
    return { x: (box.min.x + box.max.x) / 2, y: box.max.y, z: (box.min.z + box.max.z) / 2 };
  }, label);
  return toScreen(page, w);
}

async function holePoint(page, where) {
  const w = await page.evaluate(where => {
    const { col, row } = App.parseHole(where);
    const h = App.state.breadboard.getHole(col, row);
    const p = h.world ? h.world : new THREE.Vector3(h.x, 0, h.z);
    return { x: p.x, y: p.y, z: p.z };
  }, where);
  return toScreen(page, w);
}

// The label of the part whose model is under a page point (the first mesh
// hit, as the canvas's own hit test sees it), or null.
function partUnder(page, at) {
  return page.evaluate(({ x, y }) => {
    const r = App.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    App.camera.updateMatrixWorld();
    ray.setFromCamera(ndc, App.camera);
    const meshes = [];
    App.state.components.forEach(c => { if (c.group) c.group.traverse(o => { if (o.isMesh) meshes.push(o); }); });
    const hits = ray.intersectObjects(meshes, false);
    if (!hits.length) return null;
    for (let o = hits[0].object; o; o = o.parent) {
      const c = App.state.components.find(k => k.group === o);
      if (c) return c.label;
    }
    return null;
  }, at);
}

// Which element a real pointer at this point lands on (for failure messages).
const elementAt = (page, at) => page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  return el ? (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className ? '.' + el.className : '')) : null;
}, at);

function wireBattery() {
  const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
  const end  = s => { const h = hole(s); return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null }; };
  App.placePart('battery', App.batterySpot());
  const bat = App.state.components.find(c => c.type === 'battery');
  for (const [k, rail] of [[0, 'tp_63'], [1, 'tn_63']]) {
    const pm = bat.pinMeshes[k];
    App.state.wireStart = { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
    App.finishWire(end(rail));
  }
}

async function buildNightLight(page) {
  await page.evaluate(wireBatterySrc => {
    // eslint-disable-next-line no-new-func
    new Function(wireBatterySrc + '; wireBattery();')();
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    const end  = s => { const h = hole(s); return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null }; };
    const wireHoles = (a, b) => { App.state.wireStart = end(a); App.finishWire(end(b)); };
    App.placePart('ldr', [hole('d6'), hole('d9')]);
    App.placePart('resistor', [hole('b2'), hole('b6')], { resistance: 4700 });
    App.placePart('led', [hole('c8'), hole('c6')]);   // cathode c8, anode c6
    wireHoles('tp_3', 'a2');
    wireHoles('a8', 'tn_8');
    wireHoles('a9', 'tn_9');
  }, wireBattery.toString());
  expect(await controlOf(page, 'ldr', 'light'), 'LDR1 placed at the default 300 lux').toBe(300);
}

async function buildDimmer(page) {
  await page.evaluate(wireBatterySrc => {
    // eslint-disable-next-line no-new-func
    new Function(wireBatterySrc + '; wireBattery();')();
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    const end  = s => { const h = hole(s); return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null }; };
    const wireHoles = (a, b) => { App.state.wireStart = end(a); App.finishWire(end(b)); };
    App.placePart('potentiometer', [hole('c2'), hole('c3'), hole('c4')], { resistance: 1000 });
    const pot = App.state.components.find(c => c.type === 'potentiometer');
    App.setControls(pot, { position: 50 });
    wireHoles('tp_4', 'a4');   // pin 3 → +
    wireHoles('a2', 'tn_2');   // pin 1 → −
    App.placePart('resistor', [hole('b3'), hole('b7')]);
    App.placePart('led', [hole('c9'), hole('c7')]);   // cathode c9, anode c7
    wireHoles('a9', 'tn_9');
  }, wireBattery.toString());
  expect(await controlOf(page, 'potentiometer', 'position'), 'RV1 at 50 %').toBe(50);
}

async function run(page) {
  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => simText(page), { message: 'the simulation has results' }).toContain('Battery 1');
  expect(await page.evaluate(() => App.simRunning), 'the simulation is running').toBe(true);
}

// Back to the home view (distance ≈ 37.2, where the bug was reproduced),
// and let the controls settle.
async function homeView(page) {
  await page.evaluate(() => App.resetCamera());
  await frames(page, 20);
  const d = await camDistance(page);
  expect(d, 'the camera is at the home view (distance ≈ 37.2)').toBeCloseTo(Math.hypot(22, 30), 1);
}

// A part's on-screen outline: the 8 corners of its Box3 projected through
// App.camera, as a page-pixel rect { x, y, w, h } (top-left, y down).
function partRect(page, label) {
  return page.evaluate(l => {
    const c = App.state.components.find(x => x.label === l);
    c.group.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(c.group);
    App.camera.updateMatrixWorld();
    const r = App.renderer.domElement.getBoundingClientRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const X of [b.min.x, b.max.x]) for (const Y of [b.min.y, b.max.y]) for (const Z of [b.min.z, b.max.z]) {
      const p = new THREE.Vector3(X, Y, Z).project(App.camera);
      const sx = r.left + (p.x + 1) / 2 * r.width, sy = r.top + (1 - p.y) / 2 * r.height;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }, label);
}

// Distance from a page point to a rect's nearest edge (0 inside).
const rectDistance = (p, r) => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)),
                                          Math.max(r.y - p.y, 0, p.y - (r.y + r.h)));

// A point `px` pixels outside a part's outline, beside the middle of one of
// its sides, where the canvas hit test finds no part at all (a true
// near-miss: today's code zooms there). Sides tried in a fixed order.
async function nearMiss(page, label, px) {
  const r = await partRect(page, label);
  const sides = {
    right: { x: r.x + r.w + px, y: r.y + r.h / 2 },
    left:  { x: r.x - px,       y: r.y + r.h / 2 },
    below: { x: r.x + r.w / 2,  y: r.y + r.h + px },
    above: { x: r.x + r.w / 2,  y: r.y - px },
  };
  const tried = [];
  for (const [side, at] of Object.entries(sides)) {
    const under = await partUnder(page, at);
    const el = await elementAt(page, at);
    tried.push(`${side}: part ${under}, element ${el}`);
    if (under === null && (el === '#canvas' || el === 'canvas')) return { at, side, rect: r };
  }
  throw new Error(`no clear point ${px} px off ${label}'s outline ${JSON.stringify(r)}: ${tried.join('; ')}`);
}

// Is the hint box showing, and with what text?
const hintShown = page => page.evaluate(() => {
  const box = document.getElementById('hint-box');
  const text = document.getElementById('hint-text').textContent;
  return box && !box.classList.contains('hint-hidden') ? text : '';
});

// Points the real mouse at `at`, lets the scene settle, and returns the
// camera distance just before the wheel.
async function pointAt(page, at) {
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  await frames(page);
  return camDistance(page);
}

// ── Done when 1: a real wheel over the LDR while simulating ────────────────

test('simulating: one real wheel tick DOWN over the LDR takes 300 lux to 1 lux (LED lights) and does not zoom the camera', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await buildNightLight(page);
  await run(page);
  expect(await simText(page), 'at 300 lux the LED is off').not.toContain('LED ON');
  await homeView(page);

  const face = await partTop(page, 'LDR1');
  expect(await partUnder(page, face), 'the pointer is on LDR1\'s model').toBe('LDR1');
  const before = await pointAt(page, face);
  const el = await elementAt(page, face);

  await page.mouse.wheel(0, 100);
  await frames(page);

  await expect.poll(() => controlOf(page, 'ldr', 'light'),
    { message: `one wheel tick down over LDR1 (pointer on ${el}) takes 300 lux to the 1 lux floor` }).toBe(1);
  await expect.poll(() => simText(page)).toContain('LED ON  (1.4 mA)');
  const after = await camDistance(page);
  expect(after, `the camera did not zoom (distance ${before} → ${after})`).toBeCloseTo(before, 4);
  expect(errors).toEqual([]);
});

// ── Done when 1: a real wheel over the pot while simulating ────────────────

test('simulating: one real wheel tick UP over the pot moves it 50 → 55 % and does not zoom the camera', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await buildDimmer(page);
  await run(page);
  await expect.poll(() => simText(page)).toContain('LED ON  (3.5 mA)');
  await homeView(page);

  const knob = await partTop(page, 'RV1');
  expect(await partUnder(page, knob), 'the pointer is on RV1\'s model').toBe('RV1');
  const before = await pointAt(page, knob);

  await page.mouse.wheel(0, -100);
  await frames(page);

  await expect.poll(() => controlOf(page, 'potentiometer', 'position'),
    { message: 'one wheel tick up over RV1 adds 5 %' }).toBe(55);
  const after = await camDistance(page);
  expect(after, `the camera did not zoom (distance ${before} → ${after})`).toBeCloseTo(before, 4);
  expect(errors).toEqual([]);
});

// ── Done when 2 (guards): the wheel still zooms where no gesture applies ────

test('stopped: a real wheel tick over the LDR zooms the camera and leaves the light at 300 lux', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await buildNightLight(page);
  expect(await page.evaluate(() => !!App.simRunning), 'the simulation is stopped').toBe(false);
  await homeView(page);

  const face = await partTop(page, 'LDR1');
  expect(await partUnder(page, face), 'the pointer is on LDR1\'s model').toBe('LDR1');
  const before = await pointAt(page, face);

  await page.mouse.wheel(0, 100);
  await frames(page);

  const after = await camDistance(page);
  expect(Math.abs(after - before), `the camera zoomed (distance ${before} → ${after})`).toBeGreaterThan(0.01);
  expect(await controlOf(page, 'ldr', 'light'), 'the light is unchanged while stopped').toBe(300);
  expect(errors).toEqual([]);
});

test('simulating: a real wheel tick over empty board zooms the camera and moves no control', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await buildNightLight(page);
  await run(page);
  await homeView(page);

  const empty = await holePoint(page, 'h40');
  expect(await partUnder(page, empty), 'no part under the pointer').toBe(null);
  for (const label of await page.evaluate(() => App.state.components.map(c => c.label))) {
    const d = rectDistance(empty, await partRect(page, label));
    expect(d, `h40 is 40+ px from ${label}'s outline (so no part is "near")`).toBeGreaterThanOrEqual(40);
  }
  const before = await pointAt(page, empty);

  await page.mouse.wheel(0, 100);
  await frames(page);

  const after = await camDistance(page);
  expect(Math.abs(after - before), `the camera zoomed (distance ${before} → ${after})`).toBeGreaterThan(0.01);
  expect(await controlOf(page, 'ldr', 'light'), 'the LDR is untouched').toBe(300);
  expect(errors).toEqual([]);
});

// ── Bug #59: a near-miss (8 px off the outline) turns the part, no zoom ────

test('simulating, home view: a real wheel tick DOWN 8 px off the LDR\'s outline takes 300 → 1 lux (LED lights) and does not zoom', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await buildNightLight(page);
  await run(page);
  await homeView(page);
  expect(await simText(page), 'at 300 lux the LED is off').not.toContain('LED ON');

  const { at, side, rect } = await nearMiss(page, 'LDR1', 8);
  expect(rectDistance(at, rect), 'the pointer is 8 px from LDR1\'s outline').toBeCloseTo(8, 3);
  const before = await pointAt(page, at);

  await page.mouse.wheel(0, 100);
  await frames(page);

  const after = await camDistance(page);
  expect(after, `a wheel 8 px ${side} of LDR1 (outline ${Math.round(rect.w)}×${Math.round(rect.h)} px) must not zoom the camera (distance ${before.toFixed(2)} → ${after.toFixed(2)})`).toBeCloseTo(before, 4);
  await expect.poll(() => controlOf(page, 'ldr', 'light'),
    { message: `one wheel tick down 8 px ${side} of LDR1 takes 300 lux to the 1 lux floor` }).toBe(1);
  await expect.poll(() => simText(page)).toContain('LED ON  (1.4 mA)');
  expect(errors).toEqual([]);
});

test('simulating, home view: a real wheel tick UP 8 px off the pot\'s outline moves it 50 → 55 % and does not zoom', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await buildDimmer(page);
  await run(page);
  await homeView(page);
  await expect.poll(() => simText(page)).toContain('LED ON  (3.5 mA)');

  const { at, side, rect } = await nearMiss(page, 'RV1', 8);
  expect(rectDistance(at, rect), 'the pointer is 8 px from RV1\'s outline').toBeCloseTo(8, 3);
  const before = await pointAt(page, at);

  await page.mouse.wheel(0, -100);
  await frames(page);

  const after = await camDistance(page);
  expect(after, `a wheel 8 px ${side} of RV1 (outline ${Math.round(rect.w)}×${Math.round(rect.h)} px) must not zoom the camera (distance ${before.toFixed(2)} → ${after.toFixed(2)})`).toBeCloseTo(before, 4);
  await expect.poll(() => controlOf(page, 'potentiometer', 'position'),
    { message: `one wheel tick up 8 px ${side} of RV1 adds 5 %` }).toBe(55);
  expect(errors).toEqual([]);
});

// ── Bug #59: the hover hint ────────────────────────────────────────────────

test('simulating: hovering the LDR shows "Scroll to change light · 300 lux", and moving off it takes that hint away', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await buildNightLight(page);
  await run(page);
  await homeView(page);

  const face = await partTop(page, 'LDR1');
  expect(await partUnder(page, face), 'the pointer is on LDR1\'s model').toBe('LDR1');
  await pointAt(page, face);

  await expect.poll(() => hintShown(page),
    { message: 'hovering LDR1 while simulating shows a hint naming the gesture, e.g. "Scroll to change light · 300 lux"' })
    .toMatch(/Scroll/);
  const shown = await hintShown(page);
  expect(shown, 'the hint gives the current value with its unit').toMatch(/300\s*lux/);

  const empty = await holePoint(page, 'h40');
  expect(await partUnder(page, empty), 'no part under h40').toBe(null);
  await pointAt(page, empty);
  await expect.poll(() => hintShown(page),
    { message: 'off the part, the scroll hint is gone (hidden, or replaced by another hint)' })
    .not.toMatch(/Scroll to change|lux/);
  expect(errors).toEqual([]);
});
