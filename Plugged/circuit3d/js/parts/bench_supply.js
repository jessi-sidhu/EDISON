// ─────────────────────────────────────────────────────────────
//  parts/bench_supply.js — the bench power supply (issue #34).
//  The rules are docs/API-CONTRACT.md → "Part file contract" and
//  "Pattern: off-board multi-terminal source".
//
//  Off the board, three terminals: 'pos' (PS1.0), 'com' (PS1.1, the
//  ref: ground) and 'neg' (PS1.2). One set voltage that both rails
//  track: V(pos, com) and V(com, neg). The current limit only warns;
//  there is no constant-current mode.
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

  const LIGHT_ON = 1.4;              // the LIMIT light's glow when a rail is over

  // ── The readout panel: per-rail volts and mA, redrawn in update() ──
  function drawPanel(panel, volts, m) {
    const c = panel && panel.userData.canvas;
    if (!c) return;
    const g = c.getContext('2d');
    const mA = n => (Number.isFinite(n) ? n.toFixed(1) : '---') + ' mA';
    g.fillStyle = '#10161c';
    g.fillRect(0, 0, c.width, c.height);
    g.font = 'bold 34px monospace';
    g.fillStyle = '#ff5a5a';
    g.fillText(`+${volts.toFixed(1)} V  ${mA(m.posAmps)}`, 12, 50);
    g.fillStyle = '#5a8cff';
    g.fillText(`−${volts.toFixed(1)} V  ${mA(m.negAmps)}`, 12, 106);
    panel.userData.texture.needsUpdate = true;
  }

  // ── The model: a grey case, a readout panel and a LIMIT light on top,
  //  three terminal posts (red +, black COM, blue −) along the front ──
  function build(ctx, values) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    const cylinder = (r, h, m) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), m);

    const body = box(W, H, D, ctx.mat.body(0x6b7280));
    body.position.y = H / 2;
    body.castShadow = true;
    group.add(body);

    // Readout panel on the back half of the top
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(256, 128);
      const texture = new THREE.CanvasTexture(canvas);
      const screen = ctx.mat.label(0xffffff);   // a label material, so the ghost and selection treat it like the rest
      screen.map = texture;
      screen.emissiveMap = texture;
      screen.emissive.setHex(0xffffff);
      screen.emissiveIntensity = 0.6;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.8, D * 0.4), screen);
      panel.rotation.x = -Math.PI / 2;
      panel.position.set(-0.15, H + 0.01, -D * 0.2);
      panel.name = 'readout';
      panel.userData.canvas = canvas;
      panel.userData.texture = texture;
      group.add(panel);
      drawPanel(panel, Number(values.voltage) || 0, {});
    }

    // LIMIT light beside the panel: dark until a rail is over its limit
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), ctx.mat.label(0x661111));
    light.material.emissive.setHex(0xff2222);
    light.material.emissiveIntensity = 0;
    light.position.set(W / 2 - 0.2, H + 0.05, -D * 0.2);
    light.name = 'limit-light';
    group.add(light);

    // Terminal posts: + (left), COM (middle), − (right)
    const posts = [[-0.7, 0xdd2222], [0, 0x111111], [0.7, 0x2255dd]];
    for (const [x, hex] of posts) {
      const post = cylinder(0.12, 0.3, ctx.mat.label(hex));
      post.position.set(x, H + 0.15, D * 0.25);
      group.add(post);
    }

    return {
      group,
      pinPositions: posts.map(([x]) => new THREE.Vector3(x, H + 0.3, D * 0.25)),   // pos, com, neg
    };
  }

  // Readings after a run; {} (and r null) on Stop puts LIMIT out.
  function update(obj, m, r) {
    const group = obj && obj.group;
    if (!group) return;
    const over = !!(m && (m.posOver || m.negOver));
    const light = group.getObjectByName('limit-light');
    if (light) {
      if (over) light.material.emissive.setHex(0xff2222);
      light.material.emissiveIntensity = over ? LIGHT_ON : 0;
    }
    const volts = r ? r.values.voltage : obj.values && obj.values.voltage;
    drawPanel(group.getObjectByName('readout'), Number(volts) || 0, m || {});
  }

  // Each rail's current in mA, as a positive magnitude.
  function measure(r) {
    const posAmps = Math.abs(r.current.pos || 0);
    const negAmps = Math.abs(r.current.neg || 0);
    const cap = r.values.limit * 1000;
    return { posAmps, negAmps, posOver: posAmps > cap, negOver: negAmps > cap };
  }

  const amps = mA => String(Number((mA / 1000).toPrecision(2)));
  const overLine = (sign, mA, limit) =>
    `${sign} rail would current-limit: the load wants ${amps(mA)} A, limit ${String(limit)} A`;

  function warnings(r, m) {
    const out = [];
    if (m.posOver) out.push(overLine('+', m.posAmps, r.values.limit));
    if (m.negOver) out.push(overLine('−', m.negAmps, r.values.limit));
    return out;
  }

  const setVolts = r => Number(Number(r.values.voltage).toPrecision(4));
  const number = label => String(label || '').replace(/^\D+/, '');

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
    pins:     ['pos', 'com', 'neg'],
    ref:      'com',
    place:    { kind: 'offboard' },
    values:   {
      voltage: { unit: 'V', default: 12,  min: 0,     max: 30 },
      limit:   { unit: 'A', default: 0.5, min: 0.001, max: 3 },
    },

    elements: v => [{ kind: 'V', id: 'pos', pins: ['pos', 'com'], volts: v.voltage },
                    { kind: 'V', id: 'neg', pins: ['com', 'neg'], volts: v.voltage }],
    measure,
    warnings,
    report:   (r, m) => `±${setVolts(r)} V supply, + rail ${m.posAmps.toFixed(1)} mA, − rail ${m.negAmps.toFixed(1)} mA`,
    headline: (r, m) => ({
      text: `Bench supply ${number(r.label)}: ±${setVolts(r)}V` +
            (m.posAmps === undefined ? '' : ` · + ${m.posAmps.toFixed(1)} mA · − ${m.negAmps.toFixed(1)} mA`),
      cls:  'sim-info',
    }),

    ai: {
      about:    'A bench power supply beside the board: + (PS1.0), COM (PS1.1) and − (PS1.2) terminals, ' +
                '12 V unless given a voltage, with a current limit.',
      keywords: ['bench supply', 'power supply', 'lab supply', 'dual supply', '±12', 'current limit'],
      guide:    'Wire PS1.0 (+) to a + rail (tp_N, red) and PS1.1 (COM = ground) to a ground rail (tn_N, black). ' +
                'For a − rail too, wire PS1.2 (−) to bn_N; parts between COM and − see −V. Never wire two ' +
                'terminals straight together. The current limit only warns; it does not hold the current.',
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
