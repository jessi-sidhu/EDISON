// ─────────────────────────────────────────────────────────────
//  board-geometry.js — the breadboard's size, the single source of truth.
//
//  Read by breadboard.js (and through it app.js) in the browser, and by
//  server.js's prompt and the test recipes in Node. src/constants.ts is a
//  second copy for Remotion: the two runtimes share no module, so it has to
//  be kept in step by hand.
//
//  EXPORTS
//  ───────
//  Browser: window.App.BOARD_GEOMETRY
//  Node:    module.exports (the geometry object itself)
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const GEOMETRY = factory();
  if (typeof module === 'object' && module.exports) module.exports = GEOMETRY;
  if (root) (root.App = root.App || {}).BOARD_GEOMETRY = GEOMETRY;
})(typeof window !== 'undefined' ? window : null, function () {

  const GEOMETRY = {
    COLS:        63,
    HS:          0.40,   // hole pitch  (world units)
    BOARD_THICK: 0.38,
    MARGIN_X:    0.90,   // space left/right of first/last column
    BOARD_D:     7.9,

    // World-Z of every row centre.
    // Positive Z = near the viewer.  Negative Z = far side.
    // tp/tn live on the far side; bn/bp on the near side.
    ROW_Z: {
      tp: -3.35, tn: -2.95,                                    // top rails
      a : -2.15, b : -1.75, c : -1.35, d : -0.95, e : -0.55,   // top body
      // ── centre channel (no holes) ──
      f :  0.55, g :  0.95, h :  1.35, i :  1.75, j :  2.15,   // bottom body
      bn:  2.95, bp:  3.35,                                    // bottom rails
    },

    // + − + −  (near-to-far):  tp=+  tn=−  bn=+  bp=−
    RAIL_IS_POS: { tp: true, tn: false, bn: true, bp: false },

    ALL_ROWS:  ['tp','tn','a','b','c','d','e','f','g','h','i','j','bn','bp'],
    BODY_ROWS: ['a','b','c','d','e','f','g','h','i','j'],
    RAIL_ROWS: ['tp','tn','bn','bp'],
  };
  GEOMETRY.BOARD_W     = (GEOMETRY.COLS - 1) * GEOMETRY.HS + 2 * GEOMETRY.MARGIN_X;
  GEOMETRY.TOTAL_HOLES = GEOMETRY.COLS * GEOMETRY.ALL_ROWS.length;

  return GEOMETRY;
});
