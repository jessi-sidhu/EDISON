// The ENSC 220 course hub (issue #150): edison/course.html with a
// left text nav, the banner, Home (the LAB-02 procedure card and stepper),
// the Labs table and stub sections for Textbook, Grades and TA view, all as
// hash routes on one page drawn from edison/course-data.js (window.CourseData).
// The data rules themselves are test/course-data.test.js; this spec is what
// needs a real page: what the student sees, the nav clicks, the hash routes,
// Back and Forward, and the computed SFU-red rule from the Edison tokens.
// No AI is called on this page; no sign-in is involved.
//
// The page the builder matches (chosen here, stated so it can be built to):
// - The page is Edison (the Edison tokens apply, so --sfu is #A6192E on <html>).
// - One <nav> holds exactly 5 text links, in this order:
//     <a href="#home">Home</a>, #labs Labs, #textbook Textbook,
//     #grades Grades, #ta TA view
//   No icons (svg or img) inside them. The current section's link has
//   aria-current="page"; the others don't. No hash, or an unknown one
//   (constructor and __proto__ included), means #home, titled
//   "Home: ENSC 220".
// - One <h1>, the course title over the banner image, carries the SFU rule as
//   its own left border: 6px solid var(--sfu). The banner image is
//   img/course-banner.jpg and loads.
// - A <footer> holds the demo line, verbatim.
// - Home: an element .procedure-card holding "LAB-02"; its step rows are
//   .steps > li, one per step of Lab 2's lab sheet (#152: the page loads
//   ../circuit3d/labs/sheets.js and reads LabSheets.get('lab2'); each row's
//   .step-text is that step's text, in order), each with a .pill reading
//   Passed, Not yet or Check failed (a sample student's); its stepper is .stepper > li (5 stages: Pre-lab, Build, Measure,
//   Analyze, Submit) with exactly one aria-current="step"; its footer reads
//   "Status: <stage>", and a visible label reading "Sample progress" (the
//   statuses are a sample student's). The "Open Lab 2" link goes to
//   ../circuit3d/index.html?lab=lab2&ui=edison. Announcements are
//   ul.announcements > li, one per CourseData.announcements entry.
// - #labs: one <table> with its header row in <thead> (Lab, Title, Due,
//   Status, then the action) and one <tbody> row per lab. Rows 1–2 link to
//   ../circuit3d/index.html?lab=lab1|lab2&ui=edison. Rows 3–5 have
//   aria-disabled="true", read "Opens week …" and have no link.
// - #textbook, #grades and #ta render their section's <h2>: Textbook,
//   Grades, TA view (the #150 stubs; #153–#155 replace the bodies).
// - Only the current section shows.
// - landing.html and dashboard.html each have an <a> to edison/index.html in
//   their markup.
//
// Web fonts are served as empty CSS, so the page needs no network and a
// blocked font can't log an error.
const { test, expect } = require('@playwright/test');

const DEMO_LINE = 'A demo course page. Not an official SFU site.';
const SENTENCE_CASE = /^[A-Z][a-z]+( [a-z]+)*$|^TA view$/;
const ROUTES = ['home', 'labs', 'textbook', 'grades', 'ta'];
const STAGES = ['Pre-lab', 'Build', 'Measure', 'Analyze', 'Submit'];
const STUBS = [['textbook', 'Textbook'], ['grades', 'Grades'], ['ta', 'TA view']];
const labLink = n => `../circuit3d/index.html?lab=lab${n}&ui=edison`;

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openCourse(page, hash = '') {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ contentType: 'text/css', body: '' }));
  const res = await page.goto('/edison/course.html' + hash);
  expect(res && res.status(), 'edison/course.html is served').toBe(200);
}

// The course data as the page sees it (window.CourseData).
async function courseData(page) {
  await expect.poll(() => page.evaluate(() => typeof window.CourseData), {
    message: 'edison/course-data.js sets window.CourseData on the course page', timeout: 5000,
  }).toBe('object');
  return page.evaluate(() => window.CourseData);
}

const navLink   = (page, route) => page.locator(`nav a[href="#${route}"]`);
const stubTitle = (page, name) => page.getByRole('heading', { level: 2, name, exact: true });

async function expectCurrent(page, route) {
  await expect(navLink(page, route)).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('nav a[aria-current="page"]'), 'one current nav item').toHaveCount(1);
}

// The Labs section is showing, with Labs 1–2 open and 3–5 locked.
async function expectLabsTable(page, D) {
  const table = page.getByRole('table');
  await expect(table).toBeVisible();
  const heads = (await table.locator('thead th').allTextContents()).map(t => t.trim());
  expect(heads.slice(0, 4), 'the Labs columns').toEqual(['Lab', 'Title', 'Due', 'Status']);

  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    const row = rows.nth(i);
    const lab = D.labs[i];
    await expect(row).toContainText(lab.code);
    await expect(row).toContainText(lab.title);
    if (i < 2) {
      await expect(row, `${lab.code} is open`).not.toHaveAttribute('aria-disabled', 'true');
      const hrefs = await row.locator('a').evaluateAll(as => as.map(a => a.getAttribute('href')));
      expect([...new Set(hrefs)], `${lab.code} opens the lab in the Edison editor`).toEqual([labLink(i + 1)]);
    } else {
      await expect(row, `${lab.code} is locked`).toHaveAttribute('aria-disabled', 'true');
      await expect(row).toContainText(/Opens week \d+/);
      await expect(row).toContainText(lab.opens);
      await expect(row.locator('a'), `${lab.code} has no link while locked`).toHaveCount(0);
    }
  }
}

test('Home: text nav, the SFU-red banner rule, the demo footer, and the LAB-02 procedure card (Lab 2\'s lab-sheet steps) with Open Lab 2', async ({ page }) => {
  const errors = watchErrors(page);
  await openCourse(page);
  const D = await courseData(page);

  // The nav: 5 text links in sentence case, no emoji or icons, Home current.
  await expect(page.locator('nav')).toHaveCount(1);
  const links = page.locator('nav a');
  await expect(links).toHaveCount(5);
  for (const t of await links.allTextContents()) expect(t.trim(), 'nav link text').toMatch(SENTENCE_CASE);
  expect(await links.evaluateAll(as => as.map(a => a.getAttribute('href')))).toEqual(ROUTES.map(r => `#${r}`));
  await expect(page.locator('nav a svg, nav a img'), 'nav links are text only').toHaveCount(0);
  await expectCurrent(page, 'home');

  // The banner: the Edison tokens are on the page, and the title has the SFU rule.
  const sfu = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sfu').trim());
  expect(sfu.toLowerCase(), 'the --sfu token from edison/tokens.css').toBe('#a6192e');
  const title = page.locator('h1');
  await expect(title).toHaveCount(1);
  await expect(title).toContainText(D.course.title);
  await expect(title).toHaveCSS('border-left-color', 'rgb(166, 25, 46)');
  await expect(title).toHaveCSS('border-left-style', 'solid');
  await expect(title).toHaveCSS('border-left-width', '6px');
  const banner = page.locator('img[src$="img/course-banner.jpg"]');
  await expect(banner).toHaveCount(1);
  await expect.poll(() => banner.evaluate(img => img.complete && img.naturalWidth > 0), {
    message: 'the banner image loads',
  }).toBe(true);

  // The footer: the demo line, verbatim.
  const footer = page.locator('footer').filter({ hasText: DEMO_LINE });
  await expect(footer).toHaveCount(1);
  await expect(footer).toBeVisible();

  // Home's procedure card: LAB-02, one row per step of Lab 2's sheet (the
  // steps the editor's lab sheet checks, #152: LabSheets.get('lab2'), loaded
  // on this page from ../circuit3d/labs/sheets.js), in order, each with a
  // status pill; then the stepper.
  const card = page.locator('.procedure-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('LAB-02');
  const sheetSteps = await page.evaluate(() => {
    const s = window.LabSheets && LabSheets.get('lab2');
    return s ? s.steps.map(st => st.text) : null;
  });
  expect(sheetSteps, 'the course page loads ../circuit3d/labs/sheets.js, and it has Lab 2 (window.LabSheets.get("lab2"))').not.toBeNull();
  const steps = card.locator('.steps > li');
  await expect(steps, 'one row per Lab 2 sheet step').toHaveCount(sheetSteps.length);
  await expect(card.locator('.steps > li .step-text'), 'the card\'s steps are Lab 2\'s sheet steps, in order').toHaveText(sheetSteps);
  for (let i = 0; i < sheetSteps.length; i++) {
    await expect(steps.nth(i).locator('.pill'), `step ${i + 1} status`).toHaveText(/^(Passed|Not yet|Check failed)$/);
  }
  await expect(card.locator('.stepper > li')).toHaveText(STAGES);
  await expect(card.locator('.stepper > li[aria-current="step"]'), 'one current stage').toHaveCount(1);
  await expect(card).toContainText(/Status: [a-z]+/);
  // The statuses are a sample student's (dummy data), and the card says so
  // where the student can read it: shown, not a 1 px screen-reader label.
  const sample = card.getByText(/Sample progress/).first();
  await expect(sample, 'the card labels its statuses as sample progress').toBeVisible();
  const box = await sample.boundingBox();
  expect(box && box.width > 20 && box.height > 8, 'the Sample progress label is on screen at a readable size').toBe(true);

  const open = page.getByRole('link', { name: 'Open Lab 2', exact: true });
  await expect(open).toBeVisible();
  await expect(open).toHaveAttribute('href', labLink(2));

  // Announcements: one list item per announcement in the data.
  const items = page.locator('ul.announcements > li');
  await expect(items).toHaveCount(D.announcements.length);
  await expect(items.first()).toContainText(D.announcements[0].text);

  expect(errors).toEqual([]);
});

test('the nav routes: #labs opens directly with Labs 3–5 locked, the stubs render, Back and Forward move between hashes, and an unknown hash shows Home', async ({ page }) => {
  const errors = watchErrors(page);
  // The landing page's strip links straight to course.html#labs.
  await openCourse(page, '#labs');
  const D = await courseData(page);
  await expectLabsTable(page, D);
  await expectCurrent(page, 'labs');
  await expect(page.locator('.procedure-card'), 'Home is not showing on #labs').toBeHidden();

  // Each stub section by its nav link; the one before it stops showing.
  let shown = null;
  for (const [route, name] of STUBS) {
    await navLink(page, route).click();
    await expect(page).toHaveURL(new RegExp(`#${route}$`));
    await expect(stubTitle(page, name)).toBeVisible();
    await expectCurrent(page, route);
    if (shown) await expect(stubTitle(page, shown)).toBeHidden();
    else await expect(page.getByRole('table')).toHaveCount(0);
    shown = name;
  }

  await navLink(page, 'home').click();
  await expect(page).toHaveURL(/#home$/);
  await expect(page.locator('.procedure-card')).toBeVisible();
  await expect(stubTitle(page, 'TA view')).toBeHidden();
  await expectCurrent(page, 'home');

  // Back: #ta, then #grades, #textbook and the first entry, #labs.
  await page.goBack();
  await expect(page).toHaveURL(/#ta$/);
  await expect(stubTitle(page, 'TA view')).toBeVisible();
  await expect(page.locator('.procedure-card')).toBeHidden();
  await expectCurrent(page, 'ta');
  await page.goBack();
  await expect(page).toHaveURL(/#grades$/);
  await expect(stubTitle(page, 'Grades')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#textbook$/);
  await page.goBack();
  await expect(page).toHaveURL(/#labs$/);
  await expectLabsTable(page, D);
  await expectCurrent(page, 'labs');

  // Forward: #textbook again.
  await page.goForward();
  await expect(page).toHaveURL(/#textbook$/);
  await expect(stubTitle(page, 'Textbook')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expectCurrent(page, 'textbook');

  // An unknown hash shows Home, including names every plain object inherits
  // (constructor, __proto__). Labs shows first, so Home is the fallback's work.
  for (const bad of ['nope', 'constructor', '__proto__']) {
    await navLink(page, 'labs').click();
    await expect(page.getByRole('table')).toBeVisible();
    await page.goto(`/edison/course.html#${bad}`);
    await expect(page.locator('.procedure-card'), `#${bad} shows Home`).toBeVisible();
    await expect(page.getByRole('table'), `#${bad} hides Labs`).toBeHidden();
    await expectCurrent(page, 'home');
    await expect(page, `#${bad} titles the page as Home`).toHaveTitle('Home: ENSC 220');
  }

  expect(errors).toEqual([]);
});

// The link is plain markup in each page (one link each), so the served
// HTML is parsed rather than run: the dashboard sends guests to the landing
// page, and both pages start Firebase sign-in.
test('landing.html and dashboard.html each link to edison/index.html', async ({ page, request }) => {
  for (const file of ['landing.html', 'dashboard.html']) {
    const res = await request.get(`/${file}`);
    expect(res.ok(), `${file} is served`).toBe(true);
    const html = await res.text();
    const targets = await page.evaluate(({ html, file }) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return [...doc.querySelectorAll('a[href]')]
        .map(a => new URL(a.getAttribute('href'), `http://host/${file}`).pathname);
    }, { html, file });
    expect(targets, `${file} has a link to the Edison landing page`).toContain('/edison/index.html');
  }
});
