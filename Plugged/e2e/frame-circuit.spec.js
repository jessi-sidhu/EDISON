// Frame the circuit after an AI build (issue #67). The AI recipes build at
// columns 2-9, the far-left end of the 63-column board: at the home camera
// that is a ~40 px speck, hard to see, click or scroll. After an AI build is
// accepted, and when a circuit is opened, the camera frames the parts (it may
// animate briefly; these tests wait for it to settle). Reset View goes back
// to App.CAMERA.home, hand-placing a part never moves the camera, and an
// empty board keeps the home view.
//
// "The parts" here are the on-board parts. The battery sits off the board's
// far right end (App.batterySpot, x ≈ 15.8), so a frame that includes it
// spans the whole board and leaves the circuit small: framing must leave
// off-board parts out.
//
// /api/ask is stubbed with the one-LED recipe; no AI is called. Guest only.
const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 1280, height: 720 } });

// The recorded single-LED build (test/fixtures/recipes.js ONE_LED):
// R1 b2–b6, LED1 cathode c8 / anode c6, tp_3 → a2, a8 → tn_8.
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

// The same circuit as a saved file (the shape App.saveCircuit writes).
const h = (col, row) => ({ col, row });
const LED_FILE = {
  id: 'frame-e2e', name: 'Framed LED',
  components: [
    { type: 'battery',  label: 'BAT1', values: { voltage: 9 }, holeRefs: null, position: { x: 15.8, z: -3.15 } },
    { type: 'resistor', label: 'R1', values: { resistance: 470 }, holeRefs: [h(2, 'b'), h(6, 'b')], position: { x: 0, z: 0 } },
    { type: 'led',      label: 'LED1', values: {}, holeRefs: [h(8, 'c'), h(6, 'c')], position: { x: 0, z: 0 } },
  ],
  wires: [
    { startHole: null, endHole: h(63, 'tp'), startCompIdx: 0, startPinIdx: 0, endCompIdx: -1, endPinIdx: -1, color: 0xef4444 },
    { startHole: null, endHole: h(63, 'tn'), startCompIdx: 0, startPinIdx: 1, endCompIdx: -1, endPinIdx: -1, color: 0x111111 },
    { startHole: h(3, 'tp'), endHole: h(2, 'a'), startCompIdx: -1, startPinIdx: -1, endCompIdx: -1, endPinIdx: -1, color: 0xef4444 },
    { startHole: h(8, 'a'), endHole: h(8, 'tn'), startCompIdx: -1, startPinIdx: -1, endCompIdx: -1, endPinIdx: -1, color: 0x111111 },
  ],
};

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// The stubbed AI: the LED build for the quick button, `typed` for a message
// typed into the chat.
async function openEditor(page, typed = LED_BUILD) {
  await page.route('**/api/ask', route => {
    const { message } = route.request().postDataJSON();
    return route.fulfill({ json: /Build a complete working LED circuit/.test(message) ? LED_BUILD : typed });
  });
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

async function acceptLedBuild(page) {
  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 8 changes to your circuit.');
}

// The camera: its position and the orbit target.
const camera = page => page.evaluate(() => ({
  pos:    App.camera.position.toArray(),
  target: App.controls.target.toArray(),
}));
const near = (a, b, eps) => a.every((v, i) => Math.abs(v - b[i]) < eps);
const sameCamera = (a, b, eps = 1e-3) => near(a.pos, b.pos, eps) && near(a.target, b.target, eps);

// Waits until the camera stops moving (a framing animation may run), then
// returns where it is.
async function settledCamera(page) {
  let prev = await camera(page);
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(150);
    const cur = await camera(page);
    if (sameCamera(prev, cur)) return cur;
    prev = cur;
  }
  throw new Error(`the camera did not settle within 6 s: ${JSON.stringify(prev)}`);
}

const homeCamera = page => page.evaluate(() => ({ pos: App.CAMERA.home.pos, target: App.CAMERA.home.target }));

async function expectHome(page, why) {
  const cam  = await settledCamera(page);
  const home = await homeCamera(page);
  expect(sameCamera(cam, home, 0.01), `${why}: camera ${JSON.stringify(cam)} is not home ${JSON.stringify(home)}`).toBe(true);
}

// The on-screen box of every on-board part (the battery sits off the board),
// in page pixels, and the canvas's box.
const partsBox = page => page.evaluate(() => {
  App.camera.updateMatrixWorld();
  const r = App.renderer.domElement.getBoundingClientRect();
  const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity, parts: [] };
  for (const c of App.state.components) {
    if (c.type === 'battery' || !c.group) continue;
    box.parts.push(c.label);
    const b = new THREE.Box3().setFromObject(c.group);
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      const p = new THREE.Vector3(x, y, z).project(App.camera);
      const sx = r.left + (p.x + 1) / 2 * r.width;
      const sy = r.top + (1 - p.y) / 2 * r.height;
      box.left = Math.min(box.left, sx);  box.right  = Math.max(box.right, sx);
      box.top  = Math.min(box.top, sy);   box.bottom = Math.max(box.bottom, sy);
    }
  }
  box.width  = box.right - box.left;
  box.canvas = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  return box;
});

async function expectFramed(page, minParts) {
  await settledCamera(page);
  const box = await partsBox(page);
  expect(box.parts.length, `on-board parts: ${box.parts}`).toBeGreaterThanOrEqual(minParts);
  const at = JSON.stringify({ left: Math.round(box.left), right: Math.round(box.right), top: Math.round(box.top), bottom: Math.round(box.bottom), canvas: box.canvas });
  expect(box.width, `the parts' on-screen box is ${Math.round(box.width)} px wide ${at}`).toBeGreaterThanOrEqual(200);
  expect(box.left >= box.canvas.left && box.right <= box.canvas.right &&
         box.top >= box.canvas.top && box.bottom <= box.canvas.bottom,
    `the parts are fully on screen ${at}`).toBe(true);
}

// Where a board hole ("c30") is on screen, in page pixels (as placement.spec.js).
function screenPoint(page, where) {
  return page.evaluate(where => {
    const { col, row } = App.parseHole(where);
    const hole = App.state.breadboard.getHole(col, row);
    const p = hole.world ? hole.world.clone() : new THREE.Vector3(hole.x, 0, hole.z);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, where);
}

async function clickHole(page, where) {
  const at = await screenPoint(page, where);
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
}

test('after accepting the one-LED build, the parts are at least 200 px wide and fully on screen', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  const errors = watchErrors(page);
  await openEditor(page);
  await acceptLedBuild(page);
  await expectFramed(page, 2);
  expect(errors).toEqual([]);
});

test('Reset View goes back to the home camera after a framed build', async ({ page }) => {
  test.setTimeout(90_000);
  await openEditor(page);
  await acceptLedBuild(page);
  const framed = await settledCamera(page);
  expect(sameCamera(framed, await homeCamera(page), 0.01), 'the build moved the camera off home').toBe(false);

  await page.locator('#reset-cam-btn').click();
  await expectHome(page, 'after Reset View');
});

test('hand-placing a resistor does not move the camera', async ({ page }) => {
  test.setTimeout(90_000);
  await openEditor(page);
  await acceptLedBuild(page);
  const framed = await settledCamera(page);
  expect(sameCamera(framed, await homeCamera(page), 0.01), 'the build moved the camera off home').toBe(false);
  await page.locator('#reset-cam-btn').click();
  await expectHome(page, 'after Reset View');

  const before = await page.evaluate(() => App.state.components.length);
  await page.locator('#sidebar .comp-item[data-type="resistor"]').click();
  await clickHole(page, 'c30');
  expect(await page.evaluate(() => App.state.components.length), 'the resistor was placed').toBe(before + 1);
  await expectHome(page, 'after hand-placing a resistor');
});

test('opening a saved circuit frames it', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await expectHome(page, 'a new, empty board');
  await page.evaluate(d => App.loadCircuitData(d), LED_FILE);
  expect(await page.evaluate(() => App.state.components.map(c => c.label))).toEqual(['BAT1', 'R1', 'LED1']);
  await expectFramed(page, 2);
  expect(errors).toEqual([]);
});

test('"Try it out" frames the demo circuit', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/landing.html');
  await page.getByRole('button', { name: /Try it out/ }).click();
  await page.waitForURL('**/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.renderer && App.state.components.length === 4);
  await expectFramed(page, 3);
});

test('an empty board keeps the home view, also when an empty circuit is opened', async ({ page }) => {
  await openEditor(page);
  await expectHome(page, 'a new, empty board');
  await page.evaluate(() => App.loadCircuitData({ name: 'Empty', components: [], wires: [] }));
  await expectHome(page, 'after opening an empty circuit');
});

// ── Edits don't move the camera ────────────────────────────────────────────
// Only a batch that places parts (a place_* action) frames the circuit. An
// edit-only batch (set_value, set_control, delete_part) leaves the view the
// user chose, e.g. zoomed onto one part.

// A view the user might pick: close in on R1 from the front left.
const CUSTOM = { pos: [-14, 5, 5], target: [-11, 0.2, -1.6] };

async function setCamera(page, cam) {
  await page.evaluate(cam => {
    App.controls.target.set(...cam.target);
    App.camera.position.set(...cam.pos);
    App.controls.update();
  }, cam);
  return settledCamera(page);
}

async function askAndAccept(page, text, applied) {
  await page.locator('#sparky-input').fill(text);
  await page.locator('#sparky-input').press('Enter');
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText(applied);
}

test('an edit-only batch (set_value) leaves the camera exactly where the user put it', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page, {
    reply: 'Sure, swapping in a bigger resistor.',
    actions: [{ tool: 'set_value', part: 'R1', resistance: 1000 }],
  });
  await acceptLedBuild(page);
  await settledCamera(page);
  const custom = await setCamera(page, CUSTOM);

  await askAndAccept(page, 'make the resistor 1k', '✓ Applied 1 change to your circuit.');
  expect(await page.evaluate(() => App.state.components.find(c => c.label === 'R1').values.resistance)).toBe(1000);
  const after = await settledCamera(page);
  expect(sameCamera(after, custom), `the set_value batch moved the camera: ${JSON.stringify(after)}, was ${JSON.stringify(custom)}`).toBe(true);
  expect(errors).toEqual([]);
});

test('a later batch that places a part still frames the circuit', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page, {
    reply: 'Added a second LED in parallel.',
    actions: [{ tool: 'place_led', holeA: 'd8', holeB: 'd6' }],
  });
  await acceptLedBuild(page);
  await settledCamera(page);
  const home = await homeCamera(page);
  await page.locator('#reset-cam-btn').click();
  await expectHome(page, 'after Reset View');

  await askAndAccept(page, 'add a second LED in parallel', '✓ Applied 1 change to your circuit.');
  expect(await page.evaluate(() => App.state.components.map(c => c.label))).toEqual(['BAT1', 'R1', 'LED1', 'LED2']);
  const after = await settledCamera(page);
  expect(sameCamera(after, home, 0.01), 'the place_led batch framed the circuit (moved off home)').toBe(false);
  await expectFramed(page, 3);
  expect(errors).toEqual([]);
});
