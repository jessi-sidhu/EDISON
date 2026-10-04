// Issue #187 (Scene A): flush hole sockets in both UIs, and in Edison the
// scene-env groundwork: a 'scene-env' group (the grid floor), the flat
// 'ground' hidden (kept: the hero looks it up by name), and the off-board
// parts (instruments, the battery) seated at App.BENCH_Y instead of y = 0.
// The pure half (the gate, BENCH_Y's value, the holes in breadboard.js) is
// test/scene-env.test.js.
//
// Issue #188 (Scene B), folded into the same two page loads: in Edison the
// group also holds the ruled graphite slab (its top face at App.BENCH_Y), the
// ruler's numbers, the light pool and the rim light, the grid floor drops to
// BENCH_Y - 8, and #canvas-wrap::after is a vignette that lets clicks through
// to the canvas. Classic has none of it. The ruler's tick maths is
// test/scene-env.test.js.
//
// Lab 2 (?lab=lab2) is the scene: its starter has off-board instruments
// (PS1, FG1) on the bench. /api/ask is stubbed with page.route; no AI is
// called. Guest only.
//
// The hole cap is measured with THREE.Box3: in three r128 an InstancedMesh's
// box is its geometry's box in the mesh's frame (the instances sit at y = 0),
// so its top is the cylinder's cap.
const { test, expect } = require('@playwright/test');

const HOLE_CAP = 0.005;          // the cap sits this far above the board's top face
const SEAT_TOL = 0.01;           // off-board parts sit within this of their floor
const QUIET = 4, QUIET_MS = 2000;   // as e2e/edison-skin.spec.js: at most 4 frames in 2 s idle
const GRID_DROP = 8;             // #188: the grid floor sits this far below the slab's top

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// Opens Lab 2 in the given UI and waits until its off-board parts are placed.
async function openLab2(page, ui) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto(`/circuit3d/index.html?ui=${ui}&lab=lab2`);
  await page.waitForFunction(() => window.App && App.state && App.scene && App.state.breadboard && App.renderer
    && App.state.components.some(c => Parts.get(c.type).place.kind === 'offboard'), null, { timeout: 20_000 });
}

// What the scene holds: the env group, the ground, the off-board parts' y and
// how far the hole cap stands above the board's top face.
const look = page => page.evaluate(() => {
  App.scene.updateMatrixWorld(true);
  const ground = App.scene.getObjectByName('ground');
  const top = name => new THREE.Box3().setFromObject(App.scene.getObjectByName(name)).max.y;
  return {
    ui: document.documentElement.dataset.ui,
    env: !!App.scene.getObjectByName('scene-env'),
    groundVisible: ground ? ground.visible : null,
    benchY: App.BENCH_Y,
    wantBenchY: -(App.BOARD_GEOMETRY.BOARD_THICK + 0.025),
    offboard: App.state.components
      .filter(c => Parts.get(c.type).place.kind === 'offboard')
      .map(c => ({ label: c.label, type: c.type, y: c.group.position.y })),
    holeCapAboveTop: top('bb-holes') - top('bb-body'),
    // #188: what the env group holds (the names scene-env.js gives them).
    slab: (() => {
      const env  = App.scene.getObjectByName('scene-env');
      const slab = env && env.getObjectByName('env-slab');
      return slab ? { isMesh: !!slab.isMesh, top: new THREE.Box3().setFromObject(slab).max.y } : null;
    })(),
    ruler: (() => {
      const env = App.scene.getObjectByName('scene-env');
      const r   = env && env.getObjectByName('env-ruler');
      return r ? { isMesh: !!r.isMesh, hasMap: !!(r.material && r.material.map) } : null;
    })(),
    lights: (() => {
      const env = App.scene.getObjectByName('scene-env');
      const all = [];
      if (env) env.traverse(o => { if (o.isLight) all.push(o); });
      return { pool: all.filter(o => o.isSpotLight && !o.castShadow).length, rim: all.filter(o => o.isDirectionalLight).length };
    })(),
    gridY: (() => {
      const env  = App.scene.getObjectByName('scene-env');
      const grid = env && env.getObjectByName('env-grid');
      return grid ? grid.position.y : null;
    })(),
    // The vignette: #canvas-wrap::after's computed style, and what a click
    // lands on across the view (a pseudo-element with pointer events would
    // hit-test as #canvas-wrap itself).
    vignette: (() => {
      const wrap = document.getElementById('canvas-wrap');
      const cs   = getComputedStyle(wrap, '::after');
      const r    = wrap.getBoundingClientRect();
      const hits = [];
      for (let i = 1; i <= 5; i++) for (let j = 1; j <= 5; j++) {
        const el = document.elementFromPoint(r.left + r.width * i / 6, r.top + r.height * j / 6);
        hits.push(el === wrap ? 'wrap' : el === App.renderer.domElement ? 'canvas' : 'other');
      }
      return { content: cs.content, backgroundImage: cs.backgroundImage, pointerEvents: cs.pointerEvents, hits };
    })(),
  };
});

const frames = page => page.evaluate(() => App.renderer.info.render.frame);
async function framesOver(page, ms) {
  const before = await frames(page);
  await page.waitForTimeout(ms);
  return (await frames(page)) - before;
}

test('?ui=edison&lab=lab2: the scene-env floor replaces the ground, the instruments sit at App.BENCH_Y, the holes are flush, the ruled slab, ruler, lights and vignette are there, and the idle view stays quiet', async ({ page }) => {
  test.setTimeout(60_000);   // the quiet poll on top of the lab load
  const errors = watchErrors(page);
  await openLab2(page, 'edison');

  const l = await look(page);
  expect(l.ui, '<html data-ui>').toBe('edison');
  expect.soft(l.env, 'a group named "scene-env" is in the scene').toBe(true);
  expect.soft(l.groundVisible, 'the flat "ground" is still in the scene but hidden').toBe(false);
  expect.soft(Number(l.benchY), `App.BENCH_Y is -(BOARD_THICK + 0.025) = ${l.wantBenchY}, got ${l.benchY}`).toBeCloseTo(l.wantBenchY, 6);
  expect(l.offboard.length, 'Lab 2 has off-board parts').toBeGreaterThan(0);
  for (const o of l.offboard) {
    expect.soft(Math.abs(o.y - l.benchY), `${o.label} (${o.type}) sits at App.BENCH_Y (${l.benchY}), got y = ${o.y}`)
      .toBeLessThanOrEqual(SEAT_TOL);
  }
  expect.soft(l.holeCapAboveTop, `the hole cap is ${HOLE_CAP} above the board's top face, got ${l.holeCapAboveTop.toFixed(4)}`)
    .toBeCloseTo(HOLE_CAP, 3);

  // #188: the ruled graphite slab, its top face the bench the instruments stand on.
  expect.soft(l.slab && l.slab.isMesh, 'the scene-env group holds the slab mesh "env-slab"').toBe(true);
  if (l.slab) {
    expect.soft(l.slab.top, `the slab's top face is at App.BENCH_Y (${l.benchY}), got ${l.slab.top}`).toBeCloseTo(l.benchY, 3);
  }
  expect.soft(l.ruler, 'the scene-env group holds the ruler\'s numbers "env-ruler", a textured mesh').toEqual({ isMesh: true, hasMap: true });
  expect.soft(l.lights.pool, 'a spot light pool with no shadows').toBeGreaterThanOrEqual(1);
  expect.soft(l.lights.rim, 'a rim directional light').toBeGreaterThanOrEqual(1);
  expect.soft(l.gridY, `the grid floor sits ${GRID_DROP} below the slab (y = ${l.benchY - GRID_DROP}), got ${l.gridY}`)
    .toBeCloseTo(l.benchY - GRID_DROP, 3);
  // The vignette: drawn over the canvas, and clicks go through it.
  expect.soft(l.vignette.content, '#canvas-wrap::after is generated (content is set)').not.toBe('none');
  expect.soft(l.vignette.backgroundImage, '#canvas-wrap::after has a background image (the vignette)').not.toBe('none');
  expect.soft(l.vignette.pointerEvents, '#canvas-wrap::after has pointer-events: none').toBe('none');
  expect.soft(l.vignette.hits, 'no point in the view hits the vignette (#canvas-wrap itself) instead of the canvas').not.toContain('wrap');
  expect.soft(l.vignette.hits, 'points in the view reach the canvas').toContain('canvas');

  // Pin (render on demand, #109): the floor is built before the first frame
  // and nothing in it animates, so the idle view goes quiet.
  await expect.poll(() => framesOver(page, QUIET_MS), {
    message: `with no input the Edison view goes quiet (allowed: ${QUIET} frames in ${QUIET_MS} ms)`,
    timeout: 12_000, intervals: [250],
  }).toBeLessThanOrEqual(QUIET);
  expect(errors).toEqual([]);
});

test('?ui=classic&lab=lab2: no scene-env (no slab, ruler or vignette), the ground shows and the instruments stay at y = 0 as before; the holes are flush the same way', async ({ page }) => {
  const errors = watchErrors(page);
  await openLab2(page, 'classic');

  const l = await look(page);
  expect(l.ui, '<html data-ui>').toBe('classic');
  // Pins (pass today): classic's environment is unchanged.
  expect.soft(l.env, 'classic has no "scene-env" group').toBe(false);
  expect.soft(l.groundVisible, 'classic\'s "ground" is visible').toBe(true);
  expect.soft(l.slab, 'classic has no slab').toBe(null);
  expect.soft(l.ruler, 'classic has no ruler').toBe(null);
  expect.soft(l.vignette.backgroundImage, 'classic has no vignette on #canvas-wrap::after').toBe('none');
  expect(l.offboard.length, 'Lab 2 has off-board parts').toBeGreaterThan(0);
  for (const o of l.offboard) {
    expect.soft(Math.abs(o.y), `${o.label} (${o.type}) stays at y = 0 in classic, got y = ${o.y}`).toBeLessThanOrEqual(SEAT_TOL);
  }
  // The bug fix, in both UIs.
  expect.soft(l.holeCapAboveTop, `the hole cap is ${HOLE_CAP} above the board's top face, got ${l.holeCapAboveTop.toFixed(4)}`)
    .toBeCloseTo(HOLE_CAP, 3);
  expect(errors).toEqual([]);
});
