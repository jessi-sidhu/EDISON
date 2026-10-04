// The AI reads and wires parts by their stable labels (R1, BAT1…), issue #8.
// /api/ask is stubbed in the browser; no real AI is called. Guest only.
const { test, expect } = require('@playwright/test');

const simLines = page => page.locator('#sim-results .sim-line').allTextContents();

async function openEditor(page, reply = { reply: '', actions: [] }) {
  await page.route('**/api/ask', route => route.fulfill({ json: reply }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

// A battery, a resistor on a2-a6, and a red wire from the battery's + pin to
// tp_2, made with the same calls Chat.acceptBuild's board makes.
async function placeBatteryAndResistor(page) {
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placeBattery(13, 0);
    App.placeResistor(hole('a2'), hole('a6'));
    const bat = App.state.components.find(c => c.type === 'battery');
    const pm = bat.pinMeshes[0];
    const h = hole('tp_2');
    App.state.wireStart = { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
    App.finishWire({ world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null });
  });
}

test('the board the AI reads names parts by label and battery pins as BAT1.0 / BAT1.1', async ({ page }) => {
  await openEditor(page);
  await placeBatteryAndResistor(page);
  const md = await page.evaluate(() => App.exportMarkdown());
  expect(md).toContain('| BAT1 |');
  expect(md).toContain('| R1 |');
  expect(md).toContain('BAT1.0');
  expect(md).toContain('BAT1.1');
  expect(md).toContain('| BAT1.0 | tp_2 |');
  expect(md).not.toContain('_pin');
});

test('exportState names parts by label and wires by label form', async ({ page }) => {
  await openEditor(page);
  await placeBatteryAndResistor(page);
  const s = await page.evaluate(() => App.exportState());
  expect(s.components.map(c => c.id)).toEqual(['BAT1', 'R1']);
  expect(s.wires).toEqual([{ from: 'BAT1.0', to: 'tp_2' }]);
});

// The recorded single-LED build, with the battery wired as ref(pin).
const ledBuild = ref => ({
  reply: 'Built a single LED with a current-limiting resistor.',
  actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'add_wire', from: ref(0), to: 'tp_2', color: 'red' },
    { tool: 'add_wire', from: ref(1), to: 'tn_8', color: 'black' },
    { tool: 'place_resistor', holeA: 'a2', holeB: 'a6' },
    { tool: 'place_led', holeA: 'a8', holeB: 'a6' },
    { tool: 'add_wire', from: 'tp_2', to: 'a2', color: 'red' },
    { tool: 'add_wire', from: 'a8', to: 'tn_8', color: 'black' },
  ],
});

// Ask, wait for the preview, and return how many ghost meshes it added:
// one per part and one per wire it could draw.
async function previewGhosts(page) {
  const before = await page.evaluate(() => App.scene.children.length);
  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  return (await page.evaluate(() => App.scene.children.length)) - before;
}

test('a build wired from BAT1.0 previews every wire, applies on Accept and lights the LED', async ({ page }) => {
  await openEditor(page, ledBuild(k => `BAT1.${k}`));
  expect(await previewGhosts(page)).toBe(7);   // battery, resistor, LED, 4 wires

  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 8 changes to your circuit.');
  expect(await page.evaluate(() => App.state.wires.length)).toBe(4);

  await page.locator('#sim-run-btn').click();
  expect((await simLines(page)).join(' | ')).toContain('LED ON  (14.9 mA)');
});

test('with a BAT1 already on the board, delete_all then place_battery previews the wire to the new BAT1', async ({ page }) => {
  await openEditor(page, ledBuild(k => `BAT1.${k}`));
  await page.evaluate(() => App.placeBattery(-20, 0));   // the old BAT1, gone after delete_all
  expect(await previewGhosts(page)).toBe(7);

  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 8 changes to your circuit.');
  await page.locator('#sim-run-btn').click();
  expect((await simLines(page)).join(' | ')).toContain('LED ON  (14.9 mA)');
});

test('without delete_all, a battery added next to BAT1 is BAT2, and a wire to BAT2.0 previews and applies', async ({ page }) => {
  await openEditor(page, {
    reply: 'Added a second battery.',
    actions: [
      { tool: 'place_battery' },
      { tool: 'add_wire', from: 'BAT2.0', to: 'tp_20', color: 'red' },
    ],
  });
  await page.evaluate(() => App.placeBattery(-20, 0));   // BAT1
  expect(await previewGhosts(page)).toBe(2);   // battery, wire

  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 2 changes to your circuit.');
  const bat2Wired = await page.evaluate(() => {
    const bat2 = App.state.components.find(c => c.label === 'BAT2');
    return App.state.wires.some(w => w.startComp === bat2 || w.endComp === bat2);
  });
  expect(bat2Wired).toBe(true);
});

test('a build wired from battery_0_pin0 still previews every wire', async ({ page }) => {
  await openEditor(page, ledBuild(k => `battery_0_pin${k}`));
  expect(await previewGhosts(page)).toBe(7);
});
