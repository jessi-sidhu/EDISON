// ─────────────────────────────────────────────────────────────
//  photo-grid.js — photo pixels ↔ breadboard holes
//  Pure: no DOM, no THREE. Contract: docs/API-CONTRACT.md → "PhotoGrid".
//
//  BOARD FRAME (pitch units, 0.1")
//  ───────────
//    x = column − 1                       (column 1 at x = 0)
//    y = a 0, b 1, c 2, d 3, e 4,  f 7, g 8, h 9, i 10, j 11
//        (the centre channel is 0.3" wide, so f is 3 pitches below e)
//  With j on top the rows flip: y = 11 − that.
//
//  THE FLATTENED IMAGE
//  ───────────────────
//  30 px per pitch, the top-left body hole (a1, or j1 with j on top)
//  at (90, 190). H maps a flattened-image pixel to a photo pixel.
//  Which of a or j is on top is chosen from the taps, so the flattened
//  image is never a mirror image of the photo (positive Jacobian).
//
//  RAILS (named by side, not position)
//  ─────
//    aInner / aOuter   2.9 / 3.9 pitches beyond row a
//    jInner / jOuter   2.9 / 3.9 pitches beyond row j
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

  const PITCH  = 30;
  const X0     = 90;
  const Y0     = 190;
  const HEIGHT = 710;

  const ROW_Y   = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 7, g: 8, h: 9, i: 10, j: 11 };
  const FRAME_Y = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11];
  const RAIL_OFF = { Inner: 2.9, Outer: 3.9 };   // pitches beyond the body row (BB830)

  const HOLE_TOL  = 0.45;   // body snap radius
  const X_TOL     = 0.6;    // past column 1 / N by more than this is "off"
  const RAIL_ZONE = 5;      // rail zones reach 5 pitches beyond the body
  const RAIL_MID  = 3.4;    // inner below this many pitches beyond the body row, else outer
  const FLAT_TOL  = 1e-3;   // taps thinner than this (minor / major spread) are collinear

  const DARK = [40, 40, 40, 255];

  // ── Linear algebra ─────────────────────────────────────────

  // Least squares min ‖A x − b‖ by Householder QR (A is m × n, m ≥ n).
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

  function applyH(H, x, y) {
    const w = H[2][0] * x + H[2][1] * y + H[2][2];
    return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w];
  }

  function mul(A, B) {
    return A.map((row, i) => B[0].map((_, j) => row.reduce((s, _v, k) => s + A[i][k] * B[k][j], 0)));
  }

  function det3(M) {
    const [[a, b, c], [d, e, f], [g, h, i]] = M;
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  }

  // Centroid and spread of a point set: the eigenvalues of its 2 × 2
  // second-moment matrix (major ≥ minor).
  function spread(pts) {
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
    sxx /= n; syy /= n; sxy /= n;
    const t = (sxx + syy) / 2, r = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
    return { mx, my, major: t + r, minor: Math.max(t - r, 0) };
  }

  // Throws unless the points are distinct and not (near-)collinear.
  function checkSpread(pts, what) {
    const s = spread(pts);
    if (!(s.major > 0) || Math.sqrt(s.minor / s.major) < FLAT_TOL) {
      throw new Error(`taps are degenerate: the ${what} are collinear`);
    }
    const minGap = FLAT_TOL * Math.sqrt(s.major);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) < minGap) {
          throw new Error(`taps are degenerate: two ${what} are the same point`);
        }
      }
    }
    return s;
  }

  // Similarity taking the points' centroid to 0 and their mean distance to √2.
  function normaliser(pts) {
    const { mx, my } = spread(pts);
    const d = pts.reduce((s, [x, y]) => s + Math.hypot(x - mx, y - my), 0) / pts.length;
    const k = Math.SQRT2 / d;
    return { T: [[k, 0, -k * mx], [0, k, -k * my], [0, 0, 1]], Tinv: [[1 / k, 0, mx], [0, 1 / k, my], [0, 0, 1]] };
  }

  // 3 × 3 H with dst ≈ H · src, least squares over 4+ pairs, on normalised
  // coordinates (exact for 4).
  function fitH(src, dst) {
    const ns = normaliser(src), nd = normaliser(dst);
    const A = [], b = [];
    src.forEach((p, i) => {
      const [x, y] = applyH(ns.T, p[0], p[1]);
      const [u, v] = applyH(nd.T, dst[i][0], dst[i][1]);
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    });
    const h = lstsq(A, b);
    const Hn = [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
    const norm = Math.sqrt(h.reduce((s, q) => s + q * q, 1));
    if (Math.abs(det3(Hn)) / norm ** 3 < 1e-9) throw new Error('taps are degenerate (the map is singular)');
    const H = mul(nd.Tinv, mul(Hn, ns.T));
    return H.map(row => row.map(q => q / H[2][2]));
  }

  // ── Holes ──────────────────────────────────────────────────

  // 'c14' → { col: 14, y: 2 } (board-frame y), or null.
  function parseBody(hole, cols) {
    const m = /^([a-j])([1-9]\d*)$/.exec(String(hole));
    if (!m || Number(m[2]) > cols) return null;
    return { col: Number(m[2]), y: ROW_Y[m[1]] };
  }

  // 'rail:aOuter:14' → { side: 'a', off: 3.9, col: 14 }, or null.
  function parseRail(hole, cols) {
    const m = /^rail:([aj])(Inner|Outer):([1-9]\d*)$/.exec(String(hole));
    if (!m || Number(m[3]) > cols) return null;
    return { side: m[1], off: RAIL_OFF[m[2]], col: Number(m[3]) };
  }

  // ── The grid ───────────────────────────────────────────────

  function homography(taps, cols = 63) {
    const names = Object.keys(taps || {});
    if (names.length < 4) throw new Error('need 4 or more tapped holes');
    const board = names.map(h => {
      const b = parseBody(h, cols);
      if (!b) throw new Error(`tap "${h}" is not a body hole on a ${cols}-column board`);
      return b;
    });
    const photo = names.map(h => taps[h]);
    checkSpread(photo, 'tapped points');
    checkSpread(board.map(b => [b.col - 1, b.y]), 'tapped holes');

    // Fit in the a-on-top frame; if that's a mirror image of the photo, j is on top.
    const flatOf = aTop => board.map(b => [X0 + PITCH * (b.col - 1), Y0 + PITCH * (aTop ? b.y : 11 - b.y)]);
    let aTop = true;
    let H = fitH(flatOf(true), photo);
    const c = spread(flatOf(true));
    const w = H[2][0] * c.mx + H[2][1] * c.my + H[2][2];
    if (det3(H) / w ** 3 <= 0) {
      aTop = false;
      H = fitH(flatOf(false), photo);
    }

    const frameY = y => (aTop ? y : 11 - y);
    const rowAt  = fy => 'abcdefghij'[FRAME_Y.indexOf(frameY(fy))];
    const railY  = (side, off) => ((side === 'a') === aTop ? -off : 11 + off);

    function holeCentre(hole) {
      const b = parseBody(hole, cols);
      if (b) return [X0 + PITCH * (b.col - 1), Y0 + PITCH * frameY(b.y)];
      const r = parseRail(hole, cols);
      if (r) return [X0 + PITCH * (r.col - 1), Y0 + PITCH * railY(r.side, r.off)];
      return null;
    }

    function snap([x, y]) {
      const u = (x - X0) / PITCH, v = (y - Y0) / PITCH;   // frame pitches
      const off = { hole: 'off', zone: 'off', dist: null };
      if (u < -X_TOL || u > cols - 1 + X_TOL) return off;
      const col = Math.min(Math.max(Math.round(u) + 1, 1), cols);
      const du  = u - (col - 1);

      const fy = FRAME_Y.reduce((best, q) => (Math.abs(q - v) < Math.abs(best - v) ? q : best));
      const dist = Math.hypot(du, v - fy);
      if (dist <= HOLE_TOL) return { hole: rowAt(fy) + col, zone: 'body', dist };

      if (v > 4 + HOLE_TOL && v < 7 - HOLE_TOL) return { hole: rowAt(fy) + col, zone: 'gap', dist };

      const beyond = v < 0 ? -v : v - 11;
      if (beyond > HOLE_TOL && beyond <= RAIL_ZONE) {
        const topSide = aTop ? 'a' : 'j';
        const side = v < 0 ? topSide : (topSide === 'a' ? 'j' : 'a');
        const kind = beyond < RAIL_MID ? 'Inner' : 'Outer';
        const rail = side + kind;
        const ry = railY(side, RAIL_OFF[kind]);
        return { hole: `rail:${rail}:${col}`, zone: 'rail', rail, col, dist: Math.hypot(du, v - ry) };
      }
      return off;
    }

    const toPhoto = ([x, y]) => applyH(H, x, y);

    return {
      cols, aTop, pitch: PITCH, x0: X0, y0: Y0,
      width: PITCH * (cols - 1) + 180, height: HEIGHT,
      H, holeCentre, snap, toPhoto,
    };
  }

  // ── Warp ───────────────────────────────────────────────────

  // Each out pixel samples src at H · (x, y), bilinear; outside src is dark.
  function warp(src, H, out) {
    const sw = src.width, sh = src.height, s = src.data, o = out.data;
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        const [sx, sy] = applyH(H, x, y);
        const i = 4 * (y * out.width + x);
        if (!(sx >= 0 && sy >= 0 && sx <= sw - 1 && sy <= sh - 1)) {
          o[i] = DARK[0]; o[i + 1] = DARK[1]; o[i + 2] = DARK[2]; o[i + 3] = DARK[3];
          continue;
        }
        const x0 = Math.floor(sx), y0 = Math.floor(sy);
        const x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
        const fx = sx - x0, fy = sy - y0;
        const p00 = 4 * (y0 * sw + x0), p10 = 4 * (y0 * sw + x1);
        const p01 = 4 * (y1 * sw + x0), p11 = 4 * (y1 * sw + x1);
        for (let k = 0; k < 4; k++) {
          const top = s[p00 + k] + (s[p10 + k] - s[p00 + k]) * fx;
          const bot = s[p01 + k] + (s[p11 + k] - s[p01 + k]) * fx;
          o[i + k] = Math.round(top + (bot - top) * fy);
        }
      }
    }
    return out;
  }

  return { homography, warp };
});
