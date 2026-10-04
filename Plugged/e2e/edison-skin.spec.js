// The editor's Edison skin in the browser (issue #148; edison/DESIGN.md §4).
// The value-wrapping and label-finding rules are test/edison-skin.test.js;
// this spec is what needs a real page: the flag and theme on the real
// editor, the 3D scene colour, a reply's value on screen, the leader from
// that reply to LED1 in the 3D view, classic left untouched after a switch,
// and the landing page's ?ask= seam (the editor side, which lives in
// edison/skin.js).
// /api/ask is stubbed; no AI is called. Guest only; sign-in is a manual QA case.
//
// The page the builder matches:
// - circuit3d/index.html loads edison/ui-flag.js, fonts.css and tokens.css in
//   <head>, circuit3d/css/theme-edison.css, and edison/skin.js.
// - With ?ui=edison: <html data-ui="edison">, body font DM Mono (first family;
//   the Lab HUD chrome, issue #189, circuit3d/css/edison-hud.css) and the top
//   bar the HUD black #101010 (was Barlow on --pad before #189), the scene
//   background --bezel (#1e2225), and the 3D view reads as the dark bezel: the
//   default camera's far workbench (the top of the canvas, beige in classic)
//   is dark.
// - An AI reply's values are <span class="ed-num ed-val"> in DM Mono on the
//   Lab HUD's --ink (issue #192, edison-hud-chat.css; the dotted underline is
//   pinned in e2e/edison-hud-chat.spec.js); user messages are left alone.
// - A reply that names a part draws one .ed-leader: a straight line element
//   (a rotated 1 px div) whose bounding box's diagonal is the line,
//   from the reply bubble to the part's on-screen position. It follows the
//   part when the camera moves, and doesn't keep the 3D view drawing: with no
//   input the view goes quiet (render on demand, #109).
// - ?ask=<text> on load puts <text> in #sparky-input and sends it once through
//   the chat (the editor has no send button: Enter in #sparky-input, or
//   window.sparkyAsk, is how chat.js sends). chat.js doesn't change.
const { test, expect } = require('@playwright/test');

const HUD_BLACK      = 'rgb(16, 16, 16)';      // the Lab HUD's chrome, #101010 (issue #189)
const VALUE_INK      = 'rgb(244, 244, 244)';   // the Lab HUD's --ink, #F4F4F4 (issue #192)
const CLASSIC_TOPBAR = 'rgb(250, 249, 246)';   // classic --bg-topbar, #FAF9F6
const REPLY          = 'LED1 gets 14.9 mA';

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// Stub /api/ask with one reply and no actions; returns the messages sent.
async function stubAsk(page, reply) {
  const asked = [];
  await page.route('**/api/ask', route => {
    asked.push(JSON.parse(route.request().postData() || '{}').message);
    return route.fulfill({ json: { reply, actions: [] } });
  });
  return asked;
}

async function open(page, query) {
  await page.goto('/circuit3d/index.html' + query);
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

// Render on demand (#109): world matrices are current only once a frame has
// drawn them (copied from e2e/bench-supply-two-channel.spec.js, issue #131).
async function drawn(page) {
  const before = await page.evaluate(() => { App.requestRender(); return App.renderer.info.render.frame; });
  await page.waitForFunction(f => App.renderer.info.render.frame > f, before);
}

// What the user sees of the skin.
const look = page => page.evaluate(() => ({
  ui:     document.documentElement.dataset.ui,
  font:   getComputedStyle(document.body).fontFamily,
  scene:  App.scene.background.getHexString(),
  topbar: getComputedStyle(document.getElementById('topbar')).backgroundColor,
}));

// LED1 on c8 → c6, with the call Chat.acceptBuild's board makes, then framed
// as an AI build is.
async function placeLed(page) {
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('led', [hole('c8'), hole('c6')]);
    App.frameCircuit();
  });
  await drawn(page);
}

// Ask the way a person does: type in the chat box, press Enter, wait for the reply.
async function ask(page, text) {
  await page.locator('#sparky-input').fill(text);
  await page.locator('#sparky-input').press('Enter');
  await expect(page.locator('.chat-msg.ai')).toHaveCount(1);
}

// LED1's on-screen box (its group's 8 corners, projected), and the canvas's.
async function ledBox(page) {
  await drawn(page);
  return page.evaluate(() => {
    const c = App.state.components.find(p => p.label === 'LED1');
    const box = new THREE.Box3().setFromObject(c.group);
    App.camera.updateMatrixWorld();
    const r = App.renderer.domElement.getBoundingClientRect();
    const xs = [], ys = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x, y, z).project(App.camera);
      xs.push(r.left + (p.x + 1) / 2 * r.width);
      ys.push(r.top + (1 - p.y) / 2 * r.height);
    }
    return {
      led:    { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) },
      canvas: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
    };
  });
}

const rectOf = (page, sel) => page.locator(sel).evaluate(el => {
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
});

// Where the leader's ends are: one inside LED1's on-screen box, the other on
// the reply. A straight leader's two ends are opposite corners of its box.
async function leaderEnds(page) {
  const { led, canvas } = await ledBox(page);
  const line = await rectOf(page, '.ed-leader');
  const note = await rectOf(page, '.chat-msg.ai');
  const ends = [
    [{ x: line.left, y: line.top }, { x: line.right, y: line.bottom }],
    [{ x: line.right, y: line.bottom }, { x: line.left, y: line.top }],
    [{ x: line.left, y: line.bottom }, { x: line.right, y: line.top }],
    [{ x: line.right, y: line.top }, { x: line.left, y: line.bottom }],
  ];
  const onLed = ends.filter(([end]) => inside(end, led));
  return { led, canvas, line, note, onLed: onLed.length > 0, startOnNote: onLed.some(([, start]) => inside(start, note)) };
}

// Render on demand (#109), measured as e2e/render-on-demand.spec.js does:
// three.js (r128) adds one to App.renderer.info.render.frame per render().
// Quiet here is at most QUIET frames in QUIET_MS, and the view must reach such
// a window within a few seconds, so a busy machine doesn't fail it.
const QUIET = 4, QUIET_MS = 2000;
const frames = page => page.evaluate(() => App.renderer.info.render.frame);
async function framesOver(page, ms) {
  const before = await frames(page);
  await page.waitForTimeout(ms);
  return (await frames(page)) - before;
}

// The 3D view's pixels a few px below the top edge, centred, from the default
// camera: the far workbench (classic's beige ground plane). Rendered and read
// in one task, so the drawing buffer (no preserveDrawingBuffer) still holds
// the frame. The mean of a 5 x 3 block, [r, g, b].
const farBench = page => page.evaluate(() => {
  App.resetCamera();
  App.renderer.render(App.scene, App.camera);
  const gl = App.renderer.getContext();
  const w = 5, h = 3, px = new Uint8Array(w * h * 4);
  gl.readPixels(Math.floor(gl.drawingBufferWidth / 2) - 2, gl.drawingBufferHeight - 12, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const mean = [0, 0, 0];
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) mean[c] += px[i * 4 + c] / (w * h);
  return mean.map(Math.round);
});

const inside = (p, b, tol = 2) => p.x >= b.left - tol && p.x <= b.right + tol && p.y >= b.top - tol && p.y <= b.bottom + tol;
const fmt = b => `[${Math.round(b.left)}..${Math.round(b.right)}] x [${Math.round(b.top)}..${Math.round(b.bottom)}]`;

test('?ui=edison: HUD chrome, bezel scene, and a reply\'s value highlighted with a leader to LED1', async ({ page }) => {
  test.setTimeout(60_000);   // the quiet poll and the camera move on top of the flow
  const errors = watchErrors(page);
  await stubAsk(page, REPLY);
  await open(page, '?ui=edison');

  const l = await look(page);
  expect(l.ui, '<html data-ui>').toBe('edison');
  // The Lab HUD (#189): DM Mono first, on a black top bar. Soft, like the
  // checks below: a chrome miss still lets the leader checks run and report.
  expect.soft(l.font.split(',')[0].trim().replace(/^["']|["']$/g, ''), `body font's first family (computed: ${l.font})`).toBe('DM Mono');
  expect(l.scene, 'scene background (--bezel)').toBe('1e2225');
  expect.soft(l.topbar, 'top bar background (the HUD black)').toBe(HUD_BLACK);
  // The viewport reads as the bezel: what the default camera shows at the top
  // of the canvas (classic's beige workbench, see the classic test) is dark.
  // Soft, like the value's font below: a style miss still lets the leader and
  // render-on-demand checks run and report.
  const bench = await farBench(page);
  expect.soft(bench.every(c => c < 70), `the top of the 3D view is dark in Edison, got rgb(${bench})`).toBe(true);

  await placeLed(page);
  await ask(page, 'How much current does LED1 get at 9 V?');

  // The value, in DM Mono on the Lab HUD's --ink (issue #192, hud.css), in
  // Edison's reply only.
  const value = page.locator('.chat-msg.ai .ed-val');
  await expect(value).toHaveText(['14.9 mA']);
  const style = await value.evaluate(el => ({ font: getComputedStyle(el).fontFamily, color: getComputedStyle(el).color }));
  const firstFamily = style.font.split(',')[0].trim().replace(/^["']|["']$/g, '');
  expect.soft(firstFamily, `the value's first font family (computed: ${style.font})`).toBe('DM Mono');
  expect(style.color, 'the value\'s colour (the HUD\'s --ink)').toBe(VALUE_INK);
  await expect(page.locator('.chat-msg.user .ed-val'), 'the user\'s "9 V" is not highlighted').toHaveCount(0);

  // One leader, from the reply to LED1 in the 3D view.
  const leader = page.locator('.ed-leader');
  await expect(leader).toHaveCount(1);
  await expect(leader).toBeVisible();
  const { led, canvas, line, note, onLed, startOnNote } = await leaderEnds(page);
  const ledCentre = { x: (led.left + led.right) / 2, y: (led.top + led.bottom) / 2 };
  expect(inside(ledCentre, canvas, 0), `LED1 ${fmt(led)} is in the canvas ${fmt(canvas)}`).toBe(true);
  expect(onLed, `an end of the leader ${fmt(line)} lies inside LED1's on-screen box ${fmt(led)}`).toBe(true);
  expect(startOnNote, `its other end lies on the reply ${fmt(note)} (leader ${fmt(line)})`).toBe(true);

  // Render on demand (#109): with the leader shown and no input, the 3D view
  // goes quiet. A leader re-placed every animation frame keeps it drawing.
  await expect.poll(() => framesOver(page, QUIET_MS), {
    message: `with a leader shown and no input, the 3D view goes quiet (allowed: ${QUIET} frames in ${QUIET_MS} ms)`,
    timeout: 10_000, intervals: [250],
  }).toBeLessThanOrEqual(QUIET);

  // The camera moves (orbit 35 deg, 25 % closer, aimed off LED1 so it slides
  // across the view): within 1 s the leader still ends on LED1.
  await page.evaluate(() => {
    const c = App.state.components.find(p => p.label === 'LED1');
    const centre = new THREE.Box3().setFromObject(c.group).getCenter(new THREE.Vector3());
    const offset = App.camera.position.clone().sub(App.controls.target)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), 35 * Math.PI / 180).multiplyScalar(0.75);
    const target = centre.clone().add(new THREE.Vector3(1, 0, 0));
    App.controls.target.copy(target);
    App.camera.position.copy(target).add(offset);
    App.controls.update();
    App.requestRender();
  });
  const moved = (await ledBox(page)).led;
  const shift = Math.hypot((moved.left + moved.right) / 2 - ledCentre.x, (moved.top + moved.bottom) / 2 - ledCentre.y);
  expect(shift, `LED1 moved on screen (${fmt(led)} -> ${fmt(moved)})`).toBeGreaterThan(40);
  let after = null;
  await expect.poll(async () => { after = await leaderEnds(page); return after.onLed; }, {
    message: 'after the camera moves, an end of the leader lies inside LED1\'s new on-screen box',
    timeout: 1000, intervals: [100],
  }).toBe(true);
  expect(after.startOnNote, `its other end still lies on the reply ${fmt(after.note)} (leader ${fmt(after.line)})`).toBe(true);

  expect(errors).toEqual([]);
});

// A session that was Edison and switches to classic shows
// today's classic UI, and the skin does nothing to a reply there.
test('switching to ?ui=classic in the same session leaves no Edison style behind', async ({ page }) => {
  const errors = watchErrors(page);
  await stubAsk(page, REPLY);
  await open(page, '?ui=edison');
  expect((await look(page)).ui, 'the session starts in Edison').toBe('edison');

  await open(page, '?ui=classic');
  const l = await look(page);
  expect(l.ui, '<html data-ui>').toBe('classic');
  expect(l.topbar, 'classic top bar background').toBe(CLASSIC_TOPBAR);
  expect(l.scene, 'classic scene background').toBe('dcdad4');
  expect(l.font, 'classic body font').not.toContain('Barlow');
  // Pin (passes today): classic's far workbench stays the light beige ground,
  // the same pixels the Edison test needs dark.
  const bench = await farBench(page);
  expect(bench.every(c => c > 150), `the top of the 3D view is light in classic, got rgb(${bench})`).toBe(true);

  await placeLed(page);
  await ask(page, 'How much current does LED1 get?');
  await expect(page.locator('.chat-msg.ai')).toHaveText(REPLY);
  await expect(page.locator('.ed-val'), 'no value highlighting in classic').toHaveCount(0);
  await expect(page.locator('.ed-leader'), 'no leaders in classic').toHaveCount(0);

  expect(errors).toEqual([]);
});

// The landing page's prompt box opens the editor with ?ask=; the editor
// side is edison/skin.js.
test('?ask= on load puts the request in the chat and sends it exactly once', async ({ page }) => {
  const errors = watchErrors(page);
  const asked = await stubAsk(page, 'Here is an LED circuit.');
  await open(page, '?ui=edison&ask=Build%20me%20an%20LED');

  await expect.poll(() => [...asked], { message: 'the messages sent to /api/ask' }).toEqual(['Build me an LED']);
  await expect(page.locator('.chat-msg.user'), 'the request shows as the user\'s message').toHaveText(['Build me an LED']);
  await expect(page.locator('.chat-msg.ai')).toHaveText(['Here is an LED circuit.']);
  await page.waitForTimeout(1000);   // a second send would have gone out by now
  expect(asked, 'exactly one request').toEqual(['Build me an LED']);

  expect(errors).toEqual([]);
});
