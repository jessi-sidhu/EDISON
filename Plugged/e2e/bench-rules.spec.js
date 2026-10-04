// The bench's rules in the browser, issue #197: one bench supply, one
// function generator and two multimeters at most, and every instrument the
// AI places on a spot of its own in front of the board, never stacked.
// /api/ask is stubbed with page.route; no AI is called. Guest only.
//
// The page the builder matches (chosen here, stated so it can be built to):
// - A part over the limit, picked from the sidebar and clicked beside the
//   board, isn't placed; the hint (#hint-text) says
//   "PS2 not placed: the bench has one bench supply; use PS1's two channels".
// - An AI build's off-board ghosts stand where Accept puts each part. A part
//   over the limit gets no ghost; on Accept it places nothing and the chat
//   notes "PS2 not placed: …" (".chat-msg.system"), counted as not applied.
// - The AI's battery stays on App.batterySpot(); every instrument goes in
//   front of the board, all of it on screen from the home view in Edison's
//   layout at 1440 × 900 (not under a panel), no two overlapping.
const { test, expect } = require('@playwright/test');
const G = require('../circuit3d/js/board-geometry.js');

const FRONT = G.BOARD_D / 2 + 2.5;   // App.offboardSpot's front zone (BATTERY_MARGIN 2.5)

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openEditor(page, reply = { reply: '', actions: [] }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/ask', route => route.fulfill({ json: reply }));
  await page.goto('/circuit3d/index.html?ui=edison');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

// Where a world point { x, z } on the board plane is on screen.
function screenAt(page, at) {
  return page.evaluate(({ x, z }) => {
    const p = new THREE.Vector3(x, 0, z);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, at);
}

async function clickAt(page, at) {
  const p = await screenAt(page, at);
  await page.mouse.move(p.x - 3, p.y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}

const onBoard = page => page.evaluate(() => App.state.components.map(c => ({ type: c.type, label: c.label })));

test('by hand: a second bench supply is refused, and the hint says why: "PS2 not placed: the bench has one bench supply; use PS1\'s two channels"', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);

  await page.locator('#sidebar .comp-item[data-type="bench_supply"]').click();
  await clickAt(page, { x: -4, z: FRONT + 2 });
  await expect.poll(() => onBoard(page), { message: 'the first supply is placed where it was clicked' })
    .toEqual([{ type: 'bench_supply', label: 'PS1' }]);

  await clickAt(page, { x: 5, z: FRONT + 2 });
  await expect(page.locator('#hint-text')).toHaveText("PS2 not placed: the bench has one bench supply; use PS1's two channels");
  await expect(page.locator('#hint-box')).toBeVisible();
  expect(await onBoard(page), 'the second supply is not placed').toEqual([{ type: 'bench_supply', label: 'PS1' }]);
  expect(errors).toEqual([]);
});

// Two supplies and three meters asked for: one supply and two meters placed.
const BENCH_BUILD = {
  reply: 'Here is your bench: a battery, a supply, a generator and the meters.',
  actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'place_bench_supply', voltage: 12 },
    { tool: 'place_bench_supply', voltage: 5 },
    { tool: 'place_function_generator' },
    { tool: 'place_multimeter' },
    { tool: 'place_multimeter' },
    { tool: 'place_multimeter' },
  ],
};

const round = p => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2) });
const byXz = (a, b) => a.x - b.x || a.z - b.z;

test('an AI build with two supplies and three meters: the preview shows one of each it can place, Accept places them there (PS2 and MM3 noted), each on its own spot in front of the board, all on screen', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openEditor(page, BENCH_BUILD);

  await page.evaluate(() => { window.__before = new Set(App.scene.children); });
  await page.locator('#sparky-input').fill('Set up my bench');
  await page.locator('#sparky-input').press('Enter');
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();

  const ghosts = await page.evaluate(() => App.scene.children.filter(o => !window.__before.has(o))
    .map(o => ({ x: o.position.x, z: o.position.z })));
  expect(ghosts, 'one ghost per part Accept will place: BAT1, PS1, FG1, MM1, MM2').toHaveLength(5);

  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 6 changes to your circuit. 2 could not be applied.');
  const notes = await page.locator('.chat-msg.system').allTextContents();
  expect(notes).toContain("PS2 not placed: the bench has one bench supply; use PS1's two channels");
  expect(notes).toContain('MM3 not placed: the bench has two multimeters; use MM1 or MM2');

  const placed = await page.evaluate(() => App.state.components.map(c => ({
    label: c.label, type: c.type, voltage: c.values.voltage, x: c.group.position.x, z: c.group.position.z,
  })));
  expect(placed.map(p => p.label).sort()).toEqual(['BAT1', 'FG1', 'MM1', 'MM2', 'PS1']);
  expect(placed.find(p => p.label === 'PS1').voltage, 'the first supply asked for is the one placed').toBe(12);
  expect(placed.map(round).sort(byXz), 'each part stands where its ghost stood').toEqual(ghosts.map(round).sort(byXz));

  const spot = await page.evaluate(() => App.batterySpot());
  const bat = placed.find(p => p.label === 'BAT1');
  expect(round(bat), 'the AI battery keeps App.batterySpot()').toEqual(round(spot));
  for (const p of placed.filter(q => q.type !== 'battery')) {
    expect(p.z, `${p.label} stands in front of the board`).toBeGreaterThanOrEqual(FRONT);
  }

  // No two overlap, and from the home view every instrument is on the canvas, under no panel.
  const seen = await page.evaluate(() => {
    App.resetCamera();
    App.camera.updateMatrixWorld();
    const r = App.renderer.domElement.getBoundingClientRect();
    const boxes = App.state.components.map(c => ({ c, box: new THREE.Box3().setFromObject(c.group) }));
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].box.intersectsBox(boxes[j].box)) overlaps.push(`${boxes[i].c.label}/${boxes[j].c.label}`);
    }
    const hidden = [];
    for (const { c, box } of boxes) {
      if (c.type === 'battery') continue;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z).project(App.camera);
        const sx = r.left + (p.x + 1) / 2 * r.width, sy = r.top + (1 - p.y) / 2 * r.height;
        if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1 || document.elementFromPoint(sx, sy) !== App.renderer.domElement) {
          hidden.push(`${c.label} (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
        }
      }
    }
    return { overlaps, hidden };
  });
  expect(seen.overlaps, 'no two parts overlap').toEqual([]);
  expect(seen.hidden, 'every instrument is on screen at home, under no panel').toEqual([]);
  expect(errors).toEqual([]);
});
