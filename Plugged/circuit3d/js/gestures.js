// ─────────────────────────────────────────────────────────────
//  gestures.js — the gesture dispatcher (issue #26)
//
//  A click or a scroll on a part's model maps to one of its controls
//  (PartDefinition `gestures`). This module only decides when to
//  re-simulate and when to record an undo step:
//    - While a gesture continues, re-simulate at most once per
//      throttleMs (100 ms), plus one final run when it stops.
//    - A scroll ends scrollEndMs (300 ms) after its last tick; a click
//      ends on release().
//    - One gesture = one undo step: pushHistory() once, before its
//      first change.
//
//  Pure: the clock, the timers, the simulation and the undo history are
//  handed in, so it runs under Node with a fake clock.
//
//  EXPORTS
//  ───────
//  Browser: window.Gestures
//  Node:    module.exports = Gestures
//
//  Gestures.create({ now, setTimeout, clearTimeout, simulate, pushHistory,
//                    throttleMs = 100, scrollEndMs = 300 })
//    → { tick(kind, apply), release() }
//
//  Gestures.pickScrollPart(pointer, candidates, maxPx) → candidate | null
//    Which part a wheel tick near (not only on) a part turns (bug #59).
//    pointer {x, y} and each candidate's rect {x, y, w, h} (top-left,
//    y down) in page px. The nearest rect, measured to its nearest edge
//    or corner (0 inside), if that is ≤ maxPx; else null.
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const Gestures = factory();
  if (typeof module === 'object' && module.exports) module.exports = Gestures;
  if (root) root.Gestures = Gestures;
})(typeof window !== 'undefined' ? window : null, function () {

  function create({ now, setTimeout, clearTimeout, simulate, pushHistory, throttleMs = 100, scrollEndMs = 300 }) {
    let running = false;      // a gesture is under way
    let lastRun = -Infinity;  // when this gesture last simulated
    let timer   = null;       // the scroll-end timer

    // kind: 'click' | 'scroll'. apply() makes the control change.
    function tick(kind, apply) {
      if (!running) {
        running = true;
        lastRun = -Infinity;
        pushHistory();
      }
      apply();
      const t = now();
      if (t - lastRun >= throttleMs) {
        lastRun = t;
        simulate();
      }
      if (kind === 'scroll') {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(release, scrollEndMs);
      }
    }

    // Ends the gesture with one final run. Nothing running: nothing to do.
    function release() {
      if (!running) return;
      if (timer !== null) { clearTimeout(timer); timer = null; }
      running = false;
      simulate();
    }

    return { tick, release };
  }

  function rectDistance(p, r) {
    const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
    const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
    return Math.hypot(dx, dy);
  }

  function pickScrollPart(pointer, candidates, maxPx) {
    let best = null, bestD = Infinity;
    for (const c of candidates || []) {
      const d = rectDistance(pointer, c.rect);
      if (d <= maxPx && d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  return { create, pickScrollPart };
});
