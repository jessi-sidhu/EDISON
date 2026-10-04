// A stalled /api/ask ends in a clear message, not a 5-minute spinner and
// "Failed to fetch" (issue #129). /api/ask is stubbed in the browser and the
// first request never answers; no real AI is called. Guest only.
//
// The page's own guard is SparkyChat.ASK_TIMEOUT_MS (read when each ask
// starts). These tests keep its real value and jump the page's clock
// (page.clock) instead of waiting minutes. (Shrinking it to 500 ms left the
// thinking dots up for only 500 ms, and a busy runner could miss them.)
//
// Reasoning is on by default (issue #4): a build took 8–195 s on the test
// set, so the page must keep waiting that long. The second test holds
// /api/ask open for 210 s of page time, then answers with the one-LED build.
const { test, expect } = require('@playwright/test');
const { ONE_LED } = require('../test/fixtures/recipes.js');

test('a stalled ask shows "took too long", clears the dots, and the next ask works', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`console: ${m.text()} @ ${(m.location() && m.location().url) || ''}`);
  });

  let asks = 0;
  await page.route('**/api/ask', route => {
    asks++;
    if (asks === 1) return;   // the stalled AI: never answered
    return route.fulfill({ json: { reply: 'Here is a quick answer.', actions: [] } });
  });
  await page.clock.install();
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && window.SparkyChat);

  const input = page.locator('#sparky-input');
  await input.fill('Build a single LED circuit.');
  await input.press('Enter');
  await expect(page.locator('.chat-msg.typing')).toHaveCount(1);   // thinking
  await page.clock.fastForward(await page.evaluate(() => window.SparkyChat.ASK_TIMEOUT_MS));   // past the page's own guard

  const notice = page.locator('.chat-msg.system').last();
  await expect(notice).toContainText(/took too long/i);
  await expect(notice).not.toContainText(/failed to fetch/i);
  await expect(page.locator('.chat-msg.typing')).toHaveCount(0);
  await expect(input).toBeEnabled();

  await input.fill('What does a resistor do?');
  await input.press('Enter');
  await expect(page.locator('.chat-msg.ai').last()).toHaveText('Here is a quick answer.');
  await expect(page.locator('.chat-msg.typing')).toHaveCount(0);
  expect(asks).toBe(2);

  // Only the stalled request may complain.
  expect(errors.filter(e => !/\/api\/ask|ERR_ABORTED/.test(e))).toEqual([]);
});

test('a build that takes 3½ minutes keeps the thinking dots up the whole wait, then shows its preview', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`console: ${m.text()} @ ${(m.location() && m.location().url) || ''}`);
  });

  let held = null;
  await page.route('**/api/ask', route => { held = route; });   // answered below, after the wait
  await page.clock.install();
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && window.SparkyChat);

  const input = page.locator('#sparky-input');
  await input.fill('Build a single LED circuit.');
  await input.press('Enter');
  await expect.poll(() => held !== null, { message: 'the page asked /api/ask' }).toBe(true);
  const dots = page.locator('.chat-msg.typing');
  await expect(dots).toHaveCount(1);

  for (let s = 30; s <= 210; s += 30) {
    await page.clock.fastForward(30_000);
    await expect(dots, `the thinking dots are still up ${s} s into the wait`).toHaveCount(1);
    await expect(page.locator('.chat-msg.system'), `no message ${s} s into the wait`).toHaveCount(0);
  }

  await held.fulfill({ json: { reply: 'Built a single LED with a current-limiting resistor.', actions: ONE_LED } });
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
  await expect(dots).toHaveCount(0);
  await expect(page.locator('.chat-msg.ai').last()).toContainText('Built a single LED');
  expect(await page.evaluate(() => App.state.components.length), 'a preview only, nothing placed yet').toBe(0);
  expect(errors).toEqual([]);
});
