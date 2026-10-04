// ─────────────────────────────────────────────────────────────
//  parts/bench_supply.js — the bench power supply (issue #34).
//  The rules are docs/API-CONTRACT.md → "Part file contract" and
//  "Pattern: off-board multi-terminal source".
//
//  Off the board, four terminals: 'pos' (PS1.0), 'com' (PS1.1, the
//  ref: ground), 'neg' (PS1.2) and 'com2' (PS1.3, CH2 +, issue #124).
//  CH1 is pos / com, CH2 is com2 / neg. The mode control picks:
//    series (default): one set voltage both rails track, V(pos, com) and
//      V(com, neg), with com2 joined to com inside the supply;
//    independent: V(pos, com) = voltage and V(com2, neg) = voltage2, no
//      link; CH2's − (neg) is the ground of its circuit when that circuit
//      is separate from CH1's (the V element's own `ref`).
//  The current limits only warn; there is no constant-current mode.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build / view.update) runs only in the browser and draws
//  through ctx. The readout panel is an OffscreenCanvas texture.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./bench_supply.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  const W = 2.6, H = 1.2, D = 1.8;   // body; the pin positions below set where wires attach

  const LIGHT_ON = 1.4;              // a LIMIT light's glow when its channel is over

  // The readout panel on the front face, and its canvas (power-of-two
  // sizes, so r128 never has to resize an OffscreenCanvas).
  const PANEL_W = W * 0.66, PANEL_H = H * 0.6;
  const CANVAS_W = 512, CANVAS_H = 256;
  const STRETCH = (PANEL_W / PANEL_H) / (CANVAS_W / CANVAS_H);   // the canvas is drawn this much wider on the panel

  // The mode button, right of the panel, and its label's canvas.
  const BTN_W = 0.62, BTN_H = 0.3;
  const BTN_CANVAS_W = 256, BTN_CANVAS_H = 128;
  const BTN_STRETCH = (BTN_W / BTN_H) / (BTN_CANVAS_W / BTN_CANVAS_H);

  const independent = c => !!c && c.mode === 'independent';

  // Draws the text rows on a canvas plane, squeezed by 1/stretch so the
  // text reads at its own width. rows: [text, colour, baseline y].
  function drawRows(plane, rows, stretch, size, bg) {
    const c = plane && plane.userData.canvas;
    if (!c) return;
    const g = c.getContext('2d');
    const room = c.width * stretch - 40;   // usable width, in drawn units
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = bg;
    g.fillRect(0, 0, c.width, c.height);
    g.setTransform(1 / stretch, 0, 0, 1, 0, 0);
    g.font = `bold ${size}px monospace`;
    const widest = Math.max(...rows.map(([t]) => g.measureText(t).width));
    g.font = `bold ${Math.floor(size * Math.min(1, room / widest))}px monospace`;
    for (const [t, colour, y] of rows) {
      g.fillStyle = colour;
      g.fillText(t, 20, y);
    }
    plane.userData.texture.needsUpdate = true;
  }

  // ── The readout: each channel's volts and mA, redrawn in update() ──
  //  Series: the + and − rails; independent: CH1 and CH2.
  function drawPanel(panel, values, controls, m) {
    const mA = n => (Number.isFinite(n) ? n.toFixed(1) : '---') + ' mA';
    const v  = n => (Number(n) || 0).toFixed(1);
    const rows = independent(controls)
      ? [[`1 ${v(values.voltage)} V  ${mA(m.posAmps)}`,  '#ff5a5a', 108],
         [`2 ${v(values.voltage2)} V  ${mA(m.negAmps)}`, '#ffb347', 222]]
      : [[`+${v(values.voltage)} V  ${mA(m.posAmps)}`, '#ff5a5a', 108],
         [`−${v(values.voltage)} V  ${mA(m.negAmps)}`, '#5a8cff', 222]];
    drawRows(panel, rows, STRETCH, 84, '#10161c');
  }

  // The mode button's label and colour: SERIES (grey) or INDEP (amber).
  function drawButton(button, controls) {
    if (!button) return;
    const ind = independent(controls);
    button.material.color.setHex(ind ? 0xb7791f : 0x374151);
    drawRows(button.getObjectByName('mode-label'), [[ind ? 'INDEP' : 'SERIES', '#ffffff', 86]], BTN_STRETCH, 72,
             ind ? '#b7791f' : '#374151');
  }

  // A plane with a canvas texture (null where there is no OffscreenCanvas).
  function canvasPlane(ctx, w, h, cw, ch) {
    if (typeof OffscreenCanvas === 'undefined') return null;
    const THREE = ctx.THREE;
    const canvas = new OffscreenCanvas(cw, ch);
    const texture = new THREE.CanvasTexture(canvas);
    const screen = ctx.mat.label(0xffffff);   // a label material, so the ghost and selection treat it like the rest
    screen.map = texture;
    screen.emissiveMap = texture;
    screen.emissive.setHex(0xffffff);
    screen.emissiveIntensity = 0.6;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screen);
    plane.userData.canvas = canvas;
    plane.userData.texture = texture;
    return plane;
  }

  // ── The model: a grey case with a readout panel, two LIMIT lights and
  //  the mode button on its front face, and four terminal posts on the
  //  lid: CH1 + (red), CH1 − (black), CH2 + (red), CH2 − (black) ──
  function build(ctx, values, controls) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    const cylinder = (r, h, m) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), m);

    const body = box(W, H, D, ctx.mat.body(0x6b7280));
    body.position.y = H / 2;
    body.castShadow = true;
    group.add(body);

    // Readout panel on the front face (+z), facing the camera
    const panel = canvasPlane(ctx, PANEL_W, PANEL_H, CANVAS_W, CANVAS_H);
    if (panel) {
      panel.position.set(-W / 2 + 0.08 + PANEL_W / 2, H / 2, D / 2 + 0.01);
      panel.name = 'readout';
      group.add(panel);
      drawPanel(panel, values, controls, {});
    }

    // A LIMIT light per channel, top right of the front face: dark until
    // that channel (series: that rail) is over its limit
    const right = W / 2 - 0.08 - BTN_W / 2;   // the right column's centre
    for (const [name, dx] of [['limit-light', -0.16], ['limit-light-2', 0.16]]) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), ctx.mat.label(0x661111));
      light.material.emissive.setHex(0xff2222);
      light.material.emissiveIntensity = 0;
      light.position.set(right + dx, H * 0.74, D / 2 + 0.03);
      light.name = name;
      group.add(light);
    }

    // The mode button below them: a click flips SERIES / INDEP (the mode
    // control's click gesture, only on this mesh: userData.clickTarget)
    const button = box(BTN_W, BTN_H, 0.08, ctx.mat.label(0x374151));
    button.position.set(right, H * 0.32, D / 2 + 0.04);
    button.name = 'mode-button';
    button.userData.clickTarget = true;
    const label = canvasPlane(ctx, BTN_W * 0.9, BTN_H * 0.8, BTN_CANVAS_W, BTN_CANVAS_H);
    if (label) {
      label.position.z = 0.041;
      label.name = 'mode-label';
      button.add(label);
    }
    group.add(button);
    drawButton(button, controls);

    // Terminal posts, left to right CH1 +, CH1 −, CH2 +, CH2 −
    const post = { pos: [-0.9, 0xdd2222], com: [-0.45, 0x111111], com2: [0.45, 0xdd2222], neg: [0.9, 0x111111] };
    for (const [x, hex] of Object.values(post)) {
      const p = cylinder(0.12, 0.3, ctx.mat.label(hex));
      p.position.set(x, H + 0.15, D * 0.25);
      group.add(p);
    }

    return {
      group,
      pinPositions: ['pos', 'com', 'neg', 'com2'].map(k => new THREE.Vector3(post[k][0], H + 0.3, D * 0.25)),   // pin order
    };
  }

  // Readings after a run; {} (and r null) on Stop puts LIMIT out. With no
  // run, draws from the part's own values and controls (a mode flip).
  function update(obj, m, r) {
    const group = obj && obj.group;
    if (!group) return;
    m = m || {};
    for (const [name, over] of [['limit-light', !!m.posOver], ['limit-light-2', !!m.negOver]]) {
      const light = group.getObjectByName(name);
      if (!light) continue;
      if (over) light.material.emissive.setHex(0xff2222);
      light.material.emissiveIntensity = over ? LIGHT_ON : 0;
    }
    const values   = (r ? r.values : obj.values) || {};
    const controls = r ? r.controls : obj.controls;
    drawPanel(group.getObjectByName('readout'), values, controls, m);
    drawButton(group.getObjectByName('mode-button'), controls);
  }


  // Each rail's current in mA, as a positive magnitude. The + rail is CH1
  // and the − rail is CH2 (V 'neg'); independent, CH2 has its own limit2.
  function measure(r) {
    const posAmps = Math.abs(r.current.pos || 0);
    const negAmps = Math.abs(r.current.neg || 0);
    const cap  = r.values.limit * 1000;
    const cap2 = (independent(r.controls) ? r.values.limit2 : r.values.limit) * 1000;
    return { posAmps, negAmps, posOver: posAmps > cap, negOver: negAmps > cap2 };
  }

  const amps = mA => String(Number((mA / 1000).toPrecision(2)));
  const overLine = (what, mA, limit) =>
    `${what} would current-limit: the load wants ${amps(mA)} A, limit ${String(limit)} A`;

  function warnings(r, m) {
    const out = [];
    const ind = independent(r.controls);
    if (m.posOver) out.push(overLine(ind ? 'CH1' : '+ rail', m.posAmps, r.values.limit));
    if (m.negOver) out.push(overLine(ind ? 'CH2' : '− rail', m.negAmps, ind ? r.values.limit2 : r.values.limit));
    return out;
  }

  const volts    = n => Number(Number(n).toPrecision(4));
  const setVolts = r => volts(r.values.voltage);

  function headline(r, m) {
    const head = `Bench supply ${number(r.label)}: `;
    const mA = n => `${n.toFixed(1)} mA`;
    if (independent(r.controls)) {
      return { text: head + `INDEP · CH1 ${setVolts(r)}V · CH2 ${volts(r.values.voltage2)}V` +
                     (m.posAmps === undefined ? '' : ` · CH1 ${mA(m.posAmps)} · CH2 ${mA(m.negAmps)}`),
               cls: 'sim-info' };
    }
    return { text: head + `SERIES ±${setVolts(r)}V` +
                   (m.posAmps === undefined ? '' : ` · + ${mA(m.posAmps)} · − ${mA(m.negAmps)}`),
             cls: 'sim-info' };
  }

  // Series: both rails track voltage and com2 rides on com. Independent:
  // two channels; CH2 names neg as the ground of its own circuit.
  function elements(v, c) {
    if (independent(c)) {
      return [{ kind: 'V', id: 'pos', pins: ['pos', 'com'],  volts: v.voltage },
              { kind: 'V', id: 'neg', pins: ['com2', 'neg'], volts: v.voltage2, ref: 'neg' }];
    }
    return [{ kind: 'V',  id: 'pos',  pins: ['pos', 'com'],  volts: v.voltage },
            { kind: 'V',  id: 'neg',  pins: ['com', 'neg'],  volts: v.voltage },
            { kind: 'SW', id: 'link', pins: ['com', 'com2'], closed: true }];
  }
  const number = label => String(label || '').replace(/^\D+/, '');

  // What Readings.part reports, by pin name, not pin order: series V is
  // pos − neg; independent, V is CH1's and channels has both. P sums
  // each V element's V × its own current (W), null if one is missing.
  function reading(r) {
    const across = (a, b) => (typeof r.pins[a] === 'number' && typeof r.pins[b] === 'number' ? r.pins[a] - r.pins[b] : null);
    let P = 0;
    for (const el of elements(r.values, r.controls).filter(e => e.kind === 'V')) {
      const v = across(el.pins[0], el.pins[1]), i = r.current[el.id];
      P = P !== null && v !== null && typeof i === 'number' ? P + v * i / 1000 : null;
    }
    if (!independent(r.controls)) return { V: across('pos', 'neg'), P };
    return { V: across('pos', 'com'), P,
             channels: [{ name: 'CH1', V: across('pos', 'com') }, { name: 'CH2', V: across('com2', 'neg') }] };
  }

  return {
    type:     'bench_supply',
    name:     'Bench supply',
    sub:      '±0–30V · current limit',
    category: 'Sources',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="22" height="16" rx="2" ' +
              'fill="currentColor" fill-opacity="0.1"/><rect x="3" y="6" width="22" height="16" rx="2"/>' +
              '<rect x="6" y="9" width="11" height="5" rx="1"/><circle cx="21" cy="11.5" r="1.3"/>' +
              '<circle cx="8" cy="18" r="1.3"/><circle cx="14" cy="18" r="1.3"/><circle cx="20" cy="18" r="1.3"/></svg>',
    prefix:   'PS',
    pins:     ['pos', 'com', 'neg', 'com2'],
    ref:      'com',
    place:    { kind: 'offboard' },
    // Wires from the posts (#133): CH1 + red, CH1 − black, CH2 + white, CH2 − blue
    wireColors: { pos: 0xef4444, com: 0x000000, com2: 0xffffff, neg: 0x2563eb },
    values:   {
      voltage: { unit: 'V', default: 12,  min: 0,     max: 30 },
      limit:   { unit: 'A', default: 0.5, min: 0.001, max: 3 },
      // CH2, used only when independent; kept from the AI (#124), greyed
      // in the inspector in series (#127)
      voltage2: { unit: 'V', default: 12,  min: 0,     max: 30, ai: false, activeWhen: { mode: 'independent', note: 'tracks CH1' } },
      limit2:   { unit: 'A', default: 0.5, min: 0.001, max: 3,  ai: false, activeWhen: { mode: 'independent', note: 'tracks CH1' } },
    },
    controls: {
      mode: { type: 'choice', options: ['series', 'independent'], default: 'series', saved: true,
              ai: false, clickAnytime: true },
    },
    gestures: { click: 'mode' },   // only on the mode button (its userData.clickTarget)

    elements,
    measure,
    warnings,
    report:   (r, m) => (independent(r.controls)
      ? `independent supply, CH1 ${setVolts(r)} V ${m.posAmps.toFixed(1)} mA, CH2 ${volts(r.values.voltage2)} V ${m.negAmps.toFixed(1)} mA`
      : `±${setVolts(r)} V supply, + rail ${m.posAmps.toFixed(1)} mA, − rail ${m.negAmps.toFixed(1)} mA`),
    headline,
    reading,

    ai: {
      about:    'A bench power supply beside the board: + (PS1.0), COM (PS1.1) and − (PS1.2) terminals, ' +
                '12 V unless given a voltage, with a current limit.',
      keywords: ['bench supply', 'power supply', 'lab supply', 'dual supply', '±12', 'current limit'],
      guide:    'Wire PS1.0 (+) to tp_N (red) and PS1.1 (COM = ground) to tn_N (black). One rail: use only + and ' +
                'COM; leave PS1.2 unwired. For ± rails also wire PS1.2 (−) to bn_N; a − side LED has its anode ' +
                'toward COM (tn) and its cathode toward − (bn). Never wire two terminals straight together. ' +
                'The current limit only warns; it does not hold the current.',
      recipe:   {
        name:  '±12 V (both rails): an LED and 1 kΩ from + to COM, and another from COM to −, its anode toward COM',
        parts: [{ type: 'bench_supply', label: 'PS1', values: { voltage: 12 } },
                { type: 'resistor', label: 'R1', holes: ['b2', 'b6'], values: { resistance: 1000 } },
                { type: 'led', label: 'LED1', holes: ['c8', 'c6'] },        // cathode c8, anode c6 (toward +)
                { type: 'resistor', label: 'R2', holes: ['g10', 'g14'], values: { resistance: 1000 } },
                { type: 'led', label: 'LED2', holes: ['h16', 'h14'] }],     // cathode h16 (toward −), anode h14 (toward COM)
        wires: [['PS1.0', 'tp_63'], ['PS1.1', 'tn_63'], ['PS1.2', 'bn_63'],
                ['tp_3', 'a2'], ['a8', 'tn_8'],
                ['tn_10', 'f10'], ['j16', 'bn_16']],
        expect: { LED1: { on: true, current: [9.9, 10.1] },
                  LED2: { on: true, current: [9.9, 10.1] },
                  PS1:  { posAmps: [9.9, 10.1], negAmps: [9.9, 10.1], posOver: false, negOver: false } },
      },
    },

    view: { build, update },

    examples: [
      {
        name:  '+12 V across 1 kΩ supplies 12 mA',
        parts: [{ type: 'bench_supply', label: 'PS1' },
                { type: 'resistor', label: 'R1', holes: ['a10', 'a14'], values: { resistance: 1000 } }],
        wires: [['PS1.0', 'tp_50'], ['PS1.1', 'tn_50'], ['tp_9', 'b10'], ['b14', 'tn_15']],
        expect: { PS1: { posAmps: [11.95, 12.05], posOver: false, negOver: false } },
      },
      {
        name:  '+12 V across 100 Ω wants 120 mA, over a 0.05 A limit',
        parts: [{ type: 'bench_supply', label: 'PS1', values: { limit: 0.05 } },
                { type: 'resistor', label: 'R1', holes: ['a10', 'a14'], values: { resistance: 100 } }],
        wires: [['PS1.0', 'tp_50'], ['PS1.1', 'tn_50'], ['tp_9', 'b10'], ['b14', 'tn_15']],
        expect: { PS1: { posAmps: [119.9, 120.1], posOver: true } },
      },
    ],
  };
});
