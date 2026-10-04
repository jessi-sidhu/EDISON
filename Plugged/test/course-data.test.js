// The ENSC 220 course hub's data (Edison E4, issue #150): edison/course-data.js,
// a UMD module (window.CourseData in the browser, module.exports in Node).
//
// Shape (docs/API-CONTRACT.md → "Edison and the course hub" → Course data):
//   { course: { code, title, term, instructor: 'Instructor' },
//     announcements[{ date, text }],
//     labs[{ id, code, title, due, status: 'open'|'done'|'locked', opens? }],
//     chapters[{ n, title, sections[{ n, title, body, figure? }] }],
//     grades: { students[{ name, lab1, lab2, prelab1 }], sample: true },
//     heatmap: { lab, cells[{ hole, count, note }], total },
//     feed[{ minsAgo, lab, step, label, text }] }
//
// The rules checked here come from the plan (Task E4, Step 1) and the spec
// (§2: SFU-inspired, no real names; §3: sentence case, no "A · B · C" meta):
// - The course header is generic: the instructor is "Instructor".
// - Labs 1–5 in order. Labs 1–2 are open; 3–5 are locked and say which week
//   they open. Each lab's id is what ?lab= takes (lab1 … lab5), and the
//   titles are the five ENSC 220 labs the plan names.
// - Sample grades are marked sample and use invented names (Student A …).
// - Every heat-map cell is a real body hole on the 63-column breadboard
//   (rows and columns from circuit3d/js/board-geometry.js), and its count is
//   at most the class total.
// - Copy: no all-caps words over 3 letters except codes, no meta dots.
//
// The module is loaded inside each test, so a missing file fails each test
// with its name rather than failing the whole file at import.

const path = require('node:path');

const GEOMETRY = require('../circuit3d/js/board-geometry.js');

function courseData() {
  const file = path.join(__dirname, '..', 'edison', 'course-data.js');
  try {
    return require(file);
  } catch (e) {
    throw new Error(`edison/course-data.js must load in Node and export CourseData (${e.message})`);
  }
}

test('course header is generic and the term is set', () => {
  const D = courseData();
  expect(D.course).toMatchObject({ code: 'ENSC 220', title: 'Electric Circuits I', term: 'Fall 2026', instructor: 'Instructor' });
});

test('labs 1–5 in order; 1–2 open, 3–5 locked with an opening week', () => {
  const D = courseData();
  expect(D.labs.map(l => l.code)).toEqual(['LAB-01', 'LAB-02', 'LAB-03', 'LAB-04', 'LAB-05']);
  expect(D.labs.slice(0, 2).every(l => l.status !== 'locked')).toBe(true);
  expect(D.labs.slice(2).every(l => l.status === 'locked' && /^Opens week \d+$/.test(l.opens))).toBe(true);
});

test('each lab has the ?lab= id of its number, a known status and a due date', () => {
  const D = courseData();
  for (const l of D.labs) {
    expect(l.id, l.code).toBe(`lab${Number(l.code.slice(4))}`);
    expect(['open', 'done', 'locked'], l.code).toContain(l.status);
    expect(typeof l.due, `${l.code} due`).toBe('string');
    expect(l.due.trim().length, `${l.code} due`).toBeGreaterThan(0);
  }
});

test('the five labs are the ENSC 220 labs the plan names', () => {
  const D = courseData();
  expect(D.labs.map(l => l.title)).toEqual([
    'Series-parallel resistors',
    'Op-amps and the sine source',
    'RC charging',
    'Thévenin equivalents',
    'AM radio front end',
  ]);
});

test('announcements are a non-empty list of a date and text', () => {
  const D = courseData();
  expect(D.announcements.length).toBeGreaterThan(0);
  for (const a of D.announcements) {
    expect(typeof a.date).toBe('string');
    expect(a.date.trim().length).toBeGreaterThan(0);
    expect(typeof a.text).toBe('string');
    expect(a.text.trim().length).toBeGreaterThan(0);
  }
});

test('sample data is marked sample and uses no real names', () => {
  const D = courseData();
  expect(D.grades.sample).toBe(true);
  expect(D.grades.students.length).toBeGreaterThanOrEqual(8);
  for (const s of D.grades.students) expect(s.name).toMatch(/^Student [A-Z]\.?$/);
});

test('every heat-map cell is a real breadboard hole, and each count is at most the class total', () => {
  const D = courseData();
  expect(D.heatmap.cells.length, 'the heat-map has cells').toBeGreaterThan(0);
  for (const c of D.heatmap.cells) {
    expect(c.hole).toMatch(/^[a-j](?:[1-9]|[1-5]\d|6[0-3])$/);
    expect(c.count).toBeGreaterThan(0);
    expect(c.count).toBeLessThanOrEqual(D.heatmap.total);
  }
});

test('heat-map holes are body holes on the board geometry, and the heat-map names one of the labs', () => {
  const D = courseData();
  for (const c of D.heatmap.cells) {
    const m = /^([a-z]+)(\d+)$/.exec(c.hole);
    expect(m, `${c.hole} is a row letter and a column`).not.toBeNull();
    expect(GEOMETRY.BODY_ROWS, `${c.hole} row`).toContain(m[1]);
    const col = Number(m[2]);
    expect(col >= 1 && col <= GEOMETRY.COLS, `${c.hole} column within 1–${GEOMETRY.COLS}`).toBe(true);
  }
  const names = D.labs.flatMap(l => [l.id, l.code]);
  expect(names).toContain(D.heatmap.lab);
});

test('copy rules: no all-caps words over 3 letters except codes, no meta dots', () => {
  const D = courseData();
  const text = JSON.stringify(D);
  expect(text).not.toMatch(/\s·\s.*\s·\s/);
  expect(text.replace(/ENSC|LAB-\d\d|TL072|SFU|LED\d?|CH\d/g, '')).not.toMatch(/\b[A-Z]{4,}\b/);
});
