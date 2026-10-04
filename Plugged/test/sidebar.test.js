// The generated parts sidebar, circuit3d/js/sidebar.js (issue #29). The
// sidebar is built from the parts registry: one group per category, in the
// contract's category order, each item showing the part's icon, name and
// sub. A search box filters it by name, type and ai.keywords.
//
// The logic is a pure function Node can load; the page's render is a thin
// layer over it (decision 1 on the issue).
//
// The API the builder matches (chosen here):
//   Sidebar.groups(parts, query) → [{ category, parts: [item, ...] }]
//     parts   a list of part definitions, e.g. Parts.all()
//     query   the search text; '' (or only spaces) shows everything
//     item    { type, name, sub, icon, ... } copied from the definition
//             (extra fields are allowed)
//   Groups come in the contract's category order (Passives, Sources,
//   Semiconductors, I/O, Instruments); a category with no part (or no match)
//   is left out. Within a group, parts keep the order they were given in.
//   Search is case-insensitive and matches when the query is found in the
//   part's name, its type, or one of its ai.keywords.
// Loading: Node module.exports = Sidebar; browser window.Sidebar (plus a
// small render for the page, not tested here).

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const Parts = require('../circuit3d/js/parts');
const testSpan = require('./fixtures/parts/test_span.js');

let Sidebar = null;
let loadError = null;
try { Sidebar = require('../circuit3d/js/sidebar.js'); } catch (e) { loadError = e; }

function groups(parts, query) {
  assert.ok(!loadError, 'circuit3d/js/sidebar.js must exist and load in Node: ' + (loadError && loadError.message));
  assert.equal(typeof (Sidebar && Sidebar.groups), 'function', 'sidebar.js must export Sidebar.groups(parts, query)');
  return Sidebar.groups(parts, query);
}

const CATEGORIES = ['Passives', 'Sources', 'Semiconductors', 'I/O', 'Instruments'];
const typesOf = gs => gs.flatMap(g => g.parts.map(p => p.type));

// ── Grouping ───────────────────────────────────────────────────────────────

test('groups come in the contract category order, empty categories dropped', () => {
  const gs = groups(Parts.all(), '');
  assert.deepEqual(gs.map(g => g.category), ['Passives', 'Sources', 'Semiconductors', 'I/O', 'Instruments'],
    'today: resistor (Passives), battery (Sources), LED (Semiconductors), buzzer and button (I/O), multimeter (Instruments, #96)');
  const noInstruments = Parts.all().filter(d => d.category !== 'Instruments');
  assert.deepEqual(groups(noInstruments, '').map(g => g.category), ['Passives', 'Sources', 'Semiconductors', 'I/O'],
    'a category with no parts is dropped');
});

test('every registered part appears exactly once, under its own category', () => {
  const gs = groups(Parts.all(), '');
  const types = typesOf(gs);
  const want = Parts.all().map(d => d.type);
  assert.deepEqual([...types].sort(), [...want].sort(), 'each registered part once');
  assert.equal(new Set(types).size, types.length, 'no part twice');
  for (const g of gs) {
    for (const p of g.parts) assert.equal(Parts.get(p.type).category, g.category, `${p.type} is under ${g.category}`);
  }
});

test('each item carries the definition\'s type, name, sub and icon', () => {
  const gs = groups(Parts.all(), '');
  for (const p of gs.flatMap(g => g.parts)) {
    const def = Parts.get(p.type);
    assert.deepEqual({ type: p.type, name: p.name, sub: p.sub, icon: p.icon },
      { type: def.type, name: def.name, sub: def.sub, icon: def.icon });
  }
  const r = gs[0].parts.find(p => p.type === 'resistor');
  assert.equal(r.name, 'Resistor');
  assert.equal(r.sub, '2 leads · axial');
  assert.match(r.icon, /^<svg/);
});

test('a part in another category gets its own group, in category order', () => {
  // A test-only part, not registered: groups() works on the list it is given.
  const meter = Object.assign(testSpan(), { type: 'test_meter', name: 'Test meter', category: 'Instruments' });
  const extra = Object.assign(testSpan(), { type: 'test_span' });   // Passives, beside the resistor
  const gs = groups([meter, ...Parts.all(), extra], '');
  assert.deepEqual(gs.map(g => g.category), ['Passives', 'Sources', 'Semiconductors', 'I/O', 'Instruments']);
  // test_meter first (given first), then every registered Instrument (the multimeter since #96).
  const instruments = Parts.all().filter(d => d.category === 'Instruments').map(d => d.type);
  assert.deepEqual(gs[gs.length - 1].parts.map(p => p.type), ['test_meter', ...instruments]);
  // Every registered Passive (the resistor, and the potentiometer since #31), then test_span last.
  const passives = Parts.all().filter(d => d.category === 'Passives').map(d => d.type);
  assert.ok(passives.includes('resistor'));
  assert.deepEqual(gs[0].parts.map(p => p.type), [...passives, 'test_span'], 'given order kept within a group');
  for (const g of gs) assert.ok(CATEGORIES.includes(g.category));
});

test('no parts gives no groups', () => {
  assert.deepEqual(groups([], ''), []);
});

// ── Search ─────────────────────────────────────────────────────────────────

// #42: the RGB LED's type (rgb_led) and name ("RGB LED") hold "led", so a
// search for "led" finds it too, beside the LED, both Semiconductors.
test('search "led" finds the LED and the RGB LED, nothing else', () => {
  const gs = groups(Parts.all(), 'led');
  assert.deepEqual(gs.map(g => g.category), ['Semiconductors']);
  assert.deepEqual(typesOf(gs).sort(), ['led', 'rgb_led']);
});

test('search is case-insensitive: "LED" and "Led" find the LED and the RGB LED', () => {
  assert.deepEqual(typesOf(groups(Parts.all(), 'LED')).sort(), ['led', 'rgb_led']);
  assert.deepEqual(typesOf(groups(Parts.all(), 'Led')).sort(), ['led', 'rgb_led']);
});

test('search matches the name: "push" finds the Push Button, "BUZZ" the buzzer', () => {
  assert.deepEqual(typesOf(groups(Parts.all(), 'push')), ['button']);
  assert.deepEqual(typesOf(groups(Parts.all(), 'BUZZ')), ['buzzer']);
});

test('search matches ai.keywords: "ohm" finds the resistor, "volts" the battery', () => {
  assert.deepEqual(typesOf(groups(Parts.all(), 'ohm')), ['resistor']);
  assert.deepEqual(typesOf(groups(Parts.all(), 'volts')), ['battery']);
});

// #34: the bench supply's keywords "current limit" and "power supply" share
// words with the resistor ("limit") and the battery ("power").
test('a word in two parts\' keywords finds both: "limit" the resistor and the bench supply, "power" the battery and the bench supply', () => {
  assert.deepEqual(typesOf(groups(Parts.all(), 'limit')), ['resistor', 'bench_supply']);
  assert.deepEqual(typesOf(groups(Parts.all(), 'power')), ['battery', 'bench_supply']);
});

test('search matches the type of a part whose name differs', () => {
  const meter = Object.assign(testSpan(), { type: 'test_meter', name: 'Gauge', category: 'Instruments' });
  // "test_met", not "meter": "potentiometer" (#31) has "meter" in its name.
  assert.deepEqual(typesOf(groups([...Parts.all(), meter], 'test_met')), ['test_meter']);
});

test('search with no match gives no groups', () => {
  assert.deepEqual(groups(Parts.all(), 'zzz'), []);
});

// ── The page (decisions 2 and 6) ───────────────────────────────────────────

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const scriptOrder = html => [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);

test('the editor loads js/sidebar.js and js/inspector.js after the part scripts and before app.js', () => {
  const order = scriptOrder(read('circuit3d/index.html'));
  const lastPart = Math.max(...order.map((s, i) => (s.startsWith('js/parts/') ? i : -1)));
  for (const f of ['js/sidebar.js', 'js/inspector.js']) {
    const i = order.indexOf(f);
    assert.ok(i >= 0, `circuit3d/index.html must load ${f}: ${order.join(', ')}`);
    assert.ok(i > lastPart && i < order.indexOf('js/app.js'), `${f} must load after the part scripts and before app.js: ${order.join(', ')}`);
  }
});

test('the new styles live in css/sidebar.css and css/inspector.css, linked from the editor', () => {
  const html = read('circuit3d/index.html');
  for (const f of ['css/sidebar.css', 'css/inspector.css']) {
    assert.match(html, new RegExp(`<link[^>]+href="${f.replace('.', '\\.')}"`), `index.html must link ${f}`);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'circuit3d', f)), `circuit3d/${f} must exist`);
  }
});

test('index.html has no hand-written part entries: only the Wire tool is a .comp-item in the markup', () => {
  const html = read('circuit3d/index.html');
  const types = [...html.matchAll(/class="comp-item[^"]*"[^>]*data-type="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(types, ['wire'], 'the part entries come from the registry (sidebar.js), not the markup');
});
