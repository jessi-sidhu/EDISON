// The LED's glow, issue #25: lighting and dimming moved from simulate.js
// (lightUpLED / dimLED, which found the dome as "the only transparent mesh")
// into parts/led.js view.update, called after every simulation. Checked here
// by what the page shows: after Run the LED's model glows (a brighter
// emissive mesh, or a light of its own), and after Stop it is back exactly
// as it was. /api/ask is stubbed; no AI is called. Guest only.
const { test, expect } = require('@playwright/test');

// The one-LED recipe build (test/fixtures/recipes.js ONE_LED), one lead per hole.
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

const simLines = page => page.locator('#sim-results .sim-line').allTextContents();

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// How much the placed LED glows: the brightest emissive mesh in its model,
// and how many point lights in the scene are shining.
function glow(page) {
  return page.evaluate(() => {
    const led = App.state.components.find(c => c.type === 'led');
    let emissive = 0;
    led.group.traverse(o => {
      const m = o.isMesh && o.material;
      if (m && m.emissive && m.emissive.getHex() !== 0) emissive = Math.max(emissive, m.emissiveIntensity);
    });
    let lights = 0;
    App.scene.traverse(o => { if (o.isPointLight && o.visible && o.intensity > 0) lights++; });
    return { emissive, lights };
  });
}

test('the LED glows after Run and dims after Stop, through parts/led.js view.update', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/api/ask', route => route.fulfill({ json: LED_BUILD }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);

  const hasUpdate = await page.evaluate(() => {
    const d = window.Parts && Parts.get('led');
    return !!(d && d.view && typeof d.view.update === 'function');
  });
  expect(hasUpdate, "window.Parts.get('led').view.update in the editor").toBe(true);

  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 8 changes to your circuit.');

  const idle = await glow(page);

  await page.locator('#sim-run-btn').click();
  expect((await simLines(page)).join(' | ')).toContain('LED ON  (14.9 mA)');
  const lit = await glow(page);
  expect(lit.emissive > idle.emissive || lit.lights > idle.lights,
    `the lit LED glows: idle ${JSON.stringify(idle)}, after Run ${JSON.stringify(lit)}`).toBe(true);

  await page.locator('#sim-stop-btn').click();
  expect(await glow(page), 'after Stop the LED is dark again, as before Run').toEqual(idle);
  expect(errors).toEqual([]);
});
