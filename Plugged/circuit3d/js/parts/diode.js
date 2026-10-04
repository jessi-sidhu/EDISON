// ─────────────────────────────────────────────────────────────
//  parts/diode.js — a standard diode, 1N4148 or 1N4001 (issue #33).
//  The rules are docs/API-CONTRACT.md → "Part file contract".
//
//  The LED without the light: the same one D element (vf in series with
//  the LED's 0.1 Ω when on), other values and another view. Pins in the
//  LED's order: pin 0 = cathode (the banded end), pin 1 = anode.
//  A backwards diode just blocks; that is normal use, not a warning.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build) runs only in the browser and draws through ctx.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./diode.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  const RON     = 0.1;     // ohm, on-state series resistance (the LED's)
  const OPEN_MA = 0.001;   // below 1 µA nothing is flowing (a GMIN trickle)

  // The D element's key in r.current / r.modes.
  const D = 'd';
  const volts = v => (v == null ? 0 : v);   // a floating pin reads 0 V, as the solver's GMIN leaves it

  function measure(r) {
    const current = r.current[D] || 0;
    const on = r.modes[D] === 'on' && current >= OPEN_MA;
    const drop = volts(r.pins.anode) - volts(r.pins.cathode);
    return { on, current, drop };
  }

  // "200 mA" or "1 A"
  const rating = a => (a >= 1 ? `${a} A` : `${(a * 1000).toFixed(0)} mA`);

  function warnings(r, m) {
    const max = r.values.maxCurrent;
    if (!max || !(m.current > max * 1000)) return [];
    return [`Diode is over its ${rating(max)} rating at ${m.current.toFixed(1)} mA. Put a bigger resistor in series.`];
  }

  // ── The model: two leads, two stubs, a black glass body, a cathode band ──
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

    // Body: black glass
    const body = new THREE.Mesh(new THREE.CylinderGeometry(BODY_R, BODY_R, bodyLen, 16), ctx.mat.glass(0x161616, 0.92));
    body.castShadow = true;
    if (isHoriz) body.rotation.z = Math.PI / 2;
    else         body.rotation.x = Math.PI / 2;
    body.position.set(midX, LEAD_H, midZ);
    group.add(body);

    // Cathode band: a silver ring near the cathode end
    const bandW = bodyLen * 0.14;
    const band  = new THREE.Mesh(new THREE.CylinderGeometry(BODY_R + 0.005, BODY_R + 0.005, bandW, 16), ctx.mat.body(0xd0d0d0));
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
    type:     'diode',
    name:     'Diode',
    sub:      '1N4148 / 1N4001 · axial',
    category: 'Semiconductors',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="14" x2="9" y2="14"/>' +
              '<path d="M9 7 L19 14 L9 21 Z" fill="currentColor" fill-opacity="0.15"/>' +
              '<path d="M9 7 L19 14 L9 21 Z"/><line x1="19" y1="7" x2="19" y2="21"/>' +
              '<line x1="19" y1="14" x2="27" y2="14"/></svg>',
    prefix:   'D',
    pins:     ['cathode', 'anode'],
    place:    { kind: 'span', span: { min: 3, max: 5, default: 4 }, rotations: ['h', 'v'] },
    values:   {
      model: { choices: { '1N4148': { vf: 0.65, maxCurrent: 0.2 }, '1N4001': { vf: 0.7, maxCurrent: 1 } }, default: '1N4148' },
    },

    elements: v => [{ kind: 'D', id: D, pins: ['anode', 'cathode'], vf: v.vf, ron: RON }],
    measure,
    warnings,
    report:   (r, m) => `${r.values.model} diode ${m.on ? 'ON' : 'OFF'}, ${Math.max(0, m.current).toFixed(1)} mA, ` +
                        `${m.drop.toFixed(2)} V across`,

    ai: {
      about:    'A diode: cathode (banded end) in holeA, anode in holeB, on one row 3–5 columns apart. ' +
                'Conducts anode to cathode with about 0.7 V drop; blocks the other way.',
      keywords: ['diode', 'rectifier', '1n4148', '1n4001', 'reverse protection'],
      values:   ['model'],
      guide:    'Current flows from anode to cathode. For reverse-polarity protection, wire + to the anode (holeB) ' +
                'and send the cathode (holeA, the banded end) on toward the load: resistor, then LED. Backwards, it blocks.',
      recipe:   {
        name:  "+ into the 1N4148's anode (holeB), its cathode (holeA) through 470 Ω to a red LED, LED to ground: the LED lights",
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'diode', label: 'D1', holes: ['b6', 'b2'] },                                // cathode b6, anode b2
                { type: 'resistor', label: 'R1', holes: ['c6', 'c10'], values: { resistance: 470 } },
                { type: 'led', label: 'LED1', holes: ['d12', 'd10'], values: { color: 'red' } }],    // cathode d12, anode d10
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_2', 'a2'], ['a12', 'tn_12']],
        expect: { D1:   { on: true, drop: [0.64, 0.66], current: [13.4, 13.6] },
                  LED1: { on: true, current: [13.4, 13.6] } },
      },
    },

    view: { build },

    examples: [
      {
        name:  'A 1N4148 behind 1 kΩ on 9 V conducts about 8.35 mA and drops about 0.65 V',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['a2', 'a6'], values: { resistance: 1000 } },
                { type: 'diode', label: 'D1', holes: ['b10', 'b6'] }],   // cathode b10, anode b6
        wires: [['BAT1.0', 'tp_50'], ['BAT1.1', 'tn_50'], ['tp_2', 'b2'], ['c10', 'tn_10']],
        expect: { D1: { on: true, drop: [0.64, 0.66], current: [8.3, 8.4] } },
      },
      {
        name:  'A 1N4001 in the same place drops about 0.70 V at 8.30 mA',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['a2', 'a6'], values: { resistance: 1000 } },
                { type: 'diode', label: 'D1', holes: ['b10', 'b6'], values: { model: '1N4001' } }],
        wires: [['BAT1.0', 'tp_50'], ['BAT1.1', 'tn_50'], ['tp_2', 'b2'], ['c10', 'tn_10']],
        expect: { D1: { on: true, drop: [0.69, 0.71], current: [8.25, 8.35] } },
      },
      {
        name:  'Put in backwards, the diode blocks: no current, about −9 V across it',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['a2', 'a6'], values: { resistance: 1000 } },
                { type: 'diode', label: 'D1', holes: ['b6', 'b10'] }],   // cathode b6, anode b10
        wires: [['BAT1.0', 'tp_50'], ['BAT1.1', 'tn_50'], ['tp_2', 'b2'], ['c10', 'tn_10']],
        expect: { D1: { on: false, current: [-0.01, 0.01], drop: [-9.05, -8.95] } },
      },
    ],
  };
});
