// The textbook spread, edison/textbook.html (issue #181): two pages, each with
// an op-amp figure, explorable values, a "Check yourself" box and a "Test in
// lab +" link that opens the editor with that circuit built and simulating.
// The maths, the figure markup and the circuits (each solving to its worked
// Vout, −5.0 V and +1.0 V) are test/textbook-figures.test.js; this is what
// needs a real page: the spread at demo size, the arrow key on a focused
// value, typing an answer, and the click through to the editor. No AI is
// called (/api/ask is stubbed anyway); no sign-in is involved.
//
// Shapes it assumes (the page as Aarmen approved it):
// - Each page is article[data-fig="inverting" | "non-inverting"], left then
//   right, with one figure (svg.tb-fig-svg) and one link named "Test in lab"
//   whose href is ../circuit3d/index.html?ui=edison&open=<figure> (more
//   params, such as run=1, are allowed).
// - The equation's R2 is a focusable .tb-scrub[data-var="r2"] in .tb-eq; the
//   gain is [data-show="gain"]; the worked line's Vout is [data-show="worked"]
//   ("−5.0 V out"). − is U+2212.
// - The check box is input[data-check] with its .tb-tick beside it.
// - "Test in lab +" starts Simulate on load: the results card (#sim-results)
//   gives the op-amp's output with no click on Simulate.
//
// Web fonts are served as empty CSS, so a blocked font can't log an error.
const { test, expect } = require('@playwright/test');
const fs   = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FIGS = { inverting: 'edison/figures/inverting.sparky', 'non-inverting': 'edison/figures/non-inverting.sparky' };

test.use({ viewport: { width: 1440, height: 900 } });

function watchErrors(context) {
  const errors = [];
  context.on('weberror', e => errors.push('pageerror: ' + e.error().message));
  context.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openSpread(page) {
  const context = page.context();
  await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ contentType: 'text/css', body: '' }));
  await context.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  const res = await page.goto('/edison/textbook.html');
  expect(res && res.status(), 'edison/textbook.html is served').toBe(200);
}

const pageOf  = (page, id) => page.locator(`article[data-fig="${id}"]`);
const labLink = (page, id) => pageOf(page, id).getByRole('link', { name: /^Test in lab/ });
const num     = s => Number(String(s).replace(/−/g, '-').replace(/[^\d.+-]/g, ''));

test('the spread shows two pages side by side with a figure and a Test in lab link each; ArrowRight on R2 raises the gain and the worked line follows; 20k gets a ✓', async ({ page }) => {
  const errors = watchErrors(page.context());
  await openSpread(page);

  // Two pages, side by side at 1440×900, each with its figure and its link.
  await expect(page.locator('article[data-fig]'), 'two pages').toHaveCount(2);
  const boxes = [];
  for (const id of Object.keys(FIGS)) {
    await expect(pageOf(page, id), `the ${id} page`).toBeVisible();
    await expect(pageOf(page, id).locator('svg.tb-fig-svg'), `the ${id} page has one figure`).toHaveCount(1);
    await expect(pageOf(page, id).locator('svg.tb-fig-svg')).toBeVisible();
    await expect(labLink(page, id), `the ${id} page has one "Test in lab +" link`).toHaveCount(1);
    const href = await labLink(page, id).evaluate(a => a.href);
    const u = new URL(href);
    expect(u.pathname, `${id}: Test in lab opens the editor`).toBe('/circuit3d/index.html');
    expect(u.searchParams.get('ui'), `${id}: in the Edison skin`).toBe('edison');
    expect(u.searchParams.get('open'), `${id}: with its circuit`).toBe(FIGS[id]);
    boxes.push(await pageOf(page, id).boundingBox());
  }
  expect(boxes[0].x + boxes[0].width, 'the left page ends before the right page starts').toBeLessThanOrEqual(boxes[1].x + 1);
  expect(Math.abs(boxes[0].y - boxes[1].y), 'the two pages share a top edge').toBeLessThan(2);

  // Left page: focus R2 in the equation, ArrowRight, and the gain and worked line move with it.
  const left   = pageOf(page, 'inverting');
  const r2     = left.locator('.tb-eq .tb-scrub[data-var="r2"]');
  const gain   = left.locator('[data-show="gain"]');
  const worked = left.locator('[data-show="worked"]');
  const gainBefore   = num(await gain.textContent());
  const workedBefore = (await worked.textContent()).trim();
  const vin = num(await left.locator('.tb-worked .tb-scrub[data-var="vin"]').textContent());
  await r2.focus();
  await expect(r2, 'R2 takes focus').toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Math.abs(num(await gain.textContent())), {
    message: `ArrowRight on R2 raises the gain magnitude from ${Math.abs(gainBefore)}`,
  }).toBeGreaterThan(Math.abs(gainBefore));
  await expect(worked, 'the worked line updates').not.toHaveText(workedBefore);
  const gainAfter = num(await gain.textContent());
  expect(num(await worked.textContent()), `the worked line reads Vin × gain = ${vin} × ${gainAfter}`).toBeCloseTo(vin * gainAfter, 1);

  // Right page: a right answer typed in the check gets a ✓.
  const right = pageOf(page, 'non-inverting');
  const input = right.locator('input[data-check]');
  await input.fill('20k');
  await expect(right.locator('.tb-tick'), 'typing 20k shows the ✓').toHaveText('✓');

  expect(errors).toEqual([]);
});

test('Test in lab + on the left page opens the editor with the inverting amp built and already simulating: the results card reads −5.00 V without pressing Simulate', async ({ page }) => {
  test.setTimeout(60_000);   // the editor loads the 3D scene
  const errors = watchErrors(page.context());
  await openSpread(page);

  const fig  = FIGS.inverting;
  const link = labLink(page, 'inverting');
  let editor = page;
  if ((await link.getAttribute('target')) === '_blank') [editor] = await Promise.all([page.waitForEvent('popup'), link.click()]);
  else await link.click();
  await editor.waitForURL(/\/circuit3d\/index\.html\?/);
  await editor.waitForFunction(() => window.App && App.renderer && App.state && App.state.breadboard);
  expect(new URL(editor.url()).searchParams.get('open')).toBe(fig);

  // The figure's own parts and wires, as saved.
  const file = JSON.parse(fs.readFileSync(path.join(ROOT, fig), 'utf8'));
  const want = file.components.map(c => c.label).sort();
  await expect.poll(() => editor.evaluate(() => App.state.components.map(c => c.label).sort()),
    { message: `?open=${fig} loads its parts` }).toEqual(want);
  expect(await editor.evaluate(() => App.state.wires.length), `${fig} wires`).toBe(file.wires.length);

  // Nothing is clicked: the simulation is already running and the results card gives op-amp 1's output.
  const results = () => editor.evaluate(() => {
    const box = document.getElementById('sim-results');
    return box && box.style.display !== 'none' ? box.textContent : '(no results card)';
  });
  await expect.poll(results, {
    message: 'the results card gives op-amp 1 at −5.00 V with no click on Simulate', timeout: 10_000,
  }).toMatch(/op-amp 1 [−-]5\.0\d? ?V/);
  expect(await editor.evaluate(() => App.simRunning === true), 'the simulation is running').toBe(true);

  expect(errors).toEqual([]);
});

// The page and the simulator agree: R2 dragged to 47 kΩ (four steps down
// from 100 kΩ: 82, 68, 56, 47) puts 47 kΩ in "Test in lab +", and the editor
// opens the figure with R2 at 47 kΩ, already running: Vout = −47/10 × 0.5 = −2.35 V.
// The bar above the book leads back to the course and the labs.
test('Test in lab + carries the page\'s values: R2 at 47 kΩ on the page opens the circuit with R2 at 47 kΩ, running; the bar leads to the course and both labs', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/edison/textbook.html');
  await expect(page.locator('.tb-bar a[href="course.html"]')).toBeVisible();
  await expect(page.locator('.tb-bar a[href*="lab=lab1"]')).toHaveCount(1);
  await expect(page.locator('.tb-bar a[href*="lab=lab2"]')).toHaveCount(1);
  await expect(page.locator('#p4 .tb-labref a[href*="lab=lab2"]'), 'page 4 points to Lab 2').toHaveCount(1);

  const r2 = page.locator('#p4 .tb-scrub[data-var="r2"]').first();
  await r2.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
  await expect(r2).toHaveText(/47\s*kΩ/);
  const link = page.locator('#p4 a.tb-lab');
  expect(await link.getAttribute('href')).toContain('R2.resistance:47000');

  await link.click();
  await page.waitForFunction(() => window.App && App.state && App.state.components.some(c => c.label === 'R2'));
  await expect.poll(() => page.evaluate(() => App.state.components.find(c => c.label === 'R2').values.resistance), { message: 'R2 is 47 kΩ in the simulator' }).toBe(47000);
  await expect.poll(() => page.evaluate(() => !!App.simRunning), { message: 'already running' }).toBe(true);
  await expect.poll(async () => page.evaluate(() => {
    const m = (document.getElementById('sim-results') || {}).textContent || '';
    return /−?2\.3[45]\s*V/.test(m.replace('-', '−'));
  }), { message: 'the results read about −2.35 V at the output', timeout: 20_000 }).toBe(true);
  expect(errors).toEqual([]);
});
