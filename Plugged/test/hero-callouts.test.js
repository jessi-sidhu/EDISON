// The landing hero's leader-line callouts, edison/hero-callouts.js (issue
// #168, Edison landing v3 4/4; ref docs/design/landing-v3/04 and the
// storyboard 06): a dot on the part, an angled 1 px line, then a horizontal
// run to a caps label with a grey subline. The pure half, pinned here: the
// callouts as data, which ones show for a stage and the frame's anchors, the
// leader's path, and where the labels sit. The page (the SVG over the frame,
// the dots tracking the turning board, the loop stopping off screen, a phone)
// is e2e/edison-landing.spec.js.
//
// Run with:  npm test
//
// API these tests are written against (UMD like landing.js: window.HeroCallouts
// in the page, module.exports in Node):
//   HeroCallouts.CALLOUTS   [{ id, anchor, label, sub, side, stages }]
//                           id      a unique string (the page's data-callout)
//                           anchor  a key of the frame's Hero.anchors()
//                           label   the caps title; sub the grey subline
//                           side    'left' | 'right': the stage column the label sits in
//                           stages  the Landing.TIMELINE stages it shows in
//   HeroCallouts.calloutsFor(stage, anchors, opts)
//                           the CALLOUTS entries to show now: in `stage`, and
//                           whose anchor is in `anchors` (Hero.anchors(): name →
//                           { x, y, visible }) with visible true. anchors may be
//                           null (no Hero yet). opts.narrow (under 720 px): only
//                           the stage's most important one (POWER RAILS at
//                           idle, LED1 from the sketch on).
//   HeroCallouts.leaderPath(anchorPx, labelPx, side)
//                           the leader as SVG path data, absolute: 'M' at the
//                           dot (anchorPx { x, y }), 'L' to the elbow (a
//                           diagonal up or down to the label's height, part of
//                           the way across), 'L' to labelPx { x, y } (a
//                           horizontal run). side: the label's side.
//   HeroCallouts.labelAt(callout, size)
//                           where the leader meets the label, { x, y } in px
//                           inside a stage of size { width, height }: the
//                           label's edge facing the board. It depends only on
//                           the callout and the stage size, never on the
//                           anchors, so the text never moves; each side is one
//                           column (one x).
//
// The anchors today (#167, #174): LED1, R1, BAT1, rail, holes. #171 adds path
// and casing; until then CIRCUIT PATH and TRANSPARENT CASING have no anchor and
// stay hidden. The battery is hidden through the sketch (#174), so its anchor
// is visible:false there and BAT1 9 V shows only from 'solid'.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const ROOT    = path.join(__dirname, '..');
const FILE    = path.join(ROOT, 'edison', 'hero-callouts.js');
const LANDING = require('../edison/landing.js');
const STAGES  = LANDING.TIMELINE.map(s => s.stage);   // idle … done (#164)

// Loaded per test, so a module that can't load in Node fails each test by name.
function HeroCallouts() {
  assert.ok(fs.existsSync(FILE), `edison/hero-callouts.js should exist: ${path.relative(ROOT, FILE)}`);
  let mod;
  try { mod = require(FILE); } catch (e) {
    assert.fail(`edison/hero-callouts.js can't be loaded in Node: ${e.message.split('\n')[0]}`);
  }
  assert.ok(mod && typeof mod === 'object', `edison/hero-callouts.js exports an object (got ${typeof mod})`);
  return mod;
}
const fn = name => {
  const f = HeroCallouts()[name];
  assert.equal(typeof f, 'function', `HeroCallouts.${name} is a function`);
  return f;
};

// Every callout: its words and the anchor it points at. The labels are the
// brief's (caps); BAT1 9 V's subline isn't set by the issue, so only its
// presence is checked.
const WANT = {
  'HOLE GRID':          { anchor: 'holes',  sub: 'Rows of five, connected' },
  'POWER RAILS':        { anchor: 'rail',   sub: '9 V and ground, along the board' },
  'LED1':               { anchor: 'LED1',   sub: 'Lights when current flows' },
  'R1 470 Ω':           { anchor: 'R1',     sub: 'Limits the current' },
  'CIRCUIT PATH':       { anchor: 'path',   sub: 'Connects rows and columns' },
  'TRANSPARENT CASING': { anchor: 'casing', sub: 'Reveals the circuit' },
  'BAT1 9 V':           { anchor: 'BAT1',   sub: null },
};
const IDLE   = ['HOLE GRID', 'POWER RAILS'];
const SKETCH = ['CIRCUIT PATH', 'LED1', 'R1 470 Ω', 'TRANSPARENT CASING'];
const SOLID  = [...SKETCH, 'BAT1 9 V'];

// Anchors: every one in view; the sketch's (the battery hidden, #174); today's
// (no path or casing until #171).
const at = (x, y, visible = true) => ({ x, y, visible });
const ALL = { holes: at(0.5, 0.62), rail: at(0.52, 0.56), LED1: at(0.53, 0.38), R1: at(0.49, 0.46),
              BAT1: at(0.45, 0.2), path: at(0.5, 0.5), casing: at(0.36, 0.34) };
const IN_SKETCH = { ...ALL, BAT1: at(0.45, 0.2, false) };
const TODAY = { holes: ALL.holes, rail: ALL.rail, LED1: ALL.LED1, R1: ALL.R1, BAT1: ALL.BAT1 };

const labels = list => {
  assert.ok(Array.isArray(list), `calloutsFor returns an array; got ${JSON.stringify(list)}`);
  return list.map(c => c && c.label).sort();
};

// ── The callouts as data ──

test('CALLOUTS: each { id, anchor, label, sub, side, stages }: a unique id, a caps label, a subline, side left or right, stages from Landing.TIMELINE', () => {
  const C = HeroCallouts().CALLOUTS;
  assert.ok(Array.isArray(C) && C.length > 0, `HeroCallouts.CALLOUTS is a non-empty array; got ${JSON.stringify(C)}`);
  for (const c of C) {
    const what = `callout ${JSON.stringify(c && c.label)}`;
    expect(typeof c.id === 'string' && c.id.length > 0, `${what}: id is a non-empty string (${JSON.stringify(c.id)})`).toBe(true);
    expect(typeof c.anchor, `${what}: anchor`).toBe('string');
    expect(c.label, `${what}: the label is written in capitals (the design guard bans text-transform)`).toBe(String(c.label).toUpperCase());
    expect(typeof c.sub === 'string' && c.sub.trim().length > 0, `${what}: a subline`).toBe(true);
    expect(['left', 'right'], `${what}: side`).toContain(c.side);
    assert.ok(Array.isArray(c.stages) && c.stages.length > 0, `${what}: stages is a non-empty array`);
    expect(c.stages.filter(s => !STAGES.includes(s)), `${what}: stages that aren't Landing.TIMELINE stages`).toEqual([]);
  }
  expect(new Set(C.map(c => c.id)).size, 'ids are unique').toBe(C.length);
});

test('CALLOUTS: the seven, each with its subline and the Hero.anchors() key it points at', () => {
  const C = HeroCallouts().CALLOUTS;
  expect(C.map(c => c.label).sort(), 'the labels').toEqual(Object.keys(WANT).sort());
  for (const c of C) {
    const w = WANT[c.label];
    if (!w) continue;
    expect(c.anchor, `${c.label}: anchor`).toBe(w.anchor);
    if (w.sub !== null) expect(c.sub, `${c.label}: subline`).toBe(w.sub);
  }
});

// ── Which show ──

// Idle: the bare board's two. The schematic and its move into the inset have
// none (the schematic covers the stage). From the sketch on: the circuit's,
// BAT1 9 V only once the battery is in (its anchor is hidden in the sketch).
test.each([
  ['idle',      IDLE,   ALL],
  ['schematic', [],     ALL],
  ['inset',     [],     ALL],
  ['sketch',    SKETCH, IN_SKETCH],
  ['solid',     SOLID,  ALL],
  ['lit',       SOLID,  ALL],
  ['done',      SOLID,  ALL],
])('calloutsFor(%j) with its anchors shows %j', (stage, want, anchors) => {
  expect(labels(fn('calloutsFor')(stage, anchors)), `shown in ${stage}`).toEqual([...want].sort());
});

test('calloutsFor drops a callout whose anchor is missing or not visible, and shows none with no anchors, no stage or an unknown stage', () => {
  const calloutsFor = fn('calloutsFor');
  expect(labels(calloutsFor('done', TODAY)), 'done with today\'s anchors (no path or casing until #171): the three at LED1, R1 and BAT1')
    .toEqual(['BAT1 9 V', 'LED1', 'R1 470 Ω']);
  expect(labels(calloutsFor('done', { ...ALL, LED1: at(0.53, 0.38, false) })), 'LED1\'s anchor behind the camera or out of the frame').not.toContain('LED1');
  expect(labels(calloutsFor('done', { ...ALL, R1: undefined })), 'R1\'s anchor missing').not.toContain('R1 470 Ω');
  expect(labels(calloutsFor('idle', { holes: ALL.holes, rail: at(0.52, 0.56, false) })), 'idle with the rail out of view').toEqual(['HOLE GRID']);
  expect(labels(calloutsFor('idle', {})), 'no anchors').toEqual([]);
  expect(labels(calloutsFor('idle', null)), 'no Hero yet (anchors null)').toEqual([]);
  expect(labels(calloutsFor(null, ALL)), 'no stage').toEqual([]);
  expect(labels(calloutsFor('nonsense', ALL)), 'an unknown stage').toEqual([]);
});

// Under 720 px there is room for one: the rails at idle, LED1 from the sketch on.
test.each([
  ['idle',      ['POWER RAILS'], ALL],
  ['schematic', [],              ALL],
  ['sketch',    ['LED1'],        IN_SKETCH],
  ['solid',     ['LED1'],        ALL],
  ['lit',       ['LED1'],        ALL],
  ['done',      ['LED1'],        ALL],
])('calloutsFor(%j, …, { narrow: true }) keeps only the most important: %j', (stage, want, anchors) => {
  expect(labels(fn('calloutsFor')(stage, anchors, { narrow: true })), `shown in ${stage} under 720 px`).toEqual(want);
});

// ── The leader ──

// 'M x y L x y …' → [{ x, y }], absolute commands only.
function points(d) {
  const s = String(d).trim();
  assert.match(s, /^M[\d\s.,eE+-]+(L[\d\s.,eE+-]+)+$/, `leader path data is absolute M then L commands; got ${JSON.stringify(d)}`);
  return s.split(/(?=[ML])/).map(seg => {
    const [x, y] = seg.slice(1).trim().split(/[\s,]+/).map(Number);
    return { x, y };
  });
}
const near = (p, q) => Math.abs(p.x - q.x) <= 0.01 && Math.abs(p.y - q.y) <= 0.01;

// From the dot: a diagonal to the label's height, part of the way across, then
// a horizontal run into the label. Labels left and right, above and below.
test.each([
  ['left, above',  { x: 700, y: 480 }, { x: 240,  y: 300 }, 'left'],
  ['left, below',  { x: 720, y: 300 }, { x: 240,  y: 560 }, 'left'],
  ['right, above', { x: 760, y: 470 }, { x: 1200, y: 260 }, 'right'],
  ['right, below', { x: 720, y: 300 }, { x: 1200, y: 520 }, 'right'],
])('leaderPath (%s): dot → diagonal to the label\'s height → horizontal to the label', (_, dot, label, side) => {
  const p = points(fn('leaderPath')(dot, label, side));
  expect(p.length, `three points (dot, elbow, label): ${JSON.stringify(p)}`).toBe(3);
  const [a, e, l] = p;
  expect(p.every(q => Number.isFinite(q.x) && Number.isFinite(q.y)), 'every coordinate is a number').toBe(true);
  expect(near(a, dot), `starts at the dot ${JSON.stringify(dot)}; got ${JSON.stringify(a)}`).toBe(true);
  expect(near(l, label), `ends at the label ${JSON.stringify(label)}; got ${JSON.stringify(l)}`).toBe(true);
  expect(Math.abs(e.y - label.y) <= 0.01, `the elbow is at the label's height (a horizontal run into it); elbow ${JSON.stringify(e)}`).toBe(true);
  expect(Math.min(dot.x, label.x) < e.x && e.x < Math.max(dot.x, label.x),
    `the elbow is part of the way across, so both the diagonal and the run have length; elbow x ${e.x}`).toBe(true);
});

test('leaderPath with the label level with the dot is one straight horizontal line', () => {
  const dot = { x: 700, y: 300 }, label = { x: 240, y: 300 };
  const p = points(fn('leaderPath')(dot, label, 'left'));
  expect(near(p[0], dot) && near(p[p.length - 1], label), `from the dot to the label: ${JSON.stringify(p)}`).toBe(true);
  expect(p.every(q => Math.abs(q.y - 300) <= 0.01), `every point on y 300: ${JSON.stringify(p)}`).toBe(true);
});

// ── Where the labels sit ──

// The real stage at 1440 × 900 is about 1440 × 517; it is at most 680 tall,
// and narrower on a small laptop.
const SIZES = [{ width: 1440, height: 517 }, { width: 1440, height: 680 }, { width: 1024, height: 560 }].map(s => [`${s.width} × ${s.height}`, s]);

test.each(SIZES)('labelAt in a %s stage: fixed columns (one x per side, left ≤ 35 %%, right ≥ 65 %% of the width), inside the stage, the same every call', (_, size) => {
  const { CALLOUTS } = HeroCallouts(), labelAt = fn('labelAt');
  const spots = CALLOUTS.map(c => ({ c, p: labelAt(c, size) }));
  for (const { c, p } of spots) {
    expect(p && Number.isFinite(p.x) && Number.isFinite(p.y), `${c.label}: { x, y } numbers; got ${JSON.stringify(p)}`).toBe(true);
    expect(p.x > 0 && p.x < size.width && p.y > 0 && p.y < size.height, `${c.label}: inside the stage; got ${JSON.stringify(p)}`).toBe(true);
    expect(labelAt(c, size), `${c.label}: the same spot every call`).toEqual(p);
  }
  for (const side of ['left', 'right']) {
    const xs = [...new Set(spots.filter(s => s.c.side === side).map(s => s.p.x))];
    expect(xs.length <= 1, `the ${side} labels share one column (x values: ${xs.join(', ')})`).toBe(true);
    if (xs.length) {
      if (side === 'left') expect(xs[0], 'the left column, px').toBeLessThanOrEqual(0.35 * size.width);
      else expect(xs[0], 'the right column, px').toBeGreaterThanOrEqual(0.65 * size.width);
    }
  }
});

// Callouts shown together on one side never stack on each other: a caps line
// and a subline need about 40 px.
test.each(SIZES)('labelAt in a %s stage: the labels shown together on one side are at least 40 px apart', (_, size) => {
  const calloutsFor = fn('calloutsFor'), labelAt = fn('labelAt');
  for (const [stage, anchors] of [['idle', ALL], ['sketch', IN_SKETCH], ['done', ALL]]) {
    for (const side of ['left', 'right']) {
      const ys = calloutsFor(stage, anchors).filter(c => c.side === side).map(c => labelAt(c, size).y).sort((a, b) => a - b);
      const tight = ys.slice(1).map((y, i) => y - ys[i]).filter(gap => gap < 40);
      expect(tight, `${stage}, ${side} side: gaps under 40 px between label heights (${ys.map(Math.round).join(', ')})`).toEqual([]);
    }
  }
});
