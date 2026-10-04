// Tests for parts/registry.js: Parts.define() and its rules, get/all/reset,
// checkValue, nearestKit, checkPlacement and legsOf (issue #21). The rules
// are docs/API-CONTRACT.md → "Part file contract".
//
// The parts used here are test-only fixtures (test/fixtures/parts/), never
// loaded by the app. Each fixture exports a factory returning a fresh, valid
// definition; a broken part is a fixture with one thing changed.
//
// Shapes these tests assume (stated so the builder matches them):
// - A leg is { pin, col, row, hole }, as Parts.legsOf returns it. `col` is
//   the record's 0-based column, unchanged; `hole` is today's address with a
//   1-based column ("a12", rails "tp_12"), or null off the board.
// - checkPlacement(type, legs, holeMap, board) takes legs in that shape.
//   holeMap is App.holeMap()'s Map: hole → { label, pin } | { wire, end }.
//   board is { cols, bodyRows: ['a'..'j'] }, cols counting 1..cols.
// - Placement reasons are checked with includes() against the contract's
//   example text after "R1 not placed: ", so a reason may or may not start
//   with a label (checkPlacement is not given one).
// - The icon limit is 2 KB = 2048 bytes of UTF-8 (Buffer.byteLength or
//   new TextEncoder().encode(icon).length), not 2048 characters.
// - define() rejects C/L and unknown element kinds by calling elements() on
//   the part's defaults. It checks the report (80) and warnings (120)
//   lengths by calling measure/warnings/report on a sample result; the
//   fixtures accept any sample.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const testSpan  = require('./fixtures/parts/test_span.js');
const testThree = require('./fixtures/parts/test_three.js');

// The registry doesn't exist before this issue. Load it guarded, so a
// missing file or export fails as an assertion that says what's missing.
const REGISTRY = path.join(__dirname, '..', 'circuit3d', 'js', 'parts', 'registry.js');
let Parts = {};
let loadError = null;
try { Parts = require('../circuit3d/js/parts/registry.js'); } catch (e) { loadError = e; }

function need(name) {
  assert.ok(!loadError, 'circuit3d/js/parts/registry.js must exist and load in Node: ' + (loadError && loadError.message));
  assert.equal(typeof Parts[name], 'function', `registry.js must export Parts.${name}()`);
  return Parts[name];
}

beforeEach(() => { if (typeof Parts.reset === 'function') Parts.reset(); });

// ── Fixture helpers ───────────────────────────────────────────────────────

// A fresh definition from `base` with `change` applied.
function variant(base, change) {
  const def = base();
  change(def);
  return def;
}

// A 4-pin chip that straddles the centre gap (pins in rows e and f).
const testChip = () => variant(testThree, d => {
  Object.assign(d, { type: 'test_chip', name: 'Test chip', prefix: 'TC', pins: ['p1', 'p2', 'p3', 'p4'] });
  d.place    = { kind: 'footprint', legs: [[0, 0], [1, 0], [1, 1], [0, 1]], straddle: true, rotations: [0, 180] };
  d.elements = () => [{ kind: 'R', pins: ['p1', 'p4'], ohms: 1000 }, { kind: 'R', pins: ['p2', 'p3'], ohms: 1000 }];
  d.ai       = { about: 'A test-only chip.', keywords: ['chip'] };
  d.examples[0].parts[1] = { type: 'test_chip', label: 'TC1', holes: ['e10', 'e11', 'f11', 'f10'] };
  d.examples[0].expect   = { TC1: { current: 0 } };
});

// An off-board 2-pin source, like the battery.
const testOff = () => variant(testSpan, d => {
  Object.assign(d, { type: 'test_off', name: 'Test off', prefix: 'TO', category: 'Sources', ref: 'b' });
  d.place    = { kind: 'offboard' };
  d.values   = { voltage: { unit: 'V', default: 9, min: 0, max: 30 } };
  d.elements = v => [{ kind: 'V', pins: ['a', 'b'], volts: v.voltage }];
  d.ai       = { about: 'A test-only off-board source.', keywords: ['off'] };
  delete d.controls;
  delete d.gestures;
  d.examples[0].parts = [{ type: 'test_off', label: 'TO1' }];
  d.examples[0].expect = { TO1: { current: 0 } };
});

// A footprint part with n pins in a row.
const nPins = n => variant(testThree, d => {
  d.pins       = Array.from({ length: n }, (_, i) => 'p' + i);
  d.place.legs = d.pins.map((_, i) => [i, 0]);
  d.elements   = () => [{ kind: 'R', pins: ['p0', 'p1'], ohms: 1000 }];
});

// Inline <svg> markup of exactly `bytes` UTF-8 bytes, padded with `ch`.
function svgOf(bytes, ch = 'a') {
  const shell = '<svg></svg>';
  const pad = ch.repeat(Math.floor((bytes - shell.length) / Buffer.byteLength(ch)));
  return '<svg>' + pad + '</svg>';
}

// define(def) must throw a PartDefinitionError whose message matches every
// pattern.
function rejects(def, patterns) {
  const define = need('define');
  let err = null;
  try { define(def); } catch (e) { err = e; }
  assert.ok(err, 'define() should have thrown for this part');
  assert.equal(typeof Parts.PartDefinitionError, 'function', 'registry.js must export Parts.PartDefinitionError');
  assert.ok(err instanceof Parts.PartDefinitionError, `expected a PartDefinitionError, got ${err.name}: ${err.message}`);
  for (const p of patterns) assert.match(err.message, p);
}

// ── define(): a valid part ────────────────────────────────────────────────

test('a valid span part registers', () => {
  const def = need('define')(testSpan());
  assert.equal(def.type, 'test_span');
  assert.equal(need('get')('test_span'), def);
});

test('a valid footprint part, a straddling chip and an off-board part register', () => {
  const define = need('define');
  for (const make of [testThree, testChip, testOff]) {
    const def = make();
    assert.equal(define(def).type, def.type);
  }
});

test('define returns a frozen definition', () => {
  const def = need('define')(testSpan());
  assert.ok(Object.isFrozen(def), 'the definition is frozen');
  assert.ok(Object.isFrozen(def.place), 'its placement is frozen too');
  assert.ok(Object.isFrozen(def.ai), 'its ai spec is frozen too');
});

test('PartDefinitionError is an Error named PartDefinitionError', () => {
  assert.equal(typeof Parts.PartDefinitionError, 'function', 'registry.js must export Parts.PartDefinitionError');
  const err = new Parts.PartDefinitionError('x');
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'PartDefinitionError');
});

// ── define(): one broken rule per row ─────────────────────────────────────
// [what's wrong, the broken part, patterns the message must match].
// Unless the row says otherwise, the message must also name the part type.

const REQUIRED = ['type', 'name', 'sub', 'category', 'icon', 'prefix', 'pins', 'place',
                  'elements', 'report', 'ai', 'view', 'examples'];

const BROKEN = [
  ...REQUIRED.map(f => [`missing required field ${f}`, variant(testSpan, d => { delete d[f]; }),
                        [new RegExp('\\b' + f + '\\b')], f === 'type' ? null : 'test_span']),
  ['missing ai.about',                variant(testSpan, d => { delete d.ai.about; }),                 [/about/]],
  ['missing ai.keywords',             variant(testSpan, d => { delete d.ai.keywords; }),              [/keywords/]],
  ['missing view.build',              variant(testSpan, d => { d.view = {}; }),                       [/build/]],
  ['missing a value max',             variant(testSpan, d => { delete d.values.resistance.max; }),    [/resistance/, /max/]],

  // Regexes
  ['type with capitals',              variant(testSpan, d => { d.type = 'TestSpan'; }),               [/type/], 'TestSpan'],
  ['type starting with a digit',      variant(testSpan, d => { d.type = '9span'; }),                  [/type/], '9span'],
  ['lower-case prefix',               variant(testSpan, d => { d.prefix = 'ts'; }),                   [/prefix/, /ts/]],
  ['4-letter prefix',                 variant(testSpan, d => { d.prefix = 'TSPN'; }),                 [/prefix/, /TSPN/]],
  ['pin name with a dash',            variant(testSpan, d => { d.pins = ['a', 'b-1']; }),             [/pin/, /b-1/]],

  // Lengths
  ['name of 25 chars',                variant(testSpan, d => { d.name = 'N'.repeat(25); }),           [/name/, /24/]],
  ['sub of 33 chars',                 variant(testSpan, d => { d.sub = 'S'.repeat(33); }),            [/sub/, /32/]],
  ['about of 201 chars',              variant(testSpan, d => { d.ai.about = 'A'.repeat(201); }),      [/about/, /200/]],
  ['guide of 401 chars',              variant(testSpan, d => { d.ai.guide = 'G'.repeat(401); }),      [/guide/, /400/]],
  ['a warning of 121 chars',          variant(testSpan, d => { d.warnings = () => ['W'.repeat(121)]; }), [/warning/, /120/]],
  ['a report of 81 chars',            variant(testSpan, d => { d.report = () => 'R'.repeat(81); }),   [/report/, /80/]],
  ['icon of 2049 bytes',              variant(testSpan, d => { d.icon = svgOf(2049); }),              [/icon/, /2 ?KB|2048/i]],
  ['icon under 2048 chars but over 2048 bytes',
                                      variant(testSpan, d => { d.icon = svgOf(2210, 'Ω'); }),         [/icon/, /2 ?KB|2048/i]],
  ['icon that is not <svg> markup',   variant(testSpan, d => { d.icon = '<img src="x.png">'; }),      [/icon/, /svg/i]],

  // Enums
  ['unknown category',                variant(testSpan, d => { d.category = 'Misc'; }),               [/category/, /Misc/]],
  ['unknown unit',                    variant(testSpan, d => { d.values.resistance.unit = 'ohm'; }),  [/unit/, /ohm/]],
  ['unknown kit series',              variant(testSpan, d => { d.values.resistance.series = 'E6'; }), [/series/, /E6/]],
  ['unknown control type',            variant(testSpan, d => { d.controls.closed.type = 'dial'; }),   [/control/, /dial/]],
  ['unknown gesture',                 variant(testSpan, d => { d.gestures = { hover: 'closed' }; }),  [/gesture/, /hover/]],
  ['gesture on a missing control',    variant(testSpan, d => { d.gestures = { click: 'nope' }; }),    [/gesture/, /nope/]],
  ['unknown element kind',            variant(testSpan, d => { d.elements = () => [{ kind: 'Z9', pins: ['a', 'b'] }]; }), [/kind/, /Z9/]],
  ['a C element (reserved)',          variant(testSpan, d => { d.elements = () => [{ kind: 'C', pins: ['a', 'b'] }]; }),  [/\bC\b/]],
  ['an L element (reserved)',         variant(testSpan, d => { d.elements = () => [{ kind: 'L', pins: ['a', 'b'] }]; }),  [/\bL\b/]],
  ['element on an unknown pin',       variant(testSpan, d => { d.elements = () => [{ kind: 'R', pins: ['a', 'nope'], ohms: 10 }]; }), [/nope/]],
  ['R element with ohms 0',           variant(testSpan, d => { d.elements = () => [{ kind: 'R', pins: ['a', 'b'], ohms: 0 }]; }),     [/ohms/]],
  ['unknown placement kind',          variant(testSpan, d => { d.place = { kind: 'grid' }; }),        [/grid/]],
  ['unknown span rotation',           variant(testSpan, d => { d.place.rotations = ['h', 'diag']; }), [/rotation/, /diag/]],
  ['unknown footprint rotation',      variant(testThree, d => { d.place.rotations = [0, 45]; }),      [/rotation/, /45/], 'test_three'],
  ['straddling chip that turns 90°',  variant(testChip, d => { d.place.rotations = [0, 90, 180, 270]; }), [/straddle/, /rotation/], 'test_chip'],

  // Pins
  ['1 pin',                           variant(testSpan, d => { d.pins = ['a']; }),                    [/pin/, /2/]],
  ['17 pins',                         nPins(17),                                                      [/pin/, /16/], 'test_three'],
  ['duplicate pin names',             variant(testSpan, d => { d.pins = ['a', 'a']; }),               [/pin/, /unique|duplicate|twice|repeat/i]],
  ['3 pins on a span part',           variant(testSpan, d => { d.pins = ['a', 'b', 'c']; }),          [/pin/, /span/]],
  ['pins not matching the footprint', variant(testThree, d => { d.place.legs = [[0, 0], [1, 0]]; }),  [/pin/, /leg|footprint/], 'test_three'],
  ['ref that is not a pin',           variant(testOff, d => { d.ref = 'nope'; }),                     [/ref/, /nope/], 'test_off'],

  // Defaults inside their range
  ['value default below min',         variant(testSpan, d => { d.values.resistance.default = 0; }),   [/resistance/, /default/]],
  ['value min above max',             variant(testSpan, d => { Object.assign(d.values.resistance, { min: 10, max: 1, default: 5 }); }), [/resistance/]],
  ['choice default not a choice',     variant(testSpan, d => { d.values.color.default = 'purple'; }), [/color/, /purple/]],
  ['slider default above max',        variant(testThree, d => { d.controls.level.default = 150; }),   [/level/, /default/], 'test_three'],
  ['momentary control defaulting on', variant(testSpan, d => { d.controls.closed = { type: 'momentary', default: true, saved: false }; }), [/momentary/]],
  ['span default above max',          variant(testSpan, d => { d.place.span = { min: 3, max: 5, default: 6 }; }), [/span/, /default/]],
  ['span min above max',              variant(testSpan, d => { d.place.span = { min: 5, max: 3, default: 4 }; }), [/span/]],

  // Examples and keywords
  ['no examples',                     variant(testSpan, d => { d.examples = []; }),                   [/example/]],
  ['9 keywords',                      variant(testSpan, d => { d.ai.keywords = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9']; }), [/keyword/, /8/]],
  ['a keyword not in lower case',     variant(testSpan, d => { d.ai.keywords = ['test', 'Span']; }),  [/keyword/, /Span/]],

  // Unknown fields
  ['unknown top-level field',         variant(testSpan, d => { d.colour = 'red'; }),                  [/colour/]],
  ['unknown ai field',                variant(testSpan, d => { d.ai.prompt = 'hi'; }),                [/prompt/]],
  // ai.recipes (#118): a list of worked builds, each an Example like ai.recipe.
  ['ai.recipes that is not a list',   variant(testSpan, d => { d.ai.recipes = d.examples[0]; }),     [/recipes/, /list/]],
  ['an ai.recipes entry with no name', variant(testSpan, d => { d.ai.recipes = [{ ...d.examples[0], name: '' }]; }), [/recipes/, /name/]],
  ['unknown value-spec field',        variant(testSpan, d => { d.values.resistance.step = 1; }),      [/step/]],
];

for (const [what, def, patterns, part = 'test_span'] of BROKEN) {
  test(`define rejects a part with ${what}, naming the rule`, () => {
    rejects(def, part ? patterns.concat(new RegExp(part)) : patterns);
  });
}

test('the icon fixtures are the byte sizes the rows above claim', () => {
  assert.equal(Buffer.byteLength(svgOf(2048)), 2048);
  assert.equal(Buffer.byteLength(svgOf(2049)), 2049);
  const wide = svgOf(2210, 'Ω');
  assert.ok(wide.length < 2048 && Buffer.byteLength(wide) > 2048, `${wide.length} chars, ${Buffer.byteLength(wide)} bytes`);
});

// Each limit is inclusive: a part exactly at it registers.
const AT_LIMIT = [
  ['name of 24 chars',       variant(testSpan, d => { d.name = 'N'.repeat(24); })],
  ['sub of 32 chars',        variant(testSpan, d => { d.sub = 'S'.repeat(32); })],
  ['about of 200 chars',     variant(testSpan, d => { d.ai.about = 'A'.repeat(200); })],
  ['guide of 400 chars',     variant(testSpan, d => { d.ai.guide = 'G'.repeat(400); })],
  ['a warning of 120 chars', variant(testSpan, d => { d.warnings = () => ['W'.repeat(120)]; })],
  ['a report of 80 chars',   variant(testSpan, d => { d.report = () => 'R'.repeat(80); })],
  ['icon of 2048 bytes',     variant(testSpan, d => { d.icon = svgOf(2048); })],
  ['8 keywords',             variant(testSpan, d => { d.ai.keywords = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8']; })],
  ['ai.recipes of two Examples (#118)', variant(testSpan, d => { d.ai.recipes = [d.examples[0], { ...d.examples[0], name: 'second' }]; })],
  ['16 pins',                nPins(16)],
  ['a fixed span',           variant(testSpan, d => { d.place.span = { min: 3, max: 3, default: 3 }; })],
];

for (const [what, def] of AT_LIMIT) {
  test(`define accepts a part with ${what}`, () => {
    need('define')(def);
  });
}

// ── Optional headline and line, issue #26 ─────────────────────────────────
//   headline?: (r, m) → { text, cls }         one line at the top of the results
//   line?:     (r, m) → { text, cls } | null  replaces the generic "💡 NAME ON" line
// Both are optional; when given, each must be a function.

test('define accepts a part with headline(r, m) and line(r, m) functions (#26)', () => {
  const define = need('define');
  const def = variant(testSpan, d => {
    d.headline = () => ({ text: 'Test 1: ok', cls: 'sim-info' });
    d.line     = () => null;
  });
  let err = null;
  try { define(def); } catch (e) { err = e; }
  assert.strictEqual(err, null, `headline and line are optional PartDefinition fields; define() threw: ${err && err.message}`);
});

test('define refuses a headline or line that is not a function (#26)', () => {
  rejects(variant(testSpan, d => { d.headline = 'Battery 1: 9V'; }), [/test_span/, /headline/, /function/]);
  rejects(variant(testSpan, d => { d.line = { text: 'x', cls: 'sim-on' }; }), [/test_span/, /\bline\b/, /function/]);
});

test('the error lists every broken rule, not just the first', () => {
  rejects(variant(testSpan, d => {
    d.name = 'N'.repeat(30);
    d.prefix = 'bad';
    d.ai.keywords = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9'];
  }), [/test_span/, /name/, /24/, /prefix/, /bad/, /keyword/, /8/]);
});

// ── define(): unique type, prefix and tool name ───────────────────────────

test('a second part with the same type throws', () => {
  need('define')(testSpan());
  rejects(variant(testSpan, d => { d.prefix = 'TX'; d.ai.tool = 'place_other'; }), [/type/, /test_span/]);
});

test('a second part with the same prefix throws', () => {
  need('define')(testSpan());
  rejects(variant(testThree, d => { d.prefix = 'TS'; }), [/prefix/, /TS/, /test_three/]);
});

test('a second part with the same tool name throws, counting the default place_<type>', () => {
  need('define')(testSpan());
  rejects(variant(testThree, d => { d.ai.tool = 'place_test_span'; }), [/tool/, /place_test_span/, /test_three/]);
});

test('a rejected part is not registered', () => {
  rejects(variant(testSpan, d => { d.category = 'Misc'; }), [/category/]);
  assert.equal(need('get')('test_span'), null);
  need('define')(testSpan());
});

// ── get / all / reset ─────────────────────────────────────────────────────

test('get returns the definition, or null for an unknown type', () => {
  const def = need('define')(testSpan());
  assert.equal(need('get')('test_span'), def);
  assert.equal(need('get')('nope'), null);
});

test('all() lists parts in category order, then name order', () => {
  const define = need('define');
  const make = (type, prefix, name, category) => variant(testSpan, d => {
    Object.assign(d, { type, prefix, name, category });
  });
  define(make('i_one',  'IA', 'Alpha',  'Instruments'));
  define(make('p_zed',  'PZ', 'Zed',    'Passives'));
  define(make('io_one', 'IO', 'Bee',    'I/O'));
  define(make('s_one',  'SA', 'Source', 'Sources'));
  define(make('p_able', 'PA', 'Able',   'Passives'));
  define(make('sc_one', 'SC', 'Semi',   'Semiconductors'));
  assert.deepEqual(need('all')().map(d => d.type), ['p_able', 'p_zed', 's_one', 'sc_one', 'io_one', 'i_one']);
});

test('reset() empties the registry, so the same part can be defined again', () => {
  need('define')(testSpan());
  need('reset')();
  assert.equal(need('get')('test_span'), null);
  assert.deepEqual(need('all')(), []);
  need('define')(testSpan());
});

// ── Loading ───────────────────────────────────────────────────────────────

test('require("circuit3d/js/parts") gives Node the registry', () => {
  let index;
  try { index = require('../circuit3d/js/parts'); } catch (e) {
    assert.fail('circuit3d/js/parts/index.js must exist and load in Node: ' + e.message);
  }
  assert.equal(typeof index.define, 'function', 'index.js returns Parts');
  assert.equal(index, Parts, 'index.js returns the same registry as registry.js');
});

test('in the browser, registry.js sets window.Parts and leaves window.App alone', () => {
  assert.ok(fs.existsSync(REGISTRY), 'circuit3d/js/parts/registry.js must exist');
  const win = vm.createContext({ TextEncoder });
  win.window = win;
  vm.runInContext(fs.readFileSync(REGISTRY, 'utf8'), win);
  assert.equal(typeof (win.Parts && win.Parts.define), 'function', 'window.Parts.define');
  assert.equal(win.App, undefined);
});

// ── nearestKit ────────────────────────────────────────────────────────────

test('nearestKit finds the nearest E12 value across decades', () => {
  const nearestKit = need('nearestKit');
  assert.strictEqual(nearestKit(1234, 'E12'), 1200);
  assert.strictEqual(nearestKit(470, 'E12'), 470);
  assert.strictEqual(nearestKit(0.0047, 'E12'), 0.0047);
  assert.strictEqual(nearestKit(9.5, 'E12'), 10);
  assert.strictEqual(nearestKit(1600, 'E12'), 1500);
});

test('nearestKit uses the E24 series when asked', () => {
  assert.strictEqual(need('nearestKit')(1600, 'E24'), 1600);
});

// ── checkValue ────────────────────────────────────────────────────────────

describe('checkValue', () => {
  beforeEach(() => { need('define')(testSpan()); });

  test('a kit value in range is ok, with no hint', () => {
    const r = need('checkValue')('test_span', 'resistance', 470);
    assert.equal(r.ok, true);
    assert.equal(r.value, 470);
    assert.equal(r.hint, undefined);
  });

  test('1234 Ω is allowed, with a hint naming the closest E12 value', () => {
    const r = need('checkValue')('test_span', 'resistance', 1234);
    assert.equal(r.ok, true);
    assert.equal(r.value, 1234);
    assert.ok(typeof r.hint === 'string' && r.hint.includes('1.2 kΩ'), `hint: ${r.hint}`);
    assert.match(r.hint, /closest kit value/);
  });

  test('below the range fails with the range in the reason', () => {
    const r = need('checkValue')('test_span', 'resistance', -5);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'resistance must be 1 Ω–10 MΩ; got −5');
  });

  test('above the range fails with the range in the reason', () => {
    const r = need('checkValue')('test_span', 'resistance', 20e6);
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('1 Ω–10 MΩ'), r.reason);
  });

  test('a choice value must be one of the choices', () => {
    const checkValue = need('checkValue');
    assert.equal(checkValue('test_span', 'color', 'green').ok, true);
    const r = checkValue('test_span', 'color', 'purple');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'color must be one of red, yellow, green, blue, white');
  });

  test('an unknown key fails', () => {
    assert.equal(need('checkValue')('test_span', 'bogus', 1).ok, false);
  });

  test('a string number fails as not a number, with the string quoted', () => {
    const r = need('checkValue')('test_span', 'resistance', '470');
    assert.equal(r.ok, false);
    assert.match(r.reason, /must be a number/);
    assert.ok(r.reason.includes('"470"'), `reason should quote the string: ${r.reason}`);
  });

  test('null, NaN and an object each fail as not a number', () => {
    const checkValue = need('checkValue');
    for (const v of [null, NaN, { ohms: 470 }]) {
      const r = checkValue('test_span', 'resistance', v);
      assert.equal(r.ok, false, `${String(v)} should fail`);
      assert.match(r.reason, /must be a number/, `reason for ${String(v)}`);
    }
  });
});

// ── checkPlacement ────────────────────────────────────────────────────────

const BOARD = { cols: 63, bodyRows: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] };

// A leg in legsOf's shape from an address: leg('a', 'a3') → { pin: 'a', col: 2, row: 'a', hole: 'a3' }.
// Built by hand so it also works past the board's last column.
function leg(pin, hole) {
  const m = /^([a-j]|tp|tn|bn|bp)_?(\d+)$/.exec(hole);
  return { pin, col: Number(m[2]) - 1, row: m[1], hole };
}
const span = (from, to) => [leg('a', from), leg('b', to)];
const three = (a, b, c) => [leg('in', a), leg('gnd', b), leg('out', c)];

describe('checkPlacement', () => {
  beforeEach(() => {
    const define = need('define');
    define(testSpan());
    define(testThree());
    define(testChip());
  });
  const place = (type, legs, holeMap = new Map(), board = BOARD) => need('checkPlacement')(type, legs, holeMap, board);

  test('a span part {min:3,max:5,default:4} at a3→a7 is ok', () => {
    assert.deepEqual(place('test_span', span('a3', 'a7')), { ok: true });
  });

  test('spans 3 and 5, and legs in either order, are ok', () => {
    assert.equal(place('test_span', span('a3', 'a6')).ok, true);
    assert.equal(place('test_span', span('a3', 'a8')).ok, true);
    assert.equal(place('test_span', span('a7', 'a3')).ok, true);
  });

  test('a3→a33 is refused, and the reason gives the range 3–5 and the span', () => {
    const r = place('test_span', span('a3', 'a33'));
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('3–5'), r.reason);
    assert.ok(r.reason.includes('columns apart; a3 to a33 is 30.'), r.reason);
  });

  test('a3→a4 is refused as too short, with the range', () => {
    const r = place('test_span', span('a3', 'a4'));
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('3–5') && r.reason.includes('a3 to a4 is 1'), r.reason);
  });

  test('min − 1 (a3→a5) and max + 1 (a3→a9) are refused with the range', () => {
    for (const to of ['a5', 'a9']) {
      const r = place('test_span', span('a3', to));
      assert.equal(r.ok, false, to);
      assert.ok(r.reason.includes('3–5'), r.reason);
    }
  });

  test('legs on different rows and columns are refused', () => {
    assert.equal(place('test_span', span('a3', 'b7')).ok, false);
  });

  test('a3→c3, vertical inside one half, is refused', () => {
    const r = place('test_span', span('a3', 'c3'));
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('a part placed vertically must cross the centre gap (one leg in a–e, one in f–j).'), r.reason);
  });

  test('vertical across the centre gap (e3→f3, a3→j3) is ok', () => {
    assert.deepEqual(place('test_span', span('e3', 'f3')), { ok: true });
    assert.deepEqual(place('test_span', span('a3', 'j3')), { ok: true });
  });

  test('across the gap but in two columns (e3→f4) is refused', () => {
    assert.equal(place('test_span', span('e3', 'f4')).ok, false);
  });

  test('a part without the v rotation cannot be placed vertically', () => {
    need('reset')();
    need('define')(variant(testSpan, d => { d.place.rotations = ['h']; }));
    assert.equal(place('test_span', span('e3', 'f3')).ok, false);
  });

  test('a leg on a hole holding another part is refused, naming the occupant', () => {
    const holeMap = new Map([['a3', { label: 'R1', pin: '2' }]]);
    const r = place('test_span', span('a3', 'a7'), holeMap);
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes("a3 already holds R1's pin 2. A hole holds one lead; use another hole in column 3."), r.reason);
  });

  test('a leg on a hole holding a wire end is refused, naming the wire', () => {
    const r = place('test_span', span('a3', 'a7'), new Map([['a7', { wire: 3, end: 'from' }]]));
    assert.equal(r.ok, false);
    assert.match(r.reason, /a7/);
    assert.match(r.reason, /wire/);
  });

  test('a taken hole between the legs does not block', () => {
    const holeMap = new Map([['a4', { label: 'R1', pin: '1' }]]);
    assert.deepEqual(place('test_span', span('a3', 'a7'), holeMap), { ok: true });
  });

  test('a 3-pin footprint inside the board is ok', () => {
    assert.deepEqual(place('test_three', three('a61', 'a62', 'a63')), { ok: true });
  });

  test('a 3-pin footprint anchored at the last column is refused as running off the edge', () => {
    const r = place('test_three', three('a63', 'a64', 'a65'));
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('would run past column 63'), r.reason);
  });

  test('the edge is the board passed in, not a fixed size', () => {
    const r = place('test_three', three('a50', 'a51', 'a52'), new Map(), { ...BOARD, cols: 50 });
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('would run past column 50'), r.reason);
  });

  test('a straddling chip across rows e and f is ok; in rows a and b it is refused', () => {
    const chip = holes => holes.map((h, i) => leg('p' + (i + 1), h));
    assert.deepEqual(place('test_chip', chip(['e10', 'e11', 'f11', 'f10'])), { ok: true });
    const r = place('test_chip', chip(['a10', 'a11', 'b11', 'b10']));
    assert.equal(r.ok, false);
    assert.ok(r.reason.includes('a chip must sit across the centre gap (rows e and f).'), r.reason);
  });
});

// ── legsOf ────────────────────────────────────────────────────────────────

describe('legsOf', () => {
  beforeEach(() => {
    const define = need('define');
    define(testSpan());
    define(testThree());
    define(testOff());
  });

  const expected = [{ pin: 'a', col: 11, row: 'a', hole: 'a12' },
                    { pin: 'b', col: 15, row: 'a', hole: 'a16' }];

  test('a saved record with pin names gives one leg per pin, 1-based holes', () => {
    const comp = { type: 'test_span', label: 'TS1',
                   holeRefs: [{ pin: 'a', col: 11, row: 'a' }, { pin: 'b', col: 15, row: 'a' }] };
    assert.deepEqual(need('legsOf')(comp), expected);
  });

  test('a record without pin names takes them from the part, in pin order', () => {
    const comp = { type: 'test_span', label: 'TS1', holeRefs: [{ col: 11, row: 'a' }, { col: 15, row: 'a' }] };
    assert.deepEqual(need('legsOf')(comp), expected);
  });

  test('rail holes use the tp_12 form', () => {
    const comp = { type: 'test_three', label: 'TT1',
                   holeRefs: [{ col: 11, row: 'tp' }, { col: 12, row: 'a' }, { col: 13, row: 'j' }] };
    assert.deepEqual(need('legsOf')(comp).map(l => [l.pin, l.hole]),
                     [['in', 'tp_12'], ['gnd', 'a13'], ['out', 'j14']]);
  });

  test('an off-board part has one leg per pin, each with hole null', () => {
    const legs = need('legsOf')({ type: 'test_off', label: 'TO1', holeRefs: null, position: { x: -20, z: 0 } });
    assert.deepEqual(legs.map(l => l.pin), ['a', 'b']);
    assert.deepEqual(legs.map(l => l.hole), [null, null]);
  });

  test('a runtime record with a null holeRef gives that leg hole null', () => {
    const legs = need('legsOf')({ type: 'test_span', label: 'TS1', holeRefs: [{ col: 2, row: 'a' }, null] });
    assert.deepEqual(legs.map(l => [l.pin, l.hole]), [['a', 'a3'], ['b', null]]);
  });

  // Decision 7: files carry pin names so reordering can't break old circuits.
  // Legs come back in the part's pins order, matched by name.
  test('named holeRefs in swapped order come back in pin order, each with its own hole', () => {
    const comp = { type: 'test_span', label: 'TS1',
                   holeRefs: [{ pin: 'b', col: 15, row: 'a' }, { pin: 'a', col: 11, row: 'a' }] };
    assert.deepEqual(need('legsOf')(comp), expected);
  });

  test('a named pin missing from the record gets hole null at its pin-order position', () => {
    const comp = { type: 'test_three', label: 'TT1',
                   holeRefs: [{ pin: 'in', col: 11, row: 'tp' }, { pin: 'out', col: 13, row: 'j' }] };
    assert.deepEqual(need('legsOf')(comp).map(l => [l.pin, l.hole]),
                     [['in', 'tp_12'], ['gnd', null], ['out', 'j14']]);
  });

  test('a holeRef with an unknown pin name goes at the end, keeping its name', () => {
    const comp = { type: 'test_span', label: 'TS1',
                   holeRefs: [{ pin: 'old', col: 15, row: 'a' }, { pin: 'a', col: 11, row: 'a' }] };
    assert.deepEqual(need('legsOf')(comp).map(l => [l.pin, l.hole]),
                     [['a', 'a12'], ['b', null], ['old', 'a16']]);
  });
});
