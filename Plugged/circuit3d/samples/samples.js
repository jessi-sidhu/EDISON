// ─────────────────────────────────────────────────────────────
//  samples.js — the rehearsed photos behind "Use sample photo"
//  Contract: docs/API-CONTRACT.md → "Page additions" (window.PhotoSamples).
//  A plain script, not .json: the static server never serves .json.
//
//  Each entry: { file, cols, taps, title, credit, offered?, board?, match?, explain?, fix? }. taps are the corner
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
//  match, explain, fix (#17): a rehearsed upload. match lists the SHA-256
//  (hex) of the photo files that are this board; a chosen photo whose bytes
//  match gets the corner step as usual (the sample's own file if the browser
//  can't decode it, a HEIC), then on Looks right this board, as a tile does.
//  explain is Edison's canned answer to the first question after it; fix
//  { reply, actions } the canned answer to a later one asking to fix it,
//  previewed with Accept like any AI edit (chat.js askSparky). Each is used
//  once; a new photo or a cleared board drops them (photo.js).
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
  // Aarmen's own build of his bench photo (a TL072 comparator), from his saved project, 2026-10-04.
  'ensc-lab': {
    file: 'samples/ensc-lab.jpg',
    cols: 63,
    title: 'ENSC 220 lab bench',
    credit: 'Photo: Aarmen, ENSC 220 lab',
    board: [
      { tool: 'place_resistor', holeA: 'd29', holeB: 'd34', resistance: 10000 },
      { tool: 'place_bench_supply', voltage: 12, limit: 0.05, voltage2: 12, limit2: 0.5 },
      { tool: 'place_resistor', holeA: 'h29', holeB: 'h33', resistance: 470 },
      { tool: 'place_tl072', hole: 'f57', direction: 'right' },
      { tool: 'place_resistor', holeA: 'g55', holeB: 'g59', resistance: 470 },
      { tool: 'place_function_generator', amplitude: 5, frequency: 1, offset: 0 },
      { tool: 'add_wire', from: 'c34', to: 'd40', color: 'white' },
      { tool: 'add_wire', from: 'PS1.0', to: 'tp_1', color: 'red' },      // PS1 pins: pos com neg com2
      { tool: 'add_wire', from: 'PS1.1', to: 'tn_1', color: 'black' },
      { tool: 'add_wire', from: 'PS1.3', to: 'tn_2', color: 'white' },
      { tool: 'add_wire', from: 'PS1.2', to: 'bn_1', color: 'blue' },
      { tool: 'add_wire', from: 'tn_3', to: 'bp_3', color: 'black' },
      { tool: 'add_wire', from: 'e40', to: 'f41', color: 'black' },
      { tool: 'add_wire', from: 'i33', to: 'h41', color: 'black' },
      { tool: 'add_wire', from: 'd57', to: 'tp_58', color: 'red' },
      { tool: 'add_wire', from: 'FG1.1', to: 'tn_38', color: 'black' },   // FG1 pins: out com
      { tool: 'add_wire', from: 'FG1.0', to: 'f55', color: 'red' },
      { tool: 'add_wire', from: 'tp_29', to: 'a29', color: 'green' },
      { tool: 'add_wire', from: 'bp_29', to: 'j29', color: 'green' },
      { tool: 'add_wire', from: 'j60', to: 'bn_60', color: 'green' },
      { tool: 'add_wire', from: 'g41', to: 'h58', color: 'green' },
    ],
  },
  // Thandi's real board (#17), the photoexample op-amp blinker as she built it,
  // decoded from her photos (the file is a 2048-px copy of IMG_2013): U1 turned
  // around and 2 columns off, and pin 4 with no wire to ground. fix turns U1
  // around at e32 and adds a29 → tn_29.
  'thandi-blinker': {
    file: 'samples/thandi-blinker.jpg',
    cols: 63,
    match: [
      'd976b9346ff0b6009331eeb057233ed09a39538d844bb4d68b5212a42c7f99e0',   // thandi-board-1.jpg
      '335600b887ac38f3a27e8286d644bc9534bc14616646cc6ed25d3f7778f7c443',   // thandi-board-2.jpg
      '82fc1b4c628ac54ffb85a36c7b1fae91c0e6cb3a4d44f5cb37619d0ad0bb7587',   // thandi-board-3.jpg
      'a49349f12145750f4c3ae48e387906be99d0b2a2271afe2bf8a97cd47a4e517b',   // IMG_2011.heic
      'e95966be941be4c00f3f421da47601a9b8e82992bc1e77eabbfe1146258ae831',   // IMG_2012.heic
      'c31d115dbceee4d6954cf1e6da7456707d84b5346b58c2a891c65ed1113f528e',   // IMG_2013.heic
    ],
    title: 'Op-amp blinker (Thandi)',
    credit: 'Photo: Thandi',
    board: [
      { tool: 'place_battery' },
      { tool: 'place_tl072', hole: 'f27', direction: 'right' },                     // as photographed: turned around, 2 columns off
      { tool: 'place_potentiometer', hole: 'e37', direction: 'left', resistance: 10000 },
      { tool: 'place_capacitor', holeA: 'd31', holeB: 'd33', capacitance: '100µF' },
      { tool: 'place_resistor', holeA: 'a36', holeB: 'a31', resistance: 1000 },
      { tool: 'place_resistor', holeA: 'a22', holeB: 'a19', resistance: 10000 },
      { tool: 'place_resistor', holeA: 'c22', holeB: 'c17', resistance: 5600 },
      { tool: 'place_resistor', holeA: 'b26', holeB: 'b22', resistance: 10000 },
      { tool: 'place_resistor', holeA: 'd15', holeB: 'd10', resistance: 1000 },
      { tool: 'place_led', holeA: 'c8', holeB: 'c10', color: 'yellow' },            // holeA the cathode
      { tool: 'add_wire', from: 'BAT1.0', to: 'tp_1', color: 'red' },
      { tool: 'add_wire', from: 'BAT1.1', to: 'tn_1', color: 'black' },
      { tool: 'add_wire', from: 'bp_3', to: 'tp_3', color: 'black' },
      { tool: 'add_wire', from: 'bn_4', to: 'tn_5', color: 'green' },
      { tool: 'add_wire', from: 'bp_34', to: 'j32', color: 'white' },
      { tool: 'add_wire', from: 'bn_28', to: 'i29', color: 'black' },
      { tool: 'add_wire', from: 'd35', to: 'd36', color: 'red' },
      { tool: 'add_wire', from: 'c32', to: 'b37', color: 'white' },
      { tool: 'add_wire', from: 'a33', to: 'tn_31', color: 'red' },
      { tool: 'add_wire', from: 'd30', to: 'd22', color: 'red' },
      { tool: 'add_wire', from: 'a32', to: 'a15', color: 'yellow' },
      { tool: 'add_wire', from: 'a26', to: 'tn_25', color: 'red' },
      { tool: 'add_wire', from: 'a8', to: 'tn_9', color: 'black' },
      { tool: 'add_wire', from: 'b19', to: 'tp_19', color: 'white' },
      { tool: 'add_wire', from: 'b17', to: 'b15', color: 'white' },
    ],
    explain: "Two things keep this blinker dark:\n\n1. **U1 is turned around and 2 columns off.** Its dot (pin 1) should face the potentiometer, at e32. Where it sits now, pin 8 (V+) and pin 4 (V−) land in empty columns, so the op-amp gets no power.\n2. **Pin 4 (V−) has no wire to ground.** Even turned the right way, it needs a wire to the − rail.\n\nAsk me to fix it and I'll turn U1 around and add the wire.",
    fix: {
      reply: "Here's the fix: I turn U1 around and move it so pin 1 sits at e32, then wire pin 4 (V−) to the − rail (a29 → tn_29). Accept, then Run: the op-amp gets its ±supply and the LED lights.",
      actions: [
        { tool: 'delete_part', part: 'U1' },
        { tool: 'place_tl072', hole: 'e32', direction: 'left' },
        { tool: 'add_wire', from: 'a29', to: 'tn_29', color: 'black' },
      ],
    },
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
