// The AI places parts with real values (1 kΩ, a green LED, 5 V), issue #9.
// /api/ask is stubbed in the browser; no real AI is called. Guest only.
const { test, expect } = require('@playwright/test');

const simLines = page => page.locator('#sim-results .sim-line').allTextContents();

// Resistor band and LED dome colours, as components.js draws them.
const BROWN = 0x7b3f00, BLACK = 0x1a1a1a, RED = 0xd62828, GOLD = 0xd4af37;
const YELLOW = 0xfcbf49, VIOLET = 0x7c3aed;
const LED_GREEN = 0x35d94a, LED_RED = 0xff2222;

// The recorded single-LED build, with optional values on its parts. One lead
// per hole (test/fixtures/recipes.js ONE_LED): the old stacked build put the
// LED anode on R1's a6, which the registry LED refuses since #25.
const ledBuild = (vals = {}) => ({
  reply: 'Built a single LED with a current-limiting resistor.',
  actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery', ...('voltage' in vals ? { voltage: vals.voltage } : {}) },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_63', color: 'red' },
    { tool: 'add_wire', from: 'BAT1.1', to: 'tn_63', color: 'black' },
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6', ...('resistance' in vals ? { resistance: vals.resistance } : {}) },
    { tool: 'place_led', holeA: 'c8', holeB: 'c6', ...('color' in vals ? { color: vals.color } : {}) },
    { tool: 'add_wire', from: 'tp_3', to: 'a2', color: 'red' },
    { tool: 'add_wire', from: 'a8', to: 'tn_8', color: 'black' },
  ],
});

async function askForBuild(page, reply) {
  await page.route('**/api/ask', route => route.fulfill({ json: reply }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  await page.evaluate(() => { window.__before = App.scene.children.length; });
  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
}

// Colours of the preview ghosts, read from their materials. The resistor
// ghost is the one with the tan body (0xd4a96a); its bands are every other
// colour but the grey leads. The LED ghost is the one with the LED's dome (userData.ledDome).
function ghostColours(page) {
  return page.evaluate(() => {
    const ghosts = App.scene.children.slice(window.__before);
    const colours = g => {
      const out = [];
      g.traverse(o => { if (o.isMesh && o.material && o.material.color) out.push(o.material.color.getHex()); });
      return out;
    };
    const all = ghosts.map(colours);
    const resistor = all.find(c => c.includes(0xd4a96a));
    const hasDome = g => { let d = false; g.traverse(o => { if (o.userData.ledDome) d = true; }); return d; };
    const ledGhost = ghosts.find(hasDome);
    const led = ledGhost ? colours(ledGhost) : undefined;
    return {
      bands: resistor ? resistor.filter(h => h !== 0xd4a96a && h !== 0xcccccc) : null,
      led,
    };
  });
}

async function acceptAndSimulate(page) {
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 8 changes to your circuit.');
  await page.locator('#sim-run-btn').click();
  return (await simLines(page)).join(' | ');
}

const placedValues = page => page.evaluate(() => {
  const of = t => { const c = App.state.components.find(x => x.type === t); return c && c.values; };
  return { resistor: of('resistor'), led: of('led'), battery: of('battery') };
});

test('the preview of a 1k resistor shows brown-black-red bands', async ({ page }) => {
  await askForBuild(page, ledBuild({ resistance: 1000, color: 'green' }));
  const { bands } = await ghostColours(page);
  expect(bands).toEqual([BROWN, BLACK, RED, GOLD]);
});

test('the preview of a green LED has a green dome', async ({ page }) => {
  await askForBuild(page, ledBuild({ resistance: 1000, color: 'green' }));
  const { led } = await ghostColours(page);
  expect(led).toContain(LED_GREEN);
  expect(led).not.toContain(LED_RED);
});

test('a 1k resistor and a green LED are placed with those values, and the current matches 1 kΩ', async ({ page }) => {
  await askForBuild(page, ledBuild({ resistance: 1000, color: 'green' }));
  const sim = await acceptAndSimulate(page);
  const v = await placedValues(page);
  expect(v.resistor.resistance).toBe(1000);
  expect(v.led.color).toBe('green');
  expect(sim).toContain('LED ON  (6.8 mA)');   // (9 V - 2.2 V) / 1000 Ω
});

test('a 5 V battery is placed at 5 V and the simulation runs on it', async ({ page }) => {
  await askForBuild(page, ledBuild({ resistance: 1000, color: 'green', voltage: 5 }));
  const sim = await acceptAndSimulate(page);
  expect((await placedValues(page)).battery.voltage).toBe(5);
  expect(sim).toContain('Battery 1: 5V');
  expect(sim).toContain('LED ON  (2.8 mA)');   // (5 V - 2.2 V) / 1000 Ω
});

// Regression guard: with no values, the build is the same as before.
test('a build without values keeps the defaults: 470 Ω bands, a red LED and 14.9 mA', async ({ page }) => {
  await askForBuild(page, ledBuild());
  const { bands, led } = await ghostColours(page);
  expect(bands).toEqual([YELLOW, VIOLET, BROWN, GOLD]);
  expect(led).toContain(LED_RED);
  const sim = await acceptAndSimulate(page);
  const v = await placedValues(page);
  expect(v.resistor.resistance).toBe(470);
  expect(v.led.color).toBe('red');
  expect(v.battery.voltage).toBe(9);
  expect(sim).toContain('LED ON  (14.9 mA)');
});
