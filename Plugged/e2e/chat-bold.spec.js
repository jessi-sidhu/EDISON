// The AI's chat bubble shows **bold** as bold, and never runs the reply as
// HTML (issue #62). /api/ask is stubbed; no real AI is called. Guest only.
const { test, expect } = require('@playwright/test');

test('an AI reply renders **series** as bold and keeps <b> tags as text', async ({ page }) => {
  await page.route('**/api/ask', route => route.fulfill({ json: {
    reply: 'Two LEDs in **series** are dimmer. <b>not bold</b>',
    actions: [],
  } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard);
  await page.locator('#sparky-input').fill('Put two LEDs in series.');
  await page.locator('#sparky-input').press('Enter');

  const reply = page.locator('.chat-msg.ai').last();
  await expect(reply).toHaveText('Two LEDs in series are dimmer. <b>not bold</b>');
  await expect(reply.locator('strong')).toHaveText('series');
  await expect(reply.locator('b')).toHaveCount(0);
});
