// ─────────────────────────────────────────────────────────────
//  parts/slide_switch.js — the slide switch (SPDT), a registry part
//  (issue #39). The rules are docs/API-CONTRACT.md → "Part file contract".
//
//  Three legs in a row (a footprint part): pin a, common (the middle leg),
//  pin b. Horizontal only (rotations 0 and 180): facing down or up would put
//  its legs in one column half, one node, so it could never pick a side.
//  Its state is the toggle control `toB` (default false, saved with the
//  circuit), which a click on the model flips while the simulation runs
//  (gestures.click). Electrically two SW elements: common–a closed while
//  toB is false, common–b closed while it is true, never both. The slider
//  nub sits toward the joined side (view.update).
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build / view.update) runs only in the browser.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./slide_switch.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  const isB  = c => !!(c && c.toB);
  const side = r => (isB(r && r.controls) ? 'b' : 'a');

  const NUB_SHIFT = 0.36;   // how far the nub sits from the middle, toward the joined side

  // ── The model: three leads, a dark body with a slot, a slider nub ──
  //  The nub is marked userData.slideNub, with the world points of pins a
  //  and b and the middle, for update().
  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const at = legs.map(l => ctx.holeWorld(l.col, l.row));
    const [A, M, B] = at;
    const len = Math.hypot(B.x - A.x, B.z - A.z);
    const dx = len ? (B.x - A.x) / len : 1, dz = len ? (B.z - A.z) / len : 0;   // unit a → b
    const yaw = Math.atan2(-dz, dx);   // a box's long side along a → b
    const long = Math.max(len, 1.4) + 0.3;
    const LEAD_H = 0.30;

    // Upright leads from each hole to the body
    for (const p of at) group.add(ctx.lead(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, LEAD_H, p.z), 0.025));

    // Body, with a darker slot along its top
    const body = new THREE.Mesh(new THREE.BoxGeometry(long, 0.30, 0.56), ctx.mat.body(0x2a2d33));
    body.position.set(M.x, LEAD_H + 0.15, M.z);
    body.rotation.y = yaw;
    body.castShadow = true;
    group.add(body);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(long - 0.3, 0.02, 0.16), ctx.mat.body(0x111214));
    slot.position.set(M.x, LEAD_H + 0.31, M.z);
    slot.rotation.y = yaw;
    group.add(slot);

    // The slider nub, toward a (as placed) or b. Kept low (0.06 above the
    // body), so a click on the middle of the model's top lands on the body.
    const nub = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.22), ctx.mat.body(0xe8e8e8));
    nub.rotation.y = yaw;
    nub.castShadow = true;
    nub.userData.slideNub = true;
    nub.userData.mid = { x: M.x, z: M.z };
    nub.userData.dir = { x: dx, z: dz };
    const s = (isB(controls) ? 1 : -1) * NUB_SHIFT;
    nub.position.set(M.x + dx * s, LEAD_H + 0.29, M.z + dz * s);
    group.add(nub);

    return { group, pinPositions: at.map(p => new THREE.Vector3(p.x, 0, p.z)) };
  }

  // The nub follows toB: r.controls after a simulation, or the record's own
  // controls when there is no result (Stop).
  function update(obj, m, r) {
    const group = obj && obj.group;
    if (!group) return;
    const toB = r ? isB(r.controls) : isB(obj.controls);
    const s = (toB ? 1 : -1) * NUB_SHIFT;
    group.traverse(o => {
      if (!o.userData.slideNub) return;
      const { mid, dir } = o.userData;
      o.position.x = mid.x + dir.x * s;
      o.position.z = mid.z + dir.z * s;
    });
  }

  // The examples' circuit, as ai.recipe: + into common; a → 470 Ω → red
  // LED; b → 470 Ω → green LED. `controls` sets the switch's starting side.
  const known = controls => ({
    parts: [{ type: 'battery', label: 'BAT1' },
            Object.assign({ type: 'slide_switch', label: 'SS1', holes: ['c8', 'c9', 'c10'] },   // a c8, common c9, b c10
                          controls ? { controls } : {}),
            { type: 'resistor', label: 'R1', holes: ['b4', 'b8'], values: { resistance: 470 } },
            { type: 'led', label: 'LED1', holes: ['d2', 'd4'], values: { color: 'red' } },       // cathode d2, anode d4
            { type: 'resistor', label: 'R2', holes: ['b10', 'b14'], values: { resistance: 470 } },
            { type: 'led', label: 'LED2', holes: ['d16', 'd14'], values: { color: 'green' } }],  // cathode d16, anode d14
    wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_9', 'a9'], ['a2', 'tn_2'], ['a16', 'tn_16']],
  });

  return {
    type:     'slide_switch',
    name:     'Slide Switch',
    sub:      '3 leads · picks side a or b',
    category: 'I/O',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="3" y="10" width="22" height="10" rx="1.5" fill="currentColor" fill-opacity="0.1"/>' +
              '<rect x="3" y="10" width="22" height="10" rx="1.5"/>' +
              '<rect x="6" y="12" width="7" height="6" rx="1" fill="currentColor"/>' +
              '<line x1="8" y1="20" x2="8" y2="26"/><line x1="14" y1="20" x2="14" y2="26"/>' +
              '<line x1="20" y1="20" x2="20" y2="26"/></svg>',
    prefix:   'SS',
    pins:     ['a', 'common', 'b'],
    place:    { kind: 'footprint', legs: [[0, 0], [1, 0], [2, 0]], rotations: [0, 180] },
    controls: { toB: { type: 'toggle', default: false, saved: true } },
    gestures: { click: 'toB' },

    elements: (v, c) => [
      { kind: 'SW', id: 'toA', pins: ['common', 'a'], closed: !isB(c) },
      { kind: 'SW', id: 'toB', pins: ['common', 'b'], closed: isB(c) },
    ],
    measure:  r => ({ side: side(r) }),
    report:   (r, m) => `common → ${m.side}`,

    ai: {
      about:    'A slide switch (SPDT): three legs in a row, pin a, common (the middle leg), pin b. Common joins a or b, ' +
                'to pick between two circuits. Horizontal only (right or left).',
      guide:    'The middle leg is common: feed + into it. As placed (toB false) common joins pin a, so put the red ' +
                'place_led (through a 470 Ω place_resistor) on pin a and the green one on pin b. set_control toB: true ' +
                'moves it to pin b.',
      keywords: ['slide switch', 'spdt', 'selector', 'two-way switch', 'changeover switch'],
      recipe: {
        name:  '+ into the middle leg (common); a through 470 Ω to a red LED, b through 470 Ω to a green LED; as placed, red lights',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'slide_switch', label: 'SS1', holes: ['c8', 'c9', 'c10'] },                // a c8, common c9, b c10
                { type: 'resistor', label: 'R1', holes: ['b4', 'b8'], values: { resistance: 470 } },
                { type: 'led', label: 'LED1', holes: ['d2', 'd4'], values: { color: 'red' } },     // cathode d2, anode d4
                { type: 'resistor', label: 'R2', holes: ['b10', 'b14'], values: { resistance: 470 } },
                { type: 'led', label: 'LED2', holes: ['d16', 'd14'], values: { color: 'green' } }], // cathode d16, anode d14
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_9', 'a9'], ['a2', 'tn_2'], ['a16', 'tn_16']],
        expect: { SS1: { side: 'a' },
                  LED1: { on: true, current: [14.8, 15.0] },
                  LED2: { on: false, current: 0 } },
      },
    },

    view: { build, update },

    examples: [
      Object.assign({
        name:   'As placed, common joins a: the red LED lights at 14.9 mA, the green one is dark',
        expect: { SS1: { side: 'a' }, LED1: { on: true, current: [14.8, 15.0] }, LED2: { on: false } },
      }, known()),
      Object.assign({
        name:   'Flipped to b: the green LED lights at 14.5 mA, the red one is dark',
        expect: { SS1: { side: 'b' }, LED1: { on: false }, LED2: { on: true, current: [14.4, 14.6] } },
      }, known({ toB: true })),
    ],
  };
});
