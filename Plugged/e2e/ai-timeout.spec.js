// A stalled /api/ask ends in a clear message, not a 5-minute spinner and
// "Failed to fetch" (issue #129). /api/ask is stubbed in the browser and the
// first request never answers; no real AI is called. Guest only.
//
// The page's own guard is SparkyChat.ASK_TIMEOUT_MS (read when each ask
// starts). It is set to 500 ms here so the test doesn't wait the real minute.
const { test, expect } = require('@playwright/test');

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
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && window.SparkyChat);
  await page.evaluate(() => { window.SparkyChat.ASK_TIMEOUT_MS = 500; });

  const input = page.locator('#sparky-input');
  await input.fill('Build a single LED circuit.');
  await input.press('Enter');
  await expect(page.locator('.chat-msg.typing')).toHaveCount(1);   // thinking

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
