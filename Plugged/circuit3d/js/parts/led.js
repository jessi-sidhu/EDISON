// ─────────────────────────────────────────────────────────────
//  parts/led.js — the LED, a registry part (issue #25).
//  The rules are docs/API-CONTRACT.md → "Part file contract".
//
//  Pins in today's order: pin 0 = cathode (−), pin 1 = anode (+), so
//  files saved before the registry load on the same pins. The on/off
//  logic is one D element that simulate.js's generic mode loop settles.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build / view.update) runs only in the browser and draws
//  through ctx, or on the group view.build returned.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./led.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  // Dome colour and typical forward voltage for each LED colour.
  const COLORS = {
    red:    { hex: 0xff2222, vf: 2.0 },
    yellow: { hex: 0xffd21f, vf: 2.1 },
    green:  { hex: 0x35d94a, vf: 2.2 },
    blue:   { hex: 0x3b82f6, vf: 3.2 },
    white:  { hex: 0xf5f5f5, vf: 3.4 },
  };
  const domeHex = color => (COLORS[color] || COLORS.red).hex;

  const RON      = 0.1;    // ohm, on-state series resistance
  const SHORT_MA = 1000;   // above 1 A the LED is a short across the battery
  const OPEN_MA  = 0.001;  // below 1 µA nothing is flowing (a GMIN trickle)

  // The kit's stock resistors: the smallest one at or above minOhms.
  // Moved here from simulate.js; Parts.nearestKit rounds to the nearest
  // E12 value instead, which could round below the minimum.
  const STOCK_R = [100, 150, 220, 330, 470, 680, 1000, 1500, 2200, 3300, 4700, 10000];
  function stockResistor(minOhms) {
    return STOCK_R.find(r => r >= minOhms) || Math.ceil(minOhms / 1000) * 1000;
  }

  // The series resistance that would hold the LED at its rating, from the
  // volts it would see with every mode block off (r.open).
  function advice(r) {
    const minR = Math.ceil(((open(r) || 0) - r.values.vf) / r.values.maxCurrent);
    return { minR, stock: stockResistor(minR) };
  }

  // The D element's key in r.current / r.modes / r.open.
  const D = 'd';
  const through = r => r.current[D] || 0;
  const open    = r => (r.open ? r.open[D] : 0);
  const volts   = v => (v == null ? 0 : v);   // a floating pin reads 0 V, as the solver's GMIN leaves it

  function measure(r) {
    const current = through(r);
    const on = r.modes[D] === 'on' && current >= r.values.thresholdCurrent * 1000;
    return { on, current };
  }

  // Off with the cathode driven at least vf above the anode. A floating
  // anode counts at its pinMax, the most an off diode on its node lets it
  // rise; uncapped, the LED is only dark (#73).
  function reversed(r) {
    if (r.modes[D] === 'on' || r.pins.cathode == null) return false;
    const anode = r.pins.anode != null ? r.pins.anode : r.pinMax && r.pinMax.anode;
    if (typeof anode !== 'number') return false;
    return volts(r.pins.cathode) - volts(anode) >= r.values.vf;
  }

  // The results-panel line: the generic ON line while lit; on a sine that
  // crosses 0 V (r.swings), why a reversed LED is dark (#2); else none.
  function line(r, m) {
    if (m.on === true) return { text: `  💡 LED ON  (${m.current.toFixed(1)} mA)`, cls: 'sim-on' };
    return r.swings && reversed(r) ? { text: `  ${r.label} dark: the sine reverses it on this half.`, cls: 'sim-info' } : null;
  }

  function warnings(r, m) {
    const mode = r.modes[D];
    if (mode === 'on' && m.current > SHORT_MA) {
      const a = advice(r);
      return ['Short circuit. The LED sits straight across the battery with no current-limiting resistor.',
              `Put a resistor in series: at least ${a.minR} ohm, so use a ${a.stock} ohm.`];
    }
    if (m.on) {
      const max = r.values.maxCurrent;
      if (!max || m.current <= max * 1000) return [];
      const a = advice(r);
      return [`LED is over its ${(max * 1000).toFixed(0)} mA rating at ${m.current.toFixed(1)} mA. ` +
              `Needs at least ${a.minR} ohm in series, so use ${a.stock} ohm.`];
    }
    if (mode !== 'on') {
      // Backwards only when a source drives the cathode above the anode. On
      // a sine that crosses 0 V that is just its other half: line() says so.
      if (r.swings) return [];
      return reversed(r) ? ['LED is backwards. Current cannot flow from cathode to anode. Flip it around.'] : [];
    }
    // On, but under the threshold. Below OPEN_MA the "current" is only GMIN
    // leaking through a floating node: the open-circuit line says that.
    return m.current >= OPEN_MA ? ['LED: current too low.'] : [];
  }

  // ── The model: a 5 mm LED. A tinted epoxy dome on a flange with the
  //  cathode's flat, the lead frame showing through it (the cathode's
  //  anvil and reflector cup, the anode's post), and two tinned leads that
  //  leave the flange 2.54 mm apart and splay out to their holes.
  //  legs[0] = cathode (−), legs[1] = anode (+). The dome is marked
  //  userData.ledDome and the glow light userData.ledLight, for update();
  //  the flange shares the dome's material, so it glows with it. ──
  const BASE_H = 0.26;                    // the flange's underside above the board
  const DOME_R = 0.31, FLANGE_R = 0.36, FLANGE_H = 0.09, BARREL_H = 0.46;
  const LEG_X  = 0.2;                     // each lead's offset from the centre where it leaves the flange
  const FLAT   = 0.8;                     // the cathode flat, as a fraction of the flange radius
  const CLEAR  = 0.4, LIT_OPACITY = 0.92;   // the epoxy's opacity dark (see-through) and lit

  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const color = domeHex(values.color);
    const A = ctx.holeWorld(legs[0].col, legs[0].row);   // cathode
    const B = ctx.holeWorld(legs[1].col, legs[1].row);   // anode
    const ax = A.x, az = A.z, bx = B.x, bz = B.z;
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const toCathode = new THREE.Vector3(ax - bx, 0, az - bz).normalize();

    // The body is drawn with local +x toward the cathode.
    const body = new THREE.Group();
    body.position.set(mid.x, 0, mid.z);
    body.rotation.y = Math.atan2(-toCathode.z, toCathode.x);
    group.add(body);

    // Epoxy: water-clear with a tint of its colour, glowing faintly in it
    const glass = ctx.mat.surface(color, { opacity: CLEAR, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.04,
                                           envMapIntensity: 1.2, depthWrite: false });
    glass.emissive.setHex(color);
    glass.emissiveIntensity = 0.45;

    // The flange: a disc with the flat cut on the cathode side
    const a = Math.acos(FLAT);
    const rim = new THREE.Shape();
    rim.absarc(0, 0, FLANGE_R, a, Math.PI * 2 - a, false);
    rim.closePath();
    const flangeGeo = new THREE.ExtrudeGeometry(rim, { depth: FLANGE_H, bevelEnabled: true, bevelThickness: 0.012,
                                                       bevelSize: 0.012, bevelSegments: 2, curveSegments: 28 });
    flangeGeo.rotateX(-Math.PI / 2);
    const flange = new THREE.Mesh(flangeGeo, glass);
    flange.position.y = BASE_H;
    flange.castShadow = true;
    body.add(flange);

    // The dome: a short barrel and a hemisphere
    const outline = [[DOME_R * 0.97, 0], [DOME_R, 0.015], [DOME_R, BARREL_H]];
    for (let i = 1; i <= 14; i++) {
      const t = (i / 14) * Math.PI / 2;
      outline.push([DOME_R * Math.cos(t), BARREL_H + DOME_R * Math.sin(t)]);
    }
    const dome = new THREE.Mesh(ctx.lathe(outline, 40), glass);
    dome.position.y = BASE_H + FLANGE_H;
    dome.castShadow = true;
    dome.userData.ledDome = true;
    body.add(dome);

    // The lead frame inside: the cathode's wide anvil with its cup, the anode's thin post
    // (bright silver, so it reads through the tinted epoxy)
    const frame = () => ctx.mat.surface(0xe2e4e8, { metalness: 0.55, roughness: 0.3 });
    const inside = (w, h, d, x, y) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frame());
      m.position.set(x, y, 0);
      body.add(m);
    };
    const floor = BASE_H + FLANGE_H;
    inside(0.05, 0.3, 0.03, LEG_X, floor + 0.15);
    inside(0.17, 0.12, 0.03, LEG_X * 0.55, floor + 0.32);
    inside(0.04, 0.34, 0.03, -LEG_X, floor + 0.17);
    inside(0.1, 0.035, 0.03, -LEG_X * 0.75, floor + 0.34);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.035, 0.06, 16), frame());
    cup.position.set(LEG_X * 0.35, floor + 0.41, 0);
    body.add(cup);

    // Leads: straight down from the flange, then splayed out to the holes
    const legPath = (hole, sign) => {
      const top = mid.clone().addScaledVector(toCathode, sign * LEG_X).setY(BASE_H + 0.02);
      const end = new THREE.Vector3(hole.x, -0.05, hole.z);
      if (Math.hypot(top.x - end.x, top.z - end.z) < 0.02) return [top, end];
      return [top, top.clone().setY(BASE_H * 0.62), new THREE.Vector3(hole.x, BASE_H * 0.3, hole.z), end];
    };
    group.add(ctx.bentLead(legPath(A, 1), 0.024, 0.05));
    group.add(ctx.bentLead(legPath(B, -1), 0.024, 0.05));

    // The glow light, off until update() lights the LED
    const light = new THREE.PointLight(color, 8.0, 10);
    light.position.set(mid.x, 3.0, mid.z);
    light.visible = false;
    light.userData.ledLight = true;
    group.add(light);

    // Small +/− board-level markers: + by the anode, − by the cathode
    const plusMat = ctx.mat.label(0xff3333);
    for (const [w, d] of [[0.04, 0.14], [0.14, 0.04]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.01, d), plusMat);
      m.position.set(bx, 0.03, bz);
      group.add(m);
    }
    const minus = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 0.04), ctx.mat.label(0x3355ff));
    minus.position.set(ax, 0.03, az);
    group.add(minus);

    return { group, pinPositions: [new THREE.Vector3(ax, 0, az), new THREE.Vector3(bx, 0, bz)] };
  }

  // Glow after a simulation that lit it; dim otherwise (m is {} on Stop).
  // A lit LED's glow follows its current: 3.5 at 15 mA, scaled by
  // current / 15 mA and held within 0.15–1.3 of that, so a dimmer at
  // low current looks dimmer and 14.9 mA looks as it always has.
  const LIT_GLOW = 3.5, DARK_GLOW = 0.45, FULL_MA = 15;
  const glowFor = mA => LIT_GLOW * Math.min(1.3, Math.max(0.15, (Number(mA) || 0) / FULL_MA));

  function update(obj, m) {
    const group = obj && obj.group;
    if (!group) return;
    const lit = !!(m && m.on);
    group.traverse(o => {
      if (o.userData.ledDome) {
        o.material.emissiveIntensity = lit ? glowFor(m.current) : DARK_GLOW;
        o.material.opacity = lit ? LIT_OPACITY : CLEAR;
      }
      if (o.userData.ledLight) o.visible = lit;
    });
  }

  const choices = {};
  for (const [name, c] of Object.entries(COLORS)) choices[name] = { vf: c.vf };

  return {
    type:     'led',
    name:     'LED',
    sub:      '2 leads · 5mm',
    category: 'Semiconductors',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><path d="M8 19 C8 7, 20 7, 20 19 Z" fill="currentColor" ' +
              'fill-opacity="0.15"/><path d="M8 19 C8 7, 20 7, 20 19"/><line x1="6" y1="19" x2="22" y2="19"/>' +
              '<line x1="10" y1="19" x2="10" y2="26"/><line x1="18" y1="19" x2="18" y2="26"/>' +
              '<line x1="22" y1="11" x2="25" y2="8" stroke-width="1.3"/>' +
              '<line x1="22" y1="15" x2="26" y2="15" stroke-width="1.3"/></svg>',
    prefix:   'LED',
    pins:     ['cathode', 'anode'],
    place:    { kind: 'span', span: { min: 1, max: 3, default: 2 }, rotations: ['h', 'v'] },
    values:   {
      color:            { choices, default: 'red' },
      maxCurrent:       { unit: 'A', default: 0.020, min: 0.001, max: 1 },
      thresholdCurrent: { unit: 'A', default: 0.001, min: 0.000001, max: 0.1 },
    },

    elements: v => [{ kind: 'D', id: D, pins: ['anode', 'cathode'], vf: v.vf, ron: RON }],
    measure,
    warnings,
    line,
    report:   (r, m) => `LED ${m.on ? 'ON (lit)' : 'OFF (dark)'}, ${Math.max(0, m.current).toFixed(1)} mA`,

    ai: {
      about:    'An LED: cathode (−) in holeA, anode (+) in holeB, on one row 1–3 columns apart. ' +
                'Lights when current flows anode to cathode; needs a resistor in series.',
      keywords: ['led', 'light', 'diode', 'lamp', 'indicator'],
      everyday: true,
      values:   ['color'],
      guide:    'Every LED needs a resistor in series to limit current (place_resistor). ' +
                'holeA = cathode (-) goes toward GND. holeB = anode (+) goes toward resistor/power.',
    },

    view: { build, update },

    examples: [
      {
        name:  'A red LED behind 470 Ω on 9 V lights at about 14.9 mA',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['a2', 'a6'] },
                { type: 'led', label: 'LED1', holes: ['b8', 'b6'], values: { color: 'red' } }],   // cathode b8, anode b6
        wires: [['BAT1.0', 'tp_50'], ['BAT1.1', 'tn_50'], ['tp_2', 'b2'], ['c8', 'tn_8']],
        expect: { LED1: { on: true, current: [14.8, 15.0] } },
      },
      {
        name:  'A green LED behind 1 kΩ on 9 V lights at about 6.8 mA',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['a2', 'a6'], values: { resistance: 1000 } },
                { type: 'led', label: 'LED1', holes: ['b8', 'b6'], values: { color: 'green' } }],
        wires: [['BAT1.0', 'tp_50'], ['BAT1.1', 'tn_50'], ['tp_2', 'b2'], ['c8', 'tn_8']],
        expect: { LED1: { on: true, current: [6.75, 6.85] } },
      },
      {
        name:  'Put in backwards, the LED stays dark',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['a2', 'a6'] },
                { type: 'led', label: 'LED1', holes: ['b6', 'b8'] }],   // cathode b6, anode b8
        wires: [['BAT1.0', 'tp_50'], ['BAT1.1', 'tn_50'], ['tp_2', 'b2'], ['c8', 'tn_8']],
        expect: { LED1: { on: false } },
      },
    ],
  };
});
