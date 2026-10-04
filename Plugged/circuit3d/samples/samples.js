// ─────────────────────────────────────────────────────────────
//  samples.js — the rehearsed photos behind "Use sample photo"
//  Contract: docs/API-CONTRACT.md → "Page additions" (window.PhotoSamples).
//  A plain script, not .json: the static server never serves .json.
//
//  Each entry: { file, cols, taps, title, credit, offered?, board? }. taps are the corner
//  holes a1, aN, jN, j1 (N = cols) in the file's own pixels (a corner may
//  lie off the image); the key is the `sample` sent to /api/photo, and the
//  key of its recording (test/fixtures/photo/<key>.json, leads/<key>.json).
//  title names its tile in the sample picker (#182); credit shows on the
//  tile and under the photo on its confirm screen.
//
//  board (#15): a hard-coded board, an action list in the AI's build shape
//  (place_* with holeA / holeB, add_wire { from, to }, holes like e3, rails
//  like bp_23, battery leads BAT1.0 / BAT1.1), no delete_all. It wins over
//  any recording: the tile shows the photo with "Reading your board…" for
//  about a second, then builds this exactly (photo.js), with no /api/photo
//  and no confirm screen. Such an entry needs no taps and no recording.
//  test/sample-boards.test.js checks each board applies and simulates.
//
//  demo-board.jpg is a placeholder until #144: test/fixtures/photo/web/
//  p6_piranha.jpg (lungstruck, CC BY 2.0), its a1/a24/j24/j1 taps used as
//  the corners of a 63-column board (a stretched grid; the sample's
//  Reading is a fixture).
//
//  The others are web eval photos (test/fixtures/photo/web/, #175), copied
//  as they are: piranha p6_piranha, resistors p1_resistors, multimeter
//  p5_multimeter, timer555 p3_bjornr. Their corners are fitted from the
//  labelled holes in photos.json (PhotoGrid.homography + holeCentre, as
//  scripts/photo-eval.js webCorners does). Credits from ATTRIBUTION.md.
//
//  offered: false (#200) keeps a sample off the picker: its recording doesn't
//  build a working circuit (a source and a closed loop). It stays here for
//  npm run photo-eval and the replay tests. Every other sample is offered;
//  with one, "Use sample photo" goes straight to it (photo.js).
//  test/photo-samples.test.js replays every offered sample without a board
//  and checks it works.
// ─────────────────────────────────────────────────────────────

window.PhotoSamples = {
  'demo-board': {
    file: 'samples/demo-board.jpg',
    cols: 63,
    taps: { a1: [949, 189], a63: [264.2, 189.8], j63: [264.2, 513.3], j1: [949, 513.3] },
    title: 'Demo: LED in backwards',
    credit: 'Photo: lungstruck, CC BY 2.0',
  },
  // Photo 2 of the web eval set (p2_leds_buttons, copied as it is). + rail →
  // SWn → LEDn → the shared R1 → − rail: pressing SWn lights only LEDn.
  // R1 sits at d11–g11 (the photo has it from d12 into the − rail, which the
  // page won't take), with j11 → bn_11 for its far end.
  'leds-buttons': {
    file: 'samples/leds-buttons.jpg',
    cols: 63,
    title: 'LEDs and buttons',
    credit: 'Photo: Ilikefood, Copyrighted free use',
    board: [
      { tool: 'place_battery' },
      { tool: 'place_button', holeA: 'a1', holeB: 'a4' },
      { tool: 'place_button', holeA: 'a5', holeB: 'a8' },
      { tool: 'place_button', holeA: 'a9', holeB: 'a12' },
      { tool: 'place_led', holeA: 'e3',  holeB: 'e4',  color: 'green' },    // holeA: the cathode
      { tool: 'place_led', holeA: 'e7',  holeB: 'e8',  color: 'yellow' },
      { tool: 'place_led', holeA: 'e11', holeB: 'e12', color: 'red' },
      { tool: 'place_resistor', holeA: 'd11', holeB: 'g11', resistance: 1500 },
      { tool: 'add_wire', from: 'BAT1.0', to: 'bp_23' },
      { tool: 'add_wire', from: 'BAT1.1', to: 'bn_23' },
      { tool: 'add_wire', from: 'bp_3', to: 'c1', color: 'red' },
      { tool: 'add_wire', from: 'bp_6', to: 'c5', color: 'red' },
      { tool: 'add_wire', from: 'bp_9', to: 'c9', color: 'red' },
      { tool: 'add_wire', from: 'b3', to: 'b11' },
      { tool: 'add_wire', from: 'b7', to: 'c11' },
      { tool: 'add_wire', from: 'j11', to: 'bn_11', color: 'black' },
    ],
  },
  piranha: {
    file: 'samples/piranha.jpg',
    cols: 30,
    taps: { a1: [949, 189], a30: [86.1, 190], j30: [86.1, 513.3], j1: [949, 513.3] },
    title: 'Piranha LEDs',
    credit: 'Photo: lungstruck, CC BY 2.0',
    offered: false,   // its 4-leg LEDs aren't built: the circuit is open
  },
  resistors: {
    file: 'samples/resistors.jpg',
    cols: 63,
    taps: { a1: [683, 1728.3], a63: [772.4, 513.4], j63: [565.2, 502.9], j1: [458.3, 1703] },
    title: 'Seven resistors',
    credit: 'Photo: ReyungCho, CC BY-SA 4.0',
    offered: false,   // a battery and 6 resistors, the circuit open
  },
  multimeter: {
    file: 'samples/multimeter.jpg',
    cols: 63,
    taps: { a1: [721.4, 345.6], a63: [766.2, 2768.6], j63: [1621.1, 2660.5], j1: [1095.5, 325.8] },
    title: 'Multimeter on an LED',
    credit: 'Photo: Zeroping, CC BY 4.0',
    offered: false,   // an LED and a resistor, no battery, no wires
  },
  timer555: {
    file: 'samples/timer555.jpg',
    cols: 30,
    taps: { a1: [1307.5, 156.3], a30: [216.2, 165.5], j30: [152, 543.3], j1: [1398.7, 523.3] },
    title: '555 timer',
    credit: 'Photo: BjornR, Public domain',
    offered: false,   // no 555 part: a battery and 2 resistors, the circuit open
  },
};
