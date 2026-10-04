// The Lab HUD chat in the browser (issue #192, Lab HUD 4/4; mockup
// docs/design/editor-hud/1-lab-hud-closeup-chat.png, source hud.css/hud.js).
// One flow through the real chat panel, because all of it is what the user
// sees and clicks: a new ASK button that sends, the log's YOU / EDISON
// labels, a reply's value with the dotted underline, its part label as an
// outlined tag, the leader still drawn to the part, and the pending bar's
// Accept. The value's colour and font are pinned in e2e/edison-skin.spec.js,
// and the leader's geometry is too; here only its count and visibility.
// /api/ask is stubbed; no AI is called. Guest only; sign-in is a manual QA case.
//
// The page the builder matches (?ui=edison; classic is untouched):
// - #sparky-ask-btn: a <button> in #sparky-input-row whose click sends
//   #sparky-input through sparkyAsk(), the same send as Enter. In classic it
//   is not shown (index.html carries it, hidden outside html[data-ui="edison"]).
// - A header row in #sparky-panel with the text "Tutor / ENSC 220" (caps
//   from CSS, any case in the DOM).
// - Each .chat-msg.user carries a "YOU" label and each .chat-msg.ai an
//   "EDISON" label: a ::before (content as text-transform renders it) or a
//   label element just before the message. Not an element inside it: other
//   specs pin the messages' own text.
// - Replies in DM Mono, at least 13 px, line height at least 1.5.
// - A reply's .ed-val has a dotted underline (text-decoration dotted
//   underline, or a dotted border-bottom).
// - A part label in a reply (LED1 here, a part on the board) is an element
//   whose text is exactly the label, with a border on all four sides.
// - The pending bar shows only while a build waits (the mockup's
//   `display: flex !important` would keep it up); its buttons keep the names
//   Accept and Decline.
const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 1440, height: 900 } });   // the mockup's size

const QUESTION = 'Why is LED1 so dim?';
const REPLY    = '**LED1** gets 14.9 mA. Add the wire from a8 to the ground rail to finish it.';
const WIRE     = { tool: 'add_wire', from: 'a8', to: 'tn_8', color: 'black' };

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// Stub /api/ask with one reply proposing one wire; returns the messages sent.
async function stubAsk(page) {
  const asked = [];
  await page.route('**/api/ask', route => {
    asked.push(JSON.parse(route.request().postData() || '{}').message);
    return route.fulfill({ json: { reply: REPLY, actions: [WIRE] } });
  });
  return asked;
}

async function open(page, query) {
  await page.goto('/circuit3d/index.html' + query);
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

// Render on demand (#109): a frame drawn, as e2e/edison-skin.spec.js waits.
async function drawn(page) {
  const before = await page.evaluate(() => { App.requestRender(); return App.renderer.info.render.frame; });
  await page.waitForFunction(f => App.renderer.info.render.frame > f, before);
}

// LED1 on c8 → c6, framed as an AI build is (copied from e2e/edison-skin.spec.js).
async function placeLed(page) {
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('led', [hole('c8'), hole('c6')]);
    App.frameCircuit();
  });
  await drawn(page);
}

// A message's caps label as the user sees it: its ::before text (with
// text-transform applied), else the text of a label element just before it.
const whoLabel = loc => loc.evaluate(el => {
  const b = getComputedStyle(el, '::before');
  const quoted = /^"(.*)"$/.exec(b.content || '');
  if (quoted && b.display !== 'none') {
    const t = quoted[1].trim();
    return b.textTransform === 'uppercase' ? t.toUpperCase() : t;
  }
  const prev = el.previousElementSibling;
  return prev && !prev.classList.contains('chat-msg') && prev.id !== 'sparky-welcome' ? prev.innerText.trim() : `(no label; ::before content ${b.content})`;
});

test('?ui=edison: ASK sends, the log reads YOU / EDISON with an underlined value and a tagged part, and Accept applies the wire', async ({ page }) => {
  const errors = watchErrors(page);
  const asked = await stubAsk(page);
  await open(page, '?ui=edison');
  await placeLed(page);

  const panel = page.locator('#sparky-panel');
  await expect.soft(panel.getByText(/tutor\s*\/\s*ensc\s*220/i), 'the chat header\'s "Tutor / ENSC 220"').toBeVisible();
  const bar = page.locator('#sparky-pending-bar');
  await expect(bar, 'no pending bar before a build is proposed').toBeHidden();

  // ASK: type, click, and the question goes out once, as Enter sends it.
  const askBtn = page.locator('#sparky-ask-btn');
  await expect(askBtn, 'the ASK button in Edison').toBeVisible();
  await page.locator('#sparky-input').fill(QUESTION);
  await askBtn.click();
  await expect.poll(() => [...asked], { message: 'the messages sent to /api/ask' }).toEqual([QUESTION]);
  await expect(page.locator('.chat-msg.user'), 'the question shows as the user\'s message').toHaveText([QUESTION]);
  await expect(page.locator('#sparky-input'), 'the box is cleared after sending').toHaveValue('');
  const reply = page.locator('.chat-msg.ai');
  await expect(reply).toHaveCount(1);

  // The log: a caps label over each message.
  expect.soft(await whoLabel(page.locator('.chat-msg.user')), 'the user message\'s label').toBe('YOU');
  expect.soft(await whoLabel(reply), 'the reply\'s label').toBe('EDISON');

  // Long replies stay readable: DM Mono, at least 13 px, line height at least 1.5.
  const read = await reply.evaluate(el => {
    const s = getComputedStyle(el);
    return { font: s.fontFamily, size: parseFloat(s.fontSize), lineHeight: s.lineHeight };
  });
  const firstFamily = read.font.split(',')[0].trim().replace(/^["']|["']$/g, '');
  expect.soft(firstFamily, `the reply's first font family (computed: ${read.font})`).toBe('DM Mono');
  expect.soft(read.size, 'the reply\'s font size, px').toBeGreaterThanOrEqual(13);
  expect.soft(parseFloat(read.lineHeight) / read.size, `the reply's line height (${read.lineHeight} on ${read.size}px)`).toBeGreaterThanOrEqual(1.5);

  // The value: the textbook's dotted underline.
  const value = reply.locator('.ed-val');
  await expect(value).toHaveText(['14.9 mA']);
  const deco = await value.evaluate(el => {
    const s = getComputedStyle(el);
    return { line: s.textDecorationLine, style: s.textDecorationStyle, border: s.borderBottomStyle, borderWidth: parseFloat(s.borderBottomWidth) };
  });
  const dotted = (deco.line.includes('underline') && deco.style === 'dotted') || (deco.border === 'dotted' && deco.borderWidth > 0);
  expect.soft(dotted, `the value has a dotted underline (text-decoration ${deco.line} ${deco.style}, border-bottom ${deco.border} ${deco.borderWidth}px)`).toBe(true);

  // The part label: an outlined tag.
  const tag = await reply.evaluate(msg => {
    const sides = ['Top', 'Right', 'Bottom', 'Left'];
    const outlined = e => { const s = getComputedStyle(e); return sides.every(k => s[`border${k}Style`] !== 'none' && parseFloat(s[`border${k}Width`]) >= 1); };
    const el = [...msg.querySelectorAll('*')].find(e => e.textContent.trim() === 'LED1' && outlined(e));
    return el ? `<${el.tagName.toLowerCase()} class="${el.className}">` : null;
  });
  expect.soft(tag, `LED1 in the reply is an element with a border on all four sides (reply markup: ${await reply.innerHTML()})`).not.toBeNull();

  // Still exactly one leader, from the reply to LED1 (geometry: edison-skin.spec.js).
  const leader = page.locator('.ed-leader');
  await expect(leader).toHaveCount(1);
  await expect(leader).toBeVisible();

  // The pending bar: Accept and Decline by name; Accept applies the one wire.
  await expect(bar).toBeVisible();
  await expect(page.getByRole('button', { name: 'Decline' })).toBeVisible();
  const wires = await page.evaluate(() => App.state.wires.length);
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(() => page.evaluate(() => App.state.wires.length), { message: 'Accept adds the proposed wire' }).toBe(wires + 1);
  await expect(bar, 'the bar goes away after Accept').toBeHidden();

  expect(errors).toEqual([]);

  // Classic is untouched: no ASK button there.
  await open(page, '?ui=classic');
  await expect(page.locator('#sparky-ask-btn'), 'no ASK button in classic').toBeHidden();
});
