// ─────────────────────────────────────────────────────────────
//  edison/skin.js — the editor's Edison skin, script half (spec §4
//  "Edison's annotations", §5.4). With <html data-ui="edison"> it wraps
//  the measured values in Edison's replies (B612 on --mask), draws a
//  dashed leader from a reply to the first part it names, names the chat
//  Edison, and sends a ?ask= request once. chat.js doesn't change; in
//  classic none of this runs. The pure half loads in Node for
//  test/edison-skin.test.js.
// ─────────────────────────────────────────────────────────────
(function (root, factory) {
  const Skin = factory();
  if (typeof module === 'object' && module.exports) module.exports = Skin;
  if (root) {
    root.EdisonSkin = Skin;
    if (root.document && root.document.documentElement.dataset.ui === 'edison') Skin.wire(root);
  }
})(typeof window !== 'undefined' ? window : null, function () {
  const NAME_LINE = 'Edison: electrical design and interactive simulation of networks.';

  // A value starts a word (so "U1 V+" and "&#39;" hold none): an optional
  // sign (+, -, U+2212 or ±), a number, an optional SI prefix and a unit.
  const VALUE = /(?<![\w.#&])([\u2212\u00B1+-]?\d+(?:\.\d+)?[ \u00A0]?[pn\u00B5\u03BCumkM]?(?:Vpp|V|A|\u03A9|\u2126|W|Hz|F|s))(?!\w)/g;

  // html is chat.js's reply markup: only the text between tags changes.
  function highlightValues(html) {
    return String(html).split(/(<[^>]+>)/).map(part => (part.startsWith('<') ? part
      : part.replace(VALUE, '<span class="ed-num ed-val">$1</span>'))).join('');
  }

  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const word = l => new RegExp(`(?<!\\w)${escapeRe(l)}(?!\\w)`);

  // The labels named in text as whole words ("D1" is not in "LED1").
  function labelsIn(text, labels) {
    return labels.filter(l => typeof l === 'string' && l && word(l).test(text));
  }

  // The label named first in text, or null.
  function firstNamed(text, labels) {
    let best = null, at = Infinity;
    for (const l of labelsIn(text, labels)) {
      const i = text.search(word(l));
      if (i < at) { at = i; best = l; }
    }
    return best;
  }

  // ── The leader: one at a time, kept on its part and its reply ──
  // Re-placed on a timer and when the camera moves, never from
  // requestAnimationFrame: app.js draws a frame after every rAF callback, and
  // the 3D view must go quiet when nothing changes (render on demand, issue 109).
  const FOLLOW_MS = 100;
  let track = null;   // { msg, label, el, timer, off }

  function clearLeader(win) {
    if (track) { win.clearInterval(track.timer); track.off(); }
    track = null;
    for (const l of win.document.querySelectorAll('.ed-leader')) l.remove();
  }

  // Places t's line from the reply to its part; false once either is gone.
  function place(win, t) {
    const App = win.App;
    const comp = t.msg.isConnected && App.state.components.find(c => c.label === t.label);
    if (!comp || !comp.group) return false;
    App.camera.updateMatrixWorld();   // the camera may have moved since the last frame
    // Aim above the box centre: legs sit in the board, the body is up top.
    const box = new win.THREE.Box3().setFromObject(comp.group);
    const p = box.getCenter(new win.THREE.Vector3()).setY(box.min.y + 0.7 * (box.max.y - box.min.y)).project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    const to = { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
    const m = t.msg.getBoundingClientRect();
    const log = t.msg.parentElement.getBoundingClientRect();
    const from = { x: m.left + 3, y: Math.min(m.top + 14, m.bottom - 3) };
    const shown = p.z < 1 && to.x >= r.left && to.x <= r.right && to.y >= r.top && to.y <= r.bottom
      && from.y >= log.top && from.y <= log.bottom;
    const dx = to.x - from.x, dy = to.y - from.y;
    const s = t.el.style;
    s.visibility = shown ? '' : 'hidden';
    s.left = `${from.x}px`;
    s.top = `${from.y}px`;
    s.width = `${Math.hypot(dx, dy)}px`;
    s.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    return true;
  }

  function annotate(win, msg) {
    clearLeader(win);
    const App = win.App;
    if (!App || !App.state || !App.camera || !App.renderer || !win.THREE) return;
    const label = firstNamed(msg.textContent, (App.state.components || []).map(c => c.label));
    if (!label) return;
    const el = win.document.createElement('div');
    el.className = 'ed-leader';
    el.setAttribute('aria-hidden', 'true');
    win.document.body.appendChild(el);
    const t = track = { msg, label, el, timer: 0, off: () => {} };
    const follow = () => {   // runs inside controls.update(): never let a throw cost the frame
      try { if (track === t && !place(win, t)) clearLeader(win); } catch { clearLeader(win); }
    };
    // OrbitControls fires 'change' as it moves the camera (orbit, zoom,
    // damping), so the leader keeps up; the timer covers the rest (a scroll,
    // a resize, a part moved).
    const controls = App.controls;
    if (controls && typeof controls.addEventListener === 'function') {
      controls.addEventListener('change', follow);
      t.off = () => controls.removeEventListener('change', follow);
    }
    t.timer = win.setInterval(follow, FOLLOW_MS);
    follow();
  }

  // ── Page wiring (Edison only) ──────────────────────────────
  function rename(doc) {
    const title = doc.querySelector('.sparky-welcome-title');
    if (title) { title.textContent = 'Edison'; title.title = NAME_LINE; }
    const input = doc.getElementById('sparky-input');
    if (input) { input.placeholder = 'Ask Edison about your circuit'; input.title = NAME_LINE; }
    // The suggestion chips lose their emoji; their onclick stays.
    for (const b of doc.querySelectorAll('.sparky-suggest-btn')) b.textContent = b.textContent.replace(/^[^\p{L}\p{N}]+/u, '');
    const brand = doc.querySelector('.topbar-brand');
    const name = brand && [...brand.childNodes].reverse().find(n => n.nodeType === 3 && n.textContent.trim());
    if (name) name.textContent = ' Plugged ';
  }

  // ?ask=<text> (the landing page's prompt): sent once, then dropped from the URL.
  function askFromUrl(win) {
    const ask = (new URLSearchParams(win.location.search).get('ask') || '').trim();
    const input = win.document.getElementById('sparky-input');
    if (!ask || !input || typeof win.sparkyAsk !== 'function') return;
    try {
      const url = new URL(win.location.href);
      url.searchParams.delete('ask');
      win.history.replaceState(win.history.state, '', url.toString());
    } catch { /* a reload may ask again; this load still asks once */ }
    input.value = ask;
    win.sparkyAsk();
  }

  function wire(win) {
    const doc = win.document;
    const start = () => {
      rename(doc);
      const log = doc.getElementById('sparky-messages');
      if (log) new win.MutationObserver(muts => {
        for (const m of muts) for (const n of m.addedNodes) {
          if (n.nodeType !== 1 || !n.classList.contains('chat-msg') || !n.classList.contains('ai')) continue;
          n.innerHTML = highlightValues(n.innerHTML);
          annotate(win, n);
        }
      }).observe(log, { childList: true });
      askFromUrl(win);
    };
    // Loaded last in <body>, so this runs after chat.js's own DOMContentLoaded wiring.
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
    else start();
  }

  return { NAME_LINE, highlightValues, labelsIn, firstNamed, wire };
});
