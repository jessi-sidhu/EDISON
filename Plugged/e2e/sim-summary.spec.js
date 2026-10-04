// The board the AI reads carries live simulation results, issue #5.
// Builds circuits through window.App (the calls the mouse handlers and
// Chat.acceptBuild make). /api/ask is stubbed; no real AI is called. Guest only.
const { test, expect } = require('@playwright/test');

// Opens the editor with /api/ask stubbed. Every request body is pushed onto
// the returned array so a test can read the markdown the AI would get.
async function openEditor(page) {
  const asked = [];
  await page.route('**/api/ask', route => {
    asked.push(route.request().postDataJSON());
    return route.fulfill({ json: { reply: 'ok', actions: [] } });
  });
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  return asked;
}

// 9 V - 470R - red LED: BAT1.0 -> tp_2 -> a2, R1 a2-a6, LED1 anode a6,
// cathode a8 -> tn_8 <- BAT1.1. I = (9 - 2) / 470 = 14.9 mA.
// With { button: true } the LED's return goes through SW1 on a8-a10 instead.
async function buildSeries(page, opts = {}) {
  await page.evaluate(({ button }) => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    const end  = s => { const h = hole(s); return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null }; };
    const wireHoles = (a, b) => { App.state.wireStart = end(a); App.finishWire(end(b)); };
    const wireBat = (k, b) => {
      const bat = App.state.components.find(c => c.type === 'battery');
      const pm  = bat.pinMeshes[k];
      App.state.wireStart = { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
      App.finishWire(end(b));
    };

    App.placePart('battery', { x: 13, z: 0 });
    wireBat(0, 'tp_2');
    wireBat(1, 'tn_8');
    App.placePart('resistor', [hole('a2'), hole('a6')]);
    App.placePart('led', [hole('a8'), hole('a6')]);        // cathode a8, anode a6
    wireHoles('tp_2', 'a2');
    if (button) {
      App.placePart('button', [hole('e8'), hole('e10')]);
      wireHoles('a10', 'tn_8');
    } else {
      wireHoles('a8', 'tn_8');
    }
  }, { button: !!opts.button });
}

const simulationSection = md => {
  const at = md.indexOf('## Simulation');
  return at < 0 ? '' : md.slice(at);
};

test('exportMarkdown ends with a ## Simulation section: LED1 ON at 14.9 mA, no _pin names', async ({ page }) => {
  await openEditor(page);
  await buildSeries(page);
  const md = await page.evaluate(() => App.exportMarkdown());

  expect(md).toContain('## Simulation');
  const sim = simulationSection(md);
  expect(sim).toMatch(/\bLED1\b.*\b14\.9 mA\b/);
  expect(sim).toMatch(/\bLED1\b.*(\bON\b|\blit\b)/);
  expect(sim).toMatch(/LED1 pin 1 \(a6\b[^)]*\): 2\.0\d V/);   // the anode
  expect(sim).toMatch(/\bBAT1\.0\b.*\b9\.00 V/);
  expect(md).not.toContain('_pin');
});

test('the markdown sent to /api/ask carries the simulation, without running the simulator', async ({ page }) => {
  const asked = await openEditor(page);
  await buildSeries(page);
  expect(await page.evaluate(() => !!App.simRunning)).toBe(false);

  await page.getByRole('button', { name: /Analyze my circuit/ }).click();
  await expect.poll(() => asked.length).toBeGreaterThan(0);

  const sim = simulationSection(asked[0].markdown || '');
  expect(sim).toContain('## Simulation');
  expect(sim).toMatch(/\bLED1\b.*\b14\.9 mA\b/);
});

test('with no battery the ## Simulation section says "No battery on the board."', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('resistor', [hole('a2'), hole('a6')]);
  });
  const sim = simulationSection(await page.evaluate(() => App.exportMarkdown()));
  expect(sim).toContain('## Simulation');
  expect(sim).toContain('No battery on the board.');
});

test('the summary is computed fresh: pressing SW1 turns LED1 from dark to 14.9 mA', async ({ page }) => {
  await openEditor(page);
  await buildSeries(page, { button: true });

  const released = simulationSection(await page.evaluate(() => App.exportMarkdown()));
  expect(released).toContain('## Simulation');
  expect(released).not.toMatch(/\bLED1\b.*\b14\.9 mA\b/);

  await page.evaluate(() => App.toggleButton(App.state.components.find(c => c.type === 'button')));
  const pressed = simulationSection(await page.evaluate(() => App.exportMarkdown()));
  expect(pressed).toMatch(/\bLED1\b.*\b14\.9 mA\b/);
});
