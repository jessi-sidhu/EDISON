// Edison (?ui=edison), issue #201: the inspector sits in the canvas frame, not
// over the chat, and a result callout never points off the canvas.
// - Selecting a part opened #inspector at the top of the chat column
//   (#sparky-panel), over the conversation. It now sits inside the canvas, at
//   its right edge under Clear All, clear of the chat and the frame's buttons,
//   and still edits the part.
// - Zoomed in on the lit demo LED, the battery and the button leave the view,
//   and their callouts kept a leader to a ring pinned on the canvas edge: a
//   line running off the screen to nothing. Now a callout whose part is off
//   the canvas (or behind the camera) hides, so every callout shown has its
//   box and leader inside the canvas and its dot on its own part.
// The layout's "a box that can't fit hides" is test/result-callouts.test.js.
// Classic keeps the inspector in the chat column (skin.js only runs in
// Edison); e2e/inspector.spec.js covers its behaviour there.
// /api/ask is stubbed and never called. Guest only; sign-in is a manual QA case.
//
// The page the builder matches (existing hooks only):
// - #inspector: visible while a part is selected; in Edison its box lies
//   inside #canvas and intersects neither #sparky-panel (the chat column),
//   #clear-all-btn nor #reset-cam-btn.
// - .result-callout[data-label]: a callout's block, hidden (or not rendered)
//   when its part is off the canvas.
// - .result-callout-dot[data-label]: its dot; the centre sits on the part's
//   anchor, its group's top centre projected through App.camera.
// - .result-callout-leader: an SVG polyline (points in #result-callouts'
//   px); every displayed one lies inside the canvas.
//
// The board: demo.sparky (BAT1, R1, LED1, SW1 on the LED's return path), as
// File → Open loads it (App.loadCircuitData). Pressing SW1's cap while
// running lights LED1 at 14.9 mA (e2e/button.spec.js).
const fs   = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 1440, height: 900 } });   // the laptop the demo runs on

const DEMO = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'demo.sparky'), 'utf8'));
const NEAR = 15;     // px, a callout's dot to its part's projected anchor
const ZOOM = 2.5;    // the camera's distance to LED1 (OrbitControls' minDistance is 2)

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openDemo(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html?ui=edison');
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.breadboard);
  await page.evaluate(d => App.loadCircuitData(d), DEMO);
  await expect.poll(() => page.evaluate(() => App.state.components.map(c => c.label).sort()),
    { message: 'demo.sparky loads BAT1, LED1, R1 and SW1' }).toEqual(['BAT1', 'LED1', 'R1', 'SW1']);
}

// Render on demand (#109): world matrices are current only once a frame has drawn.
async function drawn(page) {
  const before = await page.evaluate(() => { App.requestRender(); return App.renderer.info.render.frame; });
  await page.waitForFunction(f => App.renderer.info.render.frame > f, before);
}

// A point of a part's model on screen: its box centre, or (top) its top centre.
function partPoint(page, label, top = false) {
  return page.evaluate(([l, top]) => {
    const c = App.state.components.find(x => x.label === l);
    const box = new THREE.Box3().setFromObject(c.group);
    const p = box.getCenter(new THREE.Vector3());
    if (top) p.y = box.max.y;
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, [label, top]);
}

const rectOf = (page, sel) => page.locator(sel).evaluate(el => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
});
const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const within = (a, c) => a.left >= c.left - 0.5 && a.top >= c.top - 0.5 && a.right <= c.right + 0.5 && a.bottom <= c.bottom + 0.5;
const fmt = r => `(${Math.round(r.left)}, ${Math.round(r.top)})-(${Math.round(r.right)}, ${Math.round(r.bottom)})`;

test('Edison: a selected part\'s inspector opens inside the canvas frame, clear of the chat and the frame\'s buttons, and still edits the part', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  await drawn(page);

  const at = await partPoint(page, 'R1');
  await page.mouse.click(at.x, at.y);
  const inspector = page.locator('#inspector');
  await expect(inspector, 'clicking R1 opens the inspector').toBeVisible();
  await expect(page.locator('#inspector-label'), 'on R1').toHaveText('R1');

  const box    = await rectOf(page, '#inspector');
  const chat   = await rectOf(page, '#sparky-panel');
  const canvas = await rectOf(page, '#canvas');
  expect(meets(box, chat), `the inspector ${fmt(box)} doesn't cover the chat column ${fmt(chat)}`).toBe(false);
  expect(within(box, canvas), `the inspector ${fmt(box)} sits inside the canvas ${fmt(canvas)}`).toBe(true);
  for (const id of ['#clear-all-btn', '#reset-cam-btn']) {
    const b = await rectOf(page, id);
    expect(meets(box, b), `the inspector ${fmt(box)} is clear of ${id} ${fmt(b)}`).toBe(false);
  }

  // It still edits the part from its new place: R1's resistance, Enter commits.
  const input = page.locator('#inspector .inspector-row[data-key="resistance"] input');
  await input.fill('1000');
  await input.press('Enter');
  await expect.poll(() => page.evaluate(() => App.state.components.find(c => c.label === 'R1').values.resistance),
    { message: 'R1 is 1 kΩ after the edit' }).toBe(1000);
  await expect(inspector, 'the inspector stays on R1').toBeVisible();
  expect(errors).toEqual([]);
});

test('Edison, zoomed in on the lit demo LED: every callout shown has its box and leader inside the canvas and its dot on its own part; a part off the canvas shows none', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  await page.locator('#sim-run-btn').click();
  await drawn(page);
  const cap = await partPoint(page, 'SW1', true);
  await page.mouse.click(cap.x, cap.y);
  const led = page.locator('.result-callout[data-label="LED1"]');
  await expect(led, 'pressing SW1 lights LED1: its callout reads 14.9 mA').toContainText('14.9 mA');

  // The camera close onto LED1, along the current view direction.
  await page.evaluate(d => {
    const c = App.state.components.find(x => x.label === 'LED1');
    const centre = new THREE.Box3().setFromObject(c.group).getCenter(new THREE.Vector3());
    const dir = App.camera.position.clone().sub(App.controls.target).normalize();
    App.controls.target.copy(centre);
    App.camera.position.copy(centre).add(dir.multiplyScalar(d));
    App.controls.update();
    App.requestRender();
  }, ZOOM);
  await drawn(page);

  const state = () => page.evaluate(() => {
    const cr = App.renderer.domElement.getBoundingClientRect();
    const or = document.getElementById('result-callouts').getBoundingClientRect();
    const canvas = { left: cr.left, top: cr.top, right: cr.right, bottom: cr.bottom };
    const anchorOf = label => {
      const c = App.state.components.find(x => x.label === label);
      const box = new THREE.Box3().setFromObject(c.group);
      const p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
      const ahead = p.clone().applyMatrix4(App.camera.matrixWorldInverse).z < 0;
      p.project(App.camera);
      const x = cr.left + (p.x + 1) / 2 * cr.width, y = cr.top + (1 - p.y) / 2 * cr.height;
      return { x, y, on: ahead && x >= cr.left && x <= cr.right && y >= cr.top && y <= cr.bottom };
    };
    App.camera.updateMatrixWorld();
    const shown = [...document.querySelectorAll('.result-callout')].filter(b => !b.hidden && b.getClientRects().length)
      .map(b => {
        const r = b.getBoundingClientRect();
        const d = document.querySelector(`.result-callout-dot[data-label="${b.dataset.label}"]`);
        const dr = d && getComputedStyle(d).display !== 'none' ? d.getBoundingClientRect() : null;
        return { label: b.dataset.label, box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
                 dot: dr ? { x: dr.left + dr.width / 2, y: dr.top + dr.height / 2 } : null, anchor: anchorOf(b.dataset.label) };
      });
    const leaders = [...document.querySelectorAll('.result-callout-leader')].filter(l => getComputedStyle(l).display !== 'none')
      .map(l => (l.getAttribute('points') || '').trim().split(/\s+/).filter(Boolean)
        .map(pt => pt.split(',').map(Number)).map(([x, y]) => ({ x: or.left + x, y: or.top + y })));
    const off = App.state.components.map(c => c.label).filter(l => !anchorOf(l).on);
    return { canvas, shown, leaders, off };
  });

  let s = null;
  await expect.poll(async () => { s = await state(); return s.shown.map(c => c.label); },
    { message: 'LED1\'s callout still shows: LED1 is on the canvas', timeout: 3000 }).toContain('LED1');
  expect(s.off.length, `zoomed in, some part is off the canvas (off: ${JSON.stringify(s.off)})`).toBeGreaterThan(0);

  const inside = p => p.x >= s.canvas.left - 0.5 && p.x <= s.canvas.right + 0.5 && p.y >= s.canvas.top - 0.5 && p.y <= s.canvas.bottom + 0.5;
  for (const c of s.shown) {
    expect(within(c.box, s.canvas), `${c.label}'s callout box ${fmt(c.box)} is inside the canvas ${fmt(s.canvas)}`).toBe(true);
    expect(c.anchor.on, `${c.label}'s callout shows only while ${c.label} is on the canvas (its anchor at ` +
      `(${Math.round(c.anchor.x)}, ${Math.round(c.anchor.y)}))`).toBe(true);
    expect(c.dot, `${c.label}'s callout has its dot`).not.toBeNull();
    const gap = Math.hypot(c.dot.x - c.anchor.x, c.dot.y - c.anchor.y);
    expect(gap, `${c.label}'s dot (${Math.round(c.dot.x)}, ${Math.round(c.dot.y)}) is on ${c.label}, not on the canvas edge`).toBeLessThanOrEqual(NEAR);
  }
  for (const label of s.off) {
    expect(s.shown.map(c => c.label), `${label} is off the canvas, so its callout hides`).not.toContain(label);
  }
  expect(s.leaders.length, 'one leader per callout shown').toBe(s.shown.length);
  for (const pts of s.leaders) {
    for (const p of pts) expect(inside(p), `leader point (${Math.round(p.x)}, ${Math.round(p.y)}) is inside the canvas ${fmt(s.canvas)}`).toBe(true);
  }
  expect(errors).toEqual([]);
});
