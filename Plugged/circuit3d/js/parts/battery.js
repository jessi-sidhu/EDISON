// ─────────────────────────────────────────────────────────────
//  parts/battery.js — the 9 V battery, a registry part (issue #26).
//  The rules are docs/API-CONTRACT.md → "Part file contract".
//
//  Off the board. Pins in today's order: '0' = + (BAT1.0), '1' = −
//  (BAT1.1), and '1' is the ref: the earliest-placed source in each
//  connected circuit is that circuit's ground. One V element.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build) runs only in the browser and draws through ctx. An
//  off-board part is drawn around (0, 0, 0); the page moves the group
//  to where the record sits.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./battery.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  const W = 2.0, H = 2.6, D = 1.4;   // body; the pin positions below set where wires attach

  // ── The model: a black body, a red + post and a blue − ring on top ──
  //  Drawn in label materials, so its ghost stays fairly opaque.
  function build(ctx) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const glow = (hex, emissive, k) => {
      const m = ctx.mat.label(hex);
      m.emissive.setHex(emissive);
      m.emissiveIntensity = k;
      return m;
    };
    const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    const cylinder = (r, h, segs, m) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segs), m);
    const ring = (r, tube, radial, segs, m) => {
      const o = new THREE.Mesh(new THREE.TorusGeometry(r, tube, radial, segs), m);
      o.rotation.x = Math.PI / 2;
      return o;
    };

    // Body and snap connector platform
    const body = box(W, H, D, ctx.mat.label(0x111111));
    body.position.y = H / 2;
    body.castShadow = true;
    group.add(body);
    const snap = box(W * 0.65, 0.22, D * 0.55, ctx.mat.label(0x333333));
    snap.position.set(0, H + 0.11, 0);
    group.add(snap);

    // + terminal (left): red post, red disc, white "+", red halo
    const posCap = cylinder(0.13, 0.30, 14, glow(0xff3333, 0x880000, 0.5));
    posCap.position.set(-0.32, H + 0.37, 0);
    const posDisc = cylinder(0.19, 0.07, 16, glow(0xff1111, 0xaa0000, 0.6));
    posDisc.position.set(-0.32, H + 0.55, 0);
    const plusV = box(0.05, 0.025, 0.26, ctx.mat.label(0xffffff));
    const plusH = box(0.26, 0.025, 0.05, ctx.mat.label(0xffffff));
    plusV.position.set(-0.32, H + 0.60, 0);
    plusH.position.set(-0.32, H + 0.60, 0);
    const posHalo = ring(0.26, 0.04, 8, 20, glow(0xff2222, 0xcc0000, 0.9));
    posHalo.position.set(-0.32, H + 0.23, 0);
    group.add(posCap, posDisc, plusV, plusH, posHalo);

    // − terminal (right): blue base, blue ring, white "−", blue halo
    const negBase = cylinder(0.28, 0.10, 18, glow(0x2244cc, 0x001166, 0.4));
    negBase.position.set(0.32, H + 0.10, 0);
    const negRing = ring(0.24, 0.09, 9, 18, glow(0x3366ff, 0x001188, 0.5));
    negRing.position.set(0.32, H + 0.24, 0);
    const minus = box(0.28, 0.025, 0.07, ctx.mat.label(0xffffff));
    minus.position.set(0.32, H + 0.14, 0);
    const negHalo = ring(0.36, 0.04, 8, 20, glow(0x2255ff, 0x0033cc, 0.9));
    negHalo.position.set(0.32, H + 0.23, 0);
    group.add(negBase, negRing, minus, negHalo);

    // +/− on both long faces, so one shows from any camera angle
    for (const fz of [D / 2 + 0.013, -(D / 2 + 0.013)]) {
      const pV = box(0.09, 0.46, 0.02, glow(0xff2222, 0xaa0000, 0.7));
      const pH = box(0.46, 0.09, 0.02, glow(0xff2222, 0xaa0000, 0.7));
      pV.position.set(-0.36, H * 0.48, fz);
      pH.position.set(-0.36, H * 0.48, fz);
      const nH = box(0.46, 0.09, 0.02, glow(0x2255ff, 0x1133cc, 0.7));
      nH.position.set(0.36, H * 0.48, fz);
      group.add(pV, pH, nH);
    }

    return {
      group,
      pinPositions: [new THREE.Vector3(-0.32, H + 0.54, 0),    // '0', +
                     new THREE.Vector3(0.32, H + 0.24, 0)],    // '1', −
    };
  }

  // Amps through the one V element, in mA, as a positive magnitude.
  const supplying = r => Math.abs(Object.values(r.current)[0] || 0);
  const number = label => String(label || '').replace(/^\D+/, '');

  return {
    type:     'battery',
    name:     'Battery',
    sub:      '9V · snap connector',
    category: 'Sources',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="3" width="8" height="4" rx="1"/>' +
              '<rect x="5" y="7" width="18" height="17" rx="2" fill="currentColor" fill-opacity="0.1"/>' +
              '<rect x="5" y="7" width="18" height="17" rx="2"/>' +
              '<line x1="9" y1="14" x2="12" y2="14" stroke-width="1.5"/>' +
              '<line x1="10.5" y1="12.5" x2="10.5" y2="15.5" stroke-width="1.5"/>' +
              '<line x1="16" y1="14" x2="19" y2="14" stroke-width="1.5"/></svg>',
    prefix:   'BAT',
    pins:     ['0', '1'],
    ref:      '1',
    place:    { kind: 'offboard' },
    values:   { voltage: { unit: 'V', default: 9, min: 1, max: 24 } },

    elements: v => [{ kind: 'V', pins: ['0', '1'], volts: v.voltage }],
    measure:  r => ({ current: supplying(r) }),
    report:   (r, m) => `${Number(r.values.voltage).toFixed(2)} V battery, supplying ${m.current.toFixed(1)} mA`,
    headline: r => ({ text: `Battery ${number(r.label)}: ${r.values.voltage}V`, cls: 'sim-info' }),

    ai: {
      about:    'A battery beside the board, 9 V unless given a voltage. Wire BAT1.0 (+) to a + rail and ' +
                'BAT1.1 (−) to a − rail.',
      keywords: ['battery', 'power', 'supply', 'volts', 'voltage', 'source'],
    },

    view: { build },

    examples: [
      {
        name:  'A 9 V battery across 470 Ω supplies 19.1 mA',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['a10', 'a14'] }],
        wires: [['BAT1.0', 'tp_10'], ['BAT1.1', 'tn_14'], ['tp_9', 'b10'], ['b14', 'tn_15']],
        expect: { BAT1: { current: [19.1, 19.2] } },
      },
      {
        name:  'A 6 V battery across 1 kΩ supplies 6.0 mA',
        parts: [{ type: 'battery', label: 'BAT1', values: { voltage: 6 } },
                { type: 'resistor', label: 'R1', holes: ['a20', 'a24'], values: { resistance: 1000 } }],
        wires: [['BAT1.0', 'tp_20'], ['BAT1.1', 'tn_24'], ['tp_19', 'b20'], ['b24', 'tn_25']],
        expect: { BAT1: { current: [5.95, 6.05] } },
      },
    ],
  };
});
