// One hole-name formula, issue #20. ids.js's pure App.holeName is the
// formula; breadboard.js's App.formatHole keeps its board check on top of
// it. ids.js loads after breadboard.js and simulate.js, so this checks the
// page ends up with both, and that the check was not overwritten. Guest
// only; /api/ask is stubbed and never called.
const { test, expect } = require('@playwright/test');

async function openEditor(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

test('App.holeName and App.formatHole agree on board holes: e14, tp_14', async ({ page }) => {
  await openEditor(page);
  const got = await page.evaluate(() => ({
    holeName: typeof App.holeName,
    e: App.formatHole({ col: 13, row: 'e' }),
    tp: App.formatHole({ col: 13, row: 'tp' }),
  }));
  expect(got.holeName).toBe('function');
  expect(got.e).toBe('e14');
  expect(got.tp).toBe('tp_14');
  expect(await page.evaluate(() => App.holeName({ col: 13, row: 'bn' }))).toBe('bn_14');
});

test('App.formatHole still throws for a hole off the board', async ({ page }) => {
  await openEditor(page);
  const errors = await page.evaluate(() => {
    const tryIt = ref => { try { App.formatHole(ref); return null; } catch (e) { return String(e.message); } };
    return [tryIt({ col: 99, row: 'a' }), tryIt({ col: -1, row: 'a' }), tryIt({ col: 3, row: 'z' })];
  });
  errors.forEach(msg => expect(msg).toMatch(/formatHole: not a board hole/));
});
