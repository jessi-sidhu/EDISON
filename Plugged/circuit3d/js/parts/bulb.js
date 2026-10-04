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

  // ── The model: two leads, stubs to a metal base, a round glass bulb ──
  //  The glass is marked userData.bulbGlass and the glow light
  //  userData.bulbLight, for update().
  const GLASS = 0xfff1c9, GLOW = 0xffa726;   // pale glass, warm orange-yellow glow
  const DARK_GLOW = 0.05, FULL_GLOW = 0.9, FULL_LIGHT = 1.5;
  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const A = ctx.holeWorld(legs[0].col, legs[0].row);
    const B = ctx.holeWorld(legs[1].col, legs[1].row);
    const ax = A.x, az = A.z, bx = B.x, bz = B.z;
    const midX = (ax + bx) / 2;
    const midZ = (az + bz) / 2;

    const isHoriz = Math.abs(az - bz) < 0.01;
    const LEAD_H  = 0.5;
    const BASE_R  = 0.13;
    const BASE_H  = 0.22;
    const GLASS_R = 0.3;

    // Upright leads from the holes to base height
    for (const p of [A, B]) group.add(ctx.lead(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, LEAD_H, p.z)));

    // Stubs from the lead tops to the base
    const stub = (from, to) => { if (from.distanceTo(to) > 0.01) group.add(ctx.lead(from, to)); };
    if (isHoriz) {
      stub(new THREE.Vector3(ax, LEAD_H, midZ), new THREE.Vector3(midX + Math.sign(ax - midX) * BASE_R, LEAD_H, midZ));
      stub(new THREE.Vector3(bx, LEAD_H, midZ), new THREE.Vector3(midX + Math.sign(bx - midX) * BASE_R, LEAD_H, midZ));
    } else {
      stub(new THREE.Vector3(midX, LEAD_H, az), new THREE.Vector3(midX, LEAD_H, midZ + Math.sign(az - midZ) * BASE_R));
      stub(new THREE.Vector3(midX, LEAD_H, bz), new THREE.Vector3(midX, LEAD_H, midZ + Math.sign(bz - midZ) * BASE_R));
    }

    // Metal base, upright at the middle
    const base = new THREE.Mesh(new THREE.CylinderGeometry(BASE_R, BASE_R, BASE_H, 16), ctx.mat.metal());
    base.position.set(midX, LEAD_H + BASE_H / 2 - 0.04, midZ);
    base.castShadow = true;
    group.add(base);

    // Glass: see-through and dark until update() lights it
    const glass = ctx.mat.glass(GLASS, 0.5);
    glass.emissive.setHex(GLOW);
    glass.emissiveIntensity = DARK_GLOW;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(GLASS_R, 22, 14), glass);
    bulb.position.set(midX, LEAD_H + BASE_H + GLASS_R * 0.8, midZ);
    bulb.castShadow = true;
    bulb.userData.bulbGlass = true;
    group.add(bulb);

    // Filament: a short dark wire inside the glass
    const fil = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.02), ctx.mat.body(0x3a2a1a));
    fil.position.copy(bulb.position);
    group.add(fil);

    // The glow light, off until update() lights the bulb
    const light = new THREE.PointLight(GLOW, 0, 6);
    light.position.set(midX, 3.0, midZ);
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
