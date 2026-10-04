// The TA view on the ENSC 220 course hub (Edison E9, issue #155):
// /edison/course.html#ta. Spec §4a: Quindar's isometric line-art hardware with
// dashed leader callouts, and Godela's heat-map colour scale with a legend;
// spec §3: numbers inside sentences, no stat-banner row. The math behind the
// drawing (TA.isoPoint, TA.colourFor, TA.summary) is test/course-ta.test.js,
// and the feed endpoint's shape and 15 s rotation is test/course-ta-feed.test.js.
// This spec is what needs a real page: the SVG as drawn, the dots inside the
// drawn outline, the leaders landing on dots, the feed polling the server,
// and the 404 fallback deployed hosting hits.
//
// No AI is called on this page; no sign-in is involved.
//
// The page the builder matches (chosen here, stated so it can be built to):
// - section[data-route="ta"] keeps its <h2>TA view</h2> (exactly that: the
//   E4 spec finds it by name). A visible "Sample data (demo)" label sits
//   beside or just under it, not inside it.
// - The summary is plain sentences; the busiest cell reads
//   "<count> of <total> students …".
// - One inline <svg> in the section holds:
//   - the board outline: ONE <polygon> or <path> with class "ta-outline",
//     stroked in --graphite (#262927);
//   - one dot per CourseData.heatmap cell, carrying data-hole="<hole>"
//     (e.g. data-hole="e30"), filled with its count's colour (TA.colourFor);
//   - dashed leaders: <line>, <polyline> or <path> elements with a
//     stroke-dasharray. One end of each lands on a dot; the other end sits by
//     a label holding that cell's note and its count ("V+ (pin 8) not wired:
//     23 students"). The two busiest cells each get one.
// - A legend, class "ta-legend", shows the scale's low and high counts (the
//   lowest cell count or 0, and the highest) and at least 2 colour swatches
//   (HTML backgrounds, or SVG rect/circle/path/polygon fills), the hottest at
//   --bus-red. No gradient: the design guard bans them.
// - The feed is the section's <ol> with <time> elements: one <li> per event,
//   newest first, each with <time datetime="<ISO>">. It loads
//   GET /api/course/ta-feed and polls it every 15 s. When that answers 404
//   (deployed hosting serves its HTML 404 page) the feed shows
//   CourseData.feed instead, timed minsAgo before now, and the
//   "Sample data (demo)" label stays.
//
// Web fonts are served as empty CSS, so the page needs no network and a
// blocked font can't log an error.
const { test, expect } = require('@playwright/test');

const FEED_PATH  = '/api/course/ta-feed';
const DEMO_LABEL = 'Sample data (demo)';
const GRAPHITE   = 'rgb(38, 41, 39)';
const BUS_RED    = [0xC4, 0x33, 0x3B];
const NEAR       = 48;   // px: a label "by" a heading or by a leader's far end

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const isFeed = url => new URL(url).pathname === FEED_PATH;
const heading = section => section.getByRole('heading', { level: 2, name: 'TA view', exact: true });

async function openTA(page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ contentType: 'text/css', body: '' }));
  const res = await page.goto('/edison/course.html#ta');
  expect(res && res.status(), 'edison/course.html is served').toBe(200);
  const section = page.locator('section[data-route="ta"]');
  await expect(section).toBeVisible();
  await expect(heading(section)).toBeVisible();
  return section;
}

async function courseData(page) {
  await expect.poll(() => page.evaluate(() => typeof window.CourseData), { timeout: 5000 }).toBe('object');
  return page.evaluate(() => window.CourseData);
}

// The feed <ol> (the one holding <time> elements) and its items as the user
// reads them, each with its <time datetime>.
const feedList = section => section.locator('ol').filter({ has: section.page().locator('time') });
function feedItems(section) {
  return feedList(section).locator('li').evaluateAll(lis => lis.map(li => {
    const t = li.querySelector('time');
    return { text: li.textContent.replace(/\s+/g, ' ').trim(), datetime: t ? t.getAttribute('datetime') : null };
  }));
}

// The "Sample data (demo)" label: shown, and beside or just under the heading.
async function expectDemoLabel(section) {
  const label = section.getByText(DEMO_LABEL).first();
  await expect(label, `"${DEMO_LABEL}" is shown on the TA view`).toBeVisible();
  const h = await heading(section).boundingBox();
  const l = await label.boundingBox();
  const mid = l.y + l.height / 2;
  expect(mid >= h.y - NEAR && mid <= h.y + h.height + NEAR,
    `"${DEMO_LABEL}" sits by the heading (label middle at ${mid.toFixed(0)} px, heading ${h.y.toFixed(0)}–${(h.y + h.height).toFixed(0)} px)`).toBe(true);
}

// The drawing as the page laid it out, in viewport pixels: the outline, each
// dot (centre, radius, fill, inside the outline or not), each dashed line
// that ends on a dot, and the text sitting by that line's far end.
function measureDrawing(section) {
  return section.evaluate((sec, NEAR) => {
    const svgs = [...sec.querySelectorAll('svg')].filter(s => s.querySelector('.ta-outline'));
    if (svgs.length !== 1) return { svgCount: svgs.length };
    const svg = svgs[0];
    const outline = svg.querySelector('.ta-outline');
    const toScreen = (el, p) => new DOMPoint(p.x, p.y).matrixTransform(el.getScreenCTM());
    const toOutline = outline.getScreenCTM().inverse();

    const dots = [...svg.querySelectorAll('[data-hole]')].map(d => {
      const r = d.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      return { hole: d.dataset.hole, cx, cy, radius: Math.max(r.width, r.height) / 2, fill: getComputedStyle(d).fill,
        insideOutline: outline.isPointInFill(new DOMPoint(cx, cy).matrixTransform(toOutline)) };
    });

    const leaders = [...svg.querySelectorAll('line, polyline, path')]
      .filter(el => el !== outline && getComputedStyle(el).strokeDasharray !== 'none')
      .map(el => {
        const ends = [toScreen(el, el.getPointAtLength(0)), toScreen(el, el.getPointAtLength(el.getTotalLength()))];
        for (const [i, end] of ends.entries()) {
          const dot = dots.find(d => Math.hypot(d.cx - end.x, d.cy - end.y) <= d.radius + 4);
          if (dot) return { hole: dot.hole, far: { x: ends[1 - i].x, y: ends[1 - i].y } };
        }
        return null;
      })
      .filter(Boolean);

    // The text within NEAR px of a point: every element's own text nodes, in page order.
    const gap = (p, r) => Math.hypot(Math.max(r.left - p.x, 0, p.x - r.right), Math.max(r.top - p.y, 0, p.y - r.bottom));
    const textNear = p => [...sec.querySelectorAll('*')]
      .filter(el => el.getBoundingClientRect().width > 0 && gap(p, el.getBoundingClientRect()) <= NEAR)
      .map(el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' '))
      .join(' ').replace(/\s+/g, ' ').trim();
    for (const l of leaders) l.textByFarEnd = textNear(l.far);

    return {
      svgCount: 1,
      outlineTag: outline.tagName.toLowerCase(),
      outlineStroke: getComputedStyle(outline).stroke,
      dots, leaders,
    };
  }, NEAR);
}

const rgbOf = css => {
  const m = /^rgb\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*\)$/.exec(String(css).trim());   // opaque rgb() only
  return m ? [m[1], m[2], m[3]].map(Number) : null;
};
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

test('#ta: the isometric breadboard with heat dots inside the outline, a legend, dashed callouts to the busiest cells, and the live feed from the server', async ({ page }) => {
  const errors = watchErrors(page);
  const feedResponse = page.waitForResponse(r => isFeed(r.url()), { timeout: 10_000 }).catch(() => null);
  const section = await openTA(page);
  const D = await courseData(page);
  const cells = D.heatmap.cells;
  const byCount = [...cells].sort((a, b) => b.count - a.count);
  const counts = cells.map(c => c.count);
  const max = Math.max(...counts), min = Math.min(...counts);

  await expectDemoLabel(section);
  await expect(section, 'the summary puts the busiest cell\'s number in a sentence')
    .toContainText(new RegExp(`\\b${byCount[0].count} of ${D.heatmap.total} students\\b`));

  // ── The drawing ──
  await expect(section.locator('svg .ta-outline'), 'the board outline (.ta-outline) is drawn in an inline SVG').toHaveCount(1);
  await expect(section.locator('svg [data-hole]'), 'one dot per heat-map cell').toHaveCount(cells.length);
  const m = await measureDrawing(section);
  expect(m.svgCount, 'one inline SVG holds the outline').toBe(1);
  expect(['polygon', 'path'], 'the outline is one polygon or path').toContain(m.outlineTag);
  expect(m.outlineStroke, 'the outline is drawn in --graphite').toBe(GRAPHITE);
  expect(m.dots.map(d => d.hole).sort(), 'the dots are the heat-map holes').toEqual(cells.map(c => c.hole).sort());
  expect(m.dots.filter(d => !d.insideOutline).map(d => d.hole), 'dots outside the drawn board outline').toEqual([]);

  // Isometric, not a top-down grid: two holes in one row differ in both x and y.
  const dot = hole => m.dots.find(d => d.hole === hole);
  const pair = cells.flatMap((a, i) => cells.slice(i + 1).filter(b => a.hole[0] === b.hole[0]).map(b => [a.hole, b.hole]))[0];
  expect(pair, 'the sample heat-map has two cells in one row to compare').toBeTruthy();
  const [p, q] = pair.map(dot);
  expect(Math.abs(p.cx - q.cx) > 1 && Math.abs(p.cy - q.cy) > 1,
    `${pair[0]} → ${pair[1]} is drawn on a slant (dx ${(q.cx - p.cx).toFixed(1)}, dy ${(q.cy - p.cy).toFixed(1)} px)`).toBe(true);

  // Coloured by count: a busier cell is never further from --bus-red, and the busiest is redder than the quietest.
  const redness = hole => {
    const rgb = rgbOf(dot(hole).fill);
    expect(rgb, `${hole}'s dot has a fill colour (got ${dot(hole).fill})`).not.toBeNull();
    return dist(rgb, BUS_RED);
  };
  for (let i = 1; i < byCount.length; i++) {
    const [a, b] = [byCount[i - 1], byCount[i]];
    expect(redness(a.hole), `${a.hole} (${a.count}) is at least as red as ${b.hole} (${b.count})`).toBeLessThanOrEqual(redness(b.hole) + 1.5);
  }
  expect(redness(byCount[0].hole), 'the busiest cell is redder than the quietest').toBeLessThan(redness(byCount.at(-1).hole));

  // ── The legend: the scale's low and high counts, and swatches up to --bus-red ──
  const legend = section.locator('.ta-legend');
  await expect(legend, 'the heat-map has a legend').toBeVisible();
  // Each text node on its own: "6", swatches, "23" must not read as "623".
  const legendTexts = await legend.evaluate(el => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), out = [];
    while (walk.nextNode()) { const t = walk.currentNode.textContent.trim(); if (t) out.push(t); }
    return out;
  });
  expect(legendTexts.some(t => new RegExp(`\\b${max}\\b`).test(t)), `the legend shows the top count, ${max} (its text: ${JSON.stringify(legendTexts)})`).toBe(true);
  expect(legendTexts.some(t => new RegExp(`\\b(${min}|0)\\b`).test(t)), `the legend shows the low count, ${min} or 0 (its text: ${JSON.stringify(legendTexts)})`).toBe(true);
  const swatches = await legend.evaluate(el => [el, ...el.querySelectorAll('*')].map(n => {
    if (n instanceof SVGElement) return /^(rect|circle|ellipse|path|polygon)$/.test(n.tagName) ? getComputedStyle(n).fill : null;
    return getComputedStyle(n).backgroundColor;
  }));
  const colours = [...new Set(swatches.map(rgbOf).filter(Boolean).map(c => c.join(',')))].map(s => s.split(',').map(Number));
  expect(colours.length, `the legend shows at least 2 colours (got ${JSON.stringify(swatches)})`).toBeGreaterThanOrEqual(2);
  expect(Math.min(...colours.map(c => dist(c, BUS_RED))), 'the legend\'s hottest swatch is --bus-red').toBeLessThanOrEqual(40);

  // ── Dashed callouts: the two busiest cells each get a leader landing on their dot, by their note ──
  expect(m.leaders.length, 'dashed leaders (stroke-dasharray) that end on a dot').toBeGreaterThanOrEqual(2);
  for (const cell of byCount.slice(0, 2)) {
    const leader = m.leaders.find(l => l.hole === cell.hole);
    expect(leader, `${cell.hole} (${cell.count} students) has a dashed leader ending on its dot`).toBeTruthy();
    expect(leader.textByFarEnd, `${cell.hole}'s leader ends by its note`).toContain(cell.note);
    expect(leader.textByFarEnd, `${cell.hole}'s callout gives its count`).toMatch(new RegExp(`\\b${cell.count}\\b`));
  }

  // ── No stat-banner row: no 3 big bare numbers side by side ──
  const bannerRows = await section.evaluate(sec => {
    const rows = {};
    for (const el of sec.querySelectorAll('*')) {
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      const r = el.getBoundingClientRect();
      if (!/^[\d.,]+\s*%?$/.test(own) || r.width === 0 || parseFloat(getComputedStyle(el).fontSize) < 25) continue;
      const row = Math.round(r.top / 8);
      rows[row] = (rows[row] || []).concat(own);
    }
    return Object.values(rows).filter(r => r.length >= 3);
  });
  expect(bannerRows, 'rows of 3+ big bare numbers (a stat banner)').toEqual([]);

  // ── The feed: what the server sent, newest first, each with a <time> ──
  const res = await feedResponse;
  expect(res, `the TA view fetches ${FEED_PATH}`).not.toBeNull();
  expect(res.status(), `${FEED_PATH} answers 200`).toBe(200);
  const body = await res.json();
  await expect(feedList(section), 'one feed list with <time> elements').toHaveCount(1);
  const items = await feedItems(section);
  expect(items.length, 'feed items shown').toBeGreaterThanOrEqual(3);
  expect(items.length, 'feed items shown').toBeLessThanOrEqual(body.events.length);
  for (const [i, it] of items.entries()) {
    expect(it.text, `feed item ${i + 1} is the server's event ${i + 1}`).toContain(body.events[i].text);
    expect(it.datetime, `feed item ${i + 1} has <time datetime>`).toBeTruthy();
    expect(Date.parse(it.datetime), `feed item ${i + 1}'s <time> is the event's time`).toBe(Date.parse(body.events[i].at));
  }

  expect(errors).toEqual([]);
});

// Page timers are run 20 s ahead with page.clock instead of waiting 15 s of
// real time; the server is real and answers on its own clock. Its events'
// `at` move with its clock, so a fresh answer changes the first <time>
// (and every 15 s it also rotates the events: test/course-ta-feed.test.js).
test('the feed refreshes within 20 s of page time, from a new server response', async ({ page }) => {
  const errors = watchErrors(page);
  let answers = 0;
  page.on('response', r => { if (isFeed(r.url()) && r.status() === 200) answers++; });
  await page.clock.install();
  const section = await openTA(page);

  const first = () => feedItems(section).then(items => items[0] || null);
  await expect.poll(first, { message: 'the feed shows an item with a <time datetime>', timeout: 5000 })
    .toMatchObject({ datetime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
  await expect.poll(() => answers, { message: `the first ${FEED_PATH} answer arrives`, timeout: 5000 }).toBeGreaterThanOrEqual(1);
  const before = await first();
  const answersBefore = answers;

  await page.clock.runFor(20_000);
  await expect.poll(() => answers, { message: `the page polls ${FEED_PATH} again within 20 s`, timeout: 5000 }).toBeGreaterThan(answersBefore);
  await expect.poll(first, { message: 'the first feed item (its <time> or its event) changes after the poll', timeout: 5000 })
    .not.toEqual(before);

  expect(errors).toEqual([]);
});

test('with the feed endpoint 404ing (deployed hosting), the feed falls back to CourseData.feed and still says "(demo)"', async ({ page }) => {
  const errors = watchErrors(page);
  let tried = 0;
  await page.route(u => isFeed(u.href), route => {
    tried++;
    return route.fulfill({ status: 404, contentType: 'text/html', body: '<!DOCTYPE html><title>Page Not Found</title><h1>404</h1>' });
  });
  const section = await openTA(page);
  const D = await courseData(page);

  await expect(feedList(section), 'the feed list still shows').toHaveCount(1);
  await expect(feedList(section).locator('li').first()).toContainText(D.feed[0].text);
  expect(tried, `the page asked ${FEED_PATH} first`).toBeGreaterThanOrEqual(1);

  const now = Date.now();
  const items = await feedItems(section);
  expect(items.length, 'fallback feed items shown').toBeGreaterThanOrEqual(3);
  expect(items.length, 'fallback feed items shown').toBeLessThanOrEqual(D.feed.length);
  for (const [i, it] of items.entries()) {
    const e = D.feed[i];
    expect(it.text, `fallback item ${i + 1} is CourseData.feed[${i}]`).toContain(e.text);
    const t = Date.parse(it.datetime);
    expect(Number.isNaN(t), `fallback item ${i + 1} has a <time datetime> (got ${it.datetime})`).toBe(false);
    expect(Math.abs(t - (now - e.minsAgo * 60000)), `fallback item ${i + 1} is timed ${e.minsAgo} min ago`).toBeLessThanOrEqual(2 * 60000);
  }
  await expectDemoLabel(section);

  // The routed 404 logs one "Failed to load resource" line; nothing else may.
  expect(errors.filter(e => !/Failed to load resource: the server responded with a status of 404/.test(e))).toEqual([]);
});

// Review (#155): opened in a background tab (document.hidden), the first
// load must still run — only the later 15 s ticks skip hidden tabs.
test('opened in a background tab, the feed still shows the server\'s events on first load', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  });
  let first = null;
  page.on('response', async r => { if (isFeed(r.url()) && r.status() === 200 && !first) first = await r.json().catch(() => null); });
  const section = await openTA(page);
  await expect(feedList(section), 'the feed list shows in a background tab').toHaveCount(1, { timeout: 5000 });
  await expect.poll(() => first && first.events && first.events[0].text, { timeout: 5000 }).toBeTruthy();
  await expect(feedList(section).locator('li').first()).toContainText(first.events[0].text, { timeout: 5000 });
  expect(errors).toEqual([]);
});
