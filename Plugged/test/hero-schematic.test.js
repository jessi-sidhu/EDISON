// The landing hero's schematic, edison/hero-schematic.js (issue #164, Edison
// landing v3 3/4). Aarmen approved its look (ref docs/design/landing-v3/05:
// white on black, plate battery, zigzag resistor, LED with two arrows,
// square-cornered wires with node dots, mono labels), so these tests PIN the
// markup as drafted; they don't ask for changes. They guard what the landing's
// CSS and timeline rely on:
// - every stroke is a <path pathLength="1"> (paths only: WebKit dashes other
//   shapes unevenly), so `stroke-dasharray: 1; stroke-dashoffset: 1 → 0` draws
//   each one, starting at its --d and taking its --t;
// - the strokes finish within DRAW_MS, in document order (one pen);
// - the labels name the circuit the hero frame shows, edison/demo/led.sparky.
//
// Run with:  npm test
//
// API (UMD: window.HeroSchematic in the page, module.exports in Node):
//   HeroSchematic.SCHEMATIC       the drawing as data ({ circuit, viewBox,
//                                 strokes, dots, labels })
//   HeroSchematic.DRAW_MS         how long the strokes take, ms
//   HeroSchematic.schematicSvg()  the markup for the stage: one
//                                 <svg class="ed-schematic">
// The page reads it through landing.js; Landing.TIMELINE's schematic stage
// outlasting DRAW_MS is test/edison-landing.test.js.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'edison', 'hero-schematic.js');
const DEMO = path.join(ROOT, 'edison', 'demo', 'led.sparky');

// Loaded per test, so a module that can't load in Node fails each test by name.
function HeroSchematic() {
  assert.ok(fs.existsSync(FILE), `edison/hero-schematic.js should exist: ${path.relative(ROOT, FILE)}`);
  let mod;
  try { mod = require(FILE); } catch (e) {
    assert.fail(`edison/hero-schematic.js can't be loaded in Node: ${e.message.split('\n')[0]}`);
  }
  assert.ok(mod && typeof mod.schematicSvg === 'function', 'HeroSchematic.schematicSvg is a function');
  return mod;
}

function svg() {
  const out = HeroSchematic().schematicSvg();
  assert.equal(typeof out, 'string', 'schematicSvg() returns markup as a string');
  return out;
}

// The markup, read with patterns (Node has no DOM): each <name ...> tag's
// attribute text, an attribute's value, and a --var in the style, in ms.
const tags  = (s, name) => [...s.matchAll(new RegExp(`<${name}(?=[\\s/>])([^>]*)>`, 'g'))].map(m => m[1]);
const attr  = (a, name) => { const m = a.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1] : null; };
const msVar = (a, name) => { const m = (attr(a, 'style') || '').match(new RegExp(`--${name}:\\s*(-?\\d+(?:\\.\\d+)?)ms\\b`)); return m ? Number(m[1]) : NaN; };
const texts = s => [...s.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);

test('schematicSvg() is one <svg class="ed-schematic"> with viewBox 0 0 960 540', () => {
  const s = svg();
  expect(s.startsWith('<svg'), 'the markup starts with <svg').toBe(true);
  expect(s.trimEnd().endsWith('</svg>'), 'the markup ends with </svg>').toBe(true);
  expect(tags(s, 'svg').length, '<svg> elements').toBe(1);
  expect((s.match(/<\/svg>/g) || []).length, '</svg> closes').toBe(1);
  const root = tags(s, 'svg')[0];
  expect(attr(root, 'class'), 'the root\'s class').toBe('ed-schematic');
  expect(attr(root, 'viewBox'), 'the root\'s viewBox').toBe('0 0 960 540');
});

test('the strokes: 14 <path pathLength="1">, each with numeric --d and --t in ms; no rect, line, polyline or polygon; 4 node dots (<circle>)', () => {
  const s = svg(), paths = tags(s, 'path');
  expect(paths.length, '<path> strokes').toBe(14);
  paths.forEach((p, i) => {
    expect(attr(p, 'pathLength'), `path ${i} pathLength`).toBe('1');
    expect(Number.isFinite(msVar(p, 'd')), `path ${i} has a numeric --d (style="${attr(p, 'style')}")`).toBe(true);
    expect(Number.isFinite(msVar(p, 't')), `path ${i} has a numeric --t (style="${attr(p, 'style')}")`).toBe(true);
  });
  for (const shape of ['rect', 'line', 'polyline', 'polygon'])
    expect(tags(s, shape).length, `<${shape}> elements (strokes are paths only)`).toBe(0);
  expect(tags(s, 'circle').length, '<circle> node dots').toBe(4);
});

// One pen: each stroke starts no earlier than the one before it, and the last
// one is finished by DRAW_MS.
test('the draw timing: every path\'s --d + --t is within DRAW_MS, and --d never goes back in document order', () => {
  const { DRAW_MS } = HeroSchematic();
  expect(typeof DRAW_MS, 'HeroSchematic.DRAW_MS').toBe('number');
  const t = tags(svg(), 'path').map(p => ({ d: msVar(p, 'd'), t: msVar(p, 't') }));
  const late = t.map((x, i) => ({ i, end: x.d + x.t })).filter(x => !(x.end <= DRAW_MS));
  expect(late, `paths still drawing after DRAW_MS ${DRAW_MS} (index, --d + --t)`).toEqual([]);
  const back = t.slice(1).map((x, i) => ({ i: i + 1, d: x.d, before: t[i].d })).filter(x => !(x.d >= x.before));
  expect(back, 'paths that start before the one ahead of them').toEqual([]);
});

// The labels are the circuit the frame builds: R1 470 Ω (yellow, violet,
// brown: 4, 7, ×10) and the 9 V battery from edison/demo/led.sparky, and LED1.
test('the labels: "470 Ω", "Yellow, Violet, Brown", "9 V", "Battery" and "LED1", matching edison/demo/led.sparky', () => {
  const H = HeroSchematic(), got = texts(svg());
  for (const want of ['470 Ω', 'Yellow, Violet, Brown', '9 V', 'Battery', 'LED1'])
    expect(got, `a <text> reading ${JSON.stringify(want)}`).toContain(want);

  expect(H.SCHEMATIC && H.SCHEMATIC.circuit, 'SCHEMATIC.circuit, the file the hero frame shows').toBe('edison/demo/led.sparky');
  const parts = JSON.parse(fs.readFileSync(DEMO, 'utf8')).components;
  const by = label => parts.find(c => c.label === label) || {};
  expect(got, 'R1\'s resistance from led.sparky, as a label').toContain(`${by('R1').values.resistance} Ω`);
  expect(got, 'BAT1\'s voltage from led.sparky, as a label').toContain(`${by('BAT1').values.voltage} V`);
  expect(by('LED1').type, 'LED1 in led.sparky is an LED').toBe('led');
});
