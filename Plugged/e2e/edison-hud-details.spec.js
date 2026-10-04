// Lab HUD details drawer (issue #193). In Edison (?ui=edison) a running
// circuit shows its results once, in the pinned callouts (#191) and the
// title block's status line (#190); the old results box (#sim-results) and
// mistakes box (#mistakes-panel) fold into a Details drawer the student opens
// from the title block. This is all page behaviour (CSS hiding, a real click
// on the title block over the 3D canvas, the drawer's place on screen), so it
// is Playwright only; the status line's text is test/hud-status.test.js.
// Classic is pinned in e2e/edison-hud-callouts.spec.js (its classic case).
// /api/ask is stubbed and never called. Guest only; sign-in is a manual QA case.
//
// The page the builder matches (chosen here, stated so it can be built to):
// - .hud-title holds a <button class="hud-details-btn" aria-expanded>, its
//   DOM text "Details +" while closed and "Details −" while open (− may be
//   U+2212 or "-"; the sign is in the text, not a CSS ::after).
// - The button, and the status line's "N PROBLEM(S)" segment, toggle
//   data-hud-details="open" on #canvas-wrap. The segment is its own element
//   (its text is just "N PROBLEM(S)") and stays clickable while the sim clock
//   ticks: a person's click lands between frames, so it must not be lost when
//   the line re-renders.
// - Closed: #sim-results and #mistakes-panel are hidden (CSS only; their text
//   stays for the specs that read it). Open: both show as one drawer under the
//   title block, on the left, at most WIDE px across, the mistakes below the
//   results.
//
// The boards: Lab 2's starter (?lab=lab2) with the student's finish from
// test/fixtures/lab2-finish.js added through App.placePart / App.finishWire
// (as e2e/lab-sheet.spec.js), and for the problem case the same with U1's V−
// jumper deleted (as e2e/edison-hud-callouts.spec.js): U1 has no supply.
const { test, expect } = require('@playwright/test');
const { lab2FinishAll } = require('../test/fixtures/lab2-finish.js');

test.use({ viewport: { width: 1440, height: 900 } });   // the demo laptop

const CLOCK = /t = \d+\.\d+ s/;
const WIDE = 460;    // px: the drawer's widest (the issue's ~420 px, with its padding and border)
const ALIGN = 40;    // px: the drawer's left edge to the title block's
const CLOSED = /Details\s*\+/;
const OPEN = /Details\s*[−-]/;

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openLab(page, query) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto(`/circuit3d/index.html?${query}`);
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.breadboard);
  await expect.poll(() => page.evaluate(() => App.state.components.map(c => c.label).sort()),
    { message: '?lab=lab2 loads U1, PS1 and FG1' }).toEqual(expect.arrayContaining(['FG1', 'PS1', 'U1']));
}

// Lab 2 finished as the inverting amplifier; with dropVneg, U1's V− jumper
// (bn_<col> → j<col>) is then deleted, so U1 has no supply.
async function buildLab2(page, { dropVneg = false } = {}) {
  const holes = await page.evaluate(() => {
    const u1 = App.state.components.find(c => c.label === 'U1');
    return Object.fromEntries(Parts.legsOf(u1).map(l => [l.pin, l.hole]));
  });
  const vneg = ['bn_' + holes.vneg.slice(1), 'j' + holes.vneg.slice(1)];
  const finish = lab2FinishAll(holes);
  const left = await page.evaluate(({ parts, wires, vneg, dropVneg }) => {
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
    if (dropVneg) {
      const ends = w => [w.startHole, w.endHole].map(h => (h ? App.formatHole(h) : null));
      const w = App.state.wires.find(x => { const e = ends(x); return e.includes(vneg[0]) && e.includes(vneg[1]); });
      if (!w) return null;
      App.deleteWire(w);
    }
    return App.state.wires.length;
  }, { parts: finish.parts, wires: finish.wires, vneg, dropVneg });
  expect(left, dropVneg ? 'the finish is drawn, then U1\'s V− jumper deleted' : 'every wire of the finish is drawn')
    .toBe(finish.wires.length - (dropVneg ? 1 : 0));
}

// Where the two boxes and the title block are, in one task.
const layout = page => page.evaluate(() => {
  const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
  const title = document.querySelector('#canvas-wrap .hud-title');
  return {
    results: box(document.getElementById('sim-results')),
    panel:   box(document.getElementById('mistakes-panel')),
    title:   title ? box(title) : null,
  };
});

// 'one drawer' when the open boxes stack as the issue's drawer; else what's off.
function drawerFault(g) {
  const r = n => Math.round(n);
  if (!g.title) return 'no .hud-title on the page';
  const left = Math.min(g.results.left, g.panel.left), right = Math.max(g.results.right, g.panel.right);
  if (right - left > WIDE) return `the drawer is ${r(right - left)} px wide (at most ${WIDE})`;
  for (const [name, b] of [['#sim-results', g.results], ['#mistakes-panel', g.panel]]) {
    if (Math.abs(b.left - g.title.left) > ALIGN) return `${name}'s left edge (${r(b.left)}) is not under the title block's (${r(g.title.left)}), on the left`;
  }
  if (g.results.top < g.title.bottom - 1) return `#sim-results (top ${r(g.results.top)}) is not under the title block (bottom ${r(g.title.bottom)})`;
  if (g.panel.top < g.results.bottom - 1) return `#mistakes-panel (top ${r(g.panel.top)}) overlaps #sim-results (bottom ${r(g.results.bottom)}): they should stack`;
  return 'one drawer';
}

test('Edison, Lab 2 finished and run: no results or mistakes box over the board; Details + opens both as one drawer under the title block, Details − folds it away', async ({ page }) => {
  test.setTimeout(90_000);   // a time run on a slow runner (software WebGL)
  const errors = watchErrors(page);
  await openLab(page, 'lab=lab2&ui=edison');
  await buildLab2(page);
  await page.locator('#sim-run-btn').click();

  const wrap = page.locator('#canvas-wrap');
  const results = page.locator('#sim-results');
  const panel = page.locator('#mistakes-panel');
  await expect(results, 'the run fills #sim-results with its clock (the text stays for the specs that read it)').toContainText(CLOCK);
  await expect(panel.locator('.mistake-row, .mistake-none').first(), 'and the mistake checker fills its panel').toBeAttached();

  // Closed: the results show once (callouts and status line), not in boxes over the board.
  await expect(results, 'closed: no results box over the board').toBeHidden();
  await expect(panel, 'closed: no mistakes box over the board').toBeHidden();
  const btn = page.locator('#canvas-wrap .hud-title button.hud-details-btn');
  await expect(btn, 'the title block has a Details button').toBeVisible();
  await expect(btn).toHaveText(CLOSED);
  await expect(btn).toHaveAttribute('aria-expanded', 'false');

  // Details +: both boxes open as one drawer under the title block, on the left.
  await btn.click();
  await expect(wrap).toHaveAttribute('data-hud-details', 'open');
  await expect(results, 'Details + shows the results').toBeVisible();
  await expect(panel, 'and the mistakes, in the same drawer').toBeVisible();
  await expect(btn, 'the button now reads Details −').toHaveText(OPEN);
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => drawerFault(await layout(page)), {
    message: `open, the two boxes stack as one drawer under the title block, on the left, at most ${WIDE} px wide`,
  }).toBe('one drawer');

  // Details −: folded away again, the text still there.
  await btn.click();
  await expect(results, 'Details − hides the results').toBeHidden();
  await expect(panel, 'and the mistakes').toBeHidden();
  await expect(btn, 'the button reads Details + again').toHaveText(CLOSED);
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(wrap).not.toHaveAttribute('data-hud-details', 'open');
  await expect(results, 'folded, #sim-results keeps its text').toContainText(CLOCK);
  expect(errors).toEqual([]);
});

test('Edison, Lab 2 with U1\'s V− unwired: clicking the status line\'s problem count opens the same drawer, with U1\'s no-supply row in it; a second click folds it', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openLab(page, 'lab=lab2&ui=edison');
  await buildLab2(page, { dropVneg: true });
  await page.locator('#sim-run-btn').click();

  const panel = page.locator('#mistakes-panel');
  const row = panel.locator('.mistake-row').filter({ hasText: /no supply/i });
  await expect(row, 'the mistake checker lists U1 with no supply').toHaveCount(1);
  await expect(panel, 'closed: the mistakes box is not over the board').toBeHidden();

  // The problem count on the status line, a real click on it while the clock
  // ticks. If this click times out with "element was detached from the DOM,
  // retrying", the line re-creates the count on every frame: a person's click
  // (mousedown and mouseup frames apart) is lost the same way.
  const count = page.locator('#canvas-wrap .hud-title .hud-status').getByText(/^\s*\d+\s+PROBLEMS?\s*$/i);
  await expect(count, 'the status line\'s "N PROBLEM(S)" is its own element').toBeVisible();
  await count.click({ timeout: 10_000 });
  await expect(page.locator('#canvas-wrap')).toHaveAttribute('data-hud-details', 'open');
  await expect(row, 'the drawer shows U1\'s no-supply row').toBeVisible();
  await expect(page.locator('#sim-results'), 'with the results above it').toBeVisible();
  await expect(page.locator('.hud-title .hud-details-btn'), 'the Details button follows: open').toHaveAttribute('aria-expanded', 'true');

  await count.click({ timeout: 10_000 });
  await expect(panel, 'a second click on the count folds the drawer').toBeHidden();
  await expect(page.locator('.hud-title .hud-details-btn')).toHaveAttribute('aria-expanded', 'false');
  expect(errors).toEqual([]);
});
