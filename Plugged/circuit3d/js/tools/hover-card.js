// ─────────────────────────────────────────────────────────────
//  tools/hover-card.js — the hover card (issue #91)
//
//  While simulating, #hover-card follows the pointer: over a hole it
//  shows readings.voltage(hole), over a part readings.part(label) as
//  V · mA · mW (W from 1 W), magnitudes, plus "over its ¼ W rating" when
//  the part is over. It listens on the canvas with its own raycaster and
//  never stops or cancels the event, so interaction.js sees it all.
//
//  EXPORTS
//  ───────
//  Browser: window.HoverCard (DOM wiring runs only when document exists)
//  Node:    module.exports
//
//  formatPower(W)          '9.5 mW' below 10 mW, '104 mW' to under 1 W, '1.72 W'
//  cardLines(label, part)  [label, 'V · mA · P', 'over its … rating'?], or null
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

  const FRACTIONS = { 0.25: '¼', 0.5: '½' };
  const ratingText = r => (r.W !== undefined ? (FRACTIONS[r.W] || r.W) + ' W' : r.mA + ' mA');

  function cardLines(label, part) {
    if (!part) return null;
    const bits = [];
    if (part.V !== null) bits.push(fixed(Math.abs(part.V), 1) + ' V');
    if (part.I !== null) bits.push(fixed(Math.abs(part.I), 1) + ' mA');
    if (part.P !== null) bits.push(formatPower(part.P));
    const lines = [label, bits.join(' · ')];
    if (part.over && part.rating) lines.push('over its ' + ratingText(part.rating) + ' rating');
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

  return { formatPower, cardLines, holeLines };
});
