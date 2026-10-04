// An AI build that wires a new multimeter by its probe names (MM1.red,
// MM1.black, as the meter's guide teaches): the preview draws both probe
// wires, and Accept lands them on the meter's pins. Before, the page knew
// pins only by number, so the probes never landed, and with the whole-or-
// nothing rule (#199) the whole build was taken back. /api/ask is stubbed;
// no AI is called.
const { test, expect } = require('@playwright/test');

const METER_BUILD = {
  reply: 'A battery and a 1 kΩ resistor, with the meter across the resistor.',
  actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'place_resistor', holeA: 'b10', holeB: 'b14', resistance: 1000 },
    { tool: 'place_multimeter', mode: 'V' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_63', color: 'red' },
    { tool: 'add_wire', from: 'BAT1.1', to: 'tn_63', color: 'black' },
    { tool: 'add_wire', from: 'tp_10', to: 'a10', color: 'red' },
    { tool: 'add_wire', from: 'a14', to: 'tn_14', color: 'black' },
    { tool: 'add_wire', from: 'MM1.red', to: 'c10' },
    { tool: 'add_wire', from: 'MM1.black', to: 'c14' },
  ],
};

test('an AI build wiring MM1.red and MM1.black: the preview draws both probe wires, Accept lands them on the meter\'s pins and it reads the resistor', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route('**/api/ask', route => route.fulfill({ json: METER_BUILD }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);

  await page.evaluate(() => { window.__before = new Set(App.scene.children); });
  await page.locator('#sparky-input').fill('Measure the resistor');
  await page.locator('#sparky-input').press('Enter');
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  const ghosts = await page.evaluate(() => App.scene.children.filter(o => !window.__before.has(o)).length);
  expect(ghosts, 'a ghost for the battery, the resistor and the meter, and one for each of the 6 wires').toBe(9);

  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 10 changes to your circuit.');
  const probes = await page.evaluate(() => {
    const mm = App.state.components.find(c => c.label === 'MM1');
    return App.state.wires.filter(w => w.startComp === mm || w.endComp === mm)
      .map(w => (w.startComp === mm ? w.startPinIdx : w.endPinIdx)).sort();
  });
  expect(probes, 'one wire on each of the meter\'s two pins').toEqual([0, 1]);
  expect(errors).toEqual([]);
});
