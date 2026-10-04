// Voltage colouring and the hover card, issue #91. While simulating, every
// hole of a connected net is tinted blue → red by its voltage (lowest to
// highest on the board), floating holes stay plain, and Stop restores the
// plain board. Hovering a part shows V · I · P; hovering a hole shows its
// voltage. A toggle (#colouring-toggle) turns the tint off. The card is
// #hover-card.
//
// Checked on the "Try it out" demo (demo.sparky), button pressed by clicking
// its cap on the canvas like button.spec.js. Its numbers, from the solver:
// tp_* 9 V, tn_* 0 V, R1–LED1 midpoint column 7 (d7) 2.0 V; R1 6.998 V,
// 14.890 mA, 104.2 mW. a30 is an empty column, floating.
//
// A hole's colour is read the way the renderer combines it: the holes
// material colour times the instance colour when the mesh has one. That
// accepts either mechanism (instanceColor reset, or removed) for "plain".
// /api/ask is stubbed and never called. Guest only.
const { test, expect } = require('@playwright/test');

const PLUS = 'tp_8';     // + rail, 9 V
const GROUND = 'tn_8';   // − rail, 0 V
const MID = 'd7';        // R1 / LED1 midpoint column, about 2 V
const FLOAT = 'a30';     // empty column, nothing connected
const HOLES = [PLUS, GROUND, MID, FLOAT];

const simLines = page => page.locator('#sim-results .sim-line').allTextContents();

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openDemo(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/landing.html');
  await page.getByRole('button', { name: /Try it out/ }).click();
  await page.waitForURL('**/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.components.length === 4);
}

// Screen point of a world position on the canvas.
function toScreen(page, kind, arg) {
  return page.evaluate(([kind, arg]) => {
    let p;
    if (kind === 'hole') {
      const { col, row } = App.parseHole(arg);
      p = App.state.breadboard.getHole(col, row).world.clone();
    } else {
      // Top centre of the part's model, like button.spec.js's capPoint.
      const c = App.state.components.find(x => x.type === arg);
      const box = new THREE.Box3().setFromObject(c.group);
      p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    }
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, [kind, arg]);
}

async function pressButton(page) {
  const at = await toScreen(page, 'part', 'button');
  await page.mouse.click(at.x, at.y);
  await expect.poll(async () => (await simLines(page)).join(' | '), { message: 'the LED lights once the button is pressed' })
    .toContain('LED ON  (14.9 mA)');
}

async function hover(page, kind, arg) {
  const at = await toScreen(page, kind, arg);
  await page.mouse.move(at.x - 20, at.y - 20);
  await page.mouse.move(at.x, at.y, { steps: 5 });
}

// { name: { r, g, b } } as rendered: material colour × instance colour.
function holeColours(page) {
  return page.evaluate(names => {
    const bb = App.state.breadboard, hm = bb.holesMesh;
    const out = {};
    for (const n of names) {
      const { col, row } = App.parseHole(n);
      const h = bb.getHole(col, row);
      const c = hm.material.color.clone();
      if (hm.instanceColor) {
        const t = new THREE.Color();
        hm.getColorAt(h.idx, t);
        c.multiply(t);
      }
      out[n] = { r: c.r, g: c.g, b: c.b };
    }
    return out;
  }, HOLES);
}

const redFraction = c => c.r / (c.r + c.b || 1);
const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
const same = (a, b) => dist(a, b) < 0.01;

test('Run + press tints + rail red, ground blue, midpoint between, floating plain; Stop restores the plain board', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  const plain = await holeColours(page);

  await page.locator('#sim-run-btn').click();
  await pressButton(page);

  await expect.poll(async () => {
    const c = await holeColours(page);
    return dist(c[PLUS], plain[PLUS]);
  }, { message: `${PLUS} (9 V) is visibly tinted once simulating` }).toBeGreaterThan(0.1);

  const c = await holeColours(page);
  const rf = n => redFraction(c[n]);
  expect(rf(PLUS), `${PLUS} (highest voltage) is red: r > b, got ${JSON.stringify(c[PLUS])}`).toBeGreaterThan(0.75);
  expect(rf(GROUND), `${GROUND} (0 V) is blue: b > r, got ${JSON.stringify(c[GROUND])}`).toBeLessThan(0.25);
  expect(dist(c[GROUND], plain[GROUND]), `${GROUND} is visibly tinted`).toBeGreaterThan(0.1);
  expect(rf(MID), `${MID} (about 2 V) sits between ground and + rail`).toBeGreaterThan(rf(GROUND));
  expect(rf(MID)).toBeLessThan(rf(PLUS));
  expect(same(c[FLOAT], plain[FLOAT]), `${FLOAT} is floating and stays plain, got ${JSON.stringify(c[FLOAT])}`).toBe(true);

  await page.locator('#sim-stop-btn').click();
  await expect.poll(async () => {
    const after = await holeColours(page);
    return HOLES.filter(n => !same(after[n], plain[n]));
  }, { message: 'Stop restores every hole to its plain colour' }).toEqual([]);

  expect(errors).toEqual([]);
});

test('hover card: the resistor shows 7.0 V · 14.9 mA · 104 mW, a + rail hole 9.0 V; no card when not simulating', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  const card = page.locator('#hover-card');

  // Not simulating: no card over the resistor.
  await hover(page, 'part', 'resistor');
  await expect(card).toBeHidden();

  await page.locator('#sim-run-btn').click();
  await pressButton(page);

  await hover(page, 'part', 'resistor');
  await expect(card, 'hovering R1 while simulating shows the card').toBeVisible();
  await expect(card).toContainText('7.0 V');
  await expect(card).toContainText('14.9 mA');
  await expect(card).toContainText('104 mW');
  await expect(card, 'R1 is under its ¼ W rating').not.toContainText(/over its/i);

  await hover(page, 'hole', PLUS);
  await expect(card, `hovering ${PLUS} shows its voltage`).toBeVisible();
  await expect(card).toContainText('9.0 V');

  await page.locator('#sim-stop-btn').click();
  await hover(page, 'part', 'resistor');
  await expect(card, 'no card once stopped').toBeHidden();

  expect(errors).toEqual([]);
});

test('#colouring-toggle turns the tint off while simulating', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  const plain = await holeColours(page);

  await page.locator('#sim-run-btn').click();
  await pressButton(page);
  await expect.poll(async () => dist((await holeColours(page))[PLUS], plain[PLUS]),
    { message: 'tinted before the toggle' }).toBeGreaterThan(0.1);

  await page.locator('#colouring-toggle').click();
  await expect.poll(async () => {
    const after = await holeColours(page);
    return HOLES.filter(n => !same(after[n], plain[n]));
  }, { message: 'colouring off: every hole back to plain while still simulating' }).toEqual([]);
  expect((await simLines(page)).join(' | '), 'still simulating').toContain('LED ON  (14.9 mA)');

  expect(errors).toEqual([]);
});
