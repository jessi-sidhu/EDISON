// The course hub's Textbook (issue #153): edison/course.html#textbook
// shows three chapters set in STIX Two Text, each with live figures (the
// viewer in a frame) and an "Open in the editor" link, plus fine-line
// engraved SVG diagrams; and the editor honours ?open=, for allowed paths only.
// The chapter data and the figure circuits (titles, numbering, word counts,
// every figure solving clean) are test/course-textbook.test.js; this spec is
// what needs a real page: what the student sees, the chapter clicks, the
// computed fonts, the frames loading their figures, the hand-off to the
// editor, and the editor's ?open= guard. No AI is called (/api/ask is stubbed
// anyway); no sign-in is involved.
//
// The page the builder matches (chosen here, stated so it can be built to):
// - The textbook section is section[data-route="textbook"] (the #150 shell; it
//   keeps its <h2>Textbook</h2> and no <table>, which e2e/edison-course.spec.js
//   checks).
// - It lists the chapters in order, one button or link per chapter whose
//   accessible name contains the chapter title. The list stays on screen
//   while a chapter is open, so a click switches chapters.
// - The router sends any other hash to Home, so a chapter opens without a
//   #anchor: no link in the section points at this page with a hash other
//   than #textbook, and switching chapters leaves the URL on #textbook.
// - The open chapter is article[data-chapter="<n>"]; the other chapters'
//   articles are hidden or absent.
//   - Its first h2/h3 is the opener: it holds the chapter title, in Barlow
//     Condensed at 39 px or more (designed at 49 px).
//   - Each section has a heading reading "<n> <title>", e.g. "3.1 The ideal
//     op-amp".
//   - Each section's body is shown in <p> elements set in STIX Two Text.
//   - Each of the chapter's figures (sections[].figure) is an <iframe> whose
//     src is ../circuit3d/viewer.html?circuit=<figure> (so the src contains
//     "viewer.html?circuit=edison/figures/"), and the frame loads that file.
//     At least one frame is square (the opener's inset), 160 px or more.
//   - Each figure has a link named exactly "Open in the editor" with href
//     ../circuit3d/index.html?ui=edison&open=<figure>.
//   - Inline SVG diagrams (120 px wide or more; e.g. an op-amp
//     symbol and a KVL loop), at least one in the textbook: drawn with 3 or
//     more stroked shapes, every stroke rendered at 1.5 px or less, and every
//     <path> unfilled (a dot is a <circle>).
// - The editor, circuit3d/index.html?open=<path>: an allowed path
//   (UiFlag.allowedCircuit) loads that circuit; anything else loads nothing,
//   is never fetched, and puts a hint that mentions opening or loading in
//   #hint-text.
//
// Web fonts are served as empty CSS, so the page needs no network for them
// and a blocked font can't log an error. Errors are watched on the whole
// browser context, so the viewer frames and a new tab count too.
const { test, expect } = require('@playwright/test');
const fs   = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const editorHref = f => `../circuit3d/index.html?ui=edison&open=${f}`;
const escapeRe   = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function watchErrors(context) {
  const errors = [];
  context.on('weberror', e => errors.push('pageerror: ' + e.error().message));
  context.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function stubNetwork(context) {
  await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ contentType: 'text/css', body: '' }));
  await context.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
}

async function openTextbook(page) {
  await stubNetwork(page.context());
  const res = await page.goto('/edison/course.html#textbook');
  expect(res && res.status(), 'edison/course.html is served').toBe(200);
}

// The course data as the page sees it (window.CourseData).
async function courseData(page) {
  await expect.poll(() => page.evaluate(() => typeof window.CourseData), {
    message: 'edison/course-data.js sets window.CourseData on the course page', timeout: 5000,
  }).toBe('object');
  return page.evaluate(() => window.CourseData);
}

const figuresOf = ch => [...new Set(ch.sections.map(s => s.figure).filter(Boolean))];
const plain     = s => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const textbook       = page => page.locator('section[data-route="textbook"]');
const chapterArticle = (page, n) => textbook(page).locator(`article[data-chapter="${n}"]`);
const chapterControl = (page, title) =>
  textbook(page).getByRole('button', { name: title }).or(textbook(page).getByRole('link', { name: title })).first();

const editorReady = page => page.waitForFunction(() => window.App && App.renderer && App.state && App.state.breadboard);
const labels      = page => page.evaluate(() => App.state.components.map(c => c.label).sort());

function readFigure(figure) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, figure), 'utf8'));
}

// The inline SVG diagrams in an element: each one's stroked shapes, its widest
// stroke as rendered (stroke-width times the drawing's scale), and its filled paths.
const diagramsIn = locator => locator.evaluate(root => [...root.querySelectorAll('svg')]
  .filter(s => { const r = s.getBoundingClientRect(); return r.width >= 120 && r.height >= 40; })
  .map(s => {
    const shapes  = [...s.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse')];
    const stroked = shapes.filter(el => { const cs = getComputedStyle(el); return cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0; });
    const widths  = stroked.map(el => {
      const cs = getComputedStyle(el);
      const m  = el.getScreenCTM();
      const k  = cs.vectorEffect === 'non-scaling-stroke' || !m ? 1 : Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
      return Math.round(parseFloat(cs.strokeWidth) * k * 100) / 100;
    });
    const filled = [...s.querySelectorAll('path')].filter(p => {
      const f = getComputedStyle(p).fill;
      return f !== 'none' && !/rgba\([^)]*,\s*0\)$/.test(f);
    }).length;
    const name = s.getAttribute('aria-label') || (s.querySelector('title') && s.querySelector('title').textContent) || 'svg';
    return { name, stroked: stroked.length, widest: Math.max(0, ...widths), filled };
  }));

// One open chapter, as the student sees it. `served` holds the paths the page
// and its frames fetched successfully.
async function expectChapter(page, ch, served) {
  const art = chapterArticle(page, ch.n);
  await expect(art, `chapter ${ch.n} ("${ch.title}") is open as article[data-chapter="${ch.n}"]`).toBeVisible();

  // The opener: the chapter title, large, in Barlow Condensed.
  const opener = art.locator('h2, h3').first();
  await expect(opener, `chapter ${ch.n} opener`).toContainText(ch.title);
  const op = await opener.evaluate(h => { const cs = getComputedStyle(h); return { family: cs.fontFamily, size: parseFloat(cs.fontSize) }; });
  expect(op.family, `chapter ${ch.n} opener font`).toContain('Barlow Condensed');
  expect(op.size, `chapter ${ch.n} opener size, px`).toBeGreaterThanOrEqual(39);

  // Numbered sections, each with its body in STIX.
  const paras = await art.evaluate(a => [...a.querySelectorAll('p')]
    .filter(p => !p.closest('figure') && p.getClientRects().length > 0)
    .map(p => ({ text: p.textContent.replace(/\s+/g, ' ').trim(), family: getComputedStyle(p).fontFamily })));
  for (const s of ch.sections) {
    const heading = new RegExp(`^\\s*${escapeRe(s.n)}\\.?\\s*${escapeRe(s.title)}\\s*$`);
    await expect(art.getByRole('heading', { name: heading }), `section heading "${s.n} ${s.title}"`).toBeVisible();
    const opening = plain(String(s.body).split(/\n\s*\n/)[0]).split(' ').slice(0, 6).join(' ');
    const p = paras.find(x => x.text.includes(opening));
    expect(p, `section ${s.n}'s body ("${opening}…") is shown in a <p>`).toBeTruthy();
    expect(p.family, `section ${s.n} body font`).toContain('STIX');
  }

  // Live figures: a viewer frame per figure that loads it, one of them square.
  const figs = figuresOf(ch);
  expect(figs.length, `"${ch.title}" names a figure`).toBeGreaterThan(0);
  const frames = art.locator('iframe');
  const info = await frames.evaluateAll(els => els.map(f => { const r = f.getBoundingClientRect(); return { attr: f.getAttribute('src') || '', abs: f.src, w: r.width, h: r.height }; }));
  for (const fr of info) expect(fr.attr, `chapter ${ch.n} frame src`).toContain('viewer.html?circuit=edison/figures/');
  for (const f of figs) {
    const i = info.findIndex(fr => { const u = new URL(fr.abs); return u.pathname === '/circuit3d/viewer.html' && u.searchParams.get('circuit') === f; });
    expect(i, `${f} is drawn in a viewer.html?circuit= frame`).toBeGreaterThanOrEqual(0);
    await frames.nth(i).scrollIntoViewIfNeeded();
    await expect.poll(() => served.has('/' + f), { message: `the viewer frame loads ${f}`, timeout: 15_000 }).toBe(true);
  }
  expect(info.some(fr => fr.w >= 160 && Math.abs(fr.w - fr.h) <= 2),
    `chapter ${ch.n} has a square inset live figure; frames: ${JSON.stringify(info.map(fr => [Math.round(fr.w), Math.round(fr.h)]))}`).toBe(true);

  // Each figure opens in the editor.
  const hrefs = await art.getByRole('link', { name: 'Open in the editor', exact: true }).evaluateAll(as => as.map(a => a.getAttribute('href')));
  expect([...new Set(hrefs)].sort(), `chapter ${ch.n} "Open in the editor" links`).toEqual(figs.map(editorHref).sort());

  return diagramsIn(art);
}

test('#textbook lists the 3 chapters; each opens in place with a Barlow Condensed opener, numbered STIX sections, live figure frames with Open in the editor, and fine-line SVG diagrams', async ({ page }) => {
  test.setTimeout(90_000);   // the figure frames load the 3D viewer
  const errors = watchErrors(page.context());
  const served = new Set();
  page.on('response', r => { if (r.ok()) served.add(new URL(r.url()).pathname); });
  await openTextbook(page);
  const D = await courseData(page);
  expect(D.chapters.length, 'three chapters').toBe(3);

  // The list: every chapter, in order, each with its control.
  await expect(textbook(page)).toBeVisible();
  const text = await textbook(page).innerText();
  const at = D.chapters.map(ch => text.indexOf(ch.title));
  expect(at.every(i => i >= 0), `the textbook lists ${JSON.stringify(D.chapters.map(c => c.title))}`).toBe(true);
  expect([...at].sort((a, b) => a - b), 'chapters listed in order').toEqual(at);
  for (const ch of D.chapters) await expect(chapterControl(page, ch.title), `a control opens "${ch.title}"`).toBeVisible();

  // Chapter 3 first (the op-amp), then 1 and 2: each click stays on #textbook.
  const diagrams = [];
  for (const n of [3, 1, 2]) {
    const ch = D.chapters[n - 1];
    await chapterControl(page, ch.title).click();
    await expect(page, `opening chapter ${n} stays on #textbook`).toHaveURL(/\/edison\/course\.html(\?[^#]*)?#textbook$/);
    await expect(textbook(page)).toBeVisible();
    await expect(page.locator('.procedure-card'), 'Home is not showing').toBeHidden();
    for (const other of D.chapters.filter(c => c.n !== n)) {
      await expect(chapterArticle(page, other.n), `chapter ${other.n} is not showing with chapter ${n} open`).toBeHidden();
    }
    diagrams.push(...(await expectChapter(page, ch, served)).map(d => ({ chapter: n, ...d })));
  }

  // Review (#153): the opener's section list jumps to a heading without
  // touching the hash, and moves keyboard focus there (chapter 2 is open now).
  const ch2 = D.chapters[1];
  const last = ch2.sections[ch2.sections.length - 1];
  await chapterArticle(page, 2).locator(`button[data-section="${last.n}"]`).click();
  const target = page.locator(`#tb-s-${last.n.replace('.', '\\.')}`);
  await expect(target, `section ${last.n} is scrolled into view`).toBeInViewport();
  await expect(page, 'jumping to a section stays on #textbook').toHaveURL(/#textbook$/);
  await expect(page.locator('.procedure-card'), 'Home is not showing').toBeHidden();
  await expect(target, `keyboard focus moves to section ${last.n}`).toBeFocused();

  // The engraved diagrams: at least one, and every one fine-line and unfilled.
  expect(diagrams.filter(d => d.stroked >= 3).length, 'at least one inline SVG diagram drawn in fine lines').toBeGreaterThan(0);
  for (const d of diagrams) {
    expect(d.widest, `chapter ${d.chapter} ${d.name}: widest stroke, px`).toBeLessThanOrEqual(1.5);
    expect(d.filled, `chapter ${d.chapter} ${d.name}: filled paths`).toBe(0);
  }

  // No in-page #anchors: a link back to this page carries #textbook or the router shows Home.
  const selfLinks = await textbook(page).locator('a[href]').evaluateAll(as => as
    .map(a => new URL(a.href)).filter(u => u.pathname === location.pathname).map(u => u.hash));
  expect(selfLinks.filter(h => h !== '#textbook'), 'links to this page from the textbook keep #textbook').toEqual([]);

  expect(errors).toEqual([]);
});

test('Open in the editor on a chapter 1 figure opens the editor with that circuit on the board', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page.context());
  await openTextbook(page);
  const D = await courseData(page);
  const ch = D.chapters[0];
  const fig = figuresOf(ch)[0];
  expect(fig, `"${ch.title}" names a figure`).toBeTruthy();

  await chapterControl(page, ch.title).click();
  const link = chapterArticle(page, ch.n).getByRole('link', { name: 'Open in the editor', exact: true }).first();
  await expect(link).toHaveAttribute('href', editorHref(fig));

  let editor = page;
  if ((await link.getAttribute('target')) === '_blank') [editor] = await Promise.all([page.waitForEvent('popup'), link.click()]);
  else await link.click();
  await editor.waitForURL(/\/circuit3d\/index\.html\?/);
  await editorReady(editor);
  const url = new URL(editor.url());
  expect(url.searchParams.get('ui')).toBe('edison');
  expect(url.searchParams.get('open')).toBe(fig);

  // The figure's own parts and wires, as saved.
  const file = readFigure(fig);
  const want = file.components.map(c => c.label).sort();
  expect(want.length, `${fig} has parts`).toBeGreaterThan(0);
  await expect.poll(() => labels(editor), { message: `?open=${fig} loads its parts` }).toEqual(want);
  expect(await editor.evaluate(() => App.state.wires.length), `${fig} wires`).toBe((file.wires || []).length);

  expect(errors).toEqual([]);
});

test('?open= outside edison/ and circuit3d/labs/ loads nothing, never fetches the file, and says so in the hint', async ({ page }) => {
  const errors = watchErrors(page.context());
  const asked = [];
  page.on('request', r => asked.push(new URL(r.url()).pathname));
  await stubNetwork(page.context());
  await page.goto('/circuit3d/index.html?ui=edison&open=../backend/server.js');
  await editorReady(page);

  await expect.poll(() => page.locator('#hint-text').textContent(), {
    message: 'a hint says the file could not be opened', timeout: 5000,
  }).toMatch(/open|load/i);
  expect(await page.locator('#hint-text').textContent(), 'nothing was loaded').not.toMatch(/^Loaded/);
  expect(await page.evaluate(() => App.state.components.length), 'the board stays empty').toBe(0);
  expect(asked.filter(p => /server\.js$/.test(p)), 'backend/server.js is never requested').toEqual([]);

  expect(errors).toEqual([]);
});
