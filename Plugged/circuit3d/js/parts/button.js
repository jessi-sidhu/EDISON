// ─────────────────────────────────────────────────────────────
//  parts/button.js — the push button, a registry part (issue #26).
//  The rules are docs/API-CONTRACT.md → "Part file contract".
//
//  Two leads, 3 columns apart. Its state is the momentary control
//  `pressed` (default false, never saved), which a click on the model
//  toggles while the simulation runs (gestures.click). Electrically one
//  SW: closed (1 mΩ) exactly while pressed. The cap goes down and back
//  up in view.update.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build / view.update) runs only in the browser.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./button.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  // The one current through the part, in mA, as a positive magnitude.
  const through = r => Math.abs(Object.values(r.current)[0] || 0);
  const number  = label => String(label || '').replace(/^\D+/, '');
  const isDown  = r => !!(r && r.controls && r.controls.pressed);

  // ── The model: a 12 mm tactile switch. A black base, its pressed-steel
  //  frame with the corner tabs, a round actuator cap, and two legs down
  //  into the holes. The cap is marked userData.isButtonCap, with its rest
  //  and pressed heights, for update(): black at rest, green while pressed. ──
  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const A = ctx.holeWorld(legs[0].col, legs[0].row);
    const B = ctx.holeWorld(legs[1].col, legs[1].row);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const along = new THREE.Vector3().subVectors(B, A).setY(0).normalize();
    const SIZE = Math.min(1.0, Math.max(0.78, A.distanceTo(B) - 0.24));   // the square's side
    const BASE = 0.05, BODY_H = 0.3;

    const frame = new THREE.Group();
    frame.position.set(mid.x, 0, mid.z);
    frame.rotation.y = Math.atan2(-along.z, along.x);
    group.add(frame);

    // Two legs, straight down from the base into the holes
    for (const p of [A, B]) group.add(ctx.bentLead([new THREE.Vector3(p.x, BASE + 0.05, p.z), new THREE.Vector3(p.x, -0.05, p.z)], 0.032));

    // The black base and the steel frame over it, with its four corner tabs
    const base = new THREE.Mesh(ctx.roundBox(SIZE, BODY_H, SIZE, 0.03), ctx.mat.surface(0x1b1b1d, { roughness: 0.55 }));
    base.position.y = BASE + BODY_H / 2;
    base.castShadow = true;
    frame.add(base);
    const top = BASE + BODY_H;
    const steel = ctx.mat.surface(0xc2c5ca, { metalness: 0.9, roughness: 0.32 });
    const plate = new THREE.Mesh(ctx.roundBox(SIZE + 0.02, 0.035, SIZE + 0.02, 0.012), steel);
    plate.position.y = top + 0.0175;
    frame.add(plate);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.02), steel);
      tab.position.set(sx * SIZE * 0.3, top - 0.08, sz * (SIZE / 2 + 0.012));
      frame.add(tab);
    }
    // The collar round the cap
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(SIZE * 0.36, SIZE * 0.38, 0.05, 32), ctx.mat.surface(0x232325, { roughness: 0.5 }));
    collar.position.y = top + 0.06;
    frame.add(collar);

    // The cap: a round black actuator with a soft top edge
    const R = SIZE * 0.3;
    const outline = [[0, 0], [R, 0], [R, 0.15], [R * 0.94, 0.19], [R * 0.8, 0.205], [0, 0.205]];
    const cap = new THREE.Mesh(ctx.lathe(outline, 40), ctx.mat.surface(REST.color, { roughness: 0.4, clearcoat: 0.3 }));
    const restY = top + 0.07;
    cap.position.set(0, restY, 0);
    cap.castShadow = true;
    cap.userData.isButtonCap = true;
    cap.userData.capRestY    = restY;
    cap.userData.capPressY   = restY - 0.07;   // only 0.07 down: subtle
    frame.add(cap);

    return { group, pinPositions: [new THREE.Vector3(A.x, 0, A.z), new THREE.Vector3(B.x, 0, B.z)] };
  }

  // Cap down and green while pressed, up and white otherwise, eased over
  // 80 ms. The state is r.controls, or the record's own controls when
  // there is no result (Stop, or a circuit with no readings).
  const REST  = { y: 'capRestY',  color: 0x1c1c1e, emissive: 0x000000, glow: 0 };
  const PRESS = { y: 'capPressY', color: 0x44cc44, emissive: 0x115511, glow: 0.6 };

  function update(obj, m, r) {
    const group = obj && obj.group;
    if (!group) return;
    const down = r ? isDown(r) : !!(obj.controls && obj.controls.pressed);
    const to = down ? PRESS : REST;
    group.traverse(cap => {
      if (!cap.userData.isButtonCap) return;
      const d = cap.userData;
      const startY = cap.position.y, targetY = d[to.y];
      const col0 = cap.material.color.clone(), emi0 = cap.material.emissive.clone();
      const glow0 = cap.material.emissiveIntensity;
      const col1 = col0.clone().setHex(to.color), emi1 = emi0.clone().setHex(to.emissive);
      const set = e => {
        cap.position.y = startY + (targetY - startY) * e;
        cap.material.color.lerpColors(col0, col1, e);
        cap.material.emissive.lerpColors(emi0, emi1, e);
        cap.material.emissiveIntensity = glow0 + (to.glow - glow0) * e;
      };
      const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
      if (d.animId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(d.animId);
      d.animId = null;
      if (!raf) { set(1); return; }
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const tick = now => {
        const p = Math.min(Math.max((now - t0) / 80, 0), 1);
        set(1 - Math.pow(1 - p, 3));   // ease out cubic
        d.animId = p < 1 ? raf(tick) : null;
      };
      d.animId = raf(tick);
    });
  }

  return {
    type:     'button',
    name:     'Push Button',
    sub:      '2 leads · momentary',
    category: 'I/O',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="6" y="14" width="16" height="10" rx="1.5" fill="currentColor" fill-opacity="0.1"/>' +
              '<rect x="6" y="14" width="16" height="10" rx="1.5"/>' +
              '<circle cx="14" cy="11" r="5" fill="currentColor" fill-opacity="0.15"/><circle cx="14" cy="11" r="5"/>' +
              '<line x1="9" y1="24" x2="9" y2="27"/><line x1="19" y1="24" x2="19" y2="27"/></svg>',
    prefix:   'SW',
    pins:     ['lead1', 'lead2'],
    place:    { kind: 'span', span: { min: 3, max: 3, default: 3 }, rotations: ['h', 'v'] },
    controls: { pressed: { type: 'momentary', default: false, saved: false } },
    gestures: { click: 'pressed' },

    elements: (v, c) => [{ kind: 'SW', pins: ['lead1', 'lead2'], closed: !!c.pressed }],
    measure:  r => ({ current: through(r) }),
    report:   (r, m) => `button ${isDown(r) ? 'pressed (closed)' : 'released (open)'}, ${m.current.toFixed(1)} mA`,
    headline: r => (isDown(r)
      ? { text: `Button ${number(r.label)}: 🟢 CLOSED (current flowing)`, cls: 'sim-on' }
      : { text: `Button ${number(r.label)}: ⭕ OPEN — click to press`, cls: 'sim-info' }),

    ai: {
      about:    'A push button: two leads on one row, exactly 3 columns apart. Open until pressed; ' +
                'the user clicks it while the simulation runs.',
      guide:    'For one button switching several LED branches, follow the ONE BUTTON SWITCHING SEPARATE BRANCHES ' +
                'recipe: each branch gets its own feed wire from a different hole in the button\'s output column.',
      keywords: ['button', 'switch', 'push', 'press', 'pushbutton'],
      everyday: true,
    },

    view: { build, update },

    examples: [
      {
        name:  'Pressed, the button closes the LED circuit: 14.9 mA through it',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['b3', 'b7'] },
                { type: 'led', label: 'LED1', holes: ['c9', 'c7'] },   // cathode c9, anode c7
                { type: 'button', label: 'SW1', holes: ['b12', 'b15'], controls: { pressed: true } }],
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_4', 'a3'], ['a9', 'a12'], ['a15', 'tn_15']],
        expect: { SW1: { current: [14.8, 15.0] }, LED1: { on: true } },
      },
      {
        name:  'Released, the button leaves the LED circuit open',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['b3', 'b7'] },
                { type: 'led', label: 'LED1', holes: ['c9', 'c7'] },
                { type: 'button', label: 'SW1', holes: ['b12', 'b15'] }],
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_4', 'a3'], ['a9', 'a12'], ['a15', 'tn_15']],
        expect: { SW1: { current: 0 }, LED1: { on: false } },
      },
    ],
  };
});
