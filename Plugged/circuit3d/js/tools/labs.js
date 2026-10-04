// ─────────────────────────────────────────────────────────────
//  tools/labs.js — the "ENSC 220 Labs" menu (issue #98)
//
//  #labs-menu-btn in the top bar opens (on a click, never a hover) a
//  list of lab starter circuits, one per lab sheet (labs/sheets.js), as
//  "Lab <n>: <title>". Picking one fetches the sheet's starter .sparky
//  and loads it with App.loadCircuitData, the same path as opening a
//  file, so it is one undo step. The menu closes on a pick, an outside
//  click or Esc.
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
    load({ id, title: `${sheet.code}: ${sheet.title}` }, sheet.starter);
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
      item.addEventListener('click', () => { close(); load(lab); });
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

  async function load(lab, url = urlFor(lab.id)) {
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
    return true;
  }

  return { LABS, urlFor, labFromSearch };
});
