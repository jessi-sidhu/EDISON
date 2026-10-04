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
