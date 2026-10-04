// ─────────────────────────────────────────────────────────────
//  edison/ui-flag.js — which UI a page shows (contract
//  "Edison and the course hub"). Loaded first in <head>; never throws.
// ─────────────────────────────────────────────────────────────
(function (root, factory) {
  const UiFlag = factory();
  if (typeof module === 'object' && module.exports) module.exports = UiFlag;
  if (root) { root.UiFlag = UiFlag; UiFlag.boot(root); }
})(typeof window !== 'undefined' ? window : null, function () {
  const KEY = 'plugged.ui';
  const UIS = ['edison', 'classic'];

  function resolve(search, stored) {
    const q = new URLSearchParams(search || '').get('ui');
    if (UIS.includes(q)) return q;
    return UIS.includes(stored) ? stored : 'classic';
  }
  function apply(doc, ui) { doc.documentElement.dataset.ui = ui; }

  // Reading win.localStorage itself can throw (Chrome with site data blocked),
  // so the property access sits inside the try too.
  function read(win) { try { return win.localStorage.getItem(KEY); } catch { return null; } }
  // true when the choice was written; false with blocked storage (this load still shows ui).
  function save(win, ui) { try { win.localStorage.setItem(KEY, ui); return true; } catch { return false; } }

  // Saved: the next URL drops ?ui= and the stored value carries the choice.
  // Not saved: the next URL carries ui=<ui> (set, so exactly one) or the switch would do nothing.
  function switchTo(ui, win = window) {
    try {
      const saved = save(win, ui);
      const url = new URL(win.location.href);
      if (saved) url.searchParams.delete('ui');
      else url.searchParams.set('ui', ui);
      win.location.assign(url.toString());
    } catch { /* never throw from a UI toggle */ }
  }

  // Only .sparky files under edison/ or circuit3d/labs/, no traversal, no scheme.
  function allowedCircuit(p) {
    return typeof p === 'string' && /^(edison|circuit3d\/labs)\/[\w\-/]+\.sparky$/.test(p) && !p.includes('..');
  }

  // Inside an iframe (the landing page's hero viewer): the saved choice belongs
  // to the page around it. Reading win.top can throw cross-origin: count that as framed.
  function framed(win) { try { return win.top !== win; } catch { return true; } }

  // An Edison-only page declares <html data-ui="edison" data-ui-fixed>: leave it alone.
  function boot(win) {
    if (win.document.documentElement.dataset.uiFixed !== undefined) return;
    const inFrame = framed(win);   // a framed page takes its UI from ?ui= only, never the saved choice
    const ui = resolve(win.location.search, inFrame ? null : read(win));
    if (!inFrame && new URLSearchParams(win.location.search).get('ui') === ui) save(win, ui);
    apply(win.document, ui);
  }

  return { KEY, resolve, apply, switchTo, allowedCircuit, boot };
});
