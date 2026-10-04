// ─────────────────────────────────────────────────────────────
//  parts/bulb.js — a small incandescent bulb, a registry part (issue #36).
//  The rules are docs/API-CONTRACT.md → "Part file contract".
//
//  Electrically it is the resistor: one R between its two pins, with no
//  polarity. What it adds is a glow that follows the power it takes:
//  brightness = min(1, P / (ratedV² / R)), so it is full at its rating,
//  a quarter as bright at half the voltage, and past 1.5 × its rated
//  power it warns that it would burn out.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build / view.update) runs only in the browser and draws
//  through ctx, or on the group view.build returned.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./bulb.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  const BURN_OUT = 1.5;   // × rated power: past this it would burn out

  // The one current through the part, in mA, from pin 1 to pin 2.
  const through = r => Number(Object.values(r.current || {})[0]) || 0;
  const ratedPower = v => (v.ratedVoltage * v.ratedVoltage) / v.resistance;

  // power in W (I² R); brightness 0–1 against the rated power.
  function measure(r) {
    const amps  = through(r) / 1000;
    const power = amps * amps * r.values.resistance;
    const rated = ratedPower(r.values);
    const brightness = rated > 0 ? Math.min(1, power / rated) : 0;
    return { power, brightness };
  }

  function warnings(r, m) {
    const rated = ratedPower(r.values);
    if (!(m.power > BURN_OUT * rated)) return [];
    return [`Bulb is at ${m.power.toFixed(2)} W, over ${BURN_OUT} × its ${rated.toFixed(2)} W rating: it would burn out. ` +
            `Lower the voltage to ${r.values.ratedVoltage} V.`];
  }

  const pct = m => Math.round(m.brightness * 100);

  function line(r, m) {
    if (!(m.brightness > 0.005)) return null;
    return { text: `  💡 BULB ${pct(m)}% bright (${m.power.toFixed(2)} W)`, cls: 'sim-on' };
  }

  const report = (r, m) =>
    `${r.values.ratedVoltage} V bulb ${pct(m)}% bright, ${m.power.toFixed(2)} W`;

  // ── The model: a miniature bulb. A ridged nickel base standing on two
  //  pins, a clear pear-shaped glass envelope, and the coiled filament on
  //  its two support wires inside. The glass is marked userData.bulbGlass,
  //  the filament userData.bulbFilament and the glow light
  //  userData.bulbLight, for update(). ──
  const GLASS = 0xfff1c9, GLOW = 0xffa726;   // pale glass, warm orange-yellow glow
  const DARK_GLOW = 0.05, FULL_GLOW = 0.9, FULL_LIGHT = 1.5;
  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const A = ctx.holeWorld(legs[0].col, legs[0].row);
    const B = ctx.holeWorld(legs[1].col, legs[1].row);
    const ax = A.x, az = A.z, bx = B.x, bz = B.z;
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const along = new THREE.Vector3(bx - ax, 0, bz - az).normalize();
    const FOOT = 0.32, BASE_R = 0.14, BASE_H = 0.26;

    // The base: nickel, with crimp rings
    const nickel = ctx.mat.surface(0xbfc2c6, { metalness: 0.85, roughness: 0.35 });
    const base = new THREE.Mesh(ctx.lathe([[BASE_R * 0.7, 0], [BASE_R, 0.03], [BASE_R, BASE_H - 0.02], [BASE_R * 0.92, BASE_H]], 32), nickel);
    base.position.set(mid.x, FOOT, mid.z);
    base.castShadow = true;
    group.add(base);
    for (const y of [0.08, 0.14]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(BASE_R, 0.012, 6, 32), nickel);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(mid.x, FOOT + y, mid.z);
      group.add(ring);
    }

    // The glass: a clear pear shape, see-through and dark until update() lights it
    const outline = [[BASE_R * 0.9, 0], [BASE_R * 0.95, 0.05], [0.16, 0.12], [0.24, 0.24], [0.27, 0.36], [0.26, 0.46],
                     [0.21, 0.56], [0.12, 0.62], [0, 0.64]];
    const glass = ctx.mat.surface(GLASS, { opacity: 0.5, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03,
                                           envMapIntensity: 1.2, depthWrite: false });
    glass.emissive.setHex(GLOW);
    glass.emissiveIntensity = DARK_GLOW;
    const bulb = new THREE.Mesh(ctx.lathe(outline, 40), glass);
    bulb.position.set(mid.x, FOOT + BASE_H, mid.z);
    bulb.castShadow = true;
    bulb.userData.bulbGlass = true;
    group.add(bulb);

    // Inside: two support wires up from the base and the coiled filament across them
    const y0 = FOOT + BASE_H, span = 0.11;
    for (const s of [-1, 1]) {
      group.add(ctx.bentLead([mid.clone().addScaledVector(along, s * 0.05).setY(y0),
                              mid.clone().addScaledVector(along, s * span).setY(y0 + 0.34)], 0.008, 0.02));
    }
    const coil = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120, a = t * Math.PI * 2 * 9;
      coil.push(mid.clone().addScaledVector(along, -span + 2 * span * t).add(new THREE.Vector3(0, y0 + 0.34 + 0.018 * Math.sin(a), 0))
                   .addScaledVector(new THREE.Vector3(-along.z, 0, along.x), 0.018 * Math.cos(a)));
    }
    const filament = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 240, 0.005, 5, false),
                                    ctx.mat.surface(0x4a3a2a, { roughness: 0.6 }));
    filament.material.emissive.setHex(0xffb347);
    filament.material.emissiveIntensity = 0;
    filament.userData.bulbFilament = true;
    group.add(filament);

    // Two pins out of the base, splayed to the holes
    const legPath = (hole, sign) => {
      const top = mid.clone().addScaledVector(along, sign * 0.07).setY(FOOT + 0.02);
      const end = new THREE.Vector3(hole.x, -0.05, hole.z);
      if (Math.hypot(top.x - end.x, top.z - end.z) < 0.02) return [top, end];
      return [top, top.clone().setY(FOOT * 0.6), new THREE.Vector3(hole.x, FOOT * 0.25, hole.z), end];
    };
    group.add(ctx.bentLead(legPath(A, -1), 0.026, 0.05));
    group.add(ctx.bentLead(legPath(B, 1), 0.026, 0.05));

    // The glow light, off until update() lights the bulb
    const light = new THREE.PointLight(GLOW, 0, 6);
    light.position.set(mid.x, 3.0, mid.z);
    light.visible = false;
    light.userData.bulbLight = true;
    group.add(light);

    return { group, pinPositions: [new THREE.Vector3(ax, 0, az), new THREE.Vector3(bx, 0, bz)] };
  }

  // Glow follows brightness; m is {} on Stop, which is dark.
  function update(obj, m) {
    const group = obj && obj.group;
    if (!group) return;
    const b = Math.max(0, Math.min(1, Number(m && m.brightness) || 0));
    group.traverse(o => {
      if (o.userData.bulbGlass) {
        o.material.emissiveIntensity = DARK_GLOW + (FULL_GLOW - DARK_GLOW) * b;
        o.material.opacity = b > 0 ? 0.5 + 0.4 * b : 0.5;
      }
      if (o.userData.bulbFilament) o.material.emissiveIntensity = 2.5 * b;
      if (o.userData.bulbLight) {
        o.visible = b > 0;
        o.intensity = FULL_LIGHT * b;
      }
    });
  }

  return {
    type:     'bulb',
    name:     'Light bulb',
    sub:      '2 leads · 6 V incandescent',
    category: 'I/O',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="11" r="7" fill="currentColor" ' +
              'fill-opacity="0.15"/><circle cx="14" cy="11" r="7"/><path d="M11 12 L12.5 9.5 L14 12 L15.5 9.5 L17 12"/>' +
              '<rect x="11" y="18" width="6" height="4" rx="1"/><line x1="12" y1="22" x2="12" y2="26"/>' +
              '<line x1="16" y1="22" x2="16" y2="26"/></svg>',
    prefix:   'LP',
    pins:     ['1', '2'],
    place:    { kind: 'span', span: { min: 2, max: 4, default: 3 }, rotations: ['h', 'v'] },
    values:   {
      resistance:   { unit: 'Ω', default: 60, min: 5, max: 1000 },
      ratedVoltage: { unit: 'V', default: 6, min: 1.5, max: 24 },
    },

    elements: v => [{ kind: 'R', pins: ['1', '2'], ohms: v.resistance }],
    measure,
    warnings,
    line,
    report,

    ai: {
      about:    'A small incandescent light bulb (60 Ω, rated 6 V): two leads on one row, 2–4 columns apart. ' +
                'Glows brighter with more power; no polarity.',
      keywords: ['bulb', 'lamp', 'light bulb', 'incandescent'],
      guide:    'For a bulb use place_bulb, not an LED. It has no polarity: either way round, and needs no resistor. ' +
                "Match the battery voltage to the bulb's rating (place_battery voltage 6 for a 6 V bulb); " +
                'more than its rated voltage burns it out.',
      recipe:   {
        name:  'A 6 V battery straight across the 6 V bulb: it lights at full brightness (100 mA, 0.6 W)',
        parts: [{ type: 'battery', label: 'BAT1', values: { voltage: 6 } },
                { type: 'bulb', label: 'LP1', holes: ['b2', 'b5'] }],
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_2', 'a2'], ['a5', 'tn_5']],
        expect: { LP1: { brightness: [0.99, 1.0], power: [0.59, 0.61] },
                  BAT1: { current: [99.5, 100.5] } },
      },
    },

    view: { build, update },

    examples: [
      {
        name:  '6 V straight across the 60 Ω / 6 V bulb: 100 mA, 0.6 W, full brightness',
        parts: [{ type: 'battery', label: 'BAT1', values: { voltage: 6 } },
                { type: 'bulb', label: 'LP1', holes: ['b2', 'b5'] }],
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_2', 'a2'], ['a5', 'tn_5']],
        expect: { LP1: { brightness: [0.99, 1.0], power: [0.59, 0.61] }, BAT1: { current: [99.5, 100.5] } },
      },
      {
        name:  'At 3 V the same bulb takes 0.15 W: a quarter as bright',
        parts: [{ type: 'battery', label: 'BAT1', values: { voltage: 3 } },
                { type: 'bulb', label: 'LP1', holes: ['b2', 'b5'] }],
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_2', 'a2'], ['a5', 'tn_5']],
        expect: { LP1: { brightness: [0.24, 0.26], power: [0.14, 0.16] }, BAT1: { current: [49.5, 50.5] } },
      },
    ],
  };
});
