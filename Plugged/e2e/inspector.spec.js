// The value inspector and the generated parts sidebar, issue #29. Selecting a
// part shows its label and one row per value/control, read from its
// definition. A number is checked with Parts.checkValue (a refusal shows its
// reason inline and changes nothing); an accepted edit is one undo step and
// re-simulates while the simulation runs. A momentary control (the button's
// `pressed`) works like the click gesture: only while simulating, no undo
// step, reset on Stop. The sidebar is built from Parts.all(), grouped by
// category, with a search box. /api/ask is stubbed in the browser; no AI is
// called. Guest only; Google sign-in stays a manual QA case.
//
// The page the builder matches (chosen here):
//   Sidebar
//   - #part-search                 the search box, inside #sidebar.
//   - #sidebar .comp-group[data-category="Passives"]
//                                  one per shown category, in contract order,
//                                  holding a .comp-group-label with the
//                                  category's name and its parts' items.
//   - .comp-item[data-type="led"]  a generated item (as today), with the icon
//                                  (<svg>) in .comp-item-icon, the name in
//                                  .comp-item-name and the sub in .comp-item-sub.
//                                  Filtered-out items and empty groups are
//                                  hidden (or not rendered). The Wire tool
//                                  stays a hand-written .comp-item[data-type="wire"].
//   Inspector
//   - #inspector                   the panel: visible while a part is
//                                  selected, hidden otherwise.
//   - #inspector-label             the selected part's label ("R1").
//   - #inspector .inspector-row[data-key="resistance"]
//                                  one row per value/control (Inspector.rows).
//       number: a text/number <input> showing the value ("470") and the unit
//               ("Ω") in the row; Enter commits. .inspector-hint holds the kit
//               hint ("closest kit value: 1.2 kΩ"); .inspector-error holds a
//               refusal's reason. Neither is visible when it has no text.
//       choice: a <select>, one <option> per choice (value = the choice's name).
//       toggle / momentary: an <input type="checkbox">. A momentary one is
//               disabled unless the simulation runs.
//   - After an edit the inspector stays on the part; after undo/redo it shows
//     the part again with its restored value (or hides if the part is gone).
const { test, expect } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const simLines = page => page.locator('#sim-results .sim-line').allTextContents();
const simText = async page => (await simLines(page)).join(' | ');
const historySize = page => page.evaluate(() => App.history.size());
const selectedLabel = page => page.evaluate(() => (App.state.selected ? App.state.selected.item.label : null));
const partOf = (page, label) => page.evaluate(l => {
  const c = App.state.components.find(x => x.label === l);
  return c ? { values: c.values, controls: c.controls || null } : null;
}, label);

const inspector = page => page.locator('#inspector');
const row = (page, key) => page.locator(`#inspector .inspector-row[data-key="${key}"]`);
const numberInput = (page, key) => row(page, key).locator('input:not([type="checkbox"]):not([type="range"])');

async function openEditor(page, ask = { reply: '', actions: [] }) {
  await page.route('**/api/ask', route => route.fulfill({ json: ask }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

// Where a board hole ("c30") is on screen, in page pixels.
function holePoint(page, where) {
  return page.evaluate(where => {
    const { col, row } = App.parseHole(where);
    const h = App.state.breadboard.getHole(col, row);
    const p = h.world ? h.world.clone() : new THREE.Vector3(h.x, 0, h.z);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, where);
}

async function clickHole(page, where) {
  const at = await holePoint(page, where);
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
}

// Clicks the top centre of a part's model, the way a person selects it.
async function clickPart(page, label) {
  const at = await page.evaluate(l => {
    const c = App.state.components.find(x => x.label === l);
    const box = new THREE.Box3().setFromObject(c.group);
    const p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, label);
  await page.mouse.click(at.x, at.y);
}

// Ctrl+Z from the page, not from inside an inspector input (where it would
// be the browser's text undo): click the inspector's label first.
async function undo(page) {
  if (await page.locator('#inspector-label').isVisible()) await page.locator('#inspector-label').click();
  else await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('ControlOrMeta+z');
}

async function setNumber(page, key, text) {
  const input = numberInput(page, key);
  await input.fill(text);
  await input.press('Enter');
}

// R1's band colours in drawing order (not the tan body or grey leads), as in
// e2e/ai-edit.spec.js.
const BODY = 0xd4a96a, LEAD = 0xc0c0c0;
const BLACK = 0x1a1a1a, BROWN = 0x7b3f00, RED = 0xd62828, YELLOW = 0xfcbf49, VIOLET = 0x7c3aed, GOLD = 0xd4af37;
const r1Bands = page => page.evaluate(([body, lead]) => {
  const r1 = App.state.components.find(c => c.label === 'R1');
  const out = [];
  r1.group.traverse(o => {
    const hex = o.isMesh && o.material && o.material.color && o.material.color.getHex();
    if (hex !== undefined && hex !== false && hex !== body && hex !== lead) out.push(hex);
  });
  return out;
}, [BODY, LEAD]);

// The recorded single-LED build (test/fixtures/recipes.js ONE_LED): BAT1,
// R1 b2–b6, LED1 cathode c8 / anode c6, tp_3 → a2, a8 → tn_8. 14.9 mA.
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

async function openWithLedBuild(page) {
  await openEditor(page, LED_BUILD);
  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 8 changes to your circuit.');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Escape');   // select mode
}

// ── Values ─────────────────────────────────────────────────────────────────

test('select R1: 470 Ω; set 1234 → hint 1.2 kΩ and new bands; Ctrl+Z → 470; −5 → inline error, nothing changes', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  const errors = watchErrors(page);
  await openEditor(page);
  await expect(inspector(page), 'nothing selected: no inspector').toBeHidden();

  await page.locator('#sidebar .comp-item[data-type="resistor"]').click();
  await clickHole(page, 'c30');                          // R1 at c30–c34
  expect(await page.evaluate(() => App.state.components.map(c => c.label))).toEqual(['R1']);
  await page.keyboard.press('Escape');                   // select mode
  await clickPart(page, 'R1');
  expect(await selectedLabel(page), 'the click selected R1').toBe('R1');

  await expect(inspector(page)).toBeVisible();
  await expect(page.locator('#inspector-label')).toHaveText('R1');
  await expect(numberInput(page, 'resistance')).toHaveValue('470');
  await expect(row(page, 'resistance')).toContainText('Ω');
  await expect(row(page, 'resistance').locator('.inspector-hint'), '470 is a kit value: no hint').toBeHidden();
  expect(await r1Bands(page)).toEqual([YELLOW, VIOLET, BROWN, GOLD]);

  // 1234: accepted, one undo step, the kit hint, the bands follow.
  const steps = await historySize(page);
  await setNumber(page, 'resistance', '1234');
  await expect.poll(async () => (await partOf(page, 'R1')).values.resistance).toBe(1234);
  expect(await historySize(page), 'one edit = one undo step').toBe(steps + 1);
  await expect(inspector(page), 'the inspector stays on R1 after the edit').toBeVisible();
  await expect(page.locator('#inspector-label')).toHaveText('R1');
  await expect(row(page, 'resistance').locator('.inspector-hint')).toBeVisible();
  await expect(row(page, 'resistance').locator('.inspector-hint')).toHaveText('closest kit value: 1.2 kΩ');
  expect(await r1Bands(page), '1234 Ω → brown, red, red, gold').toEqual([BROWN, RED, RED, GOLD]);

  // Ctrl+Z: 470 again in one step, and the inspector shows it.
  await undo(page);
  await expect.poll(async () => (await partOf(page, 'R1')).values.resistance).toBe(470);
  expect(await historySize(page)).toBe(steps);
  expect(await r1Bands(page)).toEqual([YELLOW, VIOLET, BROWN, GOLD]);
  await expect(page.locator('#inspector-label'), 'undo refreshes the inspector on R1').toHaveText('R1');
  await expect(numberInput(page, 'resistance')).toHaveValue('470');

  // −5: refused inline with checkValue's reason; the value and the history stay.
  await setNumber(page, 'resistance', '-5');
  await expect(row(page, 'resistance').locator('.inspector-error')).toBeVisible();
  await expect(row(page, 'resistance').locator('.inspector-error')).toHaveText('resistance must be 1 Ω–10 MΩ; got −5');
  expect((await partOf(page, 'R1')).values.resistance).toBe(470);
  expect(await historySize(page), 'a refused edit adds no undo step').toBe(steps);
  expect(await r1Bands(page)).toEqual([YELLOW, VIOLET, BROWN, GOLD]);

  // Then 1000: accepted, the error goes, and 1 kΩ is a kit value (no hint).
  await setNumber(page, 'resistance', '1000');
  await expect.poll(async () => (await partOf(page, 'R1')).values.resistance).toBe(1000);
  await expect(row(page, 'resistance').locator('.inspector-error')).toBeHidden();
  await expect(row(page, 'resistance').locator('.inspector-hint')).toBeHidden();
  expect(await r1Bands(page)).toEqual([BROWN, BLACK, RED, GOLD]);
  expect(errors).toEqual([]);
});

test('LED colour through the dropdown while simulating: red 14.9 mA → green 14.5 mA; Ctrl+Z brings red back', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  const errors = watchErrors(page);
  await openWithLedBuild(page);
  await clickPart(page, 'LED1');
  expect(await selectedLabel(page), 'the click selected LED1').toBe('LED1');
  await expect(page.locator('#inspector-label')).toHaveText('LED1');

  const color = row(page, 'color').locator('select');
  await expect(color).toHaveValue('red');
  expect(await color.locator('option').evaluateAll(os => os.map(o => o.value)))
    .toEqual(['red', 'yellow', 'green', 'blue', 'white']);
  // Only colour: maxCurrent and thresholdCurrent are the part's internal ratings.
  await expect(page.locator('#inspector .inspector-row')).toHaveCount(1);

  await page.locator('#sim-run-btn').click();
  await expect.poll(() => simText(page)).toContain('LED ON  (14.9 mA)');
  await expect(page.locator('#inspector-label'), 'Run keeps the selection').toHaveText('LED1');

  const steps = await historySize(page);
  await color.selectOption('green');
  // (9 V − 2.2 V) / 470 Ω = 14.5 mA, re-simulated because the simulation runs.
  await expect.poll(() => simText(page), { message: 'the simulation re-runs with the green LED' }).toContain('LED ON  (14.5 mA)');
  expect((await partOf(page, 'LED1')).values).toMatchObject({ color: 'green', vf: 2.2 });
  expect(await historySize(page)).toBe(steps + 1);
  await expect(page.locator('#inspector-label')).toHaveText('LED1');

  await undo(page);
  await expect.poll(async () => (await partOf(page, 'LED1')).values.color).toBe('red');
  expect((await partOf(page, 'LED1')).values.vf).toBe(2.0);
  await expect(row(page, 'color').locator('select'), 'the inspector shows red again').toHaveValue('red');
  if (await page.locator('#sim-run-btn').isVisible()) await page.locator('#sim-run-btn').click();
  await expect.poll(() => simText(page)).toContain('LED ON  (14.9 mA)');
  expect(errors).toEqual([]);
});

// ── Controls: the momentary button (Try it out demo) ──────────────────────

test('Try it out: the inspector\'s pressed toggle lights the LED while simulating, adds no undo step, and Stop resets it', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  const errors = watchErrors(page);
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/landing.html');
  await page.getByRole('button', { name: /Try it out/ }).click();
  await page.waitForURL('**/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.components.length === 4);

  // Not simulating: a click on the button selects it.
  await clickPart(page, 'SW1');
  expect(await selectedLabel(page), 'the click selected SW1').toBe('SW1');
  await expect(page.locator('#inspector-label')).toHaveText('SW1');
  await expect(page.locator('#inspector .inspector-row')).toHaveCount(1);
  const pressed = row(page, 'pressed').locator('input[type="checkbox"]');
  await expect(pressed).not.toBeChecked();
  await expect(pressed, 'a momentary control works only while simulating').toBeDisabled();

  await page.locator('#sim-run-btn').click();
  await expect.poll(() => simText(page)).toContain('Circuit open');
  await expect(pressed).toBeEnabled();

  const steps = await historySize(page);
  await pressed.check();
  await expect.poll(() => simText(page), { message: 'the LED lights, like a click on the button' }).toContain('LED ON  (14.9 mA)');
  expect(await simText(page)).toContain('Button 1: 🟢 CLOSED (current flowing)');
  expect((await partOf(page, 'SW1')).controls.pressed).toBe(true);
  expect(await historySize(page), 'a momentary press records no undo step').toBe(steps);

  await pressed.uncheck();
  await expect.poll(() => simText(page)).toContain('Circuit open');
  expect((await partOf(page, 'SW1')).controls.pressed).toBe(false);

  await pressed.check();
  await expect.poll(() => simText(page)).toContain('LED ON  (14.9 mA)');
  await page.locator('#sim-stop-btn').click();
  expect((await partOf(page, 'SW1')).controls.pressed, 'Stop resets pressed').toBe(false);
  await expect(pressed, 'the inspector shows the reset').not.toBeChecked();
  await expect(pressed).toBeDisabled();
  expect(await historySize(page)).toBe(steps);
  expect(errors).toEqual([]);
});

// ── Selection binds the inspector ──────────────────────────────────────────

test('the inspector follows the selection: switch parts, empty click hides, delete hides, undo restores the part', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  const errors = watchErrors(page);
  await openWithLedBuild(page);

  await clickPart(page, 'R1');
  expect(await selectedLabel(page), 'the click selected R1').toBe('R1');
  await expect(page.locator('#inspector-label')).toHaveText('R1');
  await expect(numberInput(page, 'resistance')).toHaveValue('470');

  await clickPart(page, 'LED1');
  await expect(page.locator('#inspector-label'), 'selecting another part switches the inspector').toHaveText('LED1');
  await expect(row(page, 'resistance')).toHaveCount(0);
  await expect(row(page, 'color')).toHaveCount(1);

  // A click on an empty part of the board deselects.
  await clickHole(page, 'h45');
  expect(await selectedLabel(page)).toBe(null);
  await expect(inspector(page), 'deselect hides the inspector').toBeHidden();

  await clickPart(page, 'LED1');
  await expect(page.locator('#inspector-label')).toHaveText('LED1');
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => App.state.components.map(c => c.label))).toEqual(['BAT1', 'R1']);
  await expect(inspector(page), 'deleting the selected part hides the inspector').toBeHidden();

  await page.keyboard.press('ControlOrMeta+z');
  expect(await page.evaluate(() => App.state.components.map(c => c.label))).toEqual(['BAT1', 'R1', 'LED1']);

  await expect(inspector(page), 'undo of a delete selects nothing').toBeHidden();

  await clickPart(page, 'R1');
  await expect(page.locator('#inspector-label')).toHaveText('R1');
  await expect(numberInput(page, 'resistance')).toHaveValue('470');
  expect(errors).toEqual([]);
});

// ── The generated sidebar ──────────────────────────────────────────────────

test('sidebar: every registered part once under its category; "led" filters to the LED; a generated item places as before', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  const errors = watchErrors(page);
  await openEditor(page);
  const defs = await page.evaluate(() => Parts.all().map(d => ({ type: d.type, name: d.name, sub: d.sub, category: d.category })));
  const partItems = page.locator('#sidebar .comp-item[data-type]:not([data-type="wire"])');

  // Everything, grouped, in the contract's category order.
  const categories = await page.locator('#sidebar .comp-group').evaluateAll(gs => gs.map(g => g.dataset.category));
  expect(categories).toEqual(['Passives', 'Sources', 'Semiconductors', 'I/O']);
  expect((await partItems.evaluateAll(els => els.map(e => e.dataset.type))).sort())
    .toEqual(defs.map(d => d.type).sort());
  for (const d of defs) {
    const group = page.locator(`#sidebar .comp-group[data-category="${d.category}"]`);
    await expect(group.locator('.comp-group-label')).toHaveText(d.category);
    const item = group.locator(`.comp-item[data-type="${d.type}"]`);
    await expect(item, `${d.type} once, under ${d.category}`).toHaveCount(1);
    await expect(item.locator('.comp-item-name')).toHaveText(d.name);
    await expect(item.locator('.comp-item-sub')).toHaveText(d.sub);
    await expect(item.locator('.comp-item-icon svg')).toHaveCount(1);
  }
  await expect(page.locator('#sidebar .comp-item[data-type="wire"]'), 'the Wire tool stays').toBeVisible();

  // Search.
  await page.locator('#part-search').fill('led');
  await expect(page.locator('#sidebar .comp-item[data-type]:not([data-type="wire"]):visible')).toHaveCount(1);
  await expect(page.locator('#sidebar .comp-item[data-type="led"]')).toBeVisible();
  await expect(page.locator('#sidebar .comp-group[data-category="Passives"]')).toBeHidden();
  await expect(page.locator('#sidebar .comp-group[data-category="Semiconductors"]')).toBeVisible();

  await page.locator('#part-search').fill('LIMIT');       // a resistor keyword, any case
  await expect(page.locator('#sidebar .comp-item[data-type]:not([data-type="wire"]):visible')).toHaveCount(1);
  await expect(page.locator('#sidebar .comp-item[data-type="resistor"]')).toBeVisible();

  await page.locator('#part-search').fill('zzz');
  await expect(page.locator('#sidebar .comp-item[data-type]:not([data-type="wire"]):visible')).toHaveCount(0);

  await page.locator('#part-search').fill('');
  await expect(page.locator('#sidebar .comp-item[data-type]:not([data-type="wire"]):visible')).toHaveCount(defs.length);

  // A generated item enters place mode, and placing works as before.
  await page.locator('#part-search').fill('led');
  await page.locator('#sidebar .comp-item[data-type="led"]').click();
  expect(await page.evaluate(() => [App.state.mode, App.state.pickedType])).toEqual(['place', 'led']);
  await expect(page.locator('#sidebar .comp-item[data-type="led"]')).toHaveClass(/\bactive\b/);
  await clickHole(page, 'c30');
  expect(await page.evaluate(() => App.state.components.map(c => [c.type, c.label]))).toEqual([['led', 'LED1']]);
  expect(errors).toEqual([]);
});

// ── Review fixes (#29): the number box, keys, undo from a focused control,
//    saved controls in the downloaded file ──────────────────────────────────
//
// Shapes these tests assume (the builder matches them):
// - A number box commits on blur too (change), not only on Enter: typing
//   1000 and then clicking elsewhere (the inspector label, or Run) sets it.
//   A refused value on blur shows the inline error and changes nothing.
// - After Enter, focus stays in the row's input, so the editor's keys
//   (Backspace/Delete, S/P/W) don't act on the board.
// - Ctrl/Cmd+Z with the colour <select> or a checkbox focused undoes the
//   last edit (neither has a text undo of its own).
// - App.saveCircuit writes each part's saved controls (ControlSpec saved:
//   true) as `controls`, as the undo snapshot and autosave do; unsaved ones
//   (the button's pressed) are left out.
// - A saved-control edit through the inspector schedules an autosave.

const fs   = require('node:fs');
const path = require('node:path');
const SPAN_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'parts', 'test_span.js'), 'utf8');

// Where focus is: "<row key>:<TAG>" inside an inspector row, else the tag.
const focusIn = page => page.evaluate(() => {
  const a = document.activeElement;
  const r = a && a.closest && a.closest('#inspector .inspector-row');
  return r ? `${r.dataset.key}:${a.tagName}` : (a ? a.tagName : null);
});

test('the number box commits on blur: 1000 then a click elsewhere gives 7.0 mA; −5 then blur is refused; 470 then Run commits first', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  const errors = watchErrors(page);
  await openWithLedBuild(page);
  await page.locator('#sim-run-btn').click();
  await expect.poll(() => simText(page)).toContain('LED ON  (14.9 mA)');
  await clickPart(page, 'R1');
  await expect(page.locator('#inspector-label')).toHaveText('R1');

  const steps = await historySize(page);
  await numberInput(page, 'resistance').fill('1000');
  await page.locator('#inspector-label').click();                 // blur, no Enter
  await expect.poll(async () => (await partOf(page, 'R1')).values.resistance, { message: 'blur commits the typed value' }).toBe(1000);
  expect(await r1Bands(page)).toEqual([BROWN, BLACK, RED, GOLD]);
  await expect.poll(() => simText(page)).toContain('LED ON  (7.0 mA)');   // (9 − 2.0) / 1000
  expect(await historySize(page)).toBe(steps + 1);

  // A refused value on blur: the inline error, nothing changes.
  await numberInput(page, 'resistance').fill('-5');
  await page.locator('#inspector-label').click();
  await expect(row(page, 'resistance').locator('.inspector-error')).toBeVisible();
  await expect(row(page, 'resistance').locator('.inspector-error')).toHaveText('resistance must be 1 Ω–10 MΩ; got −5');
  expect((await partOf(page, 'R1')).values.resistance).toBe(1000);
  expect(await historySize(page)).toBe(steps + 1);
  expect(await simText(page)).toContain('LED ON  (7.0 mA)');

  // Stopped, type 470 and press Run straight away: the value lands before the run.
  await page.locator('#sim-stop-btn').click();
  await numberInput(page, 'resistance').fill('470');
  await page.locator('#sim-run-btn').click();
  await expect.poll(async () => (await partOf(page, 'R1')).values.resistance).toBe(470);
  await expect.poll(() => simText(page)).toContain('LED ON  (14.9 mA)');
  expect(errors).toEqual([]);
});

test('after Enter in the number box, focus stays there: Backspace does not delete R1 and S/P/W do not switch modes', async ({ page }) => {
  const errors = watchErrors(page);
  await openWithLedBuild(page);
  await clickPart(page, 'R1');
  await expect(page.locator('#inspector-label')).toHaveText('R1');

  await numberInput(page, 'resistance').fill('1000');
  await numberInput(page, 'resistance').press('Enter');
  await expect.poll(async () => (await partOf(page, 'R1')).values.resistance).toBe(1000);
  expect(await focusIn(page), 'focus is still the resistance input').toBe('resistance:INPUT');

  await page.keyboard.press('Backspace');
  expect(await page.evaluate(() => App.state.components.map(c => c.label)), 'Backspace edits the text, not the board')
    .toEqual(['BAT1', 'R1', 'LED1']);
  for (const key of ['w', 'p', 's', 'w']) {
    await page.keyboard.press(key);
    expect(await page.evaluate(() => App.state.mode), `"${key}" typed in the box leaves the mode alone`).toBe('select');
  }
  await expect(page.locator('#inspector-label')).toHaveText('R1');
  expect(errors).toEqual([]);
});

test('Ctrl+Z with the colour dropdown still focused after picking green brings red back', async ({ page }) => {
  const errors = watchErrors(page);
  await openWithLedBuild(page);
  await clickPart(page, 'LED1');
  const color = row(page, 'color').locator('select');
  await color.focus();
  await color.selectOption('green');
  await expect.poll(async () => (await partOf(page, 'LED1')).values.color).toBe('green');
  expect(await focusIn(page), 'the dropdown keeps focus after the edit').toBe('color:SELECT');

  await page.keyboard.press('ControlOrMeta+z');                     // no click away first
  await expect.poll(async () => (await partOf(page, 'LED1')).values.color, { message: 'Ctrl+Z from the focused dropdown undoes' }).toBe('red');
  await expect(row(page, 'color').locator('select')).toHaveValue('red');
  expect(errors).toEqual([]);
});

// A test-only part with a saved toggle (test/fixtures/parts/test_span.js:
// controls.closed, default true, saved), defined in the page after load with
// a simple view, as e2e/footprint.spec.js does. The app never loads it.
async function openWithTestSpan(page) {
  await openEditor(page);
  await page.evaluate(code => {
    const module = { exports: {} };
    new Function('module', 'exports', code)(module, module.exports);
    const def = module.exports();
    def.view = {
      build(ctx, values, controls, legs) {
        const T = ctx.THREE;
        const group = new T.Group();
        const pinPositions = legs.map(l => {
          const p = ctx.holeWorld(l.col, l.row);
          const box = new T.Mesh(new T.BoxGeometry(0.18, 0.12, 0.18), ctx.mat.body(0x333333));
          box.position.set(p.x, 0.2, p.z);
          group.add(box);
          return new T.Vector3(p.x, 0.08, p.z);
        });
        return { group, pinPositions };
      },
    };
    if (!Parts.get(def.type)) Parts.define(def);
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('test_span', [hole('c30'), hole('c34')]);
    App.placePart('button', [hole('c40'), hole('c43')]);
    App.selectItem(App.state.components.find(c => c.label === 'TS1'), 'component');
  }, SPAN_SOURCE);
  await expect(page.locator('#inspector-label')).toHaveText('TS1');
}

const savedEntry = page => page.evaluate(() => {
  const key = SparkyStorage.projectsKey(SparkyStorage.currentUid(localStorage));
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  const entry = list.find(p => p.id === App.state.circuitId);
  const ts = entry && entry.components.find(c => c.label === 'TS1');
  return ts ? (ts.controls || null) : 'no TS1 in the autosave';
});

test('a saved toggle: the checkbox is one undo step, Ctrl+Z works with it focused, and it is autosaved', async ({ page }) => {
  const errors = watchErrors(page);
  await openWithTestSpan(page);
  const closed = row(page, 'closed').locator('input[type="checkbox"]');
  await expect(closed).toBeChecked();
  await expect(closed, 'a toggle works while stopped too').toBeEnabled();
  // The placement's own autosave has run, so a later one is the edit's.
  await expect.poll(() => savedEntry(page), { timeout: 5000 }).toEqual({ closed: true });

  const steps = await historySize(page);
  await closed.uncheck();
  expect((await partOf(page, 'TS1')).controls.closed).toBe(false);
  expect(await historySize(page)).toBe(steps + 1);
  await expect.poll(() => savedEntry(page), { message: 'the toggle edit schedules an autosave', timeout: 5000 })
    .toEqual({ closed: false });

  expect(await focusIn(page), 'the checkbox keeps focus after the edit').toBe('closed:INPUT');
  await page.keyboard.press('ControlOrMeta+z');                     // no click away first
  await expect.poll(async () => (await partOf(page, 'TS1')).controls.closed, { message: 'Ctrl+Z from the focused checkbox undoes' }).toBe(true);
  expect(await historySize(page)).toBe(steps);
  expect(errors).toEqual([]);
});

test('the downloaded .sparky keeps saved controls (TS1 closed: false) and leaves out unsaved ones (SW1 pressed)', async ({ page }) => {
  const errors = watchErrors(page);
  await openWithTestSpan(page);
  await row(page, 'closed').locator('input[type="checkbox"]').uncheck();
  expect((await partOf(page, 'TS1')).controls.closed).toBe(false);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => App.saveCircuit()),
  ]);
  const file = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  const byLabel = Object.fromEntries(file.components.map(c => [c.label, c]));
  expect(byLabel.TS1.controls, 'the saved toggle is in the file').toEqual({ closed: false });
  expect(byLabel.SW1.controls, "the button's pressed is never saved").toBeUndefined();
  expect(errors).toEqual([]);
});
