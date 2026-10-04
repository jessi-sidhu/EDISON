// The Thévenin tool, issue #93: while simulating, the Thévenin button
// (#thevenin-btn) enters pick mode; clicking two holes on the board opens a
// card (#thevenin-card) with Vth, Rth and In (Norton) between them. While
// picking, a hole click does not open the equation card (#equation-card).
// Esc closes the card and cancels pick mode; Stop clears it.
// Built on the 9 V divider through window.App (the calls the mouse handlers
// make), as in sim-events.spec.js, then the real Run, Thévenin and Stop
// buttons and real clicks on the canvas. Across R2 (e14 → e18): Vth 6.00 V,
// Rth 666.7 Ω, In 9.00 mA (test/readings.test.js has the hand-computed
// numbers). /api/ask is stubbed; no real AI is called. Guest only.
const { test, expect } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openEditor(page, query = '') {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: 'ok', actions: [] } }));
  await page.goto('/circuit3d/index.html' + query);
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

// 9 V divider: BAT1.0 → tp_2 → a10, R1 1 kΩ a10–a14, R2 2 kΩ b14–b18,
// c18 → tn_18 ← BAT1.1. V(e14) = 6 V, V(e18) = 0 V.
async function buildDivider(page) {
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    const end  = s => { const h = hole(s); return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null }; };
    const wireHoles = (a, b) => { App.state.wireStart = end(a); App.finishWire(end(b)); };
    const wireBat = (k, b) => {
      const bat = App.state.components.find(c => c.type === 'battery');
      const pm  = bat.pinMeshes[k];
      App.state.wireStart = { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
      App.finishWire(end(b));
    };

    App.placePart('battery', { x: 13, z: 0 });
    wireBat(0, 'tp_2');
    wireBat(1, 'tn_18');
    App.placePart('resistor', [hole('a10'), hole('a14')], { resistance: 1000 });
    App.placePart('resistor', [hole('b14'), hole('b18')], { resistance: 2000 });
    wireHoles('tp_10', 'c10');
    wireHoles('c18', 'tn_18');
  });
}

// Screen point of a world point.
function toScreen(page, world) {
  return page.evaluate(({ x, y, z }) => {
    const p = new THREE.Vector3(x, y, z);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, world);
}

// A board hole, "e14" → { col: 13, row: 'e' }.
async function clickHole(page, name) {
  const world = await page.evaluate(s => {
    const { col, row } = App.parseHole(s);
    const w = App.state.breadboard.getHole(col, row).world;
    return { x: w.x, y: w.y, z: w.z };
  }, name);
  const at = await toScreen(page, world);
  await page.mouse.click(at.x, at.y);
}

test('Thévenin across R2 of the 9 V divider: pick e14 then e18 → 6.00 V, 666.7 Ω, 9.00 mA; Esc and Stop clear it', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await buildDivider(page);

  const btn  = page.locator('#thevenin-btn');
  const card = page.locator('#thevenin-card');
  const eq   = page.locator('#equation-card');

  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-stop-btn')).toBeVisible();

  // Pick mode: two hole clicks open the Thévenin card, not the equation card.
  await expect(btn, 'the Thévenin button is on the toolbar while simulating').toBeVisible();
  await btn.click();
  await clickHole(page, 'e14');
  await expect(eq, 'a pick does not open the equation card').toBeHidden();
  await expect(card, 'one hole picked: no card yet').toBeHidden();
  await clickHole(page, 'e18');
  await expect(card, 'two holes picked: the Thévenin card opens').toBeVisible();
  await expect(eq, 'the second pick does not open the equation card').toBeHidden();
  await expect(card).toContainText('6.00 V');
  await expect(card).toContainText('666.7 Ω');
  await expect(card).toContainText('9.00 mA');

  await page.keyboard.press('Escape');
  await expect(card, 'Esc closes the card').toBeHidden();

  // Esc in the middle of a pick cancels pick mode: the next hole click is
  // an ordinary one again and opens the equation card.
  await btn.click();
  await clickHole(page, 'e14');
  await page.keyboard.press('Escape');
  await clickHole(page, 'e18');
  await expect(card, 'pick mode was cancelled: no Thévenin card').toBeHidden();
  await expect(eq, 'after Esc a hole click opens the equation card again').toBeVisible();
  await page.keyboard.press('Escape');
  await expect(eq).toBeHidden();

  // Stop clears the card.
  await btn.click();
  await clickHole(page, 'e14');
  await clickHole(page, 'e18');
  await expect(card).toBeVisible();
  await page.locator('#sim-stop-btn').click();
  await expect(card, 'Stop closes the card').toBeHidden();

  expect(errors).toEqual([]);
});

// e14's colour as rendered: material colour × instance colour (as
// voltage-colouring.spec.js reads it). Before the first Run the board has
// no instance colours, so this is the plain hole colour.
function holeColour(page, name) {
  return page.evaluate(n => {
    const bb = App.state.breadboard, hm = bb.holesMesh;
    const { col, row } = App.parseHole(n);
    const c = hm.material.color.clone();
    if (hm.instanceColor) {
      const t = new THREE.Color();
      hm.getColorAt(bb.getHole(col, row).idx, t);
      c.multiply(t);
    }
    return { r: c.r, g: c.g, b: c.b };
  }, name);
}

// The pick mark, tools/thevenin.js MARK (0xff8c00).
const markColour = page => page.evaluate(() => { const c = new THREE.Color(0xff8c00); return { r: c.r, g: c.g, b: c.b }; });
const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

test('a picked hole shows the orange mark; Esc puts its voltage tint back, Stop the plain colour', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await buildDivider(page);
  const plain = await holeColour(page, 'e14');
  const mark  = await markColour(page);

  await page.locator('#sim-run-btn').click();
  await expect.poll(async () => dist(await holeColour(page, 'e14'), plain),
    { message: 'e14 (6 V) is tinted once simulating' }).toBeGreaterThan(0.05);
  const tint = await holeColour(page, 'e14');

  await page.locator('#thevenin-btn').click();
  await clickHole(page, 'e14');
  await clickHole(page, 'e18');
  await expect(page.locator('#thevenin-card')).toBeVisible();
  const picked = await holeColour(page, 'e14');
  expect(dist(picked, mark), `picked e14 is the orange mark; got ${JSON.stringify(picked)}`).toBeLessThan(0.01);
  expect(dist(picked, tint), 'the mark differs from its voltage tint').toBeGreaterThan(0.05);

  await page.keyboard.press('Escape');
  const back = await holeColour(page, 'e14');
  expect(dist(back, tint), `after Esc e14 is its voltage tint again; got ${JSON.stringify(back)}, tint ${JSON.stringify(tint)}`).toBeLessThan(0.01);

  await page.locator('#sim-stop-btn').click();
  const stopped = await holeColour(page, 'e14');
  expect(dist(stopped, plain), `after Stop e14 is plain; got ${JSON.stringify(stopped)}, plain ${JSON.stringify(plain)}`).toBeLessThan(0.01);

  expect(errors).toEqual([]);
});

// The stuck tint: the mark saves e14's voltage tint under it. Colours off
// then puts every hole it tinted back to plain except e14, which is still
// our mark; Esc then restores the saved tint, which colouring no longer
// owns, so Stop leaves e14 tinted on a plain board.
test('pick, Colours off, Esc, Stop: the picked hole ends plain, not stuck on its voltage tint', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await buildDivider(page);
  const plain = await holeColour(page, 'e14');

  await page.locator('#sim-run-btn').click();
  await expect.poll(async () => dist(await holeColour(page, 'e14'), plain),
    { message: 'e14 (6 V) is tinted once simulating' }).toBeGreaterThan(0.05);

  await page.locator('#thevenin-btn').click();
  await clickHole(page, 'e14');
  await clickHole(page, 'e18');
  await expect(page.locator('#thevenin-card')).toBeVisible();

  await page.locator('#colouring-toggle').click();
  await expect(page.locator('#colouring-toggle')).toHaveText('Colours off');
  await page.keyboard.press('Escape');
  await expect(page.locator('#thevenin-card')).toBeHidden();
  await page.locator('#sim-stop-btn').click();
  await expect(page.locator('#sim-stop-btn')).toBeHidden();

  const after = await holeColour(page, 'e14');
  expect(dist(after, plain), `after Stop e14 is plain; got ${JSON.stringify(after)}, plain ${JSON.stringify(plain)}`).toBeLessThan(0.01);

  expect(errors).toEqual([]);
});

// Issue #196: Thévenin shows that it's waiting for picks. On the click the
// button is pressed (aria-pressed="true", and it looks different), the hint
// asks for the first hole and names Esc, and the canvas cursor is a
// crosshair; after one hole the hint asks for the second. The card, Esc
// mid-pick, or a second click on the button ends the pick: unpressed, no
// pick hint, no crosshair. Both UIs; the pick code is shared, the pressed
// look is per UI (tools.css, edison-hud.css).
const PICK_HINT = /click the (first|second) hole/i;
const hintText  = page => page.locator('#hint-text');
const canvasCursor = page => page.evaluate(() => getComputedStyle(App.renderer.domElement).cursor);
// The hint as the user sees it: '' when the box is hidden.
const shownHint = page => page.evaluate(() =>
  document.getElementById('hint-box').classList.contains('hint-hidden') ? '' : document.getElementById('hint-text').textContent);
const look = loc => loc.evaluate(el => {
  const s = getComputedStyle(el);
  return [s.color, s.backgroundColor, s.borderColor, s.boxShadow, s.outlineStyle].join(' | ');
});

for (const ui of ['classic', 'edison']) {
  test(`${ui}: Thévenin shows it's waiting: pressed button, first- then second-hole hint, crosshair; the card, Esc and a second click unpress it`, async ({ page }) => {
    const errors = watchErrors(page);
    await openEditor(page, `?ui=${ui}`);
    await buildDivider(page);

    const btn  = page.locator('#thevenin-btn');
    const card = page.locator('#thevenin-card');
    const eq   = page.locator('#equation-card');

    await page.locator('#sim-run-btn').click();
    await expect(btn).toBeVisible();

    // The click: pressed, the first-hole hint naming Esc, a crosshair.
    await btn.click();
    await expect(btn, 'the click presses the Thévenin button').toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#hint-box'), 'the hint shows').not.toHaveClass(/hint-hidden/);
    await expect(hintText(page), 'the hint asks for the first hole').toHaveText(/click the first hole/i);
    await expect(hintText(page), 'the hint says Esc cancels').toHaveText(/esc/i);
    expect(await canvasCursor(page), 'the canvas cursor is a crosshair while picking').toBe('crosshair');

    // One hole: the second-hole hint; still pressed, still a crosshair.
    await clickHole(page, 'e14');
    await expect(hintText(page), 'one hole picked: the hint asks for the second').toHaveText(/click the second hole/i);
    await expect(page.locator('#hint-box')).not.toHaveClass(/hint-hidden/);
    await expect(btn, 'still pressed after one hole').toHaveAttribute('aria-pressed', 'true');
    expect(await canvasCursor(page), 'still a crosshair after one hole').toBe('crosshair');
    const pressedLook = await look(btn);   // the mouse is on the canvas, not hovering the button

    // The second hole: the card, the button unpressed, no pick hint, no crosshair.
    await clickHole(page, 'e18');
    await expect(card, 'two holes picked: the card shows').toBeVisible();
    await expect(btn, 'the card shows: the button is unpressed').toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => shownHint(page), { message: 'the card shows: the hint no longer asks for a hole' }).not.toMatch(PICK_HINT);
    expect(await canvasCursor(page), 'the card shows: the cursor is back').not.toBe('crosshair');
    const unpressedLook = await look(btn);
    expect(pressedLook, `the pressed button looks different from the unpressed one (${unpressedLook})`).not.toBe(unpressedLook);
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();

    // Esc mid-pick cancels.
    await btn.click();
    await clickHole(page, 'e14');
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(btn, 'Esc mid-pick unpresses the button').toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => shownHint(page), { message: 'Esc mid-pick: the hint no longer asks for a hole' }).not.toMatch(PICK_HINT);
    expect(await canvasCursor(page), 'Esc mid-pick: the cursor is back').not.toBe('crosshair');

    // A second click on the button while picking cancels: the next hole
    // click is an ordinary one and opens the equation card.
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await btn.click();
    await expect(btn, 'a second click unpresses the button').toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => shownHint(page), { message: 'a second click: the hint no longer asks for a hole' }).not.toMatch(PICK_HINT);
    expect(await canvasCursor(page), 'a second click: the cursor is back').not.toBe('crosshair');
    await clickHole(page, 'e18');
    await expect(card, 'the pick was cancelled: no Thévenin card').toBeHidden();
    await expect(eq, 'after the toggle a hole click opens the equation card again').toBeVisible();

    expect(errors).toEqual([]);
  });
}
