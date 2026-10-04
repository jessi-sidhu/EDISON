// 📷 build and help, the demo beat (issue #143; docs/API-CONTRACT.md →
// "Page additions (photo)"). Build it on the
// confirm screen puts the photo's circuit on the board as one undo step
// (never over her open saved circuit), runs the simulation, badges the
// problems-panel rows of parts read unsure, and asks Edison her question
// with the photo's context appended to the /api/ask message. /api/photo and
// /api/ask are stubbed in the browser; no AI is called. Guest only; Google
// sign-in stays a manual QA case.
//
// The page the builder matches:
//   - Build it (#photo-build) → photo.js's built(result) closes the overlay,
//     then SparkyChat.applyBuild(result.actions):
//       · a board that isn't empty: App.clearAll() first (a new "Untitled";
//         her saved circuit is left as it is in My Circuits); never delete_all;
//       · Chat.acceptBuild in one history.batch (one Ctrl+Z empties it), then
//         App.frameCircuit();
//       · one system message, exactly "Built N parts from your photo. Undo
//         (Ctrl+Z) brings back the empty board." with N the parts placed
//         (the battery, R1 and LED1 here: 3; wires aren't counted), and no
//         other system message (a placement refusal note is a bug);
//       · one `model` chat-history entry "I built your board from the photo:
//         R1 a10–a14, LED1 c14–c17, …" (seen in the next /api/ask `history`).
//   - Then App.runSimulation() (App.simRunning), and window.PhotoFlags =
//     new Set(result.flags.map(f => result.labels[f.id]).filter(Boolean)).
//     photo.js clears it (empty or missing) when the next photo opens and when
//     the board is cleared (App.clearAll, e.g. the Clear All button).
//   - tools/mistakes.js: a .mistake-row whose labels include one in
//     PhotoFlags shows the text "read from photo, unsure"; other rows don't.
//   - Then sparkyAsk(question, { context }): question = what she had typed in
//     #sparky-input before 📷 (trimmed), or "What's wrong with my circuit?"
//     when empty; context = SparkyChat.photoContext(result) (pure, checked in
//     test/chat-photo.test.js). The /api/ask `message` is question + "\n\n" +
//     context; her bubble (.chat-msg.user) shows only the question; the chat
//     history keeps the message as sent (role user), then the reply.
const fs   = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { TWO_LEDS, handOver } = require('./fixtures/circuits');
const { chooseSample } = require('./fixtures/photo-sample');

// The contract's mock Reading (docs/API-CONTRACT.md → "Mock Reading"): R1 from
// the + rail to a14 (built with a white jumper b10 → tp_10, flagged moved),
// LED1 backwards (cathode c14, anode c17), W1 b17 → − rail.
const MOCK_READING = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'photo', 'demo-board.json'), 'utf8')).reading;

const GUEST_KEY = 'sparky_local_projects:guest';   // SparkyStorage.projectsKey(null)
const QUESTION  = "My LED won't light, why?";
const DEFAULT_Q = "What's wrong with my circuit?";
const PREFIX    = 'Built from a photo of my real breadboard.';
const BADGE     = 'read from photo, unsure';
const REPLY     = '**LED1** is in backwards: its cathode is on the + side, so no current flows.';

// What the mock builds (docs/API-CONTRACT.md → PhotoImport → Mock), by label:
// [label, type, holes sorted], and each wire's two ends sorted.
const DEMO_PARTS = [['BAT1', 'battery', []], ['LED1', 'led', ['c14', 'c17']], ['R1', 'resistor', ['a10', 'a14']]];
const DEMO_WIRES = ['BAT1.0~tp_3', 'BAT1.1~tn_3', 'b10~tp_10', 'b17~tn_19'];
const BUILT_NOTE = n => `Built ${n} parts from your photo. Undo (Ctrl+Z) brings back the empty board.`;

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`console: ${m.text()} @ ${(m.location() && m.location().url) || ''}`);
  });
  return errors;
}

// Stubs /api/photo with `reading` and /api/ask with REPLY; every /api/ask
// body lands in the returned list.
async function stub(page, reading) {
  const asks = [];
  await page.route('**/api/ask', route => {
    asks.push(route.request().postDataJSON());
    return route.fulfill({ json: { reply: REPLY, actions: [] } });
  });
  await page.route('**/api/photo', route => route.fulfill({ json: { reading, provider: 'fixture', model: 'deepseek-flash', ms: 12, key: 'demo-board' } }));
  return asks;
}

const editorReady = page => page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);

// 📷 → Use sample photo → the demo-board tile when the picker shows (#15:
// 2 samples offered; with one, no picker, #200) → the confirm screen.
async function openConfirm(page) {
  await chooseSample(page, 'demo-board');
  await expect(page.locator('#photo-confirm'), 'the Reading opens the confirm screen').toBeVisible();
}

async function buildIt(page) {
  await openConfirm(page);
  await page.locator('#photo-build').click();
  await expect(page.locator('#photo-modal'), 'Build it closes the overlay').toBeHidden();
}

const boardNow = page => page.evaluate(() => {
  const b = App.exportBoard();
  return {
    parts: b.parts.map(p => [p.label, p.type, (p.holes || []).slice().sort()]).sort((x, y) => x[0].localeCompare(y[0])),
    wires: b.wires.map(w => [w.from, w.to].sort().join('~')).sort(),
  };
});
const photoFlags = page => page.evaluate(() => (window.PhotoFlags ? [...window.PhotoFlags].sort() : []));
const builtResult = page => page.evaluate(() => window.PhotoConfirm.built);
const savedList = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || '[]'), GUEST_KEY);

// Each problems-panel row: its labels, whether it has the photo badge.
const problemRows = page => page.evaluate(badge => [...document.querySelectorAll('#mistakes-panel .mistake-row')].map(r => ({
  labels: r.querySelector('.mistake-labels').textContent.split(', '),
  icon:   r.querySelector('.mistake-icon').textContent,
  badge:  r.textContent.includes(badge),
})), BADGE);

// ── The demo beat ──────────────────────────────────────────────────────────

test('the demo beat: her typed question, 📷 sample, Build it → the board, one note, the simulation and LED1 backwards; Edison gets question + context while her bubble shows the question; the next photo clears the flags; one Ctrl+Z empties the board', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL)
  const errors = watchErrors(page);
  const asks = await stub(page, MOCK_READING);
  await page.goto('/circuit3d/index.html');
  await editorReady(page);
  await page.locator('#sparky-input').fill(QUESTION);

  await buildIt(page);

  // The photo's circuit is on the board, as the contract's mock builds it.
  await expect.poll(() => boardNow(page), 'R1, LED1, the battery and 4 wires are on the board').toEqual({ parts: DEMO_PARTS, wires: DEMO_WIRES });
  await expect(page.locator('#sparky-messages .chat-msg.system'), 'one note, no refusal notes').toHaveText([BUILT_NOTE(DEMO_PARTS.length)]);

  // The simulation runs; the problems panel lists LED1 backwards.
  await expect.poll(() => page.evaluate(() => App.simRunning === true), 'the simulation is running').toBe(true);
  await expect(page.locator('#mistakes-panel')).toBeVisible();
  const result = await builtResult(page);
  const flagged = [...new Set(result.flags.map(f => result.labels[f.id]).filter(Boolean))].sort();
  expect(flagged, 'the mock flags only R1 (drawn with a jumper)').toEqual(['R1']);
  expect(await photoFlags(page), 'PhotoFlags holds the flagged parts\' app labels').toEqual(flagged);
  const rows = await problemRows(page);
  expect(rows.filter(r => r.labels.includes('LED1') && r.icon === '⇄'), 'a backwards row for LED1').toHaveLength(1);
  for (const r of rows) expect(r.badge, `row ${r.labels} has the photo badge only if it names a flagged part`).toBe(r.labels.some(l => flagged.includes(l)));

  // Edison is asked her question, with the photo's context in the request only.
  await expect.poll(() => asks.length, 'one /api/ask after the build').toBe(1);
  const context = await page.evaluate(r => window.SparkyChat.photoContext(r), result);
  expect(context.startsWith(PREFIX), `the context starts "${PREFIX}": ${JSON.stringify(context)}`).toBe(true);
  expect(asks[0].message, 'the request carries question + "\\n\\n" + context').toBe(QUESTION + '\n\n' + context);
  await expect(page.locator('#sparky-messages .chat-msg.user'), 'her bubble shows only her question').toHaveText([QUESTION]);
  await expect(page.locator('#sparky-input')).toHaveValue('');
  await expect(page.locator('#sparky-messages .chat-msg.ai')).toHaveCount(1);
  const fromPhoto = asks[0].history.filter(h => /from the photo/.test(h.text));
  expect(fromPhoto, 'one history entry for the photo build').toHaveLength(1);
  expect(fromPhoto[0].role).toBe('model');
  expect(fromPhoto[0].text.startsWith('I built your board from the photo:'), fromPhoto[0].text).toBe(true);
  for (const part of ['R1 a10–a14', 'LED1 c14–c17']) expect(fromPhoto[0].text, `the entry names ${part}`).toContain(part);

  // A follow-up carries the first message as sent (with the context), then the reply.
  await page.locator('#sparky-input').fill('thanks');
  await page.locator('#sparky-input').press('Enter');
  await expect.poll(() => asks.length).toBe(2);
  const sent = asks[1].history.findIndex(h => h.role === 'user' && h.text === QUESTION + '\n\n' + context);
  expect(sent, 'history keeps the question as sent, context included').toBeGreaterThanOrEqual(0);
  expect(asks[1].history[sent + 1], 'then Edison\'s reply').toEqual({ role: 'model', text: REPLY });

  // The next photo clears the flags.
  await openConfirm(page);
  expect(await photoFlags(page), 'PhotoFlags cleared when the next photo opens').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#photo-modal')).toBeHidden();

  // One undo step brings back the empty board.
  await page.locator('#canvas').click({ position: { x: 5, y: 5 } });   // focus the board, not the chat box
  await page.keyboard.press('ControlOrMeta+z');
  expect(await boardNow(page), 'one Ctrl+Z empties the board').toEqual({ parts: [], wires: [] });
  expect(errors).toEqual([]);
});

// ── Explain mode (issue #169) ──────────────────────────────────────────────
// Build it with nothing typed asks the default question as an explanation
// only: the /api/ask body carries `explain: true`, and the server then offers
// the model no tools (test/ask-explain.test.js). A question she typed herself
// ("fix it") may want an edit, so it goes as today, without `explain`; so does
// every normal chat send, before and after an explain ask.

test('Build it with nothing typed sends explain: true; a typed "fix it" Build it and normal chat sends carry no explain', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const asks = await stub(page, MOCK_READING);
  await page.goto('/circuit3d/index.html');
  await editorReady(page);
  const noExplain = (body, what) => expect([undefined, false], `${what}: explain is ${JSON.stringify(body.explain)}`).toContain(body.explain);

  // Her own question first: as today.
  await page.locator('#sparky-input').fill('fix it');
  await buildIt(page);
  await expect.poll(() => asks.length, 'one /api/ask after the first Build it').toBe(1);
  expect(asks[0].message.startsWith('fix it\n\n'), asks[0].message).toBe(true);
  noExplain(asks[0], 'Build it with "fix it" typed');

  // A normal chat send.
  await page.locator('#sparky-input').fill('thanks');
  await page.locator('#sparky-input').press('Enter');
  await expect.poll(() => asks.length).toBe(2);
  noExplain(asks[1], 'a chat send');

  // Nothing typed: the default question, as an explanation.
  await expect(page.locator('#sparky-input')).toHaveValue('');
  await buildIt(page);
  await expect.poll(() => asks.length, 'one /api/ask after the second Build it').toBe(3);
  expect(asks[2].message.startsWith(DEFAULT_Q + '\n\n'), asks[2].message).toBe(true);
  expect(asks[2].explain, 'Build it with nothing typed sends explain: true').toBe(true);

  // The next chat send is a normal one again.
  await page.locator('#sparky-input').fill('how do I flip it?');
  await page.locator('#sparky-input').press('Enter');
  await expect.poll(() => asks.length).toBe(4);
  noExplain(asks[3], 'a chat send after the explain ask');
  expect(errors).toEqual([]);
});

// ── Her saved circuit, a flagged LED, no question ─────────────────────────

test('with a saved circuit open, no question typed and LED1\'s colour unread: the build starts a new Untitled circuit and leaves the saved one untouched; LED1\'s backwards row has the photo badge; Edison gets "What\'s wrong with my circuit?"; Clear All clears the flags', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const reading = JSON.parse(JSON.stringify(MOCK_READING));
  reading.parts.find(p => p.id === 'LED1').color = '';           // colour unread → LED1 flagged `value`
  const asks = await stub(page, reading);
  // Her saved "Two LEDs", opened from My Circuits the way the dashboard hands it over.
  await page.addInitScript(({ key, list, pending }) => {
    if (sessionStorage.getItem('__e2e_seeded')) return;
    sessionStorage.setItem('__e2e_seeded', '1');
    localStorage.setItem(key, JSON.stringify(list));
    sessionStorage.setItem('sparky_load_circuit', JSON.stringify(pending));
  }, { key: GUEST_KEY, list: [TWO_LEDS], pending: handOver(TWO_LEDS) });
  await page.goto('/circuit3d/index.html');
  await editorReady(page);
  await expect(page.locator('#circuit-name-field')).toHaveText('Two LEDs');
  expect(await page.evaluate(() => [App.state.components.length, App.state.wires.length])).toEqual([4, 4]);
  await page.waitForTimeout(1200);                                  // let any autosave of the opened circuit settle
  const savedBefore = (await savedList(page)).find(p => p.id === TWO_LEDS.id);
  expect(savedBefore, 'her circuit is in My Circuits').toBeTruthy();
  await expect(page.locator('#sparky-input')).toHaveValue('');

  await buildIt(page);

  // A new Untitled circuit holds the photo's board; hers is untouched.
  await expect.poll(() => boardNow(page), 'only the photo\'s parts: hers were cleared first').toEqual({ parts: DEMO_PARTS, wires: DEMO_WIRES });
  await expect(page.locator('#circuit-name-field'), 'a new circuit').toHaveText(/^Untitled/);
  expect(await page.evaluate(() => App.state.circuitId), 'not her circuit\'s record').not.toBe(TWO_LEDS.id);
  await expect.poll(async () => (await savedList(page)).map(p => [p.name.startsWith('Untitled') ? 'Untitled' : p.name, p.components.length, p.wires.length]).sort(),
    'her circuit plus a new Untitled record').toEqual([['Two LEDs', 4, 4], ['Untitled', 3, 4]]);
  expect((await savedList(page)).find(p => p.id === TWO_LEDS.id), 'her saved circuit is exactly as it was').toEqual(savedBefore);
  await expect(page.locator('#sparky-messages .chat-msg.system')).toHaveText([BUILT_NOTE(DEMO_PARTS.length)]);

  // LED1 is flagged, so its backwards row carries the badge.
  await expect.poll(() => page.evaluate(() => App.simRunning === true)).toBe(true);
  expect(await photoFlags(page), 'R1 (jumper) and LED1 (colour unread) are flagged').toEqual(['LED1', 'R1']);
  const rows = await problemRows(page);
  const led = rows.filter(r => r.labels.includes('LED1') && r.icon === '⇄');
  expect(led, 'a backwards row for LED1').toHaveLength(1);
  expect(led[0].badge, `LED1's row says "${BADGE}"`).toBe(true);
  await expect(page.locator('#mistakes-panel .mistake-row', { hasText: 'LED1' }).getByText(BADGE)).toBeVisible();

  // No question typed: Edison is asked the default one.
  await expect.poll(() => asks.length).toBe(1);
  const context = await page.evaluate(r => window.SparkyChat.photoContext(r), await builtResult(page));
  expect(asks[0].message).toBe(DEFAULT_Q + '\n\n' + context);
  expect(context, 'the context names LED1').toMatch(/\bLED1\b/);
  await expect(page.locator('#sparky-messages .chat-msg.user')).toHaveText([DEFAULT_Q]);

  // Clear All empties the board and the flags.
  page.on('dialog', d => d.accept());
  await page.locator('#clear-all-btn').click();
  expect(await boardNow(page)).toEqual({ parts: [], wires: [] });
  expect(await photoFlags(page), 'PhotoFlags cleared with the board').toEqual([]);
  expect((await savedList(page)).find(p => p.id === TWO_LEDS.id), 'her saved circuit is still as it was').toEqual(savedBefore);
  expect(errors).toEqual([]);
});
