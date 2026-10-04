// Accepting AI changes keeps saving to the circuit you're working on, and an
// undo is autosaved like any other edit (issue #60). Guest only, so saved
// circuits live in localStorage. /api/ask is stubbed in the browser,
// answering by the message; no real AI is called.
const { test, expect } = require('@playwright/test');

// A full LED build, starting with delete_all as the AI's builds do.
// resistance: R1's value, so each rebuild is told apart.
const ledBuild = resistance => ({
  reply: 'Built a single LED with a current-limiting resistor.',
  actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_63', color: 'red' },
    { tool: 'add_wire', from: 'BAT1.1', to: 'tn_63', color: 'black' },
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6', resistance },
    { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
    { tool: 'add_wire', from: 'tp_3', to: 'a2', color: 'red' },
    { tool: 'add_wire', from: 'a8', to: 'tn_8', color: 'black' },
  ],
});

// The stubbed AI: the 470 Ω build for the quick button, a 1 kΩ rebuild for
// "rebuild", and a set_value to 2.2 kΩ for anything else.
async function openWithAI(page) {
  await page.route('**/api/ask', route => {
    const { message } = route.request().postDataJSON();
    if (/Build a complete working LED circuit/.test(message)) return route.fulfill({ json: ledBuild(470) });
    if (/rebuild/.test(message)) return route.fulfill({ json: ledBuild(1000) });
    return route.fulfill({ json: { reply: 'Swapping the resistor.', actions: [{ tool: 'set_value', part: 'R1', resistance: 2200 }] } });
  });
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

async function accept(page, n) {
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText(`✓ Applied ${n} change${n === 1 ? '' : 's'} to your circuit.`);
}

async function ask(page, text) {
  await page.locator('#sparky-input').fill(text);
  await page.locator('#sparky-input').press('Enter');
}

// Every saved circuit, as the dashboard lists them.
const projects = page => page.evaluate(() => {
  const key = SparkyStorage.projectsKey(SparkyStorage.currentUid(localStorage));
  return JSON.parse(localStorage.getItem(key) || '[]');
});

// R1's resistance in each saved project, once autosave has caught up.
const savedResistances = page => projects(page).then(list => list.map(p => {
  const r1 = p.components.find(c => c.label === 'R1');
  return r1 ? r1.values.resistance : null;
}));

test('accepting one AI change and then another keeps one saved circuit, holding the latest build', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  await openWithAI(page);
  const name = await page.locator('#circuit-name-field').textContent();

  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await accept(page, 8);
  await expect.poll(() => savedResistances(page)).toEqual([470]);

  await ask(page, 'rebuild it with a 1k resistor');   // delete_all on a board that has parts
  await accept(page, 8);
  await expect.poll(() => savedResistances(page)).toEqual([1000]);

  await ask(page, 'make the resistor 2.2k');
  await accept(page, 1);
  await expect.poll(() => savedResistances(page)).toEqual([2200]);

  const list = await projects(page);
  expect(list).toHaveLength(1);
  expect(list[0].id).toBe(await page.evaluate(() => App.state.circuitId));
  expect(list[0].name).toBe(name);
  expect(list[0].components.map(c => c.label)).toEqual(['BAT1', 'R1', 'LED1']);
  await expect(page.locator('#circuit-name-field')).toHaveText(name);
});

test('undo is autosaved: undoing an AI build back to an empty board, then reopening the circuit, opens it empty', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  await openWithAI(page);

  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await accept(page, 8);
  await expect.poll(async () => (await projects(page)).map(p => p.components.length)).toEqual([3]);

  await page.locator('#canvas').click({ position: { x: 5, y: 5 } });   // focus the board, not the chat box
  await page.keyboard.press('ControlOrMeta+z');
  expect(await page.evaluate(() => App.state.components.length)).toBe(0);
  await expect.poll(async () => (await projects(page)).map(p => [p.components.length, p.wires.length])).toEqual([[0, 0]]);

  // Reopen it the way the dashboard does, after a reload.
  const [saved] = await projects(page);
  await page.evaluate(p => sessionStorage.setItem('sparky_load_circuit', JSON.stringify(p)), saved);
  await page.reload();
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  expect(await page.evaluate(() => [App.state.components.length, App.state.wires.length, App.state.circuitId])).toEqual([0, 0, saved.id]);
});

test('undoing an AI edit on a built board saves the board as it was before the edit', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  await openWithAI(page);

  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await accept(page, 8);
  await ask(page, 'rebuild it with a 1k resistor');
  await accept(page, 8);
  await expect.poll(() => savedResistances(page)).toEqual([1000]);

  await page.locator('#canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => savedResistances(page)).toEqual([470]);
});
