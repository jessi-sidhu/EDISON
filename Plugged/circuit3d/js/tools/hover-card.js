// ─────────────────────────────────────────────────────────────
//  tools/hover-card.js — the hover card (issue #91)
//
//  While simulating, #hover-card follows the pointer: over a hole it
//  shows readings.voltage(hole), over a part readings.part(label) as
//  V · mA · mW (W from 1 W), magnitudes, plus a capacitor's stored energy,
//  plus "over its ¼ W rating" when the part is over. It listens on the canvas with its own raycaster and
//  never stops or cancels the event, so interaction.js sees it all.
//
//  EXPORTS
//  ───────
//  Browser: window.HoverCard (DOM wiring runs only when document exists)
//  Node:    module.exports
//
//  formatPower(W)          '9.5 mW' below 10 mW, '104 mW' to under 1 W, '1.72 W'
//  formatEnergy(µJ)        '850 µJ', '12.5 mJ' from 1 mJ, '1.24 J' from 1 J
//  cardLines(label, part)  [label, 'V · mA · P', 'over its … rating'?], or null;
//                          an op-amp (part.opamps): [label, one line per op-amp];
//                          part.channels: [label, 'CH1 5.0 V · CH2 9.0 V', '106 mW total'?]
//  holeLines(hole, volts)  [hole, '9.0 V'] signed, or [hole, 'floating']
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const HoverCard = factory();
  if (typeof module === 'object' && module.exports) module.exports = HoverCard;
  if (root) root.HoverCard = HoverCard;
})(typeof window !== 'undefined' ? window : null, function () {

  const fixed = (n, d) => (Math.abs(n) < 0.5 * Math.pow(10, -d) ? 0 : n).toFixed(d);

  function formatPower(W) {
    const a = Math.abs(W);
    if (a >= 1) return a.toFixed(2) + ' W';
    const mW = a * 1000;
    return mW.toFixed(mW >= 10 ? 0 : 1) + ' mW';
  }

  function formatEnergy(uJ) {
    const a = Math.abs(uJ);
    if (a >= 1e6) return (a / 1e6).toFixed(2) + ' J';
    if (a >= 1e3) return (a / 1e3).toFixed(1) + ' mJ';
    return a.toFixed(a >= 10 ? 0 : 1) + ' µJ';
  }

  const FRACTIONS = { 0.25: '¼', 0.5: '½' };
  const ratingText = r => (r.W !== undefined ? (FRACTIONS[r.W] || r.W) + ' W'
                         : r.mA !== undefined ? r.mA + ' mA' : r.V + ' V');

  // One op-amp's line: its signed Vout and current, or why it's pinned. An
  // open half with its supply wired (floating) was opened for a floating input.
  const signed = (v, d) => (Number(fixed(v, d)) < 0 ? '−' : Number(fixed(v, d)) > 0 ? '+' : '') + fixed(Math.abs(v), d) + ' V';
  function opampLine(o, k) {
    const head = `op-amp ${k + 1}: `;
    if (o.mode === 'open') return head + (o.floating ? 'inputs not connected (output open)' : 'no supply (output open)');
    if (o.unused) return head + 'unused';
    if (o.mode === 'isrc+' || o.mode === 'isrc−') {
      return head + `current-limited at ${o.ilim} mA` + (o.vout !== null ? ` (${signed(o.vout, 1)})` : '');
    }
    if (o.vout === null) return head + 'floating';
    if (o.mode === 'high' || o.mode === 'low') return head + `clipped at ${signed(o.vout, 1)} (the rail)`;
    const I = typeof o.iout === 'number' ? ` · ${o.iout < 0 ? 'sinks' : 'sources'} ${fixed(Math.abs(o.iout), 2)} mA` : '';
    return head + signed(o.vout, 1) + I;
  }

  function cardLines(label, part) {
    if (!part) return null;
    if (Array.isArray(part.opamps) && part.opamps.length) return [label].concat(part.opamps.map(opampLine));
    // A part with channels (an independent bench supply): each channel's
    // |V|, then its total power, since one I would be only CH1's.
    if (Array.isArray(part.channels)) {
      const volts = ch => (typeof ch.V === 'number' ? fixed(Math.abs(ch.V), 1) + ' V' : 'floating');
      const lines = [label, part.channels.map(ch => `${ch.name} ${volts(ch)}`).join(' · ')];
      if (part.P !== null) lines.push(formatPower(part.P) + ' total');
      return lines;
    }
    const bits = [];
    if (part.V !== null) bits.push(fixed(Math.abs(part.V), 1) + ' V');
    if (part.I !== null) bits.push(fixed(Math.abs(part.I), 1) + ' mA');
    if (part.P !== null) bits.push(formatPower(part.P));
    if (typeof part.energy === 'number') bits.push(formatEnergy(part.energy) + ' stored');
    const lines = [label, bits.join(' · ')];
    // A rated-volts part (a capacitor) under its rating is over for being reversed.
    const reversed = part.rating && part.rating.V !== undefined && !(Math.abs(part.V) > part.rating.V);
    if (part.over && part.rating) lines.push(reversed ? 'in backwards' : 'over its ' + ratingText(part.rating) + ' rating');
    return lines;
  }

  const holeLines = (hole, volts) => [hole, typeof volts === 'number' ? fixed(volts, 1) + ' V' : 'floating'];

  if (typeof document !== 'undefined') wire();

  function wire() {
    const canvas = document.getElementById('canvas');
    const card = document.createElement('div');
    card.id = 'hover-card';
    card.hidden = true;
    document.body.appendChild(card);

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let readings = null;   // from the last plugged:sim, until Stop
    let at = null;         // last pointer position, { x, y }

    const hide = () => { card.hidden = true; };

    // lines[0] the title, then values; the rating line is the warning.
    function show(lines, warn) {
      card.replaceChildren();
      lines.forEach((text, k) => {
        const div = document.createElement('div');
        div.className = k === 0 ? 'hc-title' : warn && k === lines.length - 1 ? 'hc-warn' : 'hc-line';
        div.textContent = text;
        card.appendChild(div);
      });
      card.style.left = (at.x + 14) + 'px';
      card.style.top  = (at.y + 14) + 'px';
      card.hidden = false;
    }

    // The placed part whose model holds obj, as interaction.js's ownerOf.
    function ownerOf(obj) {
      for (let o = obj; o; o = o.parent) {
        const comp = App.state.components.find(c => c.group && c.group === o);
        if (comp) return comp;
      }
      return null;
    }

    function update() {
      if (!readings || !App.simRunning || !at) return hide();
      const r = canvas.getBoundingClientRect();
      ndc.x =  ((at.x - r.left) / r.width)  * 2 - 1;
      ndc.y = -((at.y - r.top)  / r.height) * 2 + 1;
      raycaster.setFromCamera(ndc, App.camera);

      const bb = App.state.breadboard;
      const targets = [bb.holesMesh];
      App.state.components.forEach(c => { if (c.group) c.group.traverse(o => { if (o.isMesh) targets.push(o); }); });
      const hit = raycaster.intersectObjects(targets, false)[0];
      if (!hit) return hide();

      if (hit.object === bb.holesMesh) {
        const h = bb.holeData[hit.instanceId];
        if (!h) return hide();
        const name = App.holeName(h);
        return show(holeLines(name, readings.voltage(name)), false);
      }

      const comp = ownerOf(hit.object);
      const part = comp && comp.label != null ? readings.part(comp.label) : null;
      const lines = cardLines(comp && comp.label, part);
      if (!lines) return hide();
      show(lines, part.over && part.rating);
    }

    canvas.addEventListener('pointermove', e => { at = { x: e.clientX, y: e.clientY }; update(); }, { passive: true });
    canvas.addEventListener('pointerleave', () => { at = null; hide(); }, { passive: true });

    document.addEventListener('plugged:sim', e => {
      readings = (e.detail && e.detail.readings) || null;
      if (!card.hidden) update();
    });
    document.addEventListener('plugged:sim-stop', () => { readings = null; hide(); });
  }

  return { formatPower, formatEnergy, cardLines, holeLines };
});
