// ─────────────────────────────────────────────────────────────
//  samples.js — the rehearsed photos behind "Use sample photo"
//  Contract: docs/API-CONTRACT.md → "Page additions" (window.PhotoSamples).
//  A plain script, not .json: the static server never serves .json.
//
//  Each entry: { file, cols, taps, title, credit }. taps are the corner
//  holes a1, aN, jN, j1 (N = cols) in the file's own pixels (a corner may
//  lie off the image); the key is the `sample` sent to /api/photo, and the
//  key of its recording (test/fixtures/photo/<key>.json, leads/<key>.json).
//  title names its tile in the sample picker (#182); credit shows on the
//  tile and under the photo on its confirm screen.
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
// ─────────────────────────────────────────────────────────────

window.PhotoSamples = {
  'demo-board': {
    file: 'samples/demo-board.jpg',
    cols: 63,
    taps: { a1: [949, 189], a63: [264.2, 189.8], j63: [264.2, 513.3], j1: [949, 513.3] },
    title: 'Demo: LED in backwards',
    credit: 'Photo: lungstruck, CC BY 2.0',
  },
  piranha: {
    file: 'samples/piranha.jpg',
    cols: 30,
    taps: { a1: [949, 189], a30: [86.1, 190], j30: [86.1, 513.3], j1: [949, 513.3] },
    title: 'Piranha LEDs',
    credit: 'Photo: lungstruck, CC BY 2.0',
  },
  resistors: {
    file: 'samples/resistors.jpg',
    cols: 63,
    taps: { a1: [683, 1728.3], a63: [772.4, 513.4], j63: [565.2, 502.9], j1: [458.3, 1703] },
    title: 'Seven resistors',
    credit: 'Photo: ReyungCho, CC BY-SA 4.0',
  },
  multimeter: {
    file: 'samples/multimeter.jpg',
    cols: 63,
    taps: { a1: [721.4, 345.6], a63: [766.2, 2768.6], j63: [1621.1, 2660.5], j1: [1095.5, 325.8] },
    title: 'Multimeter on an LED',
    credit: 'Photo: Zeroping, CC BY 4.0',
  },
  timer555: {
    file: 'samples/timer555.jpg',
    cols: 30,
    taps: { a1: [1307.5, 156.3], a30: [216.2, 165.5], j30: [152, 543.3], j1: [1398.7, 523.3] },
    title: '555 timer',
    credit: 'Photo: BjornR, Public domain',
  },
};
