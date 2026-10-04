// The hero's circuit (issue #163, Edison landing v2, 2/3):
// edison/demo/led.sparky, the board circuit3d/viewer.html?mode=hero draws as
// white line art, solidifies and then lights. The page itself (transparent
// canvas, edges, dashed axes, Hero.stage, the edison:lit message, ink,
// reduced motion) is e2e/viewer-hero.spec.js; this file is the circuit's
// physics, so the LED the hero lights is one the simulator really lights.
//
// Run with:  npm test
//
// The circuit (issue #163): a 9 V battery BAT1, R1 470 Ω and a red LED1 in
// series, joined by wires. It is read the way the page's Open reads a saved
// file (test/lab1-circuit.test.js's load()), then the real simulator. No
// mocks. Which holes it uses is the builder's; the parts, values and readings
// are asserted.
//
// Hand-computed: a red LED drops Vf = 2.0 V (circuit3d/js/parts/led.js), so
//   I = (9 − 2.0) / 470 = 14.89 mA through R1 and LED1 alike, under the
//   red LED's 20 mA rating: lit, nothing over, no mistakes.
//
// circuit3d/js/hero-model.js's pure half is pinned here too: inkOf (the
// &ink= param), and from issue #167 (landing v3: the glass board) the stage
// list with 'empty' first, startStage (the &stage= param), anchorOf (a
// projected point → a HUD anchor) and the neon rail colours, and from #171
// (the build-up) usedStrips, the sketch's violet and the build-up's steps.
// The rest of the hero lives in the page and is pinned there.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const Sim      = require('../circuit3d/js/simulate.js');
const IO       = require('../circuit3d/js/board-io.js');
const Parts    = require('../circuit3d/js/parts');
const Readings = require('../circuit3d/js/readings.js');
const UiFlag   = require('../edison/ui-flag.js');
const Hero     = require('../circuit3d/js/hero-model.js');

const ROOT     = path.join(__dirname, '..');
const CIRCUIT  = 'edison/demo/led.sparky';          // as viewer.html?circuit= names it
const LED_DEMO = path.join(ROOT, CIRCUIT);

const VBAT = 9, R = 470, VF_RED = 2.0;
const I_MA = (VBAT - VF_RED) / R * 1000;            // 14.89 mA

function readDemo() {
  assert.ok(fs.existsSync(LED_DEMO), `the hero's circuit should be at ${CIRCUIT}`);
  return JSON.parse(fs.readFileSync(LED_DEMO, 'utf8'));
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

function solveDemo() {
  const file = readDemo();
  const board = load(file);
  const result = Sim.analyze(board.components, board.wires);
  return { file, board, result, readings: Readings.from(result, board) };
}

const near = (got, want, tol, what) =>
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want.toFixed(2)} ± ${tol}, got ${got}`);

// ── The file ──────────────────────────────────────────────────

test('led.sparky is the hero\'s board: BAT1 at 9 V, R1 470 Ω and a red LED1, wired, every part placed legally', () => {
  const file = readDemo();
  assert.ok(UiFlag.allowedCircuit(CIRCUIT), `viewer.html?circuit=${CIRCUIT} is allow-listed`);
  const parts = (file.components || []).map(c => `${c.label}:${c.type}`).sort();
  assert.deepStrictEqual(parts, ['BAT1:battery', 'LED1:led', 'R1:resistor'], 'the three parts, by label');
  const byLabel = l => file.components.find(c => c.label === l);
  assert.equal(Number(byLabel('BAT1').values && byLabel('BAT1').values.voltage), VBAT, 'BAT1 voltage, V');
  assert.equal(Number(byLabel('R1').values && byLabel('R1').values.resistance), R, 'R1 resistance, Ω');
  assert.equal(byLabel('LED1').values && byLabel('LED1').values.color, 'red', 'LED1 colour');
  assert.ok((file.wires || []).length >= 2, `wires join the battery to the board; got ${(file.wires || []).length}`);

  const { components, wires } = load(file);
  assert.ok(components.every(c => !c.unknown), `every saved part is one this build knows: ${components.filter(c => c.unknown).map(c => c.type).join(', ')}`);
  assert.deepStrictEqual(IO.flagPlacements(components, wires), [], 'every part sits where the placement rules allow (the viewer draws only those)');
});

// viewer.html draws a part only when it can place it (an off-board part by its
// saved position, an on-board part by one hole per pin) and a wire end only by
// its hole or by startCompIdx/startPinIdx, so the hero draws the whole circuit.
test('led.sparky is drawable by viewer.html: off-board parts have a position, on-board parts a hole per pin, wire ends a hole or a part pin by index', () => {
  const file = readDemo();
  file.components.forEach(c => {
    const def = Parts.get(c.type);
    if (def.place.kind === 'offboard') {
      assert.ok(c.position && Number.isFinite(c.position.x) && Number.isFinite(c.position.z), `${c.label} (off-board) has a saved { x, z } position; got ${JSON.stringify(c.position)}`);
    } else {
      assert.equal((c.holeRefs || []).length, def.pins.length, `${c.label}: one holeRef per pin (${def.pins.join(', ')})`);
    }
  });
  const pinOk = (ci, pi) => ci >= 0 && ci < file.components.length && pi >= 0 && pi < Parts.get(file.components[ci].type).pins.length;
  file.wires.forEach((w, i) => {
    assert.ok(w.startHole || pinOk(w.startCompIdx, w.startPinIdx), `wire ${i} start: a hole, or a part pin by startCompIdx/startPinIdx; got ${JSON.stringify(w)}`);
    assert.ok(w.endHole || pinOk(w.endCompIdx, w.endPinIdx), `wire ${i} end: a hole, or a part pin by endCompIdx/endPinIdx; got ${JSON.stringify(w)}`);
  });
});

// ── The solve ─────────────────────────────────────────────────

test('the hero circuit solves: LED1 lit at (9 − 2.0) / 470 = 14.9 mA, the same through R1, nothing over, no problems', () => {
  const { result, readings } = solveDemo();
  assert.equal(result.status, 'ok', `status; lines: ${(result.lines || []).map(l => l.text).join(' | ')}`);
  assert.equal(result.shorted, false, 'not a short');

  const led = result.parts && result.parts.LED1;
  assert.ok(led && led.m, `LED1 in the solve's parts; got ${JSON.stringify(Object.keys(result.parts || {}))}`);
  assert.equal(led.m.on, true, 'LED1 is lit');
  near(readings.part('LED1') && Math.abs(readings.part('LED1').I), I_MA, 0.5, 'I(LED1), mA');
  near(readings.part('R1') && Math.abs(readings.part('R1').I), I_MA, 0.5, 'I(R1): the same series current, mA');
  assert.equal(readings.part('LED1').over, false, 'LED1 under its rating');
  assert.equal(readings.part('R1').over, false, 'R1 under its rating');

  assert.deepStrictEqual(readings.problems(), [], 'the mistake checker finds nothing on the hero circuit');
});

// ── The &ink= param ───────────────────────────────────────────
// Pin (passes today): Hero.ink(hex) is new, and a bad value there must
// change nothing; this keeps a bad &ink= in the URL falling back to the
// default ink (white, e2e/viewer-hero.spec.js) rather than to nothing.

test('pin: &ink= takes #rrggbb (any case); a missing or bad value falls back to the default ink', () => {
  for (const [param, want] of [
    ['#101010', 0x101010], ['#F4f4F4', 0xf4f4f4],
    [null, Hero.INK], [undefined, Hero.INK], ['', Hero.INK], ['nope', Hero.INK], ['#12345g', Hero.INK], ['#1010101', Hero.INK],
  ]) {
    assert.equal(Hero.inkOf(param), want, `inkOf(${JSON.stringify(param)})`);
  }
});

// ── Issue #167: stages, &stage=, anchors, neon rails ──────────
// Names chosen here, for the builder to match (all on HeroModel):
//   STAGES                ['empty', 'lineart', 'solid', 'lit'], in order.
//   rank(name)            its index in STAGES; -1 for anything else.
//   startStage(search)    the first stage from a query string (location.search,
//                         with or without the '?'): '&stage=empty' → 'empty',
//                         anything else → 'lineart' (the frame alone still
//                         shows the circuit).
//   anchorOf(ndc)         a point projected by the camera ({ x, y, z }, NDC)
//                         → { x, y, visible }: x and y 0 … 1 of the frame from
//                         the top left, held inside 0 … 1; visible false when
//                         |x| > 1, |y| > 1 (outside the frame) or z > 1
//                         (behind the camera).
//   RAIL_POS, RAIL_NEG    the + rails' neon pink and the − rails' neon blue.

test('the stages run empty → lineart → solid → lit, and rank follows that order', () => {
  assert.deepStrictEqual(Hero.STAGES, ['empty', 'lineart', 'solid', 'lit'], 'HeroModel.STAGES');
  assert.deepStrictEqual(Hero.STAGES.map(Hero.rank), [0, 1, 2, 3], 'rank of each stage');
  for (const bad of ['nope', '', undefined, 'LIT']) assert.equal(Hero.rank(bad), -1, `rank(${JSON.stringify(bad)})`);
});

test('&stage= picks the first stage: empty or lineart, and anything else (or none) is lineart', () => {
  assert.equal(typeof Hero.startStage, 'function', 'HeroModel.startStage(search)');
  for (const [search, want] of [
    ['?mode=hero&circuit=edison/demo/led.sparky&stage=empty', 'empty'],
    ['stage=empty',                                          'empty'],
    ['?mode=hero&stage=lineart',                             'lineart'],
    ['?mode=hero',                                           'lineart'],
    ['',                                                     'lineart'],
    [undefined,                                              'lineart'],
    ['?mode=hero&stage=',                                    'lineart'],
    ['?mode=hero&stage=solid',                               'lineart'],
    ['?mode=hero&stage=lit',                                 'lineart'],
    ['?mode=hero&stage=nope',                                'lineart'],
  ]) {
    assert.equal(Hero.startStage(search), want, `startStage(${JSON.stringify(search)})`);
  }
});

test('anchorOf maps a projected point to 0 … 1 of the frame from the top left, held inside it, visible only in the frame and in front of the camera', () => {
  assert.equal(typeof Hero.anchorOf, 'function', 'HeroModel.anchorOf(ndc)');
  for (const [ndc, want, what] of [
    [{ x:  0,   y:  0,    z: 0.5  }, { x: 0.5,  y: 0.5,  visible: true  }, 'the middle'],
    [{ x: -1,   y:  1,    z: 0    }, { x: 0,    y: 0,    visible: true  }, 'the top-left corner'],
    [{ x:  1,   y: -1,    z: 0.99 }, { x: 1,    y: 1,    visible: true  }, 'the bottom-right corner'],
    [{ x:  0.5, y: -0.5,  z: 0.5  }, { x: 0.75, y: 0.75, visible: true  }, 'right and down of the middle'],
    [{ x:  1.5, y:  0,    z: 0.5  }, { x: 1,    y: 0.5,  visible: false }, 'off the right edge'],
    [{ x:  0,   y:  2,    z: 0.5  }, { x: 0.5,  y: 0,    visible: false }, 'above the top'],
    [{ x: -3,   y: -1.2,  z: 0.5  }, { x: 0,    y: 1,    visible: false }, 'off the bottom-left'],
    [{ x:  0.2, y:  0.2,  z: 1.2  }, { x: 0.6,  y: 0.4,  visible: false }, 'behind the camera'],
  ]) {
    const got = Hero.anchorOf(ndc);
    const ok = got && typeof got.x === 'number' && typeof got.y === 'number' &&
      Math.abs(got.x - want.x) < 1e-9 && Math.abs(got.y - want.y) < 1e-9 && got.visible === want.visible;
    assert.ok(ok, `anchorOf(${JSON.stringify(ndc)}) (${what}): expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
});

// Issue #174: a frame at 0 × 0 (display: none until the page shows it)
// projects every point to NaN; anchorOf still answers in 0 … 1 (NaN → 0),
// not visible, so the page never places a callout at NaN.
test('anchorOf: a NaN point (a 0 × 0 frame) reads as 0, held inside the frame, and not visible', () => {
  for (const [ndc, want] of [
    [{ x: NaN, y: NaN, z: NaN }, { x: 0,   y: 0,    visible: false }],
    [{ x: NaN, y: 0.5, z: 0.5 }, { x: 0,   y: 0.25, visible: false }],
    [{ x: 0,   y: NaN, z: 0.5 }, { x: 0.5, y: 0,    visible: false }],
  ]) {
    const got = Hero.anchorOf(ndc);
    const ok = got && Number.isFinite(got.x) && Number.isFinite(got.y) &&
      Math.abs(got.x - want.x) < 1e-9 && Math.abs(got.y - want.y) < 1e-9 && got.visible === want.visible;
    assert.ok(ok, `anchorOf(${JSON.stringify(ndc).replace(/null/g, 'NaN')}): expected ${JSON.stringify(want)}, got { x: ${got && got.x}, y: ${got && got.y}, visible: ${got && got.visible} }`);
  }
});

test('the rails glow neon: + pink #FF3D7F, − blue #3D7BFF', () => {
  const hex = v => (typeof v === 'number' ? '#' + v.toString(16).padStart(6, '0') : String(v)).toUpperCase();
  assert.equal(hex(Hero.RAIL_POS), '#FF3D7F', 'HeroModel.RAIL_POS, the + rails');
  assert.equal(hex(Hero.RAIL_NEG), '#3D7BFF', 'HeroModel.RAIL_NEG, the − rails');
});

// ── Issue #171: the build-up (circuit paths, sketch glow) ─────
// Names chosen here, for the builder to match (all on HeroModel):
//   usedStrips(circuit)  the conductive strips a saved circuit ({ components,
//                        wires }, as the file reads) touches, through its
//                        on-board parts' legs and its wires' hole ends (an
//                        end at a part's pin, and an off-board part, touch
//                        nothing):
//                          { strips: [{ col, half }], rails: [{ row, from, to }] }
//                        strips: each 5-hole column strip once, half 'top'
//                        (rows a–e) or 'bottom' (f–j); rails: each rail row
//                        touched (tp, tn, bn, bp) once, from its lowest
//                        touched column to its highest (one touch: from ===
//                        to). Columns as the file has them (0-based, as
//                        holeData). Order is the builder's; compared sorted.
//   SKETCH_GLOW          the sketch's LED glow and under-glow, '#B48CFF'.
//   BUILD_STEPS          the 'lineart' build-up, in order:
//                        ['paths', 'parts', 'led', 'glass', 'underglow'].

const byStrip = (a, b) => a.half.localeCompare(b.half) || a.col - b.col;
const byRail  = (a, b) => a.row.localeCompare(b.row) || a.from - b.from;
const sortedStrips = u => ({ strips: (u && u.strips || []).slice().sort(byStrip), rails: (u && u.rails || []).slice().sort(byRail) });

// led.sparky, by hand: R1 b27–b31 and LED1 c33–c31 put legs in strips 27,
// 31 and 33 (top); W3 joins tp27 to a27 and W4 a33 to tn33; W1 and W2 run
// from BAT1's pins (off the board) to tp26 and tn35. So the + rail is used
// from 26 to 27, the − rail from 33 to 35.
test('usedStrips(led.sparky): strips 27, 31 and 33 (top), the + rail tp 26–27 and the − rail tn 33–35', () => {
  assert.equal(typeof Hero.usedStrips, 'function', 'HeroModel.usedStrips(circuit)');
  assert.deepStrictEqual(sortedStrips(Hero.usedStrips(readDemo())), {
    strips: [{ col: 27, half: 'top' }, { col: 31, half: 'top' }, { col: 33, half: 'top' }],
    rails:  [{ row: 'tn', from: 33, to: 35 }, { row: 'tp', from: 26, to: 27 }],
  });
});

// The other half of the board and the other rails, by hand: R1 g10–g14 and
// LED1 j14 (strips 10 and 14, bottom, 14 once) with its anode straight into
// bp20; BAT1's lead from its pin to bp40 (the + rail then 20–40); a wire
// bn8–f10 (bn touched once: 8–8, strip 10 again); a jumper a5–e5 inside
// one strip (5, top, once).
test('usedStrips: bottom-half strips, the bottom rails, a leg straight into a rail, a lead from an off-board part, a jumper inside one strip', () => {
  assert.equal(typeof Hero.usedStrips, 'function', 'HeroModel.usedStrips(circuit)');
  const circuit = {
    components: [
      { type: 'resistor', label: 'R1', values: { resistance: 470 }, holeRefs: [{ pin: 'lead1', col: 10, row: 'g' }, { pin: 'lead2', col: 14, row: 'g' }] },
      { type: 'led', label: 'LED1', values: { color: 'red' }, holeRefs: [{ pin: 'cathode', col: 14, row: 'j' }, { pin: 'anode', col: 20, row: 'bp' }] },
      { type: 'battery', label: 'BAT1', values: { voltage: 9 }, holeRefs: null, position: { x: 0, z: 6 } },
    ],
    wires: [
      { startHole: null, startCompIdx: 2, startPinIdx: 0, endHole: { col: 40, row: 'bp' }, endCompIdx: -1, endPinIdx: -1 },
      { startHole: { col: 8, row: 'bn' }, endHole: { col: 10, row: 'f' }, startCompIdx: -1, startPinIdx: -1, endCompIdx: -1, endPinIdx: -1 },
      { startHole: { col: 5, row: 'a' }, endHole: { col: 5, row: 'e' }, startCompIdx: -1, startPinIdx: -1, endCompIdx: -1, endPinIdx: -1 },
    ],
  };
  assert.deepStrictEqual(sortedStrips(Hero.usedStrips(circuit)), {
    strips: [{ col: 10, half: 'bottom' }, { col: 14, half: 'bottom' }, { col: 5, half: 'top' }],
    rails:  [{ row: 'bn', from: 8, to: 8 }, { row: 'bp', from: 20, to: 40 }],
  });
});

test('the sketch glows soft purple #B48CFF, and the build-up runs paths → parts → led → glass → underglow', () => {
  const hex = v => (typeof v === 'number' ? '#' + v.toString(16).padStart(6, '0') : String(v)).toUpperCase();
  assert.equal(hex(Hero.SKETCH_GLOW), '#B48CFF', 'HeroModel.SKETCH_GLOW');
  assert.deepStrictEqual(Hero.BUILD_STEPS, ['paths', 'parts', 'led', 'glass', 'underglow'], 'HeroModel.BUILD_STEPS');
});
