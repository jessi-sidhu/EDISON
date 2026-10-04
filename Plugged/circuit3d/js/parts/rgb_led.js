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

  // ── The model: a 5 mm diffused LED, a milky dome on a flanged base, its
  //  four leads splayed out to their holes ──
  //  The dome is a mesh named 'rgb-dome'; the glow light is marked
  //  userData.rgbLight. update() colours both from m.color.
  const DARK_EMISSIVE = 0x333333, DARK_GLOW = 0.3, LIT_GLOW = 2.5;

  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const at = legs.map(l => ctx.holeWorld(l.col, l.row));
    const mid = at[1].clone().add(at[2]).multiplyScalar(0.5);
    const right = new THREE.Vector3().subVectors(at[3], at[0]).setY(0).normalize();   // red → blue
    const BASE = 0.26, DOME_R = 0.31, FLANGE_R = 0.36, FLANGE_H = 0.09, BARREL_H = 0.46;

    // The body is drawn with local +x from the red lead toward the blue.
    const body = new THREE.Group();
    body.position.set(mid.x, 0, mid.z);
    body.rotation.y = Math.atan2(-right.z, right.x);
    group.add(body);

    // Diffused epoxy: milky and dim until a die lights it (the flange shares it, so it glows too)
    const glass = ctx.mat.surface(0xd2d6dc, { opacity: 0.88, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
    glass.emissive.setHex(DARK_EMISSIVE);
    glass.emissiveIntensity = DARK_GLOW;

    // The flange, its flat on the red lead's side
    const a = Math.acos(0.8);
    const rim = new THREE.Shape();
    rim.absarc(0, 0, FLANGE_R, Math.PI + a, Math.PI * 3 - a, false);
    rim.closePath();
    const flangeGeo = new THREE.ExtrudeGeometry(rim, { depth: FLANGE_H, bevelEnabled: true, bevelThickness: 0.012,
                                                       bevelSize: 0.012, bevelSegments: 2, curveSegments: 28 });
    flangeGeo.rotateX(-Math.PI / 2);
    const flange = new THREE.Mesh(flangeGeo, glass);
    flange.position.y = BASE;
    flange.castShadow = true;
    body.add(flange);

    // The dome: a short barrel and a hemisphere
    const outline = [[DOME_R * 0.97, 0], [DOME_R, 0.015], [DOME_R, BARREL_H]];
    for (let i = 1; i <= 14; i++) {
      const t = (i / 14) * Math.PI / 2;
      outline.push([DOME_R * Math.cos(t), BARREL_H + DOME_R * Math.sin(t)]);
    }
    const dome = new THREE.Mesh(ctx.lathe(outline, 40), glass);
    dome.name = 'rgb-dome';
    dome.position.y = BASE + FLANGE_H;
    dome.castShadow = true;
    body.add(dome);

    // The lead frame inside: four posts up into the dome, the common cathode's the tallest
    const frameMat = ctx.mat.surface(0xe2e4e8, { metalness: 0.55, roughness: 0.3 });
    for (let i = 0; i < 4; i++) {
      const h = i === 1 ? 0.4 : 0.3;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, h, 0.025), frameMat);
      post.position.set((i - 1.5) * 0.12, BASE + FLANGE_H + h / 2, 0);
      body.add(post);
    }

    // Four leads out of the flange 1.27 mm apart, splayed out to their holes
    at.forEach((hole, i) => {
      const top = mid.clone().addScaledVector(right, (i - 1.5) * 0.12).setY(BASE + 0.02);
      const end = new THREE.Vector3(hole.x, -0.05, hole.z);
      const path = Math.hypot(top.x - end.x, top.z - end.z) < 0.02 ? [top, end]
        : [top, top.clone().setY(BASE * 0.62), new THREE.Vector3(hole.x, BASE * 0.3, hole.z), end];
      group.add(ctx.bentLead(path, 0.022, 0.05));
    });

    const light = new THREE.PointLight(0xffffff, 8.0, 10);
    light.position.set(mid.x, 3.0, mid.z);
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
