// The Edison landing page's logic (issue #166, Edison landing v3 1/4: the
// page cut to the top, all black, a HUD stage frame under the Ask box). The
// page itself (the kept wordmark, headline and Ask box, the .ed-stage frame,
// no giant word, sections or toggle, #101010, 390 px, localStorage never
// written, an empty Ask → the editor) is e2e/edison-landing.spec.js.
//
// Run with:  npm test
//
// API these tests are written against, UMD like simulate.js and ui-flag.js:
// window.Landing in the page, module.exports in Node.
//   Landing.EXAMPLES            string[], requests the "Ask Edison" box can
//                               offer (kept from #149). EXAMPLES[0] is the
//                               box's placeholder and what an empty box sends:
//                               "Build me a light bulb" from v3 on.
//   Landing.editorUrl(prompt)   '../circuit3d/index.html?ui=edison&ask=' +
//                               encodeURIComponent(prompt) (kept from #149).
//   Landing.TIMELINE            (#164) [{ stage, ms }], the hero sequence as
//                               data, in order: idle → schematic → inset →
//                               sketch → solid → lit → done. schematic and
//                               inset are fixed times (the schematic draws,
//                               then FLIPs into the inset); sketch, solid and
//                               lit await the frame's Hero.stage(), so their
//                               ms are not pinned here.
//   Landing.plays(text)         (#164) true when "Ask Edison" plays the hero
//                               sequence instead of opening the editor: an
//                               empty box (after trim), or text matching
//                               /light ?bulb|\bled\b/i.
// No theme API: v3 has no light mode, so there is no THEME_KEY, readTheme or
// saveTheme, and the landing never writes localStorage. (#166 removed v2's
// theme tests: dark by default, the saved-theme reads, the save/read round
// trip, the four blocked-storage cases and the OS-scheme case.)
//
// The schematic itself (edison/hero-schematic.js) is test/hero-schematic.test.js;
// its DRAW_MS is read here so the schematic stage always outlasts the drawing.
// The sequence in the page (the stages in real time, the steps, the frame,
// the end button, reduced motion, a replay) is e2e/edison-landing.spec.js.
//
// The landing no longer shows edison/demo/inverting-amp.sparky (the hero
// stage is L2/L3's), but the file stays in edison/demo/ and viewer.html's
// ?circuit= still serves it, so the two tests that keep it a valid LG-13
// board stay here unchanged. Hand-computed (ideal op-amp; the TL072's finite
// gain moves it < 1 mV):
//   Vout  = −(Rf / Rin) · Vin = −(100 kΩ / 10 kΩ) · 0.5 V = −5.00 V
//   IN1− is a virtual ground, so V(Rin) = 0.50 V and V(Rf) = 5.00 V,
//   and the input draws nothing: I(Rin) = I(Rf) = 0.5 V / 10 kΩ = 0.05 mA.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const Sim      = require('../circuit3d/js/simulate.js');
const IO       = require('../circuit3d/js/board-io.js');
const Parts    = require('../circuit3d/js/parts');
const Readings = require('../circuit3d/js/readings.js');

const ROOT = path.join(__dirname, '..');
const DEMO = path.join(ROOT, 'edison', 'demo', 'inverting-amp.sparky');
const LANDING = path.join(ROOT, 'edison', 'landing.js');

const VIN = 0.5, RIN = 10000, RF = 100000;
const VOUT = -(RF / RIN) * VIN;                 // −5.00 V
const I_IN = VIN / RIN * 1000;                  // 0.05 mA

// Loaded per test, so a module that can't load in Node fails each test by name.
function Landing() {
  assert.ok(fs.existsSync(LANDING), `edison/landing.js should exist: ${path.relative(ROOT, LANDING)}`);
  let mod;
  try { mod = require(LANDING); } catch (e) {
    assert.fail(`edison/landing.js can't be loaded in Node (no DOM there): ${e.message.split('\n')[0]}`);
  }
  assert.ok(mod && typeof mod === 'object', `edison/landing.js exports an object (got ${typeof mod})`);
  return mod;
}

// ── v3: the light bulb leads, and there is no theme ──

// The placeholder the visitor reads is what an empty Ask sends, so the hero's
// light bulb (L2–L4) and the request line up.
test('EXAMPLES[0], the placeholder and what an empty Ask sends, is "Build me a light bulb"', () => {
  const ex = Landing().EXAMPLES;
  assert.ok(Array.isArray(ex), `EXAMPLES is an array; got ${JSON.stringify(ex)}`);
  expect(ex[0]).toBe('Build me a light bulb');
});

// Pin: v3 dropped light mode. Nothing named for a theme is exported, so a
// toggle can't come back by accident through the module.
test('the theme API is gone: no THEME_KEY, readTheme, saveTheme or any other theme export', () => {
  const L = Landing();
  for (const k of ['THEME_KEY', 'readTheme', 'saveTheme', 'applyTheme'])
    expect(k in L, `Landing.${k} is not exported (got ${typeof L[k]})`).toBe(false);
  expect(Object.keys(L).filter(k => /theme/i.test(k)), 'exports named for a theme').toEqual([]);
});

// ── #164: the hero sequence as data, and which requests play it ──

const SCHEMATIC_JS = path.join(ROOT, 'edison', 'hero-schematic.js');
const SEQUENCE = ['idle', 'schematic', 'inset', 'sketch', 'solid', 'lit', 'done'];

function HeroSchematic() {
  assert.ok(fs.existsSync(SCHEMATIC_JS), `edison/hero-schematic.js should exist: ${path.relative(ROOT, SCHEMATIC_JS)}`);
  return require(SCHEMATIC_JS);
}

function timeline() {
  const T = Landing().TIMELINE;
  assert.ok(Array.isArray(T), `Landing.TIMELINE is an array of { stage, ms }; got ${T === undefined ? 'undefined' : JSON.stringify(T)}`);
  return T;
}
const msOf = (T, stage) => { const s = T.find(x => x && x.stage === stage); return s ? s.ms : undefined; };

test('TIMELINE: one { stage, ms } per stage, in order idle → schematic → inset → sketch → solid → lit → done, none repeated', () => {
  const T = timeline();
  expect(T.map(s => s && s.stage), 'the stages, in order').toEqual(SEQUENCE);
  expect(new Set(T.map(s => s && s.stage)).size, 'each stage once').toBe(T.length);
});

// The schematic stage must outlast the strokes (DRAW_MS) and the label fades
// after them (the last label starts at DRAW_MS + 300), or the FLIP shrinks a
// half-drawn schematic into the inset. The fixed part of the run (schematic +
// inset) leaves room in ~8–9 s for the frame's own stages.
test('TIMELINE: the schematic stage lasts at least HeroSchematic.DRAW_MS + 300 ms, and schematic + inset is 2.5–4 s', () => {
  const T = timeline(), H = HeroSchematic();
  const schematic = msOf(T, 'schematic'), inset = msOf(T, 'inset');
  expect(typeof schematic, `TIMELINE's schematic ms (got ${JSON.stringify(schematic)})`).toBe('number');
  expect(typeof inset, `TIMELINE's inset ms (got ${JSON.stringify(inset)})`).toBe('number');
  expect(schematic, `the schematic stage vs DRAW_MS ${H.DRAW_MS} + 300 ms of label fades`).toBeGreaterThanOrEqual(H.DRAW_MS + 300);
  expect(inset, 'the FLIP into the inset takes time').toBeGreaterThan(0);
  expect(schematic + inset, 'schematic + inset, ms').toBeGreaterThanOrEqual(2500);
  expect(schematic + inset, 'schematic + inset, ms').toBeLessThanOrEqual(4000);
});

// An empty box (the placeholder is the light bulb) or a light-bulb / LED
// request plays the hero; anything else goes to the editor. \bled\b is a
// whole word, so "bled" doesn't count.
test.each([
  ['', true],
  ['   ', true],
  ['Build me a light bulb', true],
  ['build me a LIGHT BULB please', true],
  ['an LED circuit', true],
  ['lightbulb', true],
  ['Build me an inverting amplifier, gain −10', false],
  ['bled dry', false],
  ['Divide 5 V down to 3.3 V', false],
])('plays(%j) is %s', (text, want) => {
  const L = Landing();
  expect(typeof L.plays, 'Landing.plays is a function').toBe('function');
  expect(L.plays(text), `plays(${JSON.stringify(text)})`).toBe(want);
});

// ── Pins: the "Ask Edison" examples and the editor handoff (kept from #149) ──

test('EXAMPLES: at least 3 distinct plain requests in sentence case, no emoji', () => {
  const ex = Landing().EXAMPLES;
  assert.ok(Array.isArray(ex), `EXAMPLES is an array; got ${JSON.stringify(ex)}`);
  expect(ex.length).toBeGreaterThanOrEqual(3);
  for (const e of ex) {
    expect(typeof e, `example ${JSON.stringify(e)}`).toBe('string');
    expect(e.trim(), 'no surrounding spaces').toBe(e);
    expect(e, 'sentence case: starts with a capital letter').toMatch(/^[A-Z]/);
    expect(e, 'no emoji').not.toMatch(/\p{Extended_Pictographic}/u);
  }
  expect(new Set(ex).size, 'no repeats').toBe(ex.length);
});

test('editorUrl encodes the request into the editor link, Edison UI on', () => {
  expect(Landing().editorUrl('Build me an LED, 9 V')).toBe('../circuit3d/index.html?ui=edison&ask=Build%20me%20an%20LED%2C%209%20V');
});

// Each request comes back unchanged from the editor's side of the link, with
// nothing else in the query: characters that would break a query string
// (& ? # + %), and the − sign the examples use.
test.each([
  ['Build me an inverting amplifier, gain −10'],
  ['Gain 10 & 0.5 V in? #2 + 50% duty'],
  ['A 1 kΩ / 2.2 kΩ divider from 9 V'],
])('editorUrl(%j) round-trips through the editor\'s query string', prompt => {
  const url = Landing().editorUrl(prompt);
  expect(url.startsWith('../circuit3d/index.html?ui=edison&ask=')).toBe(true);
  const u = new URL(url, 'http://localhost:5001/edison/index.html');
  expect(u.pathname).toBe('/circuit3d/index.html');
  expect([...u.searchParams.keys()]).toEqual(['ui', 'ask']);
  expect(u.searchParams.get('ui')).toBe('edison');
  expect(u.searchParams.get('ask')).toBe(prompt);
  expect(u.hash).toBe('');
});

test('every example round-trips through editorUrl too', () => {
  const L = Landing();
  for (const e of L.EXAMPLES) {
    const u = new URL(L.editorUrl(e), 'http://localhost:5001/edison/index.html');
    expect(u.searchParams.get('ask'), `example ${JSON.stringify(e)}`).toBe(e);
  }
});

// ── The demo circuit file (kept from #149; no longer on the landing) ──

function readDemo() {
  assert.ok(fs.existsSync(DEMO), `the demo circuit should be at ${path.relative(ROOT, DEMO)}`);
  return JSON.parse(fs.readFileSync(DEMO, 'utf8'));
}

// The saved file as the simulator's { components, wires }, the way
// rebuildBoard places each record and redraws each wire.
function load(file) {
  const components = IO.rebuildComponents(file.components, rec => {
    const def = Parts.get(rec.type);
    if (!def) return null;
    const offboard = def.place.kind === 'offboard';
    const holeRefs = offboard ? null : IO.loadHoleRefs(rec);
    const comp = { type: rec.type, label: rec.label, values: rec.values || {}, holeRefs,
                   pins: def.pins.map(() => ({ x: 0, y: 0, z: 0 })) };
    if (rec.controls) comp.controls = Object.assign({}, rec.controls);
    return comp;
  }, t => !!Parts.get(t));
  const end = (hole, ci, name, pi) => {
    const comp = !hole && ci >= 0 ? components[ci] : null;
    return { hole: hole ? { col: hole.col, row: hole.row } : null, comp, idx: comp ? IO.pinIndex(comp, name, pi) : -1 };
  };
  const wires = (file.wires || []).map(w => {
    const a = end(w.startHole, w.startCompIdx, w.startPin, w.startPinIdx);
    const b = end(w.endHole,   w.endCompIdx,   w.endPin,   w.endPinIdx);
    return { startHole: a.hole, endHole: b.hole, startComp: a.comp, startPinIdx: a.idx,
             endComp: b.comp, endPinIdx: b.idx };
  });
  return { components, wires };
}

const near = (got, want, tol, what) =>
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want} ± ${tol}, got ${got}`);

// The resistor saved with `ohms`, by its label.
function resistorLabel(file, ohms) {
  const found = (file.components || []).filter(c => c.type === 'resistor' && Number(c.values && c.values.resistance) === ohms);
  assert.equal(found.length, 1, `exactly one ${ohms} Ω resistor in the demo circuit; found ${found.length}`);
  return found[0].label;
}

test('inverting-amp.sparky is the LG-13 board: a TL072 labelled U1, Rin 10 kΩ and Rf 100 kΩ, every part placed legally', () => {
  const file = readDemo();
  const chips = (file.components || []).filter(c => c.type === 'tl072');
  assert.deepStrictEqual(chips.map(c => c.label), ['U1'], 'one TL072, labelled U1');
  const ohms = file.components.filter(c => c.type === 'resistor').map(c => Number(c.values && c.values.resistance)).sort((a, b) => a - b);
  assert.deepStrictEqual(ohms, [RIN, RF], 'the two resistors: Rin 10 kΩ and Rf 100 kΩ');
  const { components, wires } = load(file);
  assert.ok(components.every(c => !c.unknown), `every saved part is one this build knows: ${components.filter(c => c.unknown).map(c => c.type).join(', ')}`);
  assert.deepStrictEqual(IO.flagPlacements(components, wires), [], 'every part sits where the placement rules allow (the viewer draws only those)');
});

test('the demo circuit solves: U1 linear at −5.00 V, 0.50 V across Rin and 5.00 V across Rf, 0.05 mA through both, no problems', () => {
  const file = readDemo();
  const board = load(file);
  const result = Sim.analyze(board.components, board.wires);
  const readings = Readings.from(result, board);
  assert.equal(result.status, 'ok', `status; lines: ${(result.lines || []).map(l => l.text).join(' | ')}`);
  assert.equal(result.shorted, false, 'not a short');

  const u = readings.part('U1');
  assert.ok(u && Array.isArray(u.opamps), `readings for U1 with its op-amps; got ${JSON.stringify(u)}`);
  assert.equal(u.opamps[0].mode, 'linear', 'op-amp 1 amplifies (not clipped)');
  near(u.V, VOUT, 0.01, 'U1 op-amp 1 Vout, V');

  const rin = readings.part(resistorLabel(file, RIN));
  const rf  = readings.part(resistorLabel(file, RF));
  near(Math.abs(rin.V), VIN, 0.005, 'V(Rin): the 0.5 V input over a virtual ground, V');
  near(Math.abs(rf.V), -VOUT, 0.01, 'V(Rf), V');
  near(Math.abs(rin.I), I_IN, 0.001, 'I(Rin), mA');
  near(Math.abs(rf.I), I_IN, 0.001, 'I(Rf): the same current, the input draws nothing, mA');

  assert.deepStrictEqual(readings.problems(), [], 'the mistake checker finds nothing on the demo circuit');
});
