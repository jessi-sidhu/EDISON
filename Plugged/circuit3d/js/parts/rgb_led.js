// ─────────────────────────────────────────────────────────────
//  parts/rgb_led.js — the RGB LED (common cathode), a registry part
//  (issue #42). The rules are docs/API-CONTRACT.md → "Part file contract".
//
//  Four legs in a row (a footprint part, as the pot): red, cathode, green,
//  blue; the cathode is the long leg. Electrically three D elements, one
//  per die, each from its colour pin into the shared cathode, with the
//  LED's ron. The dome shows the mix: each lit die (on, at least 1 mA)
//  feeds only its own component of m.color, full at 15 mA or above.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build / view.update) runs only in the browser and draws
//  through ctx, or on the group view.build returned.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./rgb_led.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  const DIES      = ['red', 'green', 'blue'];
  const VF        = { red: 2.0, green: 3.2, blue: 3.2 };
  const RON       = 0.1;   // ohm, the LED's on-state series resistance
  const LIT_MA    = 1;     // the LED's threshold: under 1 mA a die is dark
  const FULL_MA   = 15;    // a die's colour is full (ff) at 15 mA or above
  const RATING_MA = 20;    // each die's rating

  const mA  = (r, d) => Math.max(0, Number(r.current && r.current[d]) || 0);
  const lit = (r, d) => !!(r.modes && r.modes[d] === 'on') && mA(r, d) >= LIT_MA;
  const hex2 = n => n.toString(16).padStart(2, '0');

  function measure(r) {
    const m = {};
    const parts = DIES.map(d => {
      m[d] = mA(r, d);
      return lit(r, d) ? Math.round(255 * Math.min(1, m[d] / FULL_MA)) : 0;
    });
    m.lit = DIES.filter(d => lit(r, d));
    m.color = '#' + parts.map(hex2).join('');
    return m;
  }

  function warnings(r, m) {
    return DIES.filter(d => m[d] > RATING_MA)
      .map(d => `RGB LED ${d} is over its ${RATING_MA} mA rating at ${m[d].toFixed(1)} mA. Use a bigger resistor on the ${d} pin.`);
  }

  const litList = m => (m.lit || []).map(d => `${d} ${m[d].toFixed(1)} mA`).join(', ');

  // A results line only while a die is lit: "💡 RGB LED ON: red 14.9 mA".
  function line(r, m) {
    return m.lit && m.lit.length ? { text: `  💡 RGB LED ON: ${litList(m)}`, cls: 'sim-on' } : null;
  }

  function report(r, m) {
    return m.lit && m.lit.length ? `RGB LED ON: ${litList(m)}` : 'RGB LED OFF (dark)';
  }

  // ── The model: four leads, a dark collar and a milky dome ──
  //  The dome is a mesh named 'rgb-dome'; the glow light is marked
  //  userData.rgbLight. update() colours both from m.color.
  const DARK_EMISSIVE = 0x333333, DARK_GLOW = 0.3, LIT_GLOW = 2.5;

  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const at = legs.map(l => ctx.holeWorld(l.col, l.row));
    const midX = (at[1].x + at[2].x) / 2;
    const midZ = (at[1].z + at[2].z) / 2;
    const LEAD_H = 0.88, COLLAR_R = 0.26;

    // Upright leads, the cathode a little taller, then stubs in to the collar
    at.forEach((p, i) => {
      const h = i === 1 ? LEAD_H + 0.02 : LEAD_H;
      group.add(ctx.lead(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, h, p.z), 0.023));
      const dx = p.x - midX, dz = p.z - midZ, d = Math.hypot(dx, dz);
      if (d > COLLAR_R + 0.01) {
        const k = COLLAR_R / d;
        group.add(ctx.lead(new THREE.Vector3(p.x, h, p.z), new THREE.Vector3(midX + dx * k, LEAD_H, midZ + dz * k), 0.018));
      }
    });

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(COLLAR_R, COLLAR_R, 0.11, 20), ctx.mat.body(0x2a2a2a));
    collar.position.set(midX, LEAD_H - 0.04, midZ);
    group.add(collar);

    // Dome: milky and dim until a die lights it
    const glass = ctx.mat.glass(0xf2f2f2, 0.88);
    glass.emissive.setHex(DARK_EMISSIVE);
    glass.emissiveIntensity = DARK_GLOW;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(COLLAR_R, 22, 11, 0, Math.PI * 2, 0, Math.PI * 0.55), glass);
    dome.name = 'rgb-dome';
    dome.position.set(midX, LEAD_H + 0.04, midZ);
    dome.castShadow = true;
    group.add(dome);

    const light = new THREE.PointLight(0xffffff, 8.0, 10);
    light.position.set(midX, 3.0, midZ);
    light.visible = false;
    light.userData.rgbLight = true;
    group.add(light);

    return { group, pinPositions: at.map(p => new THREE.Vector3(p.x, 0, p.z)) };
  }

  // Glow in m.color while a die is lit; dim otherwise (m is {} on Stop).
  function update(obj, m) {
    const group = obj && obj.group;
    if (!group) return;
    const on = !!(m && m.lit && m.lit.length && typeof m.color === 'string');
    group.traverse(o => {
      if (o.name === 'rgb-dome') {
        if (on) o.material.emissive.set(m.color);
        else o.material.emissive.setHex(DARK_EMISSIVE);
        o.material.emissiveIntensity = on ? LIT_GLOW : DARK_GLOW;
        o.material.opacity = on ? 1.0 : 0.88;
      }
      if (o.userData.rgbLight) {
        o.visible = on;
        if (on) o.color.set(m.color);
      }
    });
  }

  return {
    type:     'rgb_led',
    name:     'RGB LED',
    sub:      '4 leads · common cathode',
    category: 'Semiconductors',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 C7 5, 21 5, 21 17 Z" fill="currentColor" ' +
              'fill-opacity="0.15"/><path d="M7 17 C7 5, 21 5, 21 17"/><line x1="5" y1="17" x2="23" y2="17"/>' +
              '<line x1="8" y1="17" x2="8" y2="25"/><line x1="12" y1="17" x2="12" y2="27"/>' +
              '<line x1="16" y1="17" x2="16" y2="25"/><line x1="20" y1="17" x2="20" y2="25"/>' +
              '<circle cx="11" cy="12" r="1.3" fill="#ff3b3b" stroke="none"/>' +
              '<circle cx="14" cy="10" r="1.3" fill="#35d94a" stroke="none"/>' +
              '<circle cx="17" cy="12" r="1.3" fill="#3b82f6" stroke="none"/></svg>',
    prefix:   'RGB',
    pins:     ['red', 'cathode', 'green', 'blue'],
    place:    { kind: 'footprint', legs: [[0, 0], [1, 0], [2, 0], [3, 0]], rotations: [0, 180] },

    elements: () => DIES.map(d => ({ kind: 'D', id: d, pins: [d, 'cathode'], vf: VF[d], ron: RON })),
    measure,
    warnings,
    line,
    report,

    ai: {
      about:    'An RGB LED (common cathode): red, green and blue dies in one dome. Four legs in a row: red, cathode, ' +
                'green, blue. Light several dies to mix colours.',
      keywords: ['rgb led', 'rgb', 'color led', 'multicolor'],
      guide:    'Common cathode goes to ground. Each colour pin needs its own resistor (place_resistor). ' +
                'At hole c10, direction right: red=c10 cathode=c11 green=c12 blue=c13.',
      recipe: {
        name:  'Purple: red and blue each through their own 470 Ω from 9 V, green unused, the common cathode to ground',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'rgb_led', label: 'RGB1', holes: ['c10', 'c11', 'c12', 'c13'] },
                { type: 'resistor', label: 'R1', holes: ['b6', 'b10'], values: { resistance: 470 } },     // red
                { type: 'resistor', label: 'R2', holes: ['b13', 'b17'], values: { resistance: 470 } }],   // blue
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_6', 'a6'], ['tp_17', 'a17'], ['a11', 'tn_11']],
        expect: { RGB1: { red: [14.8, 15.0], green: [0, 0.01], blue: [12.25, 12.45] } },
      },
    },

    view: { build, update },

    examples: [
      {
        name:  '9 V → 470 Ω → the red pin, cathode to ground: red about 14.9 mA, green and blue 0',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'rgb_led', label: 'RGB1', holes: ['c30', 'c31', 'c32', 'c33'] },
                { type: 'resistor', label: 'R1', holes: ['b26', 'b30'], values: { resistance: 470 } }],
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_26', 'a26'], ['a31', 'tn_31']],
        expect: { RGB1: { red: [14.8, 15.0], green: [0, 0.01], blue: [0, 0.01] } },
      },
    ],
  };
});
