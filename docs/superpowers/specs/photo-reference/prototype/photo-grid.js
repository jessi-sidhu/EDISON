// ─────────────────────────────────────────────────────────────
//  photo-grid.js — photo pixels ↔ breadboard holes (prototype).
//  Pure: no DOM, no THREE. UMD like simulate.js.
//
//  BOARD FRAME (pitch units, 0.1")
//  ───────────
//    x = column − 1                       (column 1 at x = 0)
//    y = a 0, b 1, c 2, d 3, e 4,  f 7, g 8, h 9, i 10, j 11
//        (the centre channel is 0.3" wide, so f is 3 pitches below e)
//    rails sit above row a (y < 0) and below row j (y > 11).
//
//  The student taps 4 holes (a1, aN, jN, j1); any 4+ labelled holes work
//  (least squares past 4). H maps board frame → photo pixels.
//
//  RAILS
//  ─────
//  A rail line is { side: 'a'|'j', sign: '+'|'-', y }: the rail next to
//  row a or row j, by its PRINTED sign, at board-frame y. The default is
//  a BB830-style board, which prints "+ −" in the same order on both
//  edges: on the a side + is outer, on the j side + is inner.
//
//  SNAP VOCABULARY (the reading's hole names, same as the spike's truth)
//  ───────────────
//    'c12'            a body hole
//    'rail:a:+:12'    the + rail next to row a, nearest column 12
//
//  EXPORTS
//  ───────
//  Browser: window.PhotoGrid
//  Node:    module.exports
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const PhotoGrid = factory();
  if (typeof module === 'object' && module.exports) module.exports = PhotoGrid;
  if (root) root.PhotoGrid = PhotoGrid;
})(typeof window !== 'undefined' ? window : null, function () {

  const ROWS  = 'abcdefghij';
  const ROW_Y = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 7, g: 8, h: 9, i: 10, j: 11 };

  // BB830 order (measured on the spike's 63-column photos).
  const BB830_RAILS = [
    { side: 'a', sign: '-', y: -2.9 }, { side: 'a', sign: '+', y: -3.9 },
    { side: 'j', sign: '+', y: 13.9 }, { side: 'j', sign: '-', y: 14.9 },
  ];

  const BODY_TOP = [-0.6, 4.6];   // a–e zone
  const BODY_BOT = [6.4, 11.6];   // f–j zone
  const RAIL_TOL = 0.8;           // a rail snap farther than this is "off"
  const X_TOL    = 0.6;           // past column 1 / N by more than this is "off"

  // "c12" → [11, 2]; null for anything else.
  function holeXY(hole) {
    const m = /^([a-j])(\d+)$/i.exec(String(hole));
    return m ? [Number(m[2]) - 1, ROW_Y[m[1].toLowerCase()]] : null;
  }

  // ── Linear algebra ─────────────────────────────────────────

  // Least squares min ‖A x − b‖ by Householder QR (A is m × n, m ≥ n).
  // Same answer as numpy.linalg.lstsq for a full-rank A.
  function lstsq(A, b) {
    const m = A.length, n = A[0].length;
    const R = A.map(r => r.slice()), y = b.slice();
    for (let k = 0; k < n; k++) {
      let norm = 0;
      for (let i = k; i < m; i++) norm += R[i][k] * R[i][k];
      norm = Math.sqrt(norm);
      if (norm === 0) throw new Error('taps are degenerate (collinear or repeated)');
      const alpha = R[k][k] > 0 ? -norm : norm;
      const v = new Array(m).fill(0);
      for (let i = k; i < m; i++) v[i] = R[i][k];
      v[k] -= alpha;
      let vv = 0;
      for (let i = k; i < m; i++) vv += v[i] * v[i];
      if (vv === 0) continue;
      for (let j = k; j < n; j++) {
        let s = 0;
        for (let i = k; i < m; i++) s += v[i] * R[i][j];
        s = (2 * s) / vv;
        for (let i = k; i < m; i++) R[i][j] -= s * v[i];
      }
      let s = 0;
      for (let i = k; i < m; i++) s += v[i] * y[i];
      s = (2 * s) / vv;
      for (let i = k; i < m; i++) y[i] -= s * v[i];
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let j = i + 1; j < n; j++) s -= R[i][j] * x[j];
      if (Math.abs(R[i][i]) < 1e-12) throw new Error('taps are degenerate (collinear or repeated)');
      x[i] = s / R[i][i];
    }
    return x;
  }

  // 3×3 H (row-major, H[2][2] = 1) with dst ≈ H · src, from 4+ point pairs.
  function homography(src, dst) {
    if (src.length < 4 || src.length !== dst.length) throw new Error('need 4 or more point pairs');
    const A = [], b = [];
    src.forEach(([x, y], i) => {
      const [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    });
    const h = lstsq(A, b);
    return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
  }

  function applyH(H, x, y) {
    const w = H[2][0] * x + H[2][1] * y + H[2][2];
    return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w];
  }

  function invert3(M) {
    const [[a, b, c], [d, e, f], [g, h, i]] = M;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-15) throw new Error('homography is singular');
    return [
      [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
      [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
      [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
    ];
  }

  // ── The grid ───────────────────────────────────────────────

  // taps: { a1: [px, py], a63: [...], j63: [...], j1: [...] } (4 or more
  // labelled body holes). opts: { cols (default 63), rails (default BB830),
  // jTop (parity with the spike's mirrored frame; same pixels for 4 taps) }.
  function fromTaps(taps, opts) {
    const o = opts || {};
    const cols = o.cols || 63;
    const rails = (o.rails || BB830_RAILS).map(r => Object.assign({}, r));
    const names = Object.keys(taps);
    const canon = names.map(h => {
      const xy = holeXY(h);
      if (!xy) throw new Error(`tap "${h}" is not a body hole`);
      return o.jTop ? [xy[0], 11 - xy[1]] : xy;
    });
    const Hf = homography(canon, names.map(h => taps[h]));
    // Fold the mirror back in, so everything below works in the a-top frame.
    const H = o.jTop ? mul(Hf, [[1, 0, 0], [0, -1, 11], [0, 0, 1]]) : Hf;
    const Hinv = invert3(H);

    const toPx    = (x, y) => applyH(H, x, y);
    const toBoard = (px, py) => applyH(Hinv, px, py);

    function holePx(hole) {
      const xy = holeXY(hole);
      return xy ? toPx(xy[0], xy[1]) : null;
    }

    function railY(side, sign) {
      const r = rails.find(q => q.side === side && q.sign === sign);
      return r ? r.y : null;
    }

    // 'rail:a:+:12' → pixel point on that rail line at column 12.
    function railPx(side, sign, col) {
      const y = railY(side, sign);
      return y == null ? null : toPx(col - 1, y);
    }

    // Any reading hole name → pixel point.
    function px(name) {
      const m = /^rail:([aj]):([+-]):(\d+)$/.exec(String(name));
      return m ? railPx(m[1], m[2], +m[3]) : holePx(name);
    }

    // A pixel point → the hole it is in.
    // → { hole, zone: 'body'|'gap'|'rail'|'off', dist (pitch units to the
    //     snapped centre), x, y (board frame) }. hole is null when 'off'.
    // 'gap' snaps to e or f, whichever is nearer, and should be confirmed.
    function snap(pxX, pxY) {
      const [x, y] = toBoard(pxX, pxY);
      const out = (hole, zone, cx, cy) => ({ hole, zone, dist: Math.hypot(x - cx, y - cy), x, y });
      if (x < -X_TOL || x > cols - 1 + X_TOL) return out(null, 'off', x, y);
      const col = Math.min(Math.max(Math.round(x) + 1, 1), cols);
      const cx = col - 1;
      const bodyRow = yi => ROWS[[0, 1, 2, 3, 4, 7, 8, 9, 10, 11].indexOf(yi)];
      if (y >= BODY_TOP[0] && y <= BODY_TOP[1]) {
        const yi = Math.min(Math.max(Math.round(y), 0), 4);
        return out(bodyRow(yi) + col, 'body', cx, yi);
      }
      if (y >= BODY_BOT[0] && y <= BODY_BOT[1]) {
        const yi = Math.min(Math.max(Math.round(y), 7), 11);
        return out(bodyRow(yi) + col, 'body', cx, yi);
      }
      if (y > BODY_TOP[1] && y < BODY_BOT[0]) {
        const yi = y < 5.5 ? 4 : 7;
        return out(bodyRow(yi) + col, 'gap', cx, yi);
      }
      const side = y < 0 ? 'a' : 'j';
      const near = rails.filter(r => r.side === side)
        .sort((p, q) => Math.abs(p.y - y) - Math.abs(q.y - y))[0];
      if (!near || Math.abs(near.y - y) > RAIL_TOL) return out(null, 'off', x, y);
      return out(`rail:${near.side}:${near.sign}:${col}`, 'rail', cx, near.y);
    }

    // Every body hole with its pixel centre (for the dot overlay).
    function allHoles() {
      const outList = [];
      for (let c = 1; c <= cols; c++) for (const r of ROWS) outList.push({ hole: r + c, px: holePx(r + c) });
      return outList;
    }

    return { cols, rails, H, Hinv, toPx, toBoard, holePx, railPx, px, snap, allHoles };
  }

  function mul(A, B) {
    return A.map((row, i) => B[0].map((_, j) => row.reduce((s, _v, k) => s + A[i][k] * B[k][j], 0)));
  }

  return { ROW_Y, BB830_RAILS, holeXY, lstsq, homography, applyH, invert3, fromTaps };
});
