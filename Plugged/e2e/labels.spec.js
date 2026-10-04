// Stable part labels (R1, LED1, BAT1…) survive delete, undo, save and reopen.
// Issue #2. Drives the board through window.App, the same calls the mouse
// handlers and Chat.acceptBuild make. Guest only; no AI calls.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

async function openEditor(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

// Three resistors in a row: a2-a6, a10-a14, a18-a22.
async function placeThreeResistors(page) {
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('resistor', [hole('a2'), hole('a6')]);
    App.placePart('resistor', [hole('a10'), hole('a14')]);
    App.placePart('resistor', [hole('a18'), hole('a22')]);
  });
}

async function deleteFirstPart(page) {
  await page.evaluate(() => {
    App.selectItem(App.state.components[0], 'component');
    App.deleteSelected();
  });
}

const labels = page => page.evaluate(() => App.state.components.map(c => c.label));

test('every kind of part gets a label when it is placed', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('resistor', [hole('a2'), hole('a6')]);
    App.placePart('led', [hole('a8'), hole('a9')]);
    App.placePart('battery', { x: -20, z: 0 });
    App.placePart('buzzer', [hole('a12'), hole('a13')]);
    App.placePart('button', [hole('e20'), hole('e22')]);
  });
  expect(await labels(page)).toEqual(['R1', 'LED1', 'BAT1', 'BZ1', 'SW1']);
});

test('a place call can pass its own label', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('resistor', [hole('a2'), hole('a6')], undefined, { label: 'R7' });
    App.placePart('battery', { x: -20, z: 0 }, undefined, { label: 'BAT4' });
  });
  expect(await labels(page)).toEqual(['R7', 'BAT4']);
});

test('deleting R1 leaves R2 and R3, and the next resistor is R4', async ({ page }) => {
  await openEditor(page);
  await placeThreeResistors(page);
  await deleteFirstPart(page);
  expect(await labels(page)).toEqual(['R2', 'R3']);

  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('resistor', [hole('a26'), hole('a30')]);
  });
  expect(await labels(page)).toEqual(['R2', 'R3', 'R4']);
});

test('undoing a delete brings back the same labels', async ({ page }) => {
  await openEditor(page);
  await placeThreeResistors(page);
  await deleteFirstPart(page);
  await page.evaluate(() => App.undo());
  expect(await labels(page)).toEqual(['R1', 'R2', 'R3']);
});

test('the auto-saved circuit keeps labels, and reopening it keeps them too', async ({ page }) => {
  await openEditor(page);
  await placeThreeResistors(page);
  await deleteFirstPart(page);
  await page.waitForTimeout(1200);   // auto-save runs 800 ms after the last change

  const saved = await page.evaluate(() => {
    const projects = JSON.parse(localStorage.getItem('sparky_local_projects:guest') || '[]');
    return projects.find(p => p.id === App.state.circuitId);
  });
  expect(saved.components.map(c => c.label)).toEqual(['R2', 'R3']);

  await page.evaluate(data => App.loadCircuitData(data), saved);
  expect(await labels(page)).toEqual(['R2', 'R3']);
});

test('a downloaded .sparky file keeps labels on each part, and reopening it keeps them', async ({ page }) => {
  await openEditor(page);
  await placeThreeResistors(page);
  await deleteFirstPart(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => App.saveCircuit()),
  ]);
  const file = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  expect(file.components.map(c => c.label)).toEqual(['R2', 'R3']);
  expect(file.label).toBeUndefined();   // labels live on each part, never at file level

  await page.evaluate(data => App.loadCircuitData(data), file);
  expect(await labels(page)).toEqual(['R2', 'R3']);
});

test('an old circuit saved without labels opens with labels filled in', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    const ref = s => App.parseHole(s);
    App.loadCircuitData({
      version: 1, name: 'Old circuit',
      components: [
        { type: 'resistor', values: { resistance: 220 }, holeRefs: [ref('a2'), ref('a6')] },
        { type: 'resistor', values: { resistance: 220 }, holeRefs: [ref('a10'), ref('a14')] },
        { type: 'led',      values: { color: 'red' },    holeRefs: [ref('a16'), ref('a17')] },
        { type: 'battery',  values: { voltage: 9 },      holeRefs: null, position: { x: -20, z: 0 } },
      ],
      wires: [],
    });
  });
  expect(await labels(page)).toEqual(['R1', 'R2', 'LED1', 'BAT1']);
});
