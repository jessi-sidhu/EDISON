// ─────────────────────────────────────────────────────────────
//  edison/hero-callouts.js — the landing hero's leader-line callouts
//  (issue #168, ref docs/design/landing-v3/04 and the storyboard 06).
//
//  A small dot on the part, a thin line out at an angle, then a horizontal
//  run to a caps label with a grey subline. The labels sit in fixed columns
//  at the stage's left and right; only the dots and lines follow the turning
//  board, read from the hero frame's Hero.anchors() (0 … 1 of the frame).
//
//  The pure half (Node can load it): CALLOUTS, calloutsFor, leaderPath,
//  labelAt. The page half, attach(), draws them in one SVG over the frame
//  from the landing's own requestAnimationFrame loop, which runs only while
//  the stage is on screen and the tab is visible.
//
//  Browser: window.HeroCallouts.  Node: module.exports.
// ─────────────────────────────────────────────────────────────
(function (root, factory) {
  const HeroCallouts = factory();
  if (typeof module === 'object' && module.exports) module.exports = HeroCallouts;
  if (root) root.HeroCallouts = HeroCallouts;
})(typeof window !== 'undefined' ? window : null, function () {

  const CIRCUIT = ['sketch', 'solid', 'lit', 'done'];

  // slot: the label's row in its column (0 at the top), in the order their
  // parts sit on screen so the leaders don't cross (the battery stands above
  // the LED). Callouts that share a slot never show together. primary: the
  // one kept under 720 px.
  const CALLOUTS = [
    { id: 'holes',  anchor: 'holes',  label: 'HOLE GRID',          sub: 'Rows of five, connected',         side: 'left',  slot: 1, stages: ['idle'] },
    { id: 'rails',  anchor: 'rail',   label: 'POWER RAILS',        sub: '9 V and ground, along the board', side: 'right', slot: 1, stages: ['idle'], primary: true },
    { id: 'led',    anchor: 'LED1',   label: 'LED1',               sub: 'Lights when current flows',       side: 'right', slot: 1, stages: CIRCUIT, primary: true },
    { id: 'r1',     anchor: 'R1',     label: 'R1 470 Ω',           sub: 'Limits the current',              side: 'left',  slot: 0, stages: CIRCUIT },
    { id: 'path',   anchor: 'path',   label: 'CIRCUIT PATH',       sub: 'Connects rows and columns',       side: 'left',  slot: 1, stages: CIRCUIT },
    { id: 'casing', anchor: 'casing', label: 'TRANSPARENT CASING', sub: 'Reveals the circuit',             side: 'left',  slot: 2, stages: CIRCUIT },
    { id: 'bat',    anchor: 'BAT1',   label: 'BAT1 9 V',           sub: 'Powers the circuit',              side: 'right', slot: 0, stages: ['solid', 'lit', 'done'] },
  ];

  // The ones to show now: in this stage, with their anchor in view.
  function calloutsFor(stage, anchors, opts) {
    if (!stage || !anchors) return [];
    const narrow = !!(opts && opts.narrow);
    return CALLOUTS.filter(c => c.stages.includes(stage) && (!narrow || c.primary)
      && anchors[c.anchor] && anchors[c.anchor].visible);
  }

  // Dot → a diagonal to the label's height (45° where there is room, never
  // past 80 % of the way across) → a horizontal run to the label.
  function leaderPath(a, l, side) {
    const dx = l.x - a.x, dy = Math.abs(l.y - a.y);
    const ex = a.x + Math.sign(dx) * Math.min(Math.max(dy, 1), 0.8 * Math.abs(dx));
    const n = v => String(Math.round(v * 100) / 100);
    return 'M' + n(a.x) + ' ' + n(a.y) + ' L' + n(ex) + ' ' + n(l.y) + ' L' + n(l.x) + ' ' + n(l.y);
  }

  // The columns and rows, px in a stage of size { width, height }. The left
  // column fills upwards from above the course link; the right one sits in
  // the strip above the board, clear of the SCHEMATIC VIEW inset below.
  const GAP = 10;          // the leader's end to the text
  const ROW = 54;          // a caps line and a subline, and room between
  const NARROW = 720;      // under it, one callout under the HUD title
  const CHAR = 12 * 0.72;  // a 12 px DM Mono caps letter with 0.12em tracking
  const SUB_CHAR = 11 * 0.64;   // an 11 px subline letter with 0.04em tracking
  const RIGHT_TEXT = Math.max(...CALLOUTS.filter(c => c.side === 'right').map(c => Math.max(c.label.length * CHAR, c.sub.length * SUB_CHAR)));

  // Where the leader meets the label ({ x, y }), and where its text is
  // anchored (tx, align). Depends only on the callout and the stage size.
  function labelAt(c, size) {
    const w = size.width, h = size.height;
    if (w < NARROW) {
      const tx = w - 16;
      return { x: Math.round(tx - c.label.length * CHAR - GAP), y: 104, tx, align: 'end' };
    }
    if (c.side === 'left') {
      const x = Math.round(Math.max(0.24 * w, 200));
      const base = w > 1000 ? 106 : 160;   // 721–1000 px: the end button sits above the course link
      return { x, y: Math.round(h - base - (2 - c.slot) * ROW), tx: x - GAP, align: 'end' };
    }
    const x = Math.round(Math.min(0.7 * w, w - 16 - GAP - RIGHT_TEXT));   // the widest right label stays inside
    return { x, y: 30 + c.slot * 52, tx: x + GAP, align: 'start' };
  }

  // ── The page ────────────────────────────────────────────────

  const SVG = 'http://www.w3.org/2000/svg';

  // One SVG over the frame, in .ed-stage; the loop reads the frame's
  // Hero.anchors() each animation frame while the stage is on screen.
  function attach(win, stage, frame) {
    const doc = win.document;
    const svg = doc.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'ed-callouts');
    svg.setAttribute('aria-hidden', 'true');
    const make = (tag, cls, parent) => { const e = doc.createElementNS(SVG, tag); if (cls) e.setAttribute('class', cls); parent.appendChild(e); return e; };
    const parts = CALLOUTS.map(c => {
      const g = make('g', 'ed-callout', svg);
      g.setAttribute('data-callout', c.id);
      const under = make('path', 'ed-callout-under', g);   // a black underlay, so the line reads on the white board
      const line = make('path', 'ed-callout-line', g);
      const dot = make('circle', 'ed-callout-dot', g);
      dot.setAttribute('r', '2.5');
      const title = make('text', 'ed-callout-label', g);
      title.textContent = c.label;
      const sub = make('text', 'ed-callout-sub', g);
      sub.textContent = c.sub;
      return { c, g, under, line, dot, title, sub, on: false, at: null };
    });
    const host = doc.getElementById('hero-stage');
    stage.insertBefore(svg, host ? host.nextSibling : stage.firstChild);

    // The labels: placed once per stage size, so the text never moves.
    let laid = '';
    function layout(w, h) {
      const key = w + 'x' + h;
      if (key === laid) return;
      laid = key;
      for (const p of parts) {
        p.at = labelAt(p.c, { width: w, height: h });
        for (const [el, dy] of [[p.title, 4], [p.sub, 20]]) {
          el.setAttribute('x', p.at.tx);
          el.setAttribute('y', p.at.y + dy);
          el.setAttribute('text-anchor', p.at.align);
        }
      }
    }

    // The frame's box in the SVG's px, and the labels' places: read once per
    // resize, so a frame of the loop forces no layout.
    let box = null;
    function measure() {
      const sv = svg.getBoundingClientRect(), fr = frame.getBoundingClientRect();
      box = { left: fr.left - sv.left, top: fr.top - sv.top, width: fr.width, height: fr.height, stageWidth: sv.width };
      layout(Math.round(sv.width), Math.round(sv.height));
    }
    if (win.ResizeObserver) new win.ResizeObserver(() => { box = null; }).observe(stage);

    function tick() {
      raf = 0;
      if (!running()) return;
      let anchors = null;
      try { const H = frame.contentWindow.Hero; anchors = H && typeof H.anchors === 'function' ? H.anchors() : null; } catch { /* not ready */ }
      if (!box) measure();
      const f = box;
      const show = new Set(calloutsFor(stage.dataset.hero, anchors, { narrow: f.stageWidth < NARROW }));
      for (const p of parts) {
        const a = anchors && anchors[p.c.anchor];
        if (a && Number.isFinite(a.x) && Number.isFinite(a.y)) {
          const dot = { x: f.left + a.x * f.width, y: f.top + a.y * f.height };
          p.dot.setAttribute('cx', dot.x.toFixed(1));
          p.dot.setAttribute('cy', dot.y.toFixed(1));
          const d = leaderPath(dot, p.at, p.c.side);
          p.under.setAttribute('d', d);
          p.line.setAttribute('d', d);
        }
        const on = show.has(p.c);
        if (on !== p.on) { p.on = on; p.g.classList.toggle('is-on', on); }
      }
      raf = win.requestAnimationFrame(tick);
    }

    // The loop: only while the stage is on screen and the tab is visible.
    let raf = 0, onScreen = false;
    const running = () => onScreen && doc.visibilityState !== 'hidden';
    const wake = () => { if (running() && !raf) raf = win.requestAnimationFrame(tick); };
    if (win.IntersectionObserver) {
      new win.IntersectionObserver(entries => {
        onScreen = entries[entries.length - 1].isIntersecting;
        if (!onScreen && raf) { win.cancelAnimationFrame(raf); raf = 0; }
        wake();
      }).observe(stage);
    } else { onScreen = true; wake(); }
    doc.addEventListener('visibilitychange', wake);
  }

  return { CALLOUTS, calloutsFor, leaderPath, labelAt, attach };
});
