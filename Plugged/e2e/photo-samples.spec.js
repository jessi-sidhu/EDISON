// 📷 the offered samples (issue #200): the picker offers only samples that
// build a working circuit, and today that's demo-board alone, so "Use sample
// photo" goes straight to its confirm screen, with no picker of one tile.
// test/photo-samples.test.js replays every offered sample's recording through
// the same path in Node and checks the circuit works; this walks it in the
// page.
//
// Unstubbed /api/photo: the e2e server runs PHOTO_PROVIDERS=fixture, so it
// replays test/fixtures/photo/demo-board.json and never reaches an AI.
// /api/ask is stubbed (Build it asks Edison).
const { test, expect } = require('@playwright/test');

const simLines = page => page.locator('#sim-results .sim-line').allTextContents();

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`console: ${m.text()} @ ${(m.location() && m.location().url) || ''}`);
  });
  return errors;
}

test('Use sample photo goes straight to demo-board\'s confirm screen (its recording, no picker); Build it puts BAT1, R1 and LED1 on the board and the simulation runs with no "Circuit open"', async ({ page }) => {
  test.setTimeout(90_000);   // software WebGL
  const errors = watchErrors(page);
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  const credit = await page.evaluate(() => window.PhotoSamples['demo-board'].credit);

  await page.locator('#photo-btn').click();
  const photoReply = page.waitForResponse(r => new URL(r.url()).pathname === '/api/photo' && r.request().method() === 'POST',
    { timeout: 15_000 });   // a picker would send nothing
  await page.locator('#photo-sample').click();
  const res = await photoReply;
  expect(res.status()).toBe(200);
  expect(res.request().postDataJSON().sample, 'Use sample photo sends demo-board').toBe('demo-board');
  const answer = await res.json();
  expect({ provider: answer.provider, key: answer.key }, 'answered from its recording, no AI').toEqual({ provider: 'fixture', key: 'demo-board' });

  await expect(page.locator('#photo-confirm'), 'its confirm screen opens').toBeVisible();
  await expect(page.locator('#photo-samples'), 'no picker for one sample').toBeHidden();
  await expect(page.locator('#photo-corners'), 'a sample skips the corner step').toBeHidden();
  await expect(page.locator('#photo-confirm'), 'its credit under the photo').toContainText(credit, { useInnerText: true });

  await expect(page.locator('#photo-build'), 'Build it is ready with nothing edited').toBeEnabled();
  await page.locator('#photo-build').click();
  await expect(page.locator('#photo-modal'), 'Build it closes the overlay').toBeHidden();

  await expect.poll(() => page.evaluate(() => App.exportBoard().parts.map(p => p.label).sort()),
    { message: 'the battery, the resistor and the LED are on the board' }).toEqual(['BAT1', 'LED1', 'R1']);
  await expect.poll(() => page.evaluate(() => App.simRunning === true), { message: 'the simulation is running' }).toBe(true);
  await expect.poll(async () => (await simLines(page)).join(' | '), { message: 'the simulation has its lines' }).toContain('Battery');
  const lines = (await simLines(page)).join(' | ');
  expect(lines, 'a closed loop: not "Circuit open", and the battery is there').not.toMatch(/Circuit open|No battery/i);
  expect(lines, 'what the demo shows: LED1 in backwards').toMatch(/backwards/i);
  expect(errors).toEqual([]);
});
