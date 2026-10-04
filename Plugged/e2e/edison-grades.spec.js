// The course hub's Grades section and the Canvas dummy, Edison E8 (issue
// #154): a sample-data table of labs and pre-labs per student, and
// "Push grades to Canvas", which posts to the local server's dummy route
// and always ends on the demo status line. On deployed hosting there is no
// Node server, so the route is a 404 there (plan, Review focus #1): the push
// must fall back and still say "(demo)", never an error.
// The route itself is test/course-canvas.test.js; this spec is what needs a
// real page: the table as the student sees it, the button, the click through
// to the request, and the fallback in the page. No AI is called on this page;
// no sign-in is involved.
//
// The page the builder matches (from the plan's Task E8 and the spec §5.2;
// details not named there are chosen here, stated so they can be built to):
// - #grades shows one <table> in section[data-route="grades"], with a
//   <caption> a student can read containing "Sample data" (the plan's
//   caption: "Sample data. Names are invented."). Its font is Barlow Semi
//   Condensed (var(--font-dense)).
// - The header row in <thead> has the lab columns (header text with "Lab",
//   e.g. "Lab 1", "Lab 2") and a pre-lab column ("Pre-lab"). <tbody> has one
//   row per CourseData.grades.students entry, in order, holding the name.
// - Each mark is shown as a number (its cell's text starts with the mark,
//   e.g. "9.5"), drawn in B612 (var(--font-num); proportional since #148) and right-aligned in
//   its cell. A missing mark (null) never prints null, undefined or NaN.
// - One real <button> "Push grades to Canvas", solid --mask (#1D6A45).
// - A status line in the section, role="status" (or an <output>), reads
//   exactly "Synced with Canvas just now (demo)" once the push answers.
//   Nothing reads "Synced" before the click.
// - The click POSTs /api/course/canvas/sync. On !res.ok or a network error
//   it falls back to a local { syncedAt, demo: true } and shows the same
//   line, with no error text and nothing thrown.
//
// Web fonts are served as empty CSS, so the page needs no network and a
// blocked font can't log an error.
const { test, expect } = require('@playwright/test');

const SYNC      = '/api/course/canvas/sync';
const SYNC_GLOB = '**' + SYNC;
const SYNCED    = 'Synced with Canvas just now (demo)';
const MASK_RGB  = 'rgb(29, 106, 69)';   // --mask, #1D6A45 in edison/tokens.css
const ERROR_TEXT = /error|fail|couldn'?t|could not|unable|try again|offline|not found/i;

// Console errors and page errors. `allowSyncFailure` lets through only the
// browser's own "Failed to load resource" line for a sync request this test
// made fail on purpose.
function watchErrors(page, { allowSyncFailure = false } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = m.location().url || '';
    const routed = allowSyncFailure && /^Failed to load resource/.test(m.text()) && url.endsWith(SYNC);
    if (!routed) errors.push('console: ' + m.text() + (url ? ` (${url})` : ''));
  });
  return errors;
}

async function openGrades(page) {
  const res = await page.goto('/edison/course.html#grades');
  expect(res && res.status(), 'edison/course.html is served').toBe(200);
}

async function courseData(page) {
  await expect.poll(() => page.evaluate(() => typeof window.CourseData), {
    message: 'edison/course-data.js sets window.CourseData on the course page', timeout: 5000,
  }).toBe('object');
  return page.evaluate(() => window.CourseData);
}

const answerFontsEmpty = page =>
  page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ contentType: 'text/css', body: '' }));
const gradesSection = page => page.locator('section[data-route="grades"]');
const pushButton    = page => gradesSection(page).getByRole('button', { name: 'Push grades to Canvas', exact: true });
const statusLine    = page => gradesSection(page).getByRole('status');

// The push button is there, is a real <button>, and is solid --mask.
async function expectPushButton(page) {
  const push = pushButton(page);
  await expect(push, 'the Grades section has a "Push grades to Canvas" button').toBeVisible();
  expect(await push.evaluate(b => b.tagName), 'the push control is a real <button>').toBe('BUTTON');
  await expect(push, 'the button is solid --mask').toHaveCSS('background-color', MASK_RGB);
  await expect(gradesSection(page).getByText(/Synced/), 'nothing says Synced before the push').toHaveCount(0);
  return push;
}

test('#grades: a sample-data table of labs and pre-labs, one row per student, marks right-aligned in B612', async ({ page }) => {
  const errors = watchErrors(page);
  await answerFontsEmpty(page);
  await openGrades(page);
  const D = await courseData(page);
  const students = D.grades.students;
  expect(students.length, 'precondition: the course data has sample students').toBeGreaterThan(0);

  const section = gradesSection(page);
  const table = section.getByRole('table');
  await expect(table, 'the Grades section shows one table').toHaveCount(1);
  await expect(table).toBeVisible();

  // Labelled as sample data where the student can read it.
  const caption = table.locator('caption');
  await expect(caption, 'the table has a caption').toHaveCount(1);
  await expect(caption).toContainText('Sample data');
  await expect(caption).toBeVisible();
  const box = await caption.boundingBox();
  expect(box && box.width > 20 && box.height > 8, 'the caption is on screen at a readable size').toBe(true);

  const font = await table.evaluate(t => getComputedStyle(t).fontFamily);
  expect(font, 'the table is set in Barlow Semi Condensed').toContain('Barlow Semi Condensed');

  // Lab and pre-lab columns.
  const heads = (await table.locator('thead th').allTextContents()).map(t => t.trim());
  const labCols = heads.filter(h => /\blab\b/i.test(h) && !/pre/i.test(h));
  const preCols = heads.filter(h => /pre-?\s?lab/i.test(h));
  expect(labCols.length, `lab columns in the header ${JSON.stringify(heads)}`).toBeGreaterThanOrEqual(2);
  expect(preCols.length, `a pre-lab column in the header ${JSON.stringify(heads)}`).toBeGreaterThanOrEqual(1);

  // One row per student, in order, with every mark shown as a number.
  const rows = table.locator('tbody tr');
  await expect(rows, 'one row per sample student').toHaveCount(students.length);
  const cells = await rows.evaluateAll(trs => trs.map(tr => [...tr.cells].map(c => {
    const text = c.textContent.trim();
    // The number's own text node: its font is what the student sees, and its
    // right edge is compared with the cell's content edge.
    const walk = document.createTreeWalker(c, NodeFilter.SHOW_TEXT, { acceptNode: n => /\d/.test(n.data) ? 1 : 3 });
    const node = walk.nextNode();
    if (!node) return { text };
    const range = document.createRange();
    range.selectNodeContents(node);
    const cs = getComputedStyle(c);
    const contentRight = c.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    return { text, font: getComputedStyle(node.parentElement).fontFamily, align: cs.textAlign,
      gap: contentRight - range.getBoundingClientRect().right };
  })));

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const row = cells[i];
    const who = s.name;
    expect(row.map(c => c.text).join(' | '), `row ${i + 1} is ${who}`).toContain(who);
    expect(row.map(c => c.text).join(' | '), `${who}'s row prints no null, undefined or NaN`).not.toMatch(/\b(null|undefined|NaN)\b/);

    const marks = row.filter(c => /^\d+(\.\d+)?\b/.test(c.text));
    const shown = marks.map(c => parseFloat(c.text));
    for (const key of ['lab1', 'lab2', 'prelab1']) {
      if (s[key] === null || s[key] === undefined) continue;
      expect(shown, `${who}'s ${key} mark (${s[key]}) is shown as a number`).toContain(s[key]);
    }
    for (const m of marks) {
      expect(m.font.split(',')[0].trim().replace(/["']/g, ''), `${who}'s "${m.text}" is in B612 (first family)`).toBe('B612');
      expect(Math.abs(m.gap), `${who}'s "${m.text}" is right-aligned in its cell (text-align: ${m.align}; ${m.gap.toFixed(1)} px short of the right edge)`)
        .toBeLessThanOrEqual(2);
    }
  }

  expect(errors).toEqual([]);
});

test('Push grades to Canvas: a solid --mask button that posts to the dummy route and reads "Synced with Canvas just now (demo)"', async ({ page }) => {
  const errors = watchErrors(page);
  await answerFontsEmpty(page);
  await openGrades(page);
  const push = await expectPushButton(page);

  const posted = page.waitForResponse(r => new URL(r.url()).pathname === SYNC && r.request().method() === 'POST',
    { timeout: 5000 });
  await push.click();
  const res = await posted;
  expect(res.status(), 'the local server\'s dummy route answers the push').toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, demo: true });

  await expect(statusLine(page), 'the status line reports the demo sync').toHaveText(SYNCED);
  await expect(gradesSection(page)).not.toContainText(ERROR_TEXT);

  expect(errors).toEqual([]);
});

// Deployed hosting has no Node server (Review focus #1): the route is a bare
// 404 (as the contract has it), a hosting 404 page, or the request fails
// outright. Each still ends on the demo line.
const NO_SERVER = [
  ['a bare 404',                route => route.fulfill({ status: 404 })],
  ['a hosting 404 page (HTML)', route => route.fulfill({ status: 404, contentType: 'text/html', body: '<!DOCTYPE html><h1>Page not found</h1>' })],
  ['a network failure',         route => route.abort('failed')],
];

test('with no server behind the route (404 or a network failure), the push still reads "(demo)" and shows no error', async ({ page }) => {
  const errors = watchErrors(page, { allowSyncFailure: true });
  await answerFontsEmpty(page);

  for (const [what, answer] of NO_SERVER) {
    let hits = 0;
    await page.unroute(SYNC_GLOB);
    await page.route(SYNC_GLOB, route => { hits++; return answer(route); });
    await page.goto('about:blank');   // a fresh load each round, so no status is left over
    await openGrades(page);
    const push = await expectPushButton(page);

    await push.click();
    await expect.poll(() => hits, { message: `${what}: the click posts to ${SYNC}`, timeout: 5000 }).toBe(1);
    await expect(statusLine(page), `${what}: the status line still reports the demo sync`).toHaveText(SYNCED);
    await expect(gradesSection(page), `${what}: no error text`).not.toContainText(ERROR_TEXT);
  }

  expect(errors, 'nothing thrown and no console errors besides the routed request').toEqual([]);
});
