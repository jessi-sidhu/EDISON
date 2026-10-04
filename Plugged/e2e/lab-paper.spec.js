// The lab paper (Edison): Lab 2's sheet as a paper pulled from the board's
// left edge, with its lab manual around the steps. Approved mock, 2026-10-03.
// What needs a real page: the paper docked beside the canvas (it pushes the
// board, never covers it), the parts folding to their icons while it is out,
// a real pointer drag on the grip tucking it, the next-step card bringing it
// back, and the manual filled live from a real Run. The width rule
// (Labs.paperWidth) and the data maths (LabSheets.readData, checkAnswer) are
// test/lab-sheets.test.js. /api/ask is stubbed and never called.
const { test, expect } = require('@playwright/test');
const { lab2FinishAll } = require('../test/fixtures/lab2-finish.js');

test.use({ viewport: { width: 1440, height: 900 } });   // the laptop the demo runs on

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openLab(page, id) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto(`/circuit3d/index.html?lab=${id}&ui=edison`);
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.breadboard);
  await expect(page.locator('#lab-sheet')).toBeVisible();
}

const box = (page, sel) => page.locator(sel).evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; });

// Parts and wires through App.placePart / App.finishWire (as e2e/lab-sheet.spec.js).
function addToBoard(page, finish) {
  return page.evaluate(({ parts, wires }) => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    const endAt = s => {
      const m = /^([A-Z]+\d+)\.(\d+)$/.exec(s);
      if (m) {
        const pm = App.state.components.find(c => c.label === m[1]).pinMeshes[Number(m[2])];
        return { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
      }
      const h = hole(s);
      return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null };
    };
    for (const p of parts) App.placePart(p.type, p.holes.map(hole), p.values);
    for (const [a, b] of wires) { App.state.wireStart = endAt(a); App.finishWire(endAt(b)); }
  }, finish);
}

test('?lab=lab2&ui=edison: the paper opens beside the board (the canvas starts at its edge), the parts fold to icons; a drag on the grip tucks it and shows the next step; the card pulls it out again', async ({ page }) => {
  const errors = watchErrors(page);
  await openLab(page, 'lab2');

  await expect(page.locator('#lab-sheet')).toHaveAttribute('data-paper', 'out');
  const paper = await box(page, '#lab-sheet'), canvas = await box(page, '#canvas-wrap');
  expect(canvas.left, `the board starts at the paper's right edge (${paper.right}), never under it`).toBeGreaterThanOrEqual(paper.right - 0.5);
  expect((await box(page, '#sidebar')).width, 'the parts fold to their 56 px icon rail').toBeCloseTo(56, 0);
  await expect(page.locator('#sidebar .comp-item[data-type="tl072"] .comp-item-icon'), 'a part\'s icon still shows').toBeVisible();
  await expect(page.locator('#lab-next'), 'no next-step card while the paper is out').toBeHidden();

  // Pull the grip left, the way a student tucks it.
  const g = await page.locator('.lab-paper-grip').boundingBox();
  const y = g.y + g.height / 2;
  await page.mouse.move(g.x + g.width / 2, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(g.x + g.width / 2 - i * 45, y);
  await page.mouse.up();

  await expect(page.locator('#lab-sheet')).toHaveAttribute('data-paper', 'tucked');
  await expect(page.locator('.lab-paper-sheet'), 'tucked: only the grip shows').toBeHidden();
  expect((await box(page, '#sidebar')).width, 'tucked: the parts list is back at full width').toBeGreaterThan(200);
  await expect(page.locator('#lab-next'), 'the next-step card shows on the board').toBeVisible();
  // The lab starts at step 1 (U1 comes seated; wiring it is step 1).
  await expect(page.locator('#lab-next')).toContainText('1. Wire the ±12 V supply to pins 8 and 4.');

  await page.locator('#lab-next').click();
  await expect(page.locator('#lab-sheet')).toHaveAttribute('data-paper', 'out');
  await expect(page.locator('#lab-next')).toBeHidden();
  expect(errors).toEqual([]);
});

test('Lab 2\'s manual is live: R2 reads Not yet, then On board; a pre-lab answer is checked as typed; after Run the data fills (Vout ≈ 4.975 V, gain ≈ −9.95, inverted), with the student\'s answer as Expected. Lab 1 has its manual too', async ({ page }) => {
  test.setTimeout(120_000);   // 2 s of sim clock on a slow runner (software WebGL)
  const errors = watchErrors(page);
  await openLab(page, 'lab2');

  const r2 = page.locator('.lab-paper-equip tr[data-label="R2"] .lab-paper-have');
  await expect(r2).toHaveText(/not yet/i);

  const gain = page.locator('.lab-paper-answer').first();
  await gain.fill('-10');
  await expect(page.locator('.lab-paper-tick').first()).toHaveText(/correct/i);
  await page.locator('.lab-paper-answer').nth(1).fill('5');
  const rows = page.locator('.lab-paper-data tr');
  await expect(rows.nth(2).locator('.lab-paper-exp'), 'Expected is the student\'s own pre-lab 3.2 answer').toHaveText('5 V');

  const holes = await page.evaluate(() => {
    const u1 = App.state.components.find(c => c.label === 'U1');
    return Object.fromEntries(Parts.legsOf(u1).map(l => [l.pin, l.hole]));
  });
  await addToBoard(page, lab2FinishAll(holes));
  await expect(r2, 'R2 placed: On board').toHaveText(/on board/i);

  await page.locator('#sim-run-btn').click();
  const num = async n => Number((await rows.nth(n).locator('.lab-paper-sim').textContent()).replace('−', '-').replace(/[^\d.-]/g, ''));
  await expect.poll(() => num(2), { message: 'Vout peak fills', timeout: 90_000 }).toBeGreaterThan(4.85);
  expect(await num(2), 'Vout peak, unclipped (case 11: 5.0 V ± 3 %)').toBeLessThan(5.15);
  expect(await num(3), 'the gain').toBeLessThan(-9.6);
  await expect(rows.nth(5).locator('.lab-paper-sim')).toHaveText('Inverted');
  await expect(rows.nth(2).locator('.lab-paper-sim')).toHaveAttribute('data-ok', 'yes');

  // Lab 1 has its manual too, around its 8 steps.
  await openLab(page, 'lab1');
  await expect(page.locator('.lab-paper-sec')).toHaveCount(6);
  await expect(page.locator('#lab-sheet ol > li')).toHaveCount(8);
  expect(errors).toEqual([]);
});

// The whole lab, as a student who asks for every step: Give me on 2, 3 and 4
// builds the circuit (each confirms as it lands, with no Run: the paper checks
// the board between runs), Give me on 5 runs it and the peak confirms
// (9.950 V), writing 6.1 confirms 6, and the paper says the lab is complete.
test('Lab 2 (case 11) end to end with Give me: it opens on step 1; steps 1–4 (the meter on the output included) confirm as they are built, no Run; 5 runs and confirms the 5 V peak with the meter reading about −5 V at the input\'s crest; a written 6.1 confirms 6; Lab complete', async ({ page }) => {
  test.setTimeout(120_000);   // 2 s of sim clock on a slow runner (software WebGL)
  const errors = watchErrors(page);
  await openLab(page, 'lab2');
  const step = n => page.locator('#lab-sheet ol > li').nth(n - 1);
  const tag  = n => step(n).locator('.lab-step-status');

  await expect(tag(1), 'it opens on step 1, Not yet').toHaveText(/not yet/i);
  for (const n of [1, 2, 3, 4]) {
    await expect(step(n), `step ${n} is the current step`).toHaveAttribute('data-current', '');
    await step(n).locator('.lab-step-give').click();
    await expect(tag(n), `Give me on step ${n} confirms it, no Run`).toHaveText(/passed/i);
  }
  await expect(step(2).locator('.lab-step-given'), 'Give me says where R1 went').toContainText('R1 (Rin, 10 kΩ) from i35 to i31');
  expect(await page.evaluate(() => App.simRunning), 'nothing has run yet').toBeFalsy();

  await expect(step(4).locator('.lab-step-given'), 'Give me says where the meter\'s probes went').toContainText('MM1 red probe to pin 1\'s column (g30)');
  await step(5).locator('.lab-step-give').click();
  await expect(tag(5), 'the run confirms the peak').toHaveText(/passed/i, { timeout: 90_000 });
  const meter = page.locator('.lab-paper-data tr').nth(4).locator('.lab-paper-sim');
  await expect.poll(async () => Number((await meter.textContent()).replace('−', '-').replace(/[^\d.-]/g, '')), { message: 'the meter at the input\'s crest', timeout: 30_000 }).toBeLessThan(-4.85);
  expect(Number((await meter.textContent()).replace('−', '-').replace(/[^\d.-]/g, '')), 'case 11: −5.15 to −4.85 V').toBeGreaterThan(-5.15);

  await page.locator('#lab-sheet .lab-paper-written').first().fill('The output must fall when the input rises, to keep pin 2 at 0 V.');
  await expect(tag(6)).toHaveText(/passed/i);
  await expect(page.locator('#lab-sheet')).toHaveAttribute('data-complete', '');
  await expect(page.locator('#lab-sheet .lab-sheet-progress')).toContainText('Lab complete');
  expect(errors).toEqual([]);
});

// The current step's other buttons, and Give me around the student's own
// wiring: Hint shows the step's hint; Explain asks Edison (an explain ask,
// /api/ask caught here) about that step; Give me on step 1 after the student
// wired PS1 + by hand adds only the 5 other wires and says what it skipped.
test('Hint shows the step\'s hint; Explain asks Edison about the step (explain: true); Give me skips a hole the student already used', async ({ page }) => {
  const errors = watchErrors(page);
  const asks = [];
  await page.route('**/api/ask', route => { asks.push(route.request().postDataJSON()); return route.fulfill({ json: { reply: 'Pin 8 is V+.', actions: [] } }); });
  await page.goto('/circuit3d/index.html?lab=lab2&ui=edison');
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.breadboard);
  const step2 = page.locator('#lab-sheet ol > li').nth(0);   // step 1: wire the supply
  await expect(step2, 'step 1 is current: the lab starts there').toHaveAttribute('data-current', '');

  await expect(step2.locator('.lab-step-hint')).toBeHidden();
  await step2.locator('.lab-step-hint-btn').click();
  await expect(step2.locator('.lab-step-hint'), 'Hint shows it').toBeVisible();

  await step2.locator('.lab-step-explain').click();
  await expect.poll(() => asks.length, { message: 'Explain sends one ask' }).toBe(1);
  expect(asks[0].explain, 'an explain ask, not an edit').toBe(true);
  expect(JSON.stringify(asks[0]), 'it names step 1').toContain('step 1 of LAB-02');

  // The student wires PS1 + to the top + rail by hand, then asks for the rest.
  await page.evaluate(() => {
    const pm = App.state.components.find(c => c.label === 'PS1').pinMeshes[0];
    const { col, row } = App.parseHole('tp_63'); const h = App.state.breadboard.getHole(col, row);
    App.state.wireStart = { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
    App.finishWire({ world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null });
  });
  const before = await page.evaluate(() => App.state.wires.length);
  await step2.locator('.lab-step-give').click();
  expect(await page.evaluate(() => App.state.wires.length) - before, 'the 5 wires not already there').toBe(5);
  await expect(step2.locator('.lab-step-given')).toContainText('Skipped (a hole is already in use): PS1 + (+12 V) to the top + rail');
  await expect(step2.locator('.lab-step-status'), 'the supply is wired: step 1 confirms').toHaveText(/passed/i);
  expect(errors).toEqual([]);
});

// Lab 1 end to end, the same way: it starts from the bench supply alone (at
// 0 V). Give me sets it to 10 V, places R1, then R2 and R3 in parallel, then
// wires it: each confirms as it lands, with no Run. Give me on 5 runs it, the
// three measure steps pass, the data reads 4.31 mA, 5.69 V and 1.72 mA, and
// a written 6.1 completes the lab.
test('Lab 1 end to end with Give me: from the supply alone, steps 1–4 confirm as built (no Run), the Run passes the three measures and fills the data, a written 6.1 completes it', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openLab(page, 'lab1');
  await expect.poll(() => page.evaluate(() => App.state.components.map(c => c.label).join(',')), { message: 'the starter: PS1 alone' }).toBe('PS1');
  const step = n => page.locator('#lab-sheet ol > li').nth(n - 1);
  const tag  = n => step(n).locator('.lab-step-status');

  for (const n of [1, 2, 3, 4]) {
    await expect(step(n), `step ${n} is the current step`).toHaveAttribute('data-current', '');
    await step(n).locator('.lab-step-give').click();
    await expect(tag(n), `Give me on step ${n} confirms it, no Run`).toHaveText(/passed/i);
  }
  await expect(step(3).locator('.lab-step-given')).toContainText('R3 (3.3 kΩ) from e14 to e18');
  expect(await page.evaluate(() => App.simRunning), 'nothing has run yet').toBeFalsy();

  await step(5).locator('.lab-step-give').click();
  for (const n of [5, 6, 7]) await expect(tag(n), `measure step ${n} passes on the Run`).toHaveText(/passed/i, { timeout: 30_000 });
  const sim = n => page.locator('.lab-paper-data tr').nth(n).locator('.lab-paper-sim');
  await expect(sim(1)).toHaveText('4.31 mA');
  await expect(sim(2)).toHaveText('5.69 V');
  await expect(sim(3)).toHaveText('1.72 mA');

  await page.locator('#lab-sheet .lab-paper-written').first().fill('They share both nodes, so the same voltage; each current is V over its own resistance.');
  await expect(tag(8)).toHaveText(/passed/i);
  await expect(page.locator('#lab-sheet')).toHaveAttribute('data-complete', '');
  expect(errors).toEqual([]);
});

// The current step is pinned under the paper's head, so the student never
// scrolls to find what's next: "Step 1 of 6", its text, and Give me, Hint
// and Explain. Give me there builds the step, the bar moves on to step 2 and
// says where each piece of step 1 went; Hint there shows the step's hint.
test('the current step is pinned at the top of the paper with its Give me, Hint and Explain; Give me there builds it and the bar moves on, saying where each piece went', async ({ page }) => {
  const errors = watchErrors(page);
  await openLab(page, 'lab2');
  const bar = page.locator('#lab-sheet .lab-paper-now');
  await expect(bar.locator('.lab-now-step')).toHaveText('Step 1 of 6');
  await expect(bar.locator('.lab-now-text')).toHaveText('Wire the ±12 V supply to pins 8 and 4.');
  const top = await bar.boundingBox(), head = await page.locator('#lab-sheet .lab-sheet-head').boundingBox();
  expect(Math.abs(top.y - (head.y + head.height)), 'right under the head, with no scrolling').toBeLessThan(2);

  await expect(bar.locator('.lab-now-hint')).toBeHidden();
  await bar.locator('.lab-now-hint-btn').click();
  await expect(bar.locator('.lab-now-hint'), 'Hint shows the hint').toContainText('Pin 8 is V+');

  await bar.locator('.lab-now-give').click();
  await expect(bar.locator('.lab-now-step'), 'step 1 confirmed: the bar moves on').toHaveText('Step 2 of 6');
  await expect(bar.locator('.lab-now-last')).toContainText('Give me, step 1');
  await expect(bar.locator('.lab-now-last')).toContainText('The +12 V rail to pin 8 (V+), hole a30');
  await expect(bar.locator('.lab-now-hint'), 'the new step\'s hint starts folded').toBeHidden();
  expect(errors).toEqual([]);
});
