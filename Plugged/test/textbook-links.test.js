// The textbook and the simulator linked both ways: "Test in lab +" carries
// the page's values (textbook-figures.js labHref → ?set=, applied by
// tools/labs.js setsFromSearch), and the labs' "Read first" lines name their
// textbook page (labs/sheets.js readingHref).
const fs   = require('node:fs');
const path = require('node:path');
const Labs = require('../circuit3d/js/tools/labs.js');
const TF   = require('../edison/textbook-figures.js');
const Sheets = require('../circuit3d/labs/sheets.js');
const ROOT = path.join(__dirname, '..');

test('setsFromSearch keeps a resistance or a voltage on a part label, in range; drops the rest', () => {
  expect(Labs.setsFromSearch('?open=x&set=R1.resistance:10000,R2.resistance:47000,PS2.voltage:0.5')).toEqual([
    { label: 'R1', key: 'resistance', value: 10000 }, { label: 'R2', key: 'resistance', value: 47000 }, { label: 'PS2', key: 'voltage', value: 0.5 },
  ]);
  expect(Labs.setsFromSearch('?set=PS2.voltage:-1,U1.gain:3,R9.resistance:1e9,R1.resistance:0,PS1.voltage:31,bad,<script>'), 'out of range or not allowed').toEqual([]);
  expect(Labs.setsFromSearch('?open=x'), 'no ?set=').toEqual([]);
});

test('labHref: each figure\'s link opens its circuit, running, with the page\'s R1, R2 and Vin; a negative Vin (PS2 can\'t go below 0 V) is left off', () => {
  for (const id of Object.keys(TF.FIGURES)) {
    const f = TF.FIGURES[id];
    const u = new URL(TF.labHref(id), 'http://x/edison/textbook.html');
    expect(u.pathname).toBe('/circuit3d/index.html');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ ui: 'edison', open: f.circuit, run: '1' });
    expect(Labs.setsFromSearch(u.search).map(s => s.value), `${id}: its defaults`).toEqual([f.defaults.r1, f.defaults.r2, f.defaults.vin]);
  }
  const moved = new URL(TF.labHref('inverting', { r1: 10000, r2: 47000, vin: 0.30000000000000004 }), 'http://x/edison/');
  expect(Labs.setsFromSearch(moved.search)).toEqual([
    { label: 'R1', key: 'resistance', value: 10000 }, { label: 'R2', key: 'resistance', value: 47000 }, { label: 'PS2', key: 'voltage', value: 0.3 },
  ]);
  const negative = new URL(TF.labHref('non-inverting', { r1: 10000, r2: 20000, vin: -0.5 }), 'http://x/edison/');
  expect(Labs.setsFromSearch(negative.search).map(s => s.label)).toEqual(['R1', 'R2']);
});

test('each figure\'s set names parts its circuit has, holding the key it sets', () => {
  for (const id of Object.keys(TF.FIGURES)) {
    const f = TF.FIGURES[id];
    const parts = JSON.parse(fs.readFileSync(path.join(ROOT, f.circuit), 'utf8')).components;
    for (const at of Object.values(f.set)) {
      const [label, key] = at.split('.');
      const c = parts.find(p => p.label === label);
      expect(c && key in c.values, `${id}: ${at} is in ${f.circuit}`).toBe(true);
    }
  }
});

test('the labs\' readings link to pages that exist: Lab 2 to the textbook spread\'s inverting-amp page (#p4), Lab 1 to the course\'s Textbook tab', () => {
  expect(Sheets.get('lab2').readingHref).toBe('../edison/textbook.html#p4');
  expect(Sheets.get('lab1').readingHref).toBe('../edison/course.html#textbook');
  const html = fs.readFileSync(path.join(ROOT, 'edison', 'textbook.html'), 'utf8');
  expect(html, 'the spread\'s page 4 has id="p4"').toMatch(/<article[^>]*id="p4"[^>]*data-fig="inverting"/);
});
