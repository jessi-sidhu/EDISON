// The Lab HUD's canvas frame in the editor (issue #190, Lab HUD 2/4; mockup
// docs/design/editor-hud/1-lab-hud-full.png once H1 copies it there). The
// status line's format is test/hud-status.test.js; this spec is what needs a
// real page: the frame over the real 3D view in Edison, the line following a
// real Run and Stop of Lab 2 (read from the live sim, not a fixed string),
// the panels other specs rely on still there, the view going quiet after
// Stop (no rAF loop: app.js draws a frame after every rAF callback, #109),
// and nothing of it in classic.
// /api/ask is stubbed and never called. Guest only; sign-in is a manual QA case.
//
// The page the builder matches (chosen here, stated so it can be built to):
// - With ?ui=edison, #canvas-wrap holds four .hud-bracket elements, one in
//   each corner of it (the mockup's 20 px L shapes, 16 px in).
// - .hud-title, top-left over the canvas, reads "BREADBOARD" (caps from CSS
//   or the text, either), and holds .hud-status: the status line, the text of
//   EdisonHudStatus.statusLine(state) for the live state. Here it is compared
//   with whitespace and the "●" left out, so the builder may split it into
//   styled spans and draw the dot as the mockup's pink square.
// - The live state comes from the page: t is #sim-results' "t = … s" clock,
//   open is the run's "Circuit open" line, problems is the count of
//   #mistakes-panel's .mistake-row rows that aren't .mistake-info.
// - #sim-results stays visible while running (restyled, not hidden: about 12
//   specs check it), #reset-cam-btn and #clear-all-btn stay in the DOM.
// - With ?ui=classic none of the frame shows.
// Lab 2's starter (circuit3d/labs/lab2.sparky: U1, PS1, FG1, unwired) is a
// time run (FG1 is a wave source) and an open circuit with the mistake
// checker's rows, which is the mockup's state.
const { test, expect } = require('@playwright/test');

const CLOCK = /t = (\d+\.\d+) s/;

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openLab2(page, ui) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto(`/circuit3d/index.html?ui=${ui}&lab=lab2`);
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.breadboard);
  await page.waitForFunction(() => App.state.components.length >= 3);
}

// Each .hud-bracket's box, with #canvas-wrap's.
const brackets = page => page.evaluate(() => {
  const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
  return { wrap: box(document.getElementById('canvas-wrap')), list: [...document.querySelectorAll('.hud-bracket')].map(box) };
});

// The corner of `wrap` a box sits in, if it lies within `reach` px of it on
// both axes (inside the wrap); else null.
function cornerOf(b, wrap, reach = 64) {
  const inX = b.left >= wrap.left - 1 && b.right <= wrap.right + 1;
  const inY = b.top >= wrap.top - 1 && b.bottom <= wrap.bottom + 1;
  if (!inX || !inY) return null;
  const x = b.left - wrap.left <= reach ? 'l' : wrap.right - b.right <= reach ? 'r' : null;
  const y = b.top - wrap.top <= reach ? 't' : wrap.bottom - b.bottom <= reach ? 'b' : null;
  return x && y ? y + x : null;
}

// One snapshot of what the status line shows and what the page's own panels
// say, read in one task so they belong to the same frame.
const snapshot = page => page.evaluate(clock => {
  const s = document.querySelector('.hud-title .hud-status');
  const box = document.getElementById('sim-results');
  const m = box ? box.textContent.match(new RegExp(clock)) : null;
  return {
    status:   s ? s.textContent : null,
    clock:    m ? m[1] : null,
    open:     !!box && /Circuit open/.test(box.textContent),
    problems: document.querySelectorAll('#mistakes-panel .mistake-row:not(.mistake-info)').length,
  };
}, CLOCK.source);

// The line statusLine gives for a running snapshot (the format of
// test/hud-status.test.js), and the comparison that ignores spacing and the dot.
const expected = s => [`T ${s.clock} S`, s.open ? '● CIRCUIT OPEN' : '● CIRCUIT OK',
  ...(s.problems ? [`${s.problems} PROBLEM${s.problems === 1 ? '' : 'S'}`] : [])].join(' / ');
const squash = t => String(t).replace(/[\s●]/g, '');

// Render on demand (#109), measured as e2e/edison-skin.spec.js does.
const QUIET = 4, QUIET_MS = 2000;
const frames = page => page.evaluate(() => App.renderer.info.render.frame);
async function framesOver(page, ms) {
  const before = await frames(page);
  await page.waitForTimeout(ms);
  return (await frames(page)) - before;
}

test('?ui=edison: four corner brackets and a BREADBOARD title whose status line follows Lab 2\'s Run and Stop; none of it in classic', async ({ page }) => {
  test.setTimeout(60_000);   // the running clock and the quiet poll on top of the load
  await page.setViewportSize({ width: 1440, height: 900 });   // the mockup's size
  const errors = watchErrors(page);
  await openLab2(page, 'edison');

  // The frame: one bracket in each corner of the canvas, and the title block.
  const marks = page.locator('#canvas-wrap .hud-bracket');
  await expect(marks, 'four HUD corner brackets in #canvas-wrap').toHaveCount(4);
  for (let i = 0; i < 4; i++) await expect(marks.nth(i)).toBeVisible();
  const { wrap, list } = await brackets(page);
  const corners = list.map(b => cornerOf(b, wrap)).sort();
  expect(corners, `one bracket within 64 px of each corner of #canvas-wrap (boxes: ${JSON.stringify(list)}, wrap: ${JSON.stringify(wrap)})`)
    .toEqual(['bl', 'br', 'tl', 'tr']);
  const title = page.locator('#canvas-wrap .hud-title');
  await expect(title).toBeVisible();
  await expect(title).toContainText(/BREADBOARD/i);
  await expect(title.locator('.hud-status'), 'the status line sits in the title block').toHaveCount(1);

  // Run: the line shows the sim's own clock, open state and problem count,
  // frame by frame, and the clock moves.
  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results'), '#sim-results stays visible in the HUD').toBeVisible();
  const live = async () => {
    const s = await snapshot(page);
    if (s.clock === null) return 'no "t = … s" clock in #sim-results yet';
    return squash(s.status) === squash(expected(s)) ? Number(s.clock)
      : `the status line reads "${s.status}", the page says "${expected(s)}"`;
  };
  let first = null;
  await expect.poll(async () => (first = await live()), {
    message: 'while running, the status line matches the live clock, open state and problem count',
    timeout: 15_000, intervals: [100],
  }).toEqual(expect.any(Number));
  const s = await snapshot(page);
  expect(s.open, 'Lab 2\'s unwired starter is an open circuit').toBe(true);
  expect(s.problems, 'the mistake checker lists problems for it').toBeGreaterThan(0);
  await expect.poll(live, {
    message: `the clock on the status line moves past ${first} s and still matches the page`,
    timeout: 15_000, intervals: [100],
  }).toBeGreaterThan(first + 0.2);

  // The canvas's own controls are still there (restyled only).
  await expect(page.locator('#clear-all-btn'), 'Clear All shows for a board with parts').toBeVisible();
  await expect(page.locator('#reset-cam-btn'), 'Reset View stays in the DOM (battery-spot checks it hides)').toHaveCount(1);

  // Stop: the line reads STOPPED.
  await page.locator('#sim-stop-btn').click();
  await expect.poll(async () => squash((await snapshot(page)).status), { message: 'after Stop the status line reads STOPPED' })
    .toBe('STOPPED');

  // Render on demand (#109): stopped, with the HUD shown and no input, the 3D
  // view goes quiet. A status line driven by a rAF loop keeps it drawing.
  await expect.poll(() => framesOver(page, QUIET_MS), {
    message: `stopped, with the HUD shown and no input, the 3D view goes quiet (allowed: ${QUIET} frames in ${QUIET_MS} ms)`,
    timeout: 10_000, intervals: [250],
  }).toBeLessThanOrEqual(QUIET);

  // Classic is untouched: no bracket and no title block shows.
  await openLab2(page, 'classic');
  expect(await page.evaluate(() => document.documentElement.dataset.ui), '<html data-ui>').toBe('classic');
  await expect(page.locator('.hud-bracket:visible'), 'no corner brackets in classic').toHaveCount(0);
  await expect(page.locator('.hud-title:visible'), 'no title block in classic').toHaveCount(0);

  expect(errors).toEqual([]);
});
