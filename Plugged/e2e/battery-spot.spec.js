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

// Today's 50-column board is 21.4 wide: the battery sits 2.5 past its right
// end (x 13.2), right behind the top rails (midpoint of tp -3.35 and tn -2.95).
const SPOT = { x: 21.4 / 2 + 2.5, z: -3.15 };

test('the AI battery preview and the accepted battery land on the same spot, behind the top rails', async ({ page }) => {
  await openEditor(page, batteryBuild);
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

test('App.resetCamera puts the camera back on App.CAMERA.home, (0, 22, 30) looking at the origin', async ({ page }) => {
  await openEditor(page);
  const cam = await page.evaluate(() => {
    const before = { home: App.CAMERA.home, thumb: App.CAMERA.thumb };
    App.camera.position.set(5, 5, 5);
    App.controls.target.set(1, 1, 1);
    App.controls.update();
    App.resetCamera();
    const p = App.camera.position, t = App.controls.target;
    return { ...before, pos: [p.x, p.y, p.z], target: [t.x, t.y, t.z] };
  });
  expect(cam.home).toEqual({ pos: [0, 22, 30], target: [0, 0, 0] });
  expect(cam.thumb).toEqual({ pos: [20, 22, 20], target: [0, 0, 0] });
  cam.pos.forEach((v, i) => expect(v).toBeCloseTo([0, 22, 30][i], 3));
  cam.target.forEach((v, i) => expect(v).toBeCloseTo(0, 3));
  await expect(page.locator('#reset-cam-btn')).toBeHidden();
});
