// ─────────────────────────────────────────────────────────────
//  edison/hud-status.js — the Lab HUD's canvas frame, script half
//  (issue #190, Lab HUD 2/4). With <html data-ui="edison"> it puts four
//  corner brackets and a "Breadboard" title block in #canvas-wrap; the
//  title's status line follows the sim, "T 3.11 S / ● CIRCUIT OPEN /
//  1 PROBLEM", or "STOPPED". Styled by circuit3d/css/edison-hud-canvas.css.
//  A Details +/− button after the line (and the line's problem count) opens
//  the Details drawer (#193): data-hud-details="open" on #canvas-wrap, with
//  #sim-results over #mistakes-panel in one column under the title block.
//  Closed, CSS hides both boxes; their text stays for the code that reads it.
//  Event-driven only (plugged:sim, plugged:sim-stop), never from
//  requestAnimationFrame: app.js draws a frame after every rAF callback, and
//  the 3D view must go quiet when nothing changes (render on demand, issue 109).
//  In classic none of this runs. The pure half, statusLine, loads in Node
//  for test/hud-status.test.js.
// ─────────────────────────────────────────────────────────────
(function (root, factory) {
  const Hud = factory();
  if (typeof module === 'object' && module.exports) module.exports = Hud;
  if (root) {
    root.EdisonHudStatus = Hud;
    if (root.document && root.document.documentElement.dataset.ui === 'edison') Hud.wire(root);
  }
})(typeof window !== 'undefined' ? window : null, function () {
  const SEP = ' / ';
  const DOT = '●';

  // { running, t, open, problems } → the status line. t is the sim clock in
  // seconds (a time run's plugged:sim detail.t) or null on a plain DC solve;
  // problems is the mistake checker's count, info rows left out.
  function statusLine(state) {
    const s = state || {};
    if (!s.running) return 'STOPPED';
    const out = [];
    if (typeof s.t === 'number' && Number.isFinite(s.t)) out.push(`T ${s.t.toFixed(2)} S`);
    out.push(`${DOT} CIRCUIT ${s.open ? 'OPEN' : 'OK'}`);
    const n = Number(s.problems) || 0;
    if (n > 0) out.push(`${n} PROBLEM${n === 1 ? '' : 'S'}`);
    return out.join(SEP);
  }

  // ── Page wiring (Edison only) ──────────────────────────────
  const CORNERS = ['tl', 'tr', 'bl', 'br'];

  function node(doc, tag, cls, text) {
    const e = doc.createElement(tag);
    e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // The line as spans, so its text stays statusLine's: the dot is a styled
  // square (pink when open), the open/ok words are lit, the slashes are grey.
  // The problem count is always the one node `count`: it opens the drawer,
  // and a click on it (mousedown and mouseup frames apart) is lost if the node
  // is swapped between them. Frame to frame a time run changes only the clock,
  // so a line shaped like the last (prev) just rewrites the clock's text.
  const CLOCK = /^T \S+ S/;
  const shapeOf = line => line.replace(CLOCK, 'T');

  function render(el, line, count, prev) {
    if (prev != null && shapeOf(prev) === shapeOf(line) && CLOCK.test(line) && el.firstChild) {
      el.firstChild.data = line.split(SEP)[0];
      return;
    }
    const doc = el.ownerDocument;
    const kids = [];
    line.split(SEP).forEach((seg, i) => {
      if (i) kids.push(node(doc, 'span', 'hud-status-sep', SEP));
      if (seg.startsWith(`${DOT} `)) {
        const open = /OPEN$/.test(seg);
        const dot = node(doc, 'span', open ? 'hud-status-dot hud-status-bad' : 'hud-status-dot', DOT);
        dot.setAttribute('aria-hidden', 'true');
        kids.push(dot, doc.createTextNode(' '), node(doc, 'span', 'hud-status-on', seg.slice(DOT.length + 1)));
      } else if (/^\d+ PROBLEMS?$/.test(seg)) {
        count.textContent = seg;
        kids.push(count);
      } else kids.push(doc.createTextNode(seg));
    });
    el.replaceChildren(...kids);
  }

  // The live state from one plugged:sim. The clock is detail.t (time runs
  // only), open is the solve's own "Circuit open" line (as #sim-results shows
  // it), and problems are the rows tools/mistakes.js just listed: its listener
  // was added first, so it has already run for this solve, and counting its
  // rows saves solving the problems a second time each frame.
  function stateOf(win, detail) {
    const d = detail || {};
    const result = d.result || {};
    const lines = Array.isArray(result.lines) ? result.lines : [];
    const App = win.App;
    return {
      // A first DC solve sends plugged:sim before App.simRunning is set.
      running: !!(App && App.simRunning) || result.status === 'ok',
      t: typeof d.t === 'number' ? d.t : null,
      open: lines.some(l => l && /Circuit open/.test(l.text)),
      problems: win.document.querySelectorAll('#mistakes-panel .mistake-row:not(.mistake-info)').length,
    };
  }

  function build(doc) {
    const wrap = doc.getElementById('canvas-wrap');
    if (!wrap || wrap.querySelector('.hud-title')) return null;
    const frame = CORNERS.map(k => {
      const b = node(doc, 'div', `hud-bracket hud-bracket-${k}`);
      b.setAttribute('aria-hidden', 'true');
      return b;
    });
    const title = node(doc, 'div', 'hud-title');
    const status = node(doc, 'p', 'hud-status');
    const details = node(doc, 'button', 'hud-details-btn');
    details.type = 'button';
    details.setAttribute('aria-controls', 'hud-details');
    title.append(node(doc, 'p', 'hud-title-name', 'Breadboard'), status, details);
    const drawer = node(doc, 'div', 'hud-drawer');
    drawer.id = 'hud-details';
    // Right after the 3D canvas, so every overlay added later paints above;
    // the drawer last, where the two boxes were.
    const canvas = doc.getElementById('canvas');
    if (canvas && canvas.parentNode === wrap) canvas.after(...frame, title);
    else wrap.append(...frame, title);
    wrap.append(drawer);
    return { wrap, status, details, drawer, count: node(doc, 'span', 'hud-status-count') };
  }

  // simulate.js and tools/mistakes.js make their boxes on the first solve, in
  // #canvas-wrap: move them into the drawer, results first. Ids, text and the
  // inline display their modules set stay theirs.
  function adopt(doc, drawer) {
    const results = doc.getElementById('sim-results');
    const panel = doc.getElementById('mistakes-panel');
    if (results && results.parentNode !== drawer) drawer.prepend(results);
    if (panel && panel.parentNode !== drawer) drawer.append(panel);
  }

  function wire(win) {
    const doc = win.document;
    const start = () => {
      const hud = build(doc);
      if (!hud) return;
      const { wrap, status, details, drawer, count } = hud;
      const setOpen = open => {
        if (open) { adopt(doc, drawer); wrap.dataset.hudDetails = 'open'; } else delete wrap.dataset.hudDetails;
        details.textContent = open ? 'Details −' : 'Details +';
        details.setAttribute('aria-expanded', String(open));
      };
      const toggle = () => setOpen(wrap.dataset.hudDetails !== 'open');
      details.addEventListener('click', toggle);
      count.addEventListener('click', toggle);
      setOpen(false);
      let shown = null;
      const show = line => { if (line !== shown) { render(status, line, count, shown); shown = line; } };
      show(statusLine({ running: false }));
      doc.addEventListener('plugged:sim', e => {
        try { adopt(doc, drawer); show(statusLine(stateOf(win, e.detail))); } catch { /* the HUD never costs the sim a frame */ }
      });
      doc.addEventListener('plugged:sim-stop', () => show(statusLine({ running: false })));
    };
    // Loaded last in <body>, after tools/mistakes.js has added its listener.
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
    else start();
  }

  return { statusLine, wire };
});
