// Direction 1 — "Lab HUD": DOM tweaks.
(async () => {
  const { $, $$, el } = MX;
  await MX.fonts('family=DM+Mono:wght@300;400;500');

  // ── Top bar: cells ──
  const tb = $('#topbar');
  const brand = $('.topbar-brand');
  brand.lastChild.textContent = 'EDISON';
  [...brand.childNodes].forEach(n => { if (n.nodeType === 3 && n !== brand.lastChild) n.textContent = ''; });
  const cell = (cls, html) => el('div', 'hud-cell ' + (cls || ''), html);
  const c1 = cell('', ''); c1.appendChild(brand);
  const nameF = $('#circuit-name-field'); nameF.textContent = 'Lab 2: inverting amplifier';
  const c2 = cell('', '<span class="hud-file-k">FILE</span>'); c2.appendChild(nameF);
  const run = cell('hud-run', '<span class="hud-led"></span>RUNNING <b>T 00:03.0</b>');
  const stop = $('#sim-stop-btn');
  const toggles = ['#colouring-toggle', '#flow-dots-toggle', '#scope-toggle'].map(s => $(s)).filter(Boolean);
  const tools = ['#thevenin-btn', '#csv-export-btn'].map(s => $(s)).filter(Boolean);
  tools.forEach(b => b.classList.add('hud-plus'));
  const labs = $('.labs-menu-wrap');
  const dl = [...$$('#topbar .btn-secondary')].find(b => /Download/.test(b.textContent));
  $('#labs-menu-btn').classList.add('hud-plus'); dl.classList.add('hud-plus');
  const spacer = () => el('div', 'hud-spacer');
  tb.innerHTML = '';
  tb.append(c1, c2, spacer(), run, stop, ...toggles, ...tools, spacer(), labs, dl);
  const strip = t => { const v = t.textContent.replace(/ (on|off)$/i, ''); if (v !== t.textContent) t.textContent = v; };
  toggles.forEach(t => { strip(t); new MutationObserver(() => strip(t)).observe(t, { childList: true, characterData: true, subtree: true }); });

  // ── Parts: counts on the group labels ──
  for (const g of $$('.comp-group')) {
    const l = g.querySelector('.comp-group-label');
    const n = g.querySelectorAll('.comp-item').length;
    l.innerHTML = `<span>${l.textContent}</span><i>${String(n).padStart(2, '0')}</i>`;
  }
  $('#part-search').placeholder = 'Search parts';

  // ── Canvas HUD ──
  const cw = $('#canvas-wrap');
  for (const k of ['tl', 'tr', 'bl', 'br']) el('div', 'hud-br ' + k, '', cw);
  el('div', 'hud-title', '<p class="n">BREADBOARD</p><p class="s">LAB 2<span class="sl">/</span>BUILD<span class="sl">/</span><span class="on">MEASURE</span><span class="sl">/</span>ANALYZE</p>', cw);
  $('#hint-text').textContent = 'Click a part or wire to select it. Del deletes.';
  $('#hint-box').classList.remove('hint-hidden');

  // ── Chat ──
  const panel = $('#sparky-panel');
  el('div', 'hud-chat-head', '<p>EDISON</p><p class="g">TUTOR / ENSC 220</p>', panel, panel.firstChild);
  const row = $('#sparky-input-row');
  const ask = el('div', 'hud-ask', '', row);
  ask.append($('#photo-wrap'), $('#sparky-input'));
  el('button', 'hud-send', 'ASK +', ask);
  $('#photo-btn').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></svg>';
  const pend = $('#sparky-pending-bar');
  el('div', 'hud-pend', '+1 WIRE', pend, pend.firstChild);
  $('.pending-decline').textContent = 'DECLINE';
  $('.pending-accept').textContent = 'ACCEPT';
  MX.chat(window.MX_CHAT);
  $('#sparky-input').placeholder = 'Ask about your circuit';
  // part labels in replies as outlined tags
  for (const m of $$('.chat-msg.ai')) m.innerHTML = m.innerHTML.replace(/\b(U1|R1|R2|PS1|FG1)\b(?![^<]*>)/g, '<span class="hud-tag">$1</span>');

  // ── Camera ──

  // ── Callouts pinned to parts, built from the run's own result and mistake lines ──
  const lines = $$('#sim-results .sim-line').map(e => e.textContent.trim());
  const clock = (lines.find(l => /^t\s*=/.test(l)) || 't = 3.5 s').replace(/^t\s*=\s*/, '');
  const open = lines.some(l => /Circuit open/.test(l));
  const ps = (lines.find(l => /^Bench supply/.test(l)) || '').replace(/^Bench supply 1:\s*/, '');
  const fg = (lines.find(l => /^Function generator/.test(l)) || '').replace(/^Function generator 1:\s*/, '');
  const mrow = $('#mistakes-panel .mistake-row');
  const mLab = mrow ? mrow.querySelector('.mistake-labels').textContent : 'U1';
  const mWhy = mrow ? mrow.querySelector('.mistake-why').textContent.replace(/^U1:\s*/, '') : '';
  $('#sim-results').style.setProperty('display', 'none', 'important');
  $('#mistakes-panel').style.setProperty('display', 'none', 'important');
  const caps = s => s.toUpperCase();
  const co = (cls, title, sub) => el('div', 'hud-co ' + cls, `<p class="t">${title}</p>${sub.map(x => `<p class="s">${x}</p>`).join('')}`, cw);
  const cU1 = co('bad', `<span class="hud-led bad"></span>${mLab} NO SUPPLY`, [mWhy.replace(/: wire/, '.<br>Wire').replace(/^the op-amp/, 'The op-amp')]);
  const cPS = co('', 'PS1 BENCH SUPPLY', [ps.replace(/ · /g, '<br>').replace('SERIES ±12V', 'Series ±12 V')]);
  const cFG = co('', 'FG1 FUNCTION GENERATOR', [fg.replace(/ · /g, '<br>').replace(/^sine/, 'Sine')]);
  // status in the title block
  $('.hud-title .s').innerHTML = `T ${caps(clock)}<span class="sl">/</span>${open ? '<span class="hud-led bad" style="margin-right:8px;vertical-align:1px"></span><span class="on">CIRCUIT OPEN</span>' : 'CLOSED'}<span class="sl">/</span>1 PROBLEM`;
  $('.hud-run b').textContent = 'T ' + clock.replace(' s', ' S');

  window.__mxAfter = () => {
    MX.fit([9, 23, 33], { l: 34, r: 40, t: 170, b: 230 });
    toggles.forEach(t => { t.textContent = t.textContent.replace(/ (on|off)$/i, ''); });
    $$('.ed-leader').forEach(e => e.remove());
    const wrap = cw.getBoundingClientRect();
    const layer = MX.svgLayer('hud-leaders');
    layer.innerHTML = '';
    function pin(box, anchor, side, dx, dy, run, col, dot) {
      if (!box || !anchor) return;
      const s = side === 'left' ? -1 : 1;
      const E = { x: anchor.x + s * dx, y: anchor.y + dy };
      const T = { x: E.x + s * run, y: E.y };
      MX.svg(layer, 'polyline', { points: `${anchor.x},${anchor.y} ${E.x},${E.y} ${T.x},${T.y}`, fill: 'none', stroke: col || '#8A8A8A', 'stroke-width': 1 });
      MX.svg(layer, 'circle', { cx: anchor.x, cy: anchor.y, r: 3, fill: dot || '#F4F4F4' });
      box.style.top = (T.y - wrap.top - 9) + 'px';
      if (s > 0) { box.style.left = (T.x - wrap.left + 10) + 'px'; box.style.textAlign = 'left'; }
      else { box.style.right = (wrap.right - T.x + 10) + 'px'; box.style.textAlign = 'right'; }
    }
    pin(cU1, MX.project('U1', 1.0), 'left', 40, -150, 30, '#8A8A8A', '#FF3D7F');
    pin(cPS, MX.project('PS1', 1.0), 'left', 30, -130, 30);
    pin(cFG, MX.project('FG1', 0.3), 'left', 70, 40, 50);
  };
  window.__mxCrops = [
    { name: 'detail', x: 232, y: 0, w: 868, h: 600 },
    { name: 'chat', x: 1100, y: 0, w: 340, h: 900 },
  ];
  window.__mxReady = true;
})();
