// Issue #53: tidy the #27 leftovers.
//   1. One withUnit: the registry exports Parts.withUnit(n, unit), the one SI
//      formatter; components.js and backend/server.js use it instead of
//      their own copies. docs/API-CONTRACT.md lists it under "Interfaces".
//   2. No App.SPANS table (nor its RESISTOR_/LED_/BUZZER_/BUTTON_SPAN
//      aliases): interaction.js and chat.js read def.place.span.default.
//   3. `ai` is required (● in the contract): Parts.define refuses a part
//      without it, naming the part and "ai", so server.js never meets one.
//
// Shapes these tests assume (stated so the builder matches them):
// - Parts.withUnit is exported from parts/registry.js (so also from
//   require('circuit3d/js/parts')) and formats exactly as the registry's
//   private withUnit does today: plain() for non-SI units, a real minus.
// - "No copy" is checked on source text: no `function withUnit` and no
//   `withUnit =` definition in components.js or server.js, and both call
//   Parts.withUnit(.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const testSpan  = require('./fixtures/parts/test_span.js');
const testThree = require('./fixtures/parts/test_three.js');
const testChip  = require('./fixtures/parts/test_chip.js');

const PLUGGED = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(PLUGGED, f), 'utf8');

let Parts = {};
let loadError = null;
try { Parts = require('../circuit3d/js/parts/registry.js'); } catch (e) { loadError = e; }

function need(name) {
  assert.ok(!loadError, 'circuit3d/js/parts/registry.js must load in Node: ' + (loadError && loadError.message));
  assert.equal(typeof Parts[name], 'function', `registry.js must export Parts.${name}()`);
  return Parts[name];
}

// ── 1. Parts.withUnit: the one SI formatter ──────────────────────────────

describe('Parts.withUnit formats values exactly as the registry does today', () => {
  // [value, unit, text], pinned from the registry's private withUnit at 3cbbb03.
  const CASES = [
    [1,       'Ω',  '1 Ω'],
    [470,     'Ω',  '470 Ω'],
    [1000,    'Ω',  '1 kΩ'],
    [1234,    'Ω',  '1.23 kΩ'],
    [4700,    'Ω',  '4.7 kΩ'],
    [1e6,     'Ω',  '1 MΩ'],
    [1e7,     'Ω',  '10 MΩ'],
    [0,       'Ω',  '0 Ω'],
    [9,       'V',  '9 V'],
    [-5,      'V',  '−5 V'],
    [0.02,    'A',  '20 mA'],
    [2.2e-6,  'F',  '2.2 µF'],
    [50,      '%',  '50%'],
    [-5,      '%',  '−5%'],
    [25,      '°C', '25 °C'],
    [0.1 + 0.2, '°C', '0.3 °C'],
  ];
  for (const [n, unit, text] of CASES) {
    test(`withUnit(${n}, '${unit}') → "${text}"`, () => {
      assert.equal(need('withUnit')(n, unit), text);
    });
  }

  test('require("circuit3d/js/parts") gives the same Parts.withUnit', () => {
    const All = require('../circuit3d/js/parts');
    assert.equal(typeof All.withUnit, 'function', 'circuit3d/js/parts must expose Parts.withUnit');
    assert.equal(All.withUnit(1200, 'Ω'), '1.2 kΩ');
  });
});

describe('there is one withUnit, in the registry', () => {
  // A definition of withUnit: `function withUnit(` or `withUnit = ` / `withUnit=`.
  const DEFINES = /function\s+withUnit\s*\(|\bwithUnit\s*=[^=]/;

  test('registry.js defines it and exports it as Parts.withUnit', () => {
    const src = read('circuit3d/js/parts/registry.js');
    assert.match(src, DEFINES, 'registry.js keeps the one withUnit');
    assert.equal(typeof Parts.withUnit, 'function', 'registry.js must export Parts.withUnit');
  });

  for (const file of ['circuit3d/js/components.js', 'backend/server.js']) {
    test(`${file} has no withUnit of its own and calls Parts.withUnit`, () => {
      const src = read(file);
      assert.doesNotMatch(src, DEFINES, `${file} still defines its own withUnit; use Parts.withUnit`);
      assert.match(src, /Parts\.withUnit\(/, `${file} should format values with Parts.withUnit(n, unit)`);
    });
  }

  test('docs/API-CONTRACT.md lists Parts.withUnit(n, unit) under Interfaces', () => {
    const doc = read('../docs/API-CONTRACT.md');
    const start = doc.indexOf('## Interfaces');
    assert.ok(start >= 0, 'docs/API-CONTRACT.md has an "## Interfaces" section');
    const next = doc.indexOf('\n## ', start + 1);
    const section = doc.slice(start, next < 0 ? undefined : next);
    assert.match(section, /Parts\.withUnit\(\s*n\s*,\s*unit\s*\)/,
      'the Interfaces section should document Parts.withUnit(n, unit)');
  });
});

// ── 2. No SPANS table: spans come from def.place.span.default ────────────

describe('spans come from the registry, not an App.SPANS table', () => {
  const jsFiles = dir => fs.readdirSync(path.join(PLUGGED, dir), { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? jsFiles(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []);
  const PAGES = ['index.html', 'landing.html', 'dashboard.html', '404.html',
                 'circuit3d/index.html', 'circuit3d/viewer.html'];
  const SOURCES = [...jsFiles('circuit3d/js'), ...PAGES.filter(p => fs.existsSync(path.join(PLUGGED, p)))];
  const OLD = /\bSPANS\b|\b(RESISTOR|LED|BUZZER|BUTTON)_SPAN\b/;

  test('no SPANS table or *_SPAN alias is left in circuit3d/js or the pages', () => {
    const hits = [];
    for (const f of SOURCES) {
      read(f).split('\n').forEach((line, i) => { if (OLD.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`); });
    }
    assert.deepEqual(hits, [], 'App.SPANS and its aliases should be gone:\n' + hits.join('\n'));
  });

  test('interaction.js reads a span part\'s default span from place.span.default', () => {
    assert.match(read('circuit3d/js/interaction.js'), /place\.span\.default/,
      'interaction.js should take the hand-placement span from def.place.span.default');
  });

  test('chat.js builds the span preview ghost at def.place.span.default, with no table in front of it', () => {
    assert.match(read('circuit3d/js/chat.js'), /App\.buildPreview\(\s*def\.type\s*,\s*def\.place\.span\.default\s*,/,
      'chat.js should call App.buildPreview(def.type, def.place.span.default, ...)');
  });
});

// ── 3. ai is required ────────────────────────────────────────────────────

describe('Parts.define refuses a part with no ai', () => {
  beforeEach(() => { if (typeof Parts.reset === 'function') Parts.reset(); });

  for (const [what, change] of [['no ai field', d => { delete d.ai; }],
                                ['ai: undefined', d => { d.ai = undefined; }],
                                ['ai: null', d => { d.ai = null; }]]) {
    test(`${what}: refused with a message naming the part and "ai"`, () => {
      const d = testSpan();
      change(d);
      let err = null;
      try { need('define')(d); } catch (e) { err = e; }
      assert.ok(err, 'define() should refuse a part with no ai');
      assert.ok(err instanceof Parts.PartDefinitionError, `expected a PartDefinitionError, got ${err.name}: ${err.message}`);
      assert.match(err.message, /test_span/, 'the message names the part');
      assert.match(err.message, /\bai\b/, 'the message names the missing field "ai"');
      assert.equal(Parts.get('test_span'), null, 'the refused part is not registered');
    });
  }

  test('every shipped part and the test fixtures have ai and still define', () => {
    const define = need('define');
    const shipped = ['resistor', 'led', 'battery', 'buzzer', 'button', 'potentiometer']
      .map(t => require(`../circuit3d/js/parts/${t}.js`));
    Parts.reset();   // requiring them registered them; define each again from scratch
    for (const def of [...shipped, testSpan(), testThree(), testChip()]) {
      assert.ok(def.ai && typeof def.ai === 'object', `${def.type} has an ai spec`);
      assert.equal(define(def).type, def.type);
    }
  });

  test('the gizmo fixtures define, and server.js builds its tools with them', () => {
    Parts.reset();
    for (const t of ['resistor', 'led', 'battery', 'buzzer', 'button', 'potentiometer']) {
      Parts.define(require(`../circuit3d/js/parts/${t}.js`));
    }
    const { withGizmos } = require('./fixtures/gizmos.js');
    const { Server, gizmos } = withGizmos(3);
    assert.equal(gizmos.length, 3);
    for (const g of gizmos) assert.ok(g.ai, `${g.type} has an ai spec`);
    assert.ok(Server, 'server.js loads with the gizmos registered');
  });
});
