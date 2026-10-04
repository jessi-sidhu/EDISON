// ─────────────────────────────────────────────────────────────
//  camera-frame.js — where the camera goes to frame some parts (issue #67)
//
//  After an AI build, or when a circuit is opened, the camera frames the
//  board's parts so they are big enough to see, click and scroll. The view
//  keeps home's angle; only the target and the distance change.
//
//  Pure: no THREE, no window, so it runs under Node.
//
//  EXPORTS
//  ───────
//  Browser: window.CameraFrame
//  Node:    module.exports = CameraFrame
//
//  CameraFrame.frameParts(items, { home, fov, aspect, minDistance })
//    → { target: [x,y,z], pos: [x,y,z] }
//    items        points [x,y,z] and/or boxes { min: [x,y,z], max: [x,y,z] }
//    home         { pos, target } (App.CAMERA.home)
//    fov          the camera's vertical fov, degrees
//    aspect       canvas width / height
//    minDistance  the closest the camera may come
//  target is the centre of the items' bounding box; pos is back along home's
//  view direction, far enough to fit them all (clamped to minDistance and
//  home's distance). No items → the home view.
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const CameraFrame = factory();
  if (typeof module === 'object' && module.exports) module.exports = CameraFrame;
  if (root) root.CameraFrame = CameraFrame;
})(typeof window !== 'undefined' ? window : null, function () {

  const MARGIN = 1.25;   // room around the parts' bounding sphere

  // Each item as its points: a box gives its 8 corners.
  function pointsOf(items) {
    const out = [];
    for (const it of items || []) {
      if (Array.isArray(it)) { out.push(it); continue; }
      const { min, max } = it;
      for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push([x, y, z]);
    }
    return out;
  }

  function frameParts(items, { home, fov, aspect, minDistance }) {
    const pts = pointsOf(items);
    if (!pts.length) return { target: home.target.slice(), pos: home.pos.slice() };

    const lo = [0, 1, 2].map(i => Math.min(...pts.map(p => p[i])));
    const hi = [0, 1, 2].map(i => Math.max(...pts.map(p => p[i])));
    const target = [0, 1, 2].map(i => (lo[i] + hi[i]) / 2);
    const radius = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;

    // The sphere fits when d ≥ r / sin(half the narrower fov).
    const halfV = (fov * Math.PI / 180) / 2;
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const fit   = radius * MARGIN / Math.sin(Math.min(halfV, halfH));

    const dir   = [0, 1, 2].map(i => home.pos[i] - home.target[i]);
    const homeD = Math.hypot(dir[0], dir[1], dir[2]);
    const d     = Math.min(Math.max(fit, minDistance), homeD);
    const pos   = [0, 1, 2].map(i => target[i] + dir[i] / homeD * d);
    return { target, pos };
  }

  return { frameParts };
});
