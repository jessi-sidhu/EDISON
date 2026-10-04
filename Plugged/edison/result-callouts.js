// ─────────────────────────────────────────────────────────────
//  edison/result-callouts.js — results and mistakes as callouts pinned to
//  their parts (issue #191, Lab HUD 3/4). Edison only (?ui=edison).
//
//  Each shown line of readings.lines() (contract "Readings") gets a label
//  block (caps title, grey sublines) and an elbow leader from a dot on its
//  part: the part group's top centre, projected through App.camera. All
//  leaders and dots are one SVG over the canvas, in #result-callouts.
//
//    ResultCallouts.MAX              the clutter cap
//    ResultCallouts.pick(lines)      at most MAX: faults, then warn, then
//                                    ok, in their given order within a level
//    ResultCallouts.layoutCallouts(items, viewport, avoid?)
//                                    items [{ label, x, y, w, h }] (the dot,
//                                    px, and the block's size), viewport
//                                    { width, height }, avoid [{ left, top,
//                                    width, height }] (panels to keep off).
//                                    → [{ label, left, top, width, height,
//                                    side, leader }] in the same order: the
//                                    blocks stay inside the viewport and never
//                                    overlap; leader is [[x, y], elbow, end].
//                                    A block wider or taller than the viewport
//                                    can't fit: { label, hidden: true } (#201)
//
//  The page half redraws on plugged:sim, clears on plugged:sim-stop, and
//  re-projects on the orbit controls' 'change' (the camera moved) and on a
//  resize. No animation loop: render on demand (issue 109) stays quiet.
//  A callout never draws outside the canvas (#201): one whose part's anchor
//  is off the canvas or behind the camera (zoomed in, or an instrument a
//  framed lab leaves out) hides, as does one whose block can't fit.
//
//  EXPORTS
//  ───────
//  Browser: window.ResultCallouts (after app.js, which sets up App)
//  Node:    module.exports; nothing touches the DOM at load
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const ResultCallouts = factory();
  if (typeof module === 'object' && module.exports) module.exports = ResultCallouts;
  if (root) { root.ResultCallouts = ResultCallouts; ResultCallouts.boot(root); }
})(typeof window !== 'undefined' ? window : null, function () {

  const MAX = 4;                                // the issue's "at most about 4"
  const RANK = { fault: 0, warn: 1, ok: 2 };

  function pick(lines) {
    if (!Array.isArray(lines)) return [];
    const rank = l => (l && RANK[l.level] !== undefined ? RANK[l.level] : RANK.ok);
    return lines.map((l, k) => ({ l, k })).sort((a, b) => rank(a.l) - rank(b.l) || a.k - b.k)
      .slice(0, MAX).map(x => x.l);
  }

  // ── Layout: where each label block goes ──
  const GAP     = 8;     // px, the leader's end to its block
  const RUN     = 30;    // px, the leader's level run
  const REACH   = 40;    // px, the leader's slant sideways
  const RISE    = 110;   // px, a block's title line above (or below) its dot
  const TITLE_Y = 15;    // px, a block's top to its title line's middle
  const ROOM    = 6;     // px kept clear around blocks and dots when there is space
  const STEP    = 10;    // px, the fallback scan's grid

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const hits = (a, b, pad) => a.left < b.left + b.width + pad && b.left < a.left + a.width + pad &&
                              a.top < b.top + b.height + pad && b.top < a.top + a.height + pad;
  const covers = (b, p, pad) => p.x > b.left - pad && p.x < b.left + b.width + pad &&
                                p.y > b.top - pad && p.y < b.top + b.height + pad;

  function inside(box, vp) {
    return Object.assign(box, { left: clamp(box.left, 0, Math.max(0, vp.width - box.width)),
                                top:  clamp(box.top, 0, Math.max(0, vp.height - box.height)) });
  }

  // Boxes around the dot, best first: up left (the mockup), up right,
  // down left, down right, at a few heights.
  function candidates(it, vp) {
    const out = [];
    for (const rise of [RISE, RISE * 0.5, RISE * 1.7, RISE * 2.5]) {
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const edge = it.x + sx * (REACH + RUN + GAP);
        out.push(inside({ left: sx < 0 ? edge - it.w : edge, top: it.y + sy * rise - TITLE_Y, width: it.w, height: it.h }, vp));
      }
    }
    return out;
  }

  // The free spot on a grid nearest want, or null when none is free.
  function scan(want, vp, free) {
    let best = null, bestD = Infinity;
    for (let top = 0; top <= vp.height - want.height; top += STEP) {
      for (let left = 0; left <= vp.width - want.width; left += STEP) {
        const d = (left - want.left) ** 2 + (top - want.top) ** 2;
        if (d >= bestD) continue;
        const box = { left, top, width: want.width, height: want.height };
        if (free(box)) { best = box; bestD = d; }
      }
    }
    return best;
  }

  // The elbow leader: from the dot, slanting to the run, level into the block.
  function leaderOf(it, b) {
    if (it.x >= b.left - GAP && it.x <= b.left + b.width + GAP) {   // the dot is under or over its block
      const y = it.y < b.top ? b.top - GAP : b.top + b.height + GAP;
      return { side: 'left', leader: [[it.x, it.y], [it.x, y], [it.x, y]] };
    }
    const left = b.left + b.width < it.x;
    const end = { x: left ? b.left + b.width + GAP : b.left - GAP, y: b.top + Math.min(TITLE_Y, b.height / 2) };
    const elbow = { x: left ? Math.min(end.x + RUN, it.x) : Math.max(end.x - RUN, it.x), y: end.y };
    return { side: left ? 'left' : 'right', leader: [[it.x, it.y], [elbow.x, elbow.y], [end.x, end.y]] };
  }

  // Do segments ab and cd cross? Two leaders [dot, elbow, end] tangle when any of their segments do.
  function crosses(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  }
  const tangled = (p, q) => [0, 1].some(i => [0, 1].some(j => crosses(p[i], p[i + 1], q[j], q[j + 1])));

  function layoutCallouts(items, viewport, avoid) {
    const vp = { width: Number(viewport && viewport.width) || 0, height: Number(viewport && viewport.height) || 0 };
    const all = (Array.isArray(items) ? items : [])
      .map(it => ({ label: it.label, x: Number(it.x) || 0, y: Number(it.y) || 0, w: Number(it.w) || 0, h: Number(it.h) || 0 }));
    // A block bigger than the viewport fits nowhere in it: hidden, and it takes no room.
    const fitsIn = it => it.w <= vp.width && it.h <= vp.height;
    const list = all.filter(fitsIn);
    const keepOff = (Array.isArray(avoid) ? avoid : []).filter(r => r && r.width > 0 && r.height > 0);
    const placed = [];
    const clear = (box, pad, withDots) => placed.every(p => !hits(box, p, pad)) && keepOff.every(r => !hits(box, r, pad)) &&
                                          (!withDots || list.every(d => !covers(box, d, pad)));
    const boxes = list.map(item => {
      const tries = candidates(item, vp);
      const box = tries.find(b => clear(b, ROOM, true))
        || scan(tries[0], vp, b => clear(b, ROOM, true))
        || scan(tries[0], vp, b => placed.every(p => !hits(b, p, 0)))
        || tries[0];
      placed.push(box);
      return box;
    });

    // Two leaders that cross: trade the blocks' heights, or their places
    // (each kept to the near edge of the spot it takes), when that
    // untangles them and both still fit.
    const fits = (box, i, j) => box.left >= 0 && box.top >= 0 && box.left + box.width <= vp.width && box.top + box.height <= vp.height &&
      boxes.every((o, m) => m === i || m === j || !hits(box, o, 0)) && keepOff.every(r => !hits(box, r, 0));
    const moveTo = (box, spot, side) => Object.assign({}, box, { top: spot.top, left: side === 'left' ? spot.left + spot.width - box.width : spot.left });
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = boxes[i], b = boxes[j], la = leaderOf(list[i], a), lb = leaderOf(list[j], b);
        if (!tangled(la.leader, lb.leader)) continue;
        const trades = [[Object.assign({}, a, { top: b.top }), Object.assign({}, b, { top: a.top })],
                        [moveTo(a, b, lb.side), moveTo(b, a, la.side)]];
        const ok = trades.find(([x, y]) => fits(x, i, j) && fits(y, i, j) && !hits(x, y, 0) &&
                                           !tangled(leaderOf(list[i], x).leader, leaderOf(list[j], y).leader));
        if (ok) [boxes[i], boxes[j]] = ok;
      }
    }
    const laid = list.map((item, k) => Object.assign({ label: item.label, left: boxes[k].left, top: boxes[k].top,
                                                      width: boxes[k].width, height: boxes[k].height }, leaderOf(item, boxes[k])));
    return all.map(item => (fitsIn(item) ? laid[list.indexOf(item)] : { label: item.label, hidden: true }));
  }

  // ── The page (Edison only) ──
  const SVG = 'http://www.w3.org/2000/svg';
  const AVOID = ['sim-results', 'mistakes-panel', 'scope', 'meter-display', 'lab-sheet', 'clear-all-btn', 'reset-cam-btn', 'inspector'];

  function boot(win) {
    const doc = win.document;
    if (!doc || doc.documentElement.dataset.ui !== 'edison') return;
    let overlay = null, svg = null, shown = [], hooked = false;
    const els = new Map();   // label → { block, line, dot, key }

    function make() {
      const wrap = doc.getElementById('canvas-wrap'), canvas = doc.getElementById('canvas');
      if (!wrap) return false;
      overlay = doc.createElement('div');
      overlay.id = 'result-callouts';
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');   // the same text is in #sim-results and the mistakes panel
      svg = doc.createElementNS(SVG, 'svg');
      svg.setAttribute('class', 'result-callouts-leaders');
      overlay.append(svg);
      // Right after the canvas, so every panel over the board stays on top.
      if (canvas && canvas.parentNode === wrap) canvas.after(overlay); else wrap.prepend(overlay);
      if (typeof ResizeObserver === 'function') new ResizeObserver(place).observe(wrap);
      return true;
    }

    // The orbit controls say 'change' whenever the camera moves.
    function hook() {
      const controls = win.App && win.App.controls;
      if (hooked || !controls || typeof controls.addEventListener !== 'function') return;
      controls.addEventListener('change', place);
      hooked = true;
    }

    function entry(label) {
      if (!els.has(label)) {
        const block = doc.createElement('div');
        block.className = 'result-callout';
        block.dataset.label = label;
        const line = doc.createElementNS(SVG, 'polyline');
        line.setAttribute('class', 'result-callout-leader');
        const dot = doc.createElementNS(SVG, 'circle');
        dot.setAttribute('class', 'result-callout-dot');
        dot.setAttribute('r', '3');
        dot.dataset.label = label;
        svg.append(line, dot);
        overlay.append(block);
        els.set(label, { block, line, dot, key: '' });
      }
      return els.get(label);
    }

    function fill(e, l) {
      const key = [l.level, l.title].concat(l.sub).join('\n');
      if (e.key === key) return;
      e.key = key;
      e.block.dataset.level = l.level;
      e.dot.dataset.level = l.level;
      const p = (cls, text) => { const x = doc.createElement('p'); x.className = cls; if (text) x.textContent = text; return x; };
      const title = p('result-callout-title');
      const led = doc.createElement('span');
      led.className = 'result-callout-led';
      const name = doc.createElement('span');
      name.className = 'result-callout-label';
      name.textContent = l.label;
      title.append(led, name, doc.createTextNode(' ' + l.title));
      e.block.replaceChildren(title, ...l.sub.map(s => p('result-callout-sub', s)));
    }

    function drop(label) {
      const e = els.get(label);
      e.block.remove(); e.line.remove(); e.dot.remove();
      els.delete(label);
    }

    function render(readings) {
      hook();
      if (!overlay && !make()) return;
      const comps = (win.App && win.App.state && win.App.state.components) || [];
      const lines = readings && typeof readings.lines === 'function' ? readings.lines() : [];
      shown = pick(lines.filter(l => comps.some(c => c.label === l.label && c.group)));
      const keep = new Set(shown.map(l => l.label));
      [...els.keys()].filter(label => !keep.has(label)).forEach(drop);
      shown.forEach(l => fill(entry(l.label), l));
      overlay.hidden = !shown.length;
      place();
    }

    function clear() {
      shown = [];
      [...els.keys()].forEach(drop);
      if (overlay) overlay.hidden = true;
    }

    // The part's anchor (its group's top centre) on the canvas, px from the
    // overlay's top left; null when it isn't on the canvas. #191 pinned an
    // off-canvas part's dot to the canvas edge instead, so zoomed in (or in a
    // framed lab, the instruments) its leader ran to the edge, at nothing:
    // now that callout hides (#201).
    function anchor(comp, cam, cr, or) {
      const THREE = win.THREE;
      const box = new THREE.Box3().setFromObject(comp.group);
      if (box.isEmpty()) return null;
      const world = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
      if (world.clone().applyMatrix4(cam.matrixWorldInverse).z >= 0) return null;   // behind the camera
      const p = world.clone().project(cam);
      const x = (p.x + 1) / 2 * cr.width, y = (1 - p.y) / 2 * cr.height;
      if (!(x >= 0 && y >= 0 && x <= cr.width && y <= cr.height)) return null;   // off the canvas (or NaN)
      return { x: cr.left - or.left + x, y: cr.top - or.top + y };
    }

    function place() {
      if (!overlay || overlay.hidden || !shown.length) return;
      const App = win.App;
      const canvas = App && App.renderer && App.renderer.domElement;
      if (!canvas || !App.camera || !win.THREE) return;
      App.camera.updateMatrixWorld();
      const or = overlay.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
      const items = [], gone = [];
      for (const l of shown) {
        const e = els.get(l.label);
        const comp = App.state.components.find(c => c.label === l.label);
        const at = comp && comp.group ? anchor(comp, App.camera, cr, or) : null;
        if (!at) { gone.push(e); continue; }
        e.block.hidden = false;
        items.push({ label: l.label, x: at.x, y: at.y, w: e.block.offsetWidth, h: e.block.offsetHeight, e });
      }
      const avoid = AVOID.map(id => doc.getElementById(id)).filter(Boolean).map(el => el.getBoundingClientRect())
        .map(r => ({ left: r.left - or.left, top: r.top - or.top, width: r.width, height: r.height }));
      const boxes = layoutCallouts(items, { width: or.width, height: or.height }, avoid);
      boxes.forEach((b, k) => {
        const { e, x, y } = items[k];
        if (b.hidden) { gone.push(e); return; }   // its block can't fit on the canvas
        e.block.style.left = b.left + 'px';
        e.block.style.top = b.top + 'px';
        e.block.dataset.side = b.side;
        e.line.setAttribute('points', b.leader.map(pt => pt.join(',')).join(' '));
        e.dot.setAttribute('cx', String(x));
        e.dot.setAttribute('cy', String(y));
        e.line.style.display = e.dot.style.display = '';
      });
      gone.forEach(e => { e.block.hidden = true; e.line.style.display = e.dot.style.display = 'none'; });
    }

    doc.addEventListener('plugged:sim', ev => render(ev.detail && ev.detail.readings));
    doc.addEventListener('plugged:sim-stop', clear);
    hook();
  }

  return { MAX, pick, layoutCallouts, boot };
});
