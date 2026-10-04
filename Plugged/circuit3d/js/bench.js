// ─────────────────────────────────────────────────────────────
//  bench.js — the lab bench's rules for off-board parts (issue #197)
//
//  How many of each instrument the bench has, and where an AI-placed
//  off-board part stands so no two stack. Pure: no THREE, no DOM, so the
//  AI's placement (chat.js) and its preview are tested in Node.
//
//  EXPORTS
//  ───────
//  Browser: window.Bench (loaded after the part scripts, before app.js)
//  Node:    module.exports = Bench
//
//  MARGIN   how far clear of the board an off-board part sits
//           (App.BATTERY_MARGIN is this number)
//  LIMITS   { bench_supply: 1, function_generator: 1, multimeter: 2 }
//  refusal(type, components) → why the bench can't take one more of
//           `type` ("the bench has one bench supply; use PS1's two
//           channels"), or null. components: records with { type, label }.
//  spotsOf(components) → [{ x, z }], where the off-board ones stand: a
//           page record's group.position, or a plain record's position.
//  spotFor(type, taken, batterySpot) → { x, z }, the next spot clear of
//           every spot in `taken`: a battery keeps batterySpot while it is
//           free; everything else goes in a row in front of the board (z past
//           BOARD_D / 2 + MARGIN, App.offboardSpot's front zone, so it lands
//           as it is), all on screen from App.CAMERA.home. From the right,
//           the battery's end: a second battery, the supply, the generator,
//           meter 1, meter 2. The sources sit nearest column 63, where the
//           recipes wire them; the meters nearest the low columns, where
//           the recipes build.
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const inNode = typeof module === 'object' && module.exports;
  const Bench  = inNode
    ? factory(require('./parts'), require('./board-geometry.js'))
    : factory(root.Parts, root.App.BOARD_GEOMETRY);
  if (inNode) module.exports = Bench;
  if (root) root.Bench = Bench;
})(typeof window !== 'undefined' ? window : null, function (Parts, GEOMETRY) {

  const MARGIN = 2.5;

  // ── How many of each ───────────────────────────────────────
  const LIMITS = { bench_supply: 1, function_generator: 1, multimeter: 2 };
  const WHY = {
    bench_supply:       have => `the bench has one bench supply; use ${have[0]}'s two channels`,
    function_generator: have => `the bench has one function generator; use ${have[0]}`,
    multimeter:         have => `the bench has two multimeters; use ${have.join(' or ')}`,
  };

  function refusal(type, components) {
    if (!Object.hasOwn(LIMITS, type)) return null;
    const have = (components || []).filter(c => c && c.type === type).map(c => c.label);
    return have.length < LIMITS[type] ? null : WHY[type](have);
  }

  // ── Where each stands ──────────────────────────────────────
  // The front row: slot k at x = k × PITCH, k = −2…2, across the middle of
  // the board, so the row stays on screen in Edison's narrow canvas. PITCH is
  // wider than the widest instrument (the supply, 2.84) and ROW deeper than
  // the deepest (the meter, 3.64), each with a gap, so two parts whose spots
  // are at least PITCH apart in x or ROW apart in z never overlap. Each type
  // tries the slots in its own order; a full row starts another, ROW
  // further out.
  const PITCH = 3.4, ROW = 4, ROWS = 8;
  const FRONT_Z = GEOMETRY.BOARD_D / 2 + MARGIN + 0.5;
  const ORDER = {
    battery:            [2, 1, 0, -1, -2],
    bench_supply:       [1, 2, 0, -1, -2],
    function_generator: [0, 1, -1, 2, -2],
    multimeter:         [-1, -2, 0, 1, 2],
  };

  function spotsOf(components) {
    const out = [];
    for (const c of components || []) {
      const def = c && Parts && Parts.get(c.type);
      if (!def || def.place.kind !== 'offboard') continue;
      const at = c.group ? c.group.position : c.position;
      if (at && Number.isFinite(at.x) && Number.isFinite(at.z)) out.push({ x: at.x, z: at.z });
    }
    return out;
  }

  const clear = (spot, taken) => taken.every(s => Math.abs(s.x - spot.x) >= PITCH || Math.abs(s.z - spot.z) >= ROW);

  function spotFor(type, taken, batterySpot) {
    const order = Object.hasOwn(ORDER, type) ? ORDER[type] : ORDER.function_generator;   // another type: the middle first
    const spots = type === 'battery' && batterySpot ? [{ x: batterySpot.x, z: batterySpot.z }] : [];
    for (let row = 0; row < ROWS; row++) for (const k of order) spots.push({ x: k * PITCH, z: FRONT_Z + row * ROW });
    return spots.find(s => clear(s, taken || [])) || spots[spots.length - 1];
  }

  return { MARGIN, LIMITS, refusal, spotsOf, spotFor };
});
