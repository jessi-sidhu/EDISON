// ─────────────────────────────────────────────────────────────
//  parts/zener.js — a Zener diode, 3.3 V / 5.1 V / 12 V (issue #35).
//  The rules are docs/API-CONTRACT.md → "Part file contract".
//
//  The diode with a breakdown voltage: one D element with vz, so reversed
//  past vz it conducts and holds about vz across it. That is its normal
//  use (a voltage regulator), so reversed is not a warning, and forward it
//  just drops 0.7 V like a diode. Pins in the diode's order: pin 0 =
//  cathode (the banded end), pin 1 = anode.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build) runs only in the browser and draws through ctx.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./zener.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  const VF        = 0.7;   // V, forward drop
  const RON       = 0.1;   // ohm, series resistance forward and in breakdown (the diode's)
  const MAX_POWER = 0.5;   // W, the rating of a 1N47xx-style glass Zener

  // The D element's key in r.current / r.modes.
  const D = 'd';
  const volts = v => (v == null ? 0 : v);   // a floating pin reads 0 V, as the solver's GMIN leaves it

  // voltage: V(cathode) − V(anode), so a regulating Zener reads +vz.
  // current: mA from cathode to anode (pin 0 → pin 1), so regulating is +.
  function measure(r) {
    const mode    = r.modes[D] || 'off';
    const current = -(r.current[D] || 0) || 0;   // "|| 0": no −0
    const voltage = volts(r.pins.cathode) - volts(r.pins.anode);
    return { mode, voltage, current };
  }

  const watts = m => Math.abs(m.voltage * m.current) / 1000;

  function warnings(r, m) {
    const p = watts(m);
    if (!(p > MAX_POWER)) return [];
    return [`Zener is over its ${MAX_POWER} W rating at ${p.toFixed(2)} W. Use a bigger series resistor.`];
  }

  function line(r, m) {
    if (m.mode === 'breakdown') {
      return { text: `  ZENER regulating at ${m.voltage.toFixed(2)} V (${m.current.toFixed(1)} mA)`, cls: 'sim-on' };
    }
    if (m.mode === 'on') {
      return { text: `  ZENER forward, conducting like a diode (${Math.abs(m.current).toFixed(1)} mA)`, cls: 'sim-info' };
    }
    return null;
  }

  function report(r, m) {
    const state = m.mode === 'breakdown' ? 'regulating' : m.mode === 'on' ? 'forward' : 'off';
    return `${r.values.model} Zener ${state}, ${m.voltage.toFixed(2)} V across, ${m.current.toFixed(1)} mA`;
  }

  // ── The model: two leads, two stubs, an orange glass body, a black band ──
  //  legs[0] = cathode, legs[1] = anode. The band sits at the cathode end.
  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const A = ctx.holeWorld(legs[0].col, legs[0].row);   // cathode
    const B = ctx.holeWorld(legs[1].col, legs[1].row);   // anode
    const ax = A.x, az = A.z, bx = B.x, bz = B.z;
    const midX = (ax + bx) / 2;
    const midZ = (az + bz) / 2;

    const isHoriz = Math.abs(az - bz) < 0.01;
    const LEAD_H  = 0.6;
    const BODY_R  = 0.09;
    const bodyLen = Math.max(0.36, (isHoriz ? Math.abs(bx - ax) : Math.abs(bz - az)) * 0.46);

    // Upright leads from the holes to body height
    for (const p of [A, B]) group.add(ctx.lead(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, LEAD_H, p.z)));

    // Stubs from the lead tops to the body ends
    const hOff = bodyLen / 2 + 0.01;
    const stub = (from, to) => { if (from.distanceTo(to) > 0.01) group.add(ctx.lead(from, to)); };
    if (isHoriz) {
      stub(new THREE.Vector3(ax, LEAD_H, midZ), new THREE.Vector3(midX + Math.sign(ax - midX) * hOff, LEAD_H, midZ));
      stub(new THREE.Vector3(bx, LEAD_H, midZ), new THREE.Vector3(midX + Math.sign(bx - midX) * hOff, LEAD_H, midZ));
    } else {
      stub(new THREE.Vector3(midX, LEAD_H, az), new THREE.Vector3(midX, LEAD_H, midZ + Math.sign(az - midZ) * hOff));
      stub(new THREE.Vector3(midX, LEAD_H, bz), new THREE.Vector3(midX, LEAD_H, midZ + Math.sign(bz - midZ) * hOff));
    }

    // Body: orange glass (the diode's is black)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(BODY_R, BODY_R, bodyLen, 16), ctx.mat.glass(0xd2691e, 0.85));
    body.castShadow = true;
    if (isHoriz) body.rotation.z = Math.PI / 2;
    else         body.rotation.x = Math.PI / 2;
    body.position.set(midX, LEAD_H, midZ);
    group.add(body);

    // Cathode band: a black ring near the cathode end
    const bandW = bodyLen * 0.14;
    const band  = new THREE.Mesh(new THREE.CylinderGeometry(BODY_R + 0.005, BODY_R + 0.005, bandW, 16), ctx.mat.body(0x1a1a1a));
    const bandOff = bodyLen / 2 - bandW;
    if (isHoriz) {
      band.rotation.z = Math.PI / 2;
      band.position.set(midX + Math.sign(ax - midX) * bandOff, LEAD_H, midZ);
    } else {
      band.rotation.x = Math.PI / 2;
      band.position.set(midX, LEAD_H, midZ + Math.sign(az - midZ) * bandOff);
    }
    group.add(band);

    return { group, pinPositions: [new THREE.Vector3(ax, 0, az), new THREE.Vector3(bx, 0, bz)] };
  }

  return {
    type:     'zener',
    name:     'Zener diode',
    sub:      '3.3 / 5.1 / 12 V · 0.5 W',
    category: 'Semiconductors',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="14" x2="9" y2="14"/>' +
              '<path d="M9 7 L19 14 L9 21 Z" fill="currentColor" fill-opacity="0.15"/>' +
              '<path d="M9 7 L19 14 L9 21 Z"/><polyline points="16 5 19 7 19 21 22 23"/>' +
              '<line x1="19" y1="14" x2="27" y2="14"/></svg>',
    prefix:   'ZD',
    pins:     ['cathode', 'anode'],
    place:    { kind: 'span', span: { min: 3, max: 5, default: 4 }, rotations: ['h', 'v'] },
    values:   {
      model: { choices: { '3.3V': { vz: 3.3 }, '5.1V': { vz: 5.1 }, '12V': { vz: 12 } }, default: '5.1V' },
    },

    elements: v => [{ kind: 'D', id: D, pins: ['anode', 'cathode'], vf: VF, ron: RON, vz: v.vz }],
    measure,
    warnings,
    line,
    report,

    ai: {
      about:    'A Zener diode: cathode (banded end) in holeA, anode in holeB, on one row 3–5 columns apart. ' +
                'Reversed, it holds its rated voltage; forward, it drops 0.7 V.',
      keywords: ['zener', 'regulator', 'voltage reference', '5.1v'],
      values:   ['model'],
      guide:    'For regulation the Zener is reversed: cathode (holeA, the banded end) toward + through a series ' +
                'resistor (place_resistor), anode (holeB) to ground (tn_N). For 12 V use place_bench_supply. ' +
                'Forward, it only drops 0.7 V like a diode.',
      recipe:   {
        name:  "Bench supply at 12 V; + through 1 kΩ into the Zener's cathode (holeA); its anode (holeB) to ground: it holds 5.1 V",
        parts: [{ type: 'bench_supply', label: 'PS1', values: { voltage: 12 } },
                { type: 'resistor', label: 'R1', holes: ['b2', 'b6'], values: { resistance: 1000 } },
                { type: 'zener', label: 'ZD1', holes: ['c6', 'c10'] }],                          // cathode c6, anode c10
        wires: [['PS1.0', 'tp_63'], ['PS1.1', 'tn_63'], ['tp_2', 'a2'], ['a10', 'tn_10']],
        expect: { ZD1: { mode: 'breakdown', voltage: [5.0, 5.2], current: [6.6, 7.2] } },
      },
    },

    view: { build },

    examples: [
      {
        name:  'Bench supply at 12 V → 1 kΩ → a reversed 5.1V Zener holds about 5.10 V at 6.90 mA',
        parts: [{ type: 'bench_supply', label: 'PS1', values: { voltage: 12 } },
                { type: 'resistor', label: 'R1', holes: ['b2', 'b6'], values: { resistance: 1000 } },
                { type: 'zener', label: 'ZD1', holes: ['c6', 'c10'] }],   // cathode c6, anode c10
        wires: [['PS1.0', 'tp_63'], ['PS1.1', 'tn_63'], ['tp_2', 'a2'], ['a10', 'tn_10']],
        expect: { ZD1: { mode: 'breakdown', voltage: [5.0, 5.2], current: [6.6, 7.2] } },
      },
      {
        name:  'Forward (anode toward +), it conducts like a diode: about −0.70 V at −11.3 mA',
        parts: [{ type: 'bench_supply', label: 'PS1', values: { voltage: 12 } },
                { type: 'resistor', label: 'R1', holes: ['b2', 'b6'], values: { resistance: 1000 } },
                { type: 'zener', label: 'ZD1', holes: ['c10', 'c6'] }],   // cathode c10, anode c6
        wires: [['PS1.0', 'tp_63'], ['PS1.1', 'tn_63'], ['tp_2', 'a2'], ['a10', 'tn_10']],
        expect: { ZD1: { mode: 'on', voltage: [-0.71, -0.69], current: [-11.4, -11.2] } },
      },
    ],
  };
});
