// Reloading the editor reopens the circuit this tab had open, and never files
// another "Untitled (N)" (issue #63). Guest only, so saved circuits live in
// localStorage under sparky_local_projects:guest. /api/ask is stubbed; no
// real AI is called.
const { test, expect } = require('@playwright/test');
const { TWO_LEDS, ONE_RESISTOR, handOver } = require('./fixtures/circuits');

const GUEST_KEY = 'sparky_local_projects:guest';   // SparkyStorage.projectsKey(null)

// Seeds the guest's saved circuits once per tab (a reload keeps what the
// editor saved), and optionally hands the editor a circuit the way the
// dashboard's openCircuit does.
async function setUp(page, { saved = [], open = null } = {}) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: 'ok', actions: [] } }));
  await page.addInitScript(({ key, list, pending }) => {
    if (sessionStorage.getItem('__e2e_seeded')) return;
    sessionStorage.setItem('__e2e_seeded', '1');
    localStorage.setItem(key, JSON.stringify(list));
    if (pending) sessionStorage.setItem('sparky_load_circuit', JSON.stringify(pending));
  }, { key: GUEST_KEY, list: saved, pending: open });
}

const editorReady = page => page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
const boardCounts = page => page.evaluate(() => [App.state.components.length, App.state.wires.length]);
const savedList   = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || '[]'), GUEST_KEY);
const nameField   = page => page.locator('#circuit-name-field');

async function openEditor(page) {
  await page.goto('/circuit3d/index.html');
  await editorReady(page);
}

async function reload(page) {
  await page.reload();
  await editorReady(page);
}

// A resistor on b2–b6, the way a click-to-place does.
const placeResistor = page => page.evaluate(() =>
  App.placePart('resistor', [{ col: 2, row: 'b' }, { col: 6, row: 'b' }]));

test('a multi-part circuit opened from the dashboard reopens after a reload, with no new record saved', async ({ page }) => {
  test.setTimeout(90_000);
  await setUp(page, { saved: [TWO_LEDS, ONE_RESISTOR], open: handOver(TWO_LEDS) });
  await openEditor(page);
  await expect(nameField(page)).toHaveText('Two LEDs');
  expect(await boardCounts(page)).toEqual([4, 4]);

  await reload(page);
  await expect(nameField(page)).toHaveText('Two LEDs');
  expect(await boardCounts(page)).toEqual([4, 4]);
  expect(await page.evaluate(() => App.state.circuitId)).toBe(TWO_LEDS.id);

  await page.waitForTimeout(1200);   // auto-save runs 800 ms after the last change
  expect((await savedList(page)).map(p => p.id).sort()).toEqual([ONE_RESISTOR.id, TWO_LEDS.id].sort());
});

test('reloading twice still reopens the same circuit', async ({ page }) => {
  test.setTimeout(90_000);
  await setUp(page, { saved: [TWO_LEDS], open: handOver(TWO_LEDS) });
  await openEditor(page);
  await reload(page);
  await reload(page);
  await expect(nameField(page)).toHaveText('Two LEDs');
  expect(await boardCounts(page)).toEqual([4, 4]);
  await page.waitForTimeout(1200);
  expect(await savedList(page)).toHaveLength(1);
});

test('a new circuit, once autosaved, reopens after a reload under the same name, as one record', async ({ page }) => {
  test.setTimeout(90_000);
  await setUp(page);
  await openEditor(page);
  const name = await nameField(page).textContent();

  await placeResistor(page);
  await expect.poll(async () => (await savedList(page)).map(p => [p.name, p.components.length])).toEqual([[name, 1]]);
  const id = await page.evaluate(() => App.state.circuitId);

  await reload(page);
  await expect(nameField(page)).toHaveText(name);
  expect(await boardCounts(page)).toEqual([1, 0]);
  expect(await page.evaluate(() => App.state.circuitId)).toBe(id);

  await page.waitForTimeout(1200);
  expect((await savedList(page)).map(p => [p.id, p.name])).toEqual([[id, name]]);
});

test('an empty new circuit is not saved by a reload (pins current behaviour)', async ({ page }) => {
  test.setTimeout(90_000);
  await setUp(page);
  await openEditor(page);
  await reload(page);
  await page.waitForTimeout(1200);
  expect(await savedList(page)).toEqual([]);
  expect(await boardCounts(page)).toEqual([0, 0]);
});

test('after Clear All, a reload does not bring the old circuit back (pins current behaviour)', async ({ page }) => {
  test.setTimeout(90_000);
  await setUp(page, { saved: [TWO_LEDS], open: handOver(TWO_LEDS) });
  await openEditor(page);
  expect(await boardCounts(page)).toEqual([4, 4]);

  page.on('dialog', d => d.accept());   // "Delete all 8 items on the board?"
  await page.locator('#clear-all-btn').click();
  expect(await boardCounts(page)).toEqual([0, 0]);
  await expect(nameField(page)).not.toHaveText('Two LEDs');

  await reload(page);
  expect(await boardCounts(page)).toEqual([0, 0]);
  await expect(nameField(page)).not.toHaveText('Two LEDs');
  await page.waitForTimeout(1200);
  const [kept] = await savedList(page);
  expect([kept.id, kept.components.length]).toEqual([TWO_LEDS.id, 4]);   // the old circuit is untouched
});

test('after Clear All, the new circuit built in its place is the one a reload reopens', async ({ page }) => {
  test.setTimeout(90_000);
  await setUp(page, { saved: [TWO_LEDS], open: handOver(TWO_LEDS) });
  await openEditor(page);

  page.on('dialog', d => d.accept());
  await page.locator('#clear-all-btn').click();
  const name = await nameField(page).textContent();
  await placeResistor(page);
  await expect.poll(async () => (await savedList(page)).length).toBe(2);
  const id = await page.evaluate(() => App.state.circuitId);
  expect(id).not.toBe(TWO_LEDS.id);

  await reload(page);
  await expect(nameField(page)).toHaveText(name);
  expect(await boardCounts(page)).toEqual([1, 0]);
  expect(await page.evaluate(() => App.state.circuitId)).toBe(id);
  await page.waitForTimeout(1200);
  expect(await savedList(page)).toHaveLength(2);
});
