// ─────────────────────────────────────────────────────────────
//  tools/labs.js — the "ENSC 220 Labs" menu (issue #98)
//
//  #labs-menu-btn in the top bar opens (on a click, never a hover) a
//  list of lab starter circuits, one per lab sheet (labs/sheets.js), as
//  "Lab <n>: <title>". Picking one opens its lab sheet (as ?lab= does) and
//  fetches the sheet's starter .sparky
//  and loads it with App.loadCircuitData, the same path as opening a
//  file, so it is one undo step, then frames it from FRAME_DISTANCE back
//  so the board and the mat show around a lone starter part (#194). The
//  menu closes on a pick, an outside click or Esc.
//
//  On load, ?lab=<id> opens that lab; otherwise ?open=<path> (a path from
//  Plugged/, e.g. edison/figures/ohm.sparky) loads that circuit, but only
//  if UiFlag.allowedCircuit passes it. Anything else is never fetched.
//  With &run=1 too (the textbook's "Test in lab +"), the loaded circuit
//  starts simulating, as if Simulate were pressed.
//
//  EXPORTS
//  ───────
//  Browser: window.Labs (DOM wiring runs only when document exists)
//  Node:    module.exports
//
//  LABS        [{ id, title }], one per LabSheets id, in order
//  urlFor(id)  → the lab sheet's starter, relative to circuit3d/index.html
//                (null for an id with no sheet)
//  labFromSearch(search) → the ?lab= id in a location.search, or null
//  FRAME_DISTANCE  the closest the camera comes when a lab opens
//                (App.frameCircuit's minDistance; a saved circuit gets 6)
//  paperWidth(w, room) → the lab paper's width once a pull ends (Edison,
//                tools/lab-sheet.js): 0 (tucked) under PAPER_SNAP, else
//                w kept between PAPER_MIN and room − PAPER_MIN_BOARD, so
//                the board keeps its room. room: the px between the folded
//                parts rail and the chat, less the grip.
//  PAPER_WIDTH   the paper's width when it opens
//  frame()       frames a lab: FRAME_DISTANCE back, and in Edison (beside
//                the lab paper) the whole board and the bench instruments
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Labs = factory(node ? require('../../labs/sheets.js') : root && root.LabSheets);
  if (node) module.exports = Labs;
  if (root) root.Labs = Labs;
})(typeof window !== 'undefined' ? window : null, function (Sheets) {

  // "LAB-02" → "Lab 2: <title>".
  const LABS = (Sheets ? Sheets.ids() : []).map(id => {
    const s = Sheets.get(id);
    return { id, title: `Lab ${Number(s.code.slice(4))}: ${s.title}` };
  });

  const urlFor = id => {
    const s = Sheets && Sheets.get(id);
    return s ? s.starter : null;
  };

  const labFromSearch = search => new URLSearchParams(search || '').get('lab') || null;

  // Picked from 1440×900 screenshots of Lab 2 with the sheet and chat open
  // (a 608 px canvas): at 12, U1, all four supply rails and a strip of mat
  // beyond each long edge of the board; at 6, U1 filled the view.
  const FRAME_DISTANCE = 12;

  // The lab paper, from the approved mock (1440 × 900): it opens at 480, a
  // pull narrower than 200 tucks it, and the board always keeps 260.
  const PAPER_WIDTH = 480, PAPER_SNAP = 200, PAPER_MIN = 380, PAPER_MIN_BOARD = 260;
  function paperWidth(w, room) {
    if (!(w >= PAPER_SNAP)) return 0;
    const max = Math.max(PAPER_MIN, room - PAPER_MIN_BOARD);
    return Math.round(Math.min(Math.max(w, PAPER_MIN), max));
  }

  if (typeof document !== 'undefined') {
    wire();
    // Every script tag, app.js's boot included, has run by DOMContentLoaded.
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', openFromQuery);
    else openFromQuery();
  }

  // The sheet opens first, so the circuit is framed for the narrower canvas.
  function openFromQuery() {
    const id = labFromSearch(location.search);
    const q = new URLSearchParams(location.search);
    if (!id) { openPath(q.get('open'), q.get('run') === '1'); return; }
    const sheet = window.LabSheets ? LabSheets.get(id) : null;
    if (!sheet) { App.setHint(`There's no ${id}`, 4000); return; }
    if (window.LabSheet) LabSheet.open(id);
    load({ id, title: `${sheet.code}: ${sheet.title}` }, sheet.starter, FRAME_DISTANCE);
  }

  // ?open= (the textbook's "Open in the editor"): allow-listed like the viewer's ?circuit=.
  function openPath(path, run) {
    if (!path) return;
    if (!(window.UiFlag && UiFlag.allowedCircuit(path))) {
      App.setHint(`Can't open ${path}: only Edison figures and lab circuits can be opened this way.`, 5000);
      return;
    }
    load({ id: path, title: path }, `../${path}`).then(ok => { if (ok && run && !App.simRunning) App.runSimulation(); });
  }

  function wire() {
    const btn  = document.getElementById('labs-menu-btn');
    const menu = document.getElementById('labs-menu');
    if (!btn || !menu) return;

    for (const lab of LABS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'labs-menu-item';
      item.setAttribute('role', 'menuitem');
      item.textContent = lab.title;
      // A lab picked here opens with its sheet (the lab paper in Edison), as ?lab= does.
      item.addEventListener('click', () => { close(); if (window.LabSheet) LabSheet.open(lab.id); load(lab, urlFor(lab.id), FRAME_DISTANCE); });
      menu.appendChild(item);
    }

    const isOpen = () => !menu.hidden;
    function open()  { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
    function close() { menu.hidden = true;  btn.setAttribute('aria-expanded', 'false'); }

    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (isOpen()) close(); else open();
    });
    document.addEventListener('click', e => {
      if (isOpen() && !menu.contains(e.target) && !btn.contains(e.target)) close();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && isOpen()) close();
    });
  }

  // frameDistance: a lab's wider view; without it the circuit is framed as
  // any opened file is (App.loadCircuitData).
  async function load(lab, url = urlFor(lab.id), frameDistance) {
    let data;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (err) {
      App.setHint(`Couldn't load ${lab.title.split(':')[0]}: ${err.message}`, 4000);
      return false;
    }
    App.loadCircuitData(data);
    if (frameDistance) frame();
    return true;
  }

  // Browser only: App and the page exist.
  function frame() {
    const whole = typeof document !== 'undefined' && document.documentElement.dataset.ui === 'edison';
    App.frameCircuit({ minDistance: FRAME_DISTANCE, whole });
  }

  return { LABS, urlFor, labFromSearch, FRAME_DISTANCE, frame, PAPER_WIDTH, PAPER_MIN_BOARD, paperWidth };
});
