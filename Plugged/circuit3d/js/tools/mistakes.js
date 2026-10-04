// ─────────────────────────────────────────────────────────────
//  tools/mistakes.js — the mistake checker panel (issue #95).
//
//  On every plugged:sim it lists readings.problems() in #mistakes-panel,
//  just under the results panel (#sim-results): one .mistake-row per
//  problem (kind icon, labels, why), or "No problems found". Clicking a
//  row selects the first part it names, which outlines it on the board.
//  plugged:sim-stop hides the panel. Reads Readings only, never the solver.
//
//  LOADING
//  ───────
//  Browser: a <script> after readings.js. Does nothing in Node.
// ─────────────────────────────────────────────────────────────

(function () {
  if (typeof document === 'undefined') return;

  const ICONS = { short: '⚡', 'no-resistor': 'Ω', backwards: '⇄', open: '○', over: '🔥' };

  function panel() {
    let el = document.getElementById('mistakes-panel');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mistakes-panel';
      document.getElementById('canvas-wrap').appendChild(el);
    }
    return el;
  }

  // Select the first named part that is on the board.
  function pick(labels) {
    const comp = labels.map(l => App.state.components.find(c => c.label === l)).find(Boolean);
    if (comp) App.selectItem(comp, 'component');
  }

  function row(p) {
    const el = document.createElement('div');
    el.className = 'mistake-row';
    const icon = document.createElement('span');
    icon.className = 'mistake-icon';
    icon.textContent = ICONS[p.kind] || '!';
    const labels = document.createElement('span');
    labels.className = 'mistake-labels';
    labels.textContent = p.labels.join(', ');
    const why = document.createElement('div');
    why.className = 'mistake-why';
    why.textContent = p.why;
    el.append(icon, labels, why);
    el.addEventListener('click', () => pick(p.labels));
    return el;
  }

  function render(readings) {
    const list = readings && readings.problems ? readings.problems() : [];
    const el = panel();
    el.replaceChildren();
    if (!list.length) {
      const none = document.createElement('div');
      none.className = 'mistake-none';
      none.textContent = 'No problems found';
      el.append(none);
    } else {
      list.forEach(p => el.append(row(p)));
    }
    // Directly under the results panel, whose height changes with each solve.
    const results = document.getElementById('sim-results');
    const below = results && results.offsetParent ? results.offsetTop + results.offsetHeight + 8 : 50;
    el.style.top = below + 'px';
    el.style.display = 'block';
  }

  document.addEventListener('plugged:sim', e => render(e.detail && e.detail.readings));
  document.addEventListener('plugged:sim-stop', () => {
    const el = document.getElementById('mistakes-panel');
    if (el) el.style.display = 'none';
  });
})();
