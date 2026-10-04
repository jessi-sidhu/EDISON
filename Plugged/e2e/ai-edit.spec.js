// The AI edits a built circuit: set_value, delete_part (issue #27, step D2).
// /api/ask is stubbed in the browser, answering by the message; no real AI is
// called. Guest only.
//
// Decided for the preview (the builder matches it): an edit action places
// nothing, so it adds no ghost. Instead the preview posts one system chat
// message per edit, before Accept, naming the part and what changes, e.g.
// "R1 → 1 kΩ" for set_value (the value written as the markdown writes it)
// and "delete R1" / "remove R1" for delete_part. Decline leaves the board as
// it was; Accept applies every action as one undo step.
const { test, expect } = require('@playwright/test');

const simLines = page => page.locator('#sim-results .sim-line').allTextContents();

// The recorded single-LED build (test/fixtures/recipes.js ONE_LED):
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

// The stubbed AI: the LED build for the quick button, and `edits` for a typed message.
async function openWithAI(page, edits) {
  await page.route('**/api/ask', route => {
    const { message } = route.request().postDataJSON();
    return route.fulfill({ json: /Build a complete working LED circuit/.test(message) ? LED_BUILD : edits });
  });
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 8 changes to your circuit.');
}

// Types a message into the chat and waits for the edit's preview.
async function ask(page, text) {
  await page.evaluate(() => { window.__sceneBefore = App.scene.children.length; });
  await page.locator('#sparky-input').fill(text);
  await page.locator('#sparky-input').press('Enter');
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
}

async function simulate(page) {
  await page.locator('#sim-run-btn').click();
  const out = (await simLines(page)).join(' | ');
  await page.locator('#sim-stop-btn').click();
  return out;
}

async function undo(page) {
  await page.locator('#canvas').click({ position: { x: 5, y: 5 } });   // focus the board, not the chat box
  await page.keyboard.press('ControlOrMeta+z');
}

const labels = page => page.evaluate(() => App.state.components.map(c => c.label));
const resistance = page => page.evaluate(() => App.state.components.find(c => c.label === 'R1').values.resistance);

// R1's model, as its band colours in drawing order (not the tan body or
// the grey leads).
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

test('"make the resistor 1k": set_value previews as a note, Accept gives 7.0 mA and new bands, one Ctrl+Z gives back 14.9 mA', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  await openWithAI(page, {
    reply: 'Sure, swapping in a bigger resistor.',
    actions: [{ tool: 'set_value', part: 'R1', resistance: 1000 }],
  });
  expect(await simulate(page)).toContain('LED ON  (14.9 mA)');
  expect(await r1Bands(page)).toEqual([YELLOW, VIOLET, BROWN, GOLD]);   // 470 Ω

  await ask(page, 'make the resistor 1k');
  // The preview: a note naming R1 and its new value, no ghost, nothing changed yet.
  await expect(page.locator('.chat-msg.system').filter({ hasText: 'R1' }).filter({ hasText: '1 kΩ' })).toHaveCount(1);
  expect(await page.evaluate(() => App.scene.children.length - window.__sceneBefore), 'set_value adds no ghost').toBe(0);
  expect(await resistance(page)).toBe(470);

  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 1 change to your circuit.');
  expect(await resistance(page)).toBe(1000);
  expect(await r1Bands(page)).toEqual([BROWN, BLACK, RED, GOLD]);   // 1 kΩ
  expect(await labels(page)).toEqual(['BAT1', 'R1', 'LED1']);
  expect(await simulate(page)).toContain('LED ON  (7.0 mA)');         // (9 V − 2.0 V) / 1000 Ω

  await undo(page);
  expect(await resistance(page)).toBe(470);
  expect(await simulate(page)).toContain('LED ON  (14.9 mA)');
});

test('delete_part R1 previews as a note, Accept removes it and the LED goes dark, one Ctrl+Z brings it back', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  await openWithAI(page, {
    reply: 'Taking the resistor out.',
    actions: [{ tool: 'delete_part', part: 'R1' }],
  });

  await ask(page, 'remove the resistor');
  await expect(page.locator('.chat-msg.system').filter({ hasText: 'R1' }).filter({ hasText: /delet|remov/i })).toHaveCount(1);
  expect(await page.evaluate(() => App.scene.children.length - window.__sceneBefore), 'delete_part adds no ghost').toBe(0);
  expect(await labels(page)).toEqual(['BAT1', 'R1', 'LED1']);

  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 1 change to your circuit.');
  expect(await labels(page)).toEqual(['BAT1', 'LED1']);
  expect(await page.evaluate(() => App.state.wires.length)).toBe(4);   // R1 had no wire on its pins
  expect(await page.evaluate(() => App.holeMap().has('b2') || App.holeMap().has('b6')), 'R1 left its holes').toBe(false);
  expect(await simulate(page)).not.toContain('LED ON');

  await undo(page);
  expect(await labels(page)).toEqual(['BAT1', 'R1', 'LED1']);
  expect(await simulate(page)).toContain('LED ON  (14.9 mA)');
});

test('delete_part BAT1 takes the two wires on its pins with it; one Ctrl+Z restores both', async ({ page }) => {
  await openWithAI(page, {
    reply: 'Removing the battery.',
    actions: [{ tool: 'delete_part', part: 'BAT1' }],
  });
  await ask(page, 'take the battery off');
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 1 change to your circuit.');
  expect(await labels(page)).toEqual(['R1', 'LED1']);
  expect(await page.evaluate(() => App.state.wires.map(w => [w.startHole && App.formatHole(w.startHole), w.endHole && App.formatHole(w.endHole)])))
    .toEqual([['tp_3', 'a2'], ['a8', 'tn_8']]);

  await undo(page);
  expect(await labels(page)).toEqual(['BAT1', 'R1', 'LED1']);
  expect(await page.evaluate(() => App.state.wires.length)).toBe(4);
});

test('a refused edit (an unknown label) changes nothing and says so', async ({ page }) => {
  await openWithAI(page, {
    reply: 'Changing R9.',
    actions: [{ tool: 'set_value', part: 'R9', resistance: 1000 }],
  });
  await ask(page, 'make R9 1k');
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 0 changes to your circuit. 1 could not be applied.');
  await expect(page.locator('.chat-msg.system').filter({ hasText: 'R9' })).not.toHaveCount(0);
  expect(await resistance(page)).toBe(470);
});

// ── The value column the AI reads, generic from each part's ValueSpecs ──────
// App.formatValue / exportMarkdown write each value the AI may set (the
// part's ai.values, default all) with its unit, SI-prefixed ("470 Ω",
// "1 kΩ", "9 V"), a choice as its name ("red"), joined by ", ". A part with
// no such values (buzzer, button) shows "—".

test('the markdown value column is built from each part\'s values: 470 Ω, 1 kΩ, red, 9 V, and — for the buzzer and button', async ({ page }) => {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('battery', { x: -20, z: 0 });
    App.placePart('resistor', [hole('b2'), hole('b6')]);
    App.placePart('resistor', [hole('b10'), hole('b14')], { resistance: 1000 });
    App.placePart('led', [hole('c8'), hole('c6')]);
    App.placePart('buzzer', [hole('b20'), hole('b22')]);
    App.placePart('button', [hole('b30'), hole('b33')]);
  });
  const md = await page.evaluate(() => App.exportMarkdown());
  const row = label => (md.split('\n').find(l => l.startsWith(`| ${label} |`)) || '').split('|').map(c => c.trim()).slice(1, -1);

  expect(row('BAT1').slice(0, 3)).toEqual(['BAT1', 'battery', '9 V']);
  expect(row('R1').slice(0, 3)).toEqual(['R1', 'resistor', '470 Ω']);
  expect(row('R2').slice(0, 3)).toEqual(['R2', 'resistor', '1 kΩ']);
  expect(row('LED1').slice(0, 3)).toEqual(['LED1', 'led', 'red']);
  expect(row('BZ1').slice(0, 3)).toEqual(['BZ1', 'buzzer', '—']);
  expect(row('SW1').slice(0, 3)).toEqual(['SW1', 'button', '—']);
  // The LED's legs still say which is which, from its pin names.
  expect(row('LED1')[3]).toContain('c8');
  expect(row('LED1')[3]).toContain('cathode');
  expect(row('LED1')[4]).toContain('c6');
  expect(row('LED1')[4]).toContain('anode');
  // The off-board battery still tells the AI its wire refs.
  expect(md).toContain('BAT1.0');
  expect(md).toContain('BAT1.1');
});
