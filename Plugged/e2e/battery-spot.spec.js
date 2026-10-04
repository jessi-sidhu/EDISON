// One battery spot and one camera view, issue #6.
// /api/ask is stubbed in the browser; no real AI is called. Guest only.
const { test, expect } = require('@playwright/test');

// A build that only places a battery, so the one preview ghost is the battery's.
const batteryBuild = {
  reply: 'Placed a battery.',
  actions: [{ tool: 'delete_all' }, { tool: 'place_battery' }],
};

async function openEditor(page, reply = { reply: '', actions: [] }) {
  await page.route('**/api/ask', route => route.fulfill({ json: reply }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

// The battery sits 2.5 past the board's right end, right behind the top rails
// (midpoint of tp and tn). The board's size comes from board-geometry.js
// (issue #22): 63 columns, 26.6 wide, so x 15.8, z -3.15.
const GEOMETRY = require('../circuit3d/js/board-geometry.js');
const SPOT = { x: GEOMETRY.BOARD_W / 2 + 2.5, z: (GEOMETRY.ROW_Z.tp + GEOMETRY.ROW_Z.tn) / 2 };

test('the AI battery preview and the accepted battery land on the same spot, behind the top rails', async ({ page }) => {
  await openEditor(page, batteryBuild);
  expect(SPOT.x).toBeCloseTo(15.8, 5);
  expect(await page.evaluate(() => App.batterySpot())).toEqual({ x: expect.closeTo(SPOT.x, 2), z: expect.closeTo(SPOT.z, 2) });

  await page.evaluate(() => { window.__before = App.scene.children.length; });
  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();

  const ghost = await page.evaluate(() => {
    const g = App.scene.children.slice(window.__before);
    return g.map(o => ({ x: o.position.x, z: o.position.z }));
  });
  expect(ghost).toHaveLength(1);
  expect(ghost[0].x).toBeCloseTo(SPOT.x, 2);
  expect(ghost[0].z).toBeCloseTo(SPOT.z, 2);

  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 2 changes to your circuit.');
  const placed = await page.evaluate(() => {
    const bat = App.state.components.find(c => c.type === 'battery');
    return { x: bat.group.position.x, z: bat.group.position.z };
  });
  expect(placed.x).toBeCloseTo(SPOT.x, 2);
  expect(placed.z).toBeCloseTo(SPOT.z, 2);
});

// The numbers in App.CAMERA may change with the board's width (issue #22);
// board-63.spec.js checks the views still show the whole board.
test('App.resetCamera puts the camera back on App.CAMERA.home', async ({ page }) => {
  await openEditor(page);
  const cam = await page.evaluate(() => {
    const home = App.CAMERA.home;
    App.camera.position.set(5, 5, 5);
    App.controls.target.set(1, 1, 1);
    App.controls.update();
    App.resetCamera();
    const p = App.camera.position, t = App.controls.target;
    return { home, pos: [p.x, p.y, p.z], target: [t.x, t.y, t.z] };
  });
  cam.pos.forEach((v, i) => expect(v).toBeCloseTo(cam.home.pos[i], 3));
  cam.target.forEach((v, i) => expect(v).toBeCloseTo(cam.home.target[i], 3));
  await expect(page.locator('#reset-cam-btn')).toBeHidden();
});

// Instruments picked from the sidebar (App.offboardSpot): in front of or
// behind the board they go where you point, BATTERY_MARGIN clear of its long
// edge; a point just past that edge moves out to the clear line; level with
// the board they go past its ends, as before; a spot in front survives a
// reload. The preview stands where the click then puts the part. The bench
// has two multimeters (#197), so the edge one is deleted before the third
// spot is tried.
const GUEST_KEY = 'sparky_local_projects:guest';   // SparkyStorage.projectsKey(null)

function screenAt(page, at) {
  return page.evaluate(({ x, z }) => {
    const p = new THREE.Vector3(x, 0, z);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, at);
}

// Picks the multimeter, hovers (x, z) and clicks there: the preview's spot
// while hovering and the placed meter's, both { x, z }.
async function placeMeterAt(page, at) {
  await page.locator('#sidebar .comp-item[data-type="multimeter"]').click();
  await page.evaluate(() => { window.__kids = new Set(App.scene.children); });
  const p = await screenAt(page, at);
  await page.mouse.move(p.x - 3, p.y);
  await page.mouse.move(p.x, p.y);
  const ghost = await page.evaluate(() => {
    const g = App.scene.children.find(o => !window.__kids.has(o) && o.visible && o.children.length > 5);
    return g ? { x: g.position.x, z: g.position.z } : null;
  });
  const n = await page.evaluate(() => App.state.components.length);
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(k => App.state.components.length === k + 1, n);
  const placed = await page.evaluate(() => {
    const m = App.state.components[App.state.components.length - 1];
    return { x: m.group.position.x, z: m.group.position.z };
  });
  await page.keyboard.press('Escape');
  return { ghost, placed };
}

test('a multimeter goes where you point in front of the board, just past its long edge out to the clear line, level with it past the end; the front spot survives a reload', async ({ page }) => {
  test.setTimeout(90_000);
  await openEditor(page);
  const D = GEOMETRY.BOARD_D / 2, W = GEOMETRY.BOARD_W / 2, M = 2.5;
  expect(await page.evaluate(() => App.BATTERY_MARGIN)).toBe(M);

  const front = await placeMeterAt(page, { x: 4, z: D + 4 });
  expect(front.ghost, 'a preview while hovering in front of the board').not.toBeNull();
  for (const s of [front.ghost, front.placed]) {
    expect(s.x, 'in front of the board: x as pointed, inside the board\'s length').toBeCloseTo(4, 1);
    expect(s.z, 'in front of the board: z as pointed').toBeCloseTo(D + 4, 1);
  }

  const edge = await placeMeterAt(page, { x: 0, z: D + 1 });
  for (const s of [edge.ghost, edge.placed]) {
    expect(s.x, 'just past the long edge: x as pointed').toBeCloseTo(0, 1);
    expect(s.z, 'just past the long edge: out to the clear line').toBeCloseTo(D + M, 2);
  }

  await page.evaluate(() => App.deletePart(App.state.components[1]));   // a third meter would be refused (#197)
  const level = await placeMeterAt(page, { x: W - 1, z: 0 });
  for (const s of [level.ghost, level.placed]) {
    expect(s.x, 'level with the board: past its end, as before').toBeCloseTo(W + M, 2);
    expect(s.z).toBeCloseTo(0, 1);
  }

  // Autosave, then reload: the meters come back where they were.
  await expect.poll(() => page.evaluate(k => {
    const list = JSON.parse(localStorage.getItem(k) || '[]');
    const rec = list.find(p => p.components && p.components.filter(c => c.type === 'multimeter').length === 2
      && p.components.some(c => c.type === 'multimeter' && c.position && Math.abs(c.position.z) < 0.5));
    return rec ? rec.components.filter(c => c.type === 'multimeter').map(c => c.position) : null;
  }, GUEST_KEY), { timeout: 10_000 }).not.toBeNull();
  await page.reload();
  await page.waitForFunction(() => window.App && App.state && App.state.components.filter(c => c.type === 'multimeter').length === 2);
  const back = await page.evaluate(() => App.state.components.filter(c => c.type === 'multimeter')
    .map(c => ({ x: c.group.position.x, z: c.group.position.z })));
  [front.placed, level.placed].forEach((s, i) => {
    expect(back[i].x, `meter ${i + 1} x after a reload`).toBeCloseTo(s.x, 2);
    expect(back[i].z, `meter ${i + 1} z after a reload`).toBeCloseTo(s.z, 2);
  });
});
