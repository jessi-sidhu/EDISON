// ─────────────────────────────────────────────────────────────
//  tools/labs.js — the "ENSC 220 Labs" menu (issue #98)
//
//  #labs-menu-btn in the top bar opens (on a click, never a hover) a
//  list of lab starter circuits. Picking one fetches its .sparky from
//  circuit3d/labs/ and loads it with App.loadCircuitData, the same path
//  as opening a file, so it is one undo step. The menu closes on a pick,
//  an outside click or Esc.
//
//  EXPORTS
//  ───────
//  Browser: window.Labs (DOM wiring runs only when document exists)
//  Node:    module.exports
//
//  LABS        [{ id, title }]
//  urlFor(id)  → the lab's .sparky path, relative to circuit3d/index.html
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const Labs = factory();
  if (typeof module === 'object' && module.exports) module.exports = Labs;
  if (root) root.Labs = Labs;
})(typeof window !== 'undefined' ? window : null, function () {

  const LABS = [
    { id: 'lab1', title: 'Lab 1: Series-parallel resistors' },
  ];

  const urlFor = id => `labs/${id}.sparky`;

  if (typeof document !== 'undefined') wire();

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

  async function load(lab) {
    let data;
    try {
      const res = await fetch(urlFor(lab.id));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (err) {
      App.setHint(`Couldn't load ${lab.title.split(':')[0]}: ${err.message}`, 4000);
      return;
    }
    App.loadCircuitData(data);
  }

  return { LABS, urlFor };
});
