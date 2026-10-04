// ─────────────────────────────────────────────────────────────
//  parts/bench_supply.js — the bench power supply (issue #34).
//  The rules are docs/API-CONTRACT.md → "Part file contract" and
//  "Pattern: off-board multi-terminal source".
//
//  Off the board, four terminals: 'pos' (PS1.0), 'com' (PS1.1, the
//  ref: ground), 'neg' (PS1.2) and 'com2' (PS1.3, CH2 +, issue #124).
//  CH1 is pos / com, CH2 is com2 / neg. The mode control picks:
//    series (default): one set voltage both rails track, V(pos, com) and
//      V(com, neg), with com2 joined to com inside the supply;
//    independent: V(pos, com) = voltage and V(com2, neg) = voltage2, no
//      link; CH2's − (neg) is the ground of its circuit when that circuit
//      is separate from CH1's (the V element's own `ref`).
//  The current limits only warn; there is no constant-current mode.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build / view.update) runs only in the browser and draws
//  through ctx. The readout panel is an OffscreenCanvas texture.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./bench_supply.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  // The case: W × H × D on FOOT-high rubber feet, its front panel's face at
  // z = PANEL. The case sits behind the group's origin so the posts' tips
  // come out near the top rails' rows: a wire from a post to tp or tn runs
  // in front of the panel until it is past the case (app wires are arcs).
  const W = 2.8, H = 1.5, D = 1.9, FOOT = 0.06;
  const FRONT = 0.05, PANEL = FRONT + 0.01;
  const MID = FOOT + H / 2;           // the case's centre height

  const CASE   = 0x7e7c78;           // off-white enamel (the shell takes little of the studio's overhead softbox, or its top burns out)
  const FACE   = 0xb1afaa;           // the front panel, lit less by the sun than the top
  const LIP    = 0xa6a49f;           // the case's lip round the front panel
  const INK    = '#57534c';          // printing on the panel

  const LIGHT_ON = 1.4;              // a LIMIT light's glow when its channel is over

  // The screen, upper left of the front panel, and its canvas (power-of-two
  // sizes, so r128 never has to resize an OffscreenCanvas).
  const SCREEN_W = 1.52, SCREEN_H = 0.7, SCREEN_X = -0.42, SCREEN_Y = 1.03;
  const CANVAS_W = 1024, CANVAS_H = 512;
  const STRETCH = (SCREEN_W / SCREEN_H) / (CANVAS_W / CANVAS_H);   // the canvas is drawn this much wider on the screen
  const ROWS = [0.3, 0.72];          // each readout row's centre, as a fraction down the screen
  const rowY = k => SCREEN_Y + SCREEN_H / 2 - ROWS[k] * SCREEN_H;

  // The controls column on the right: two knobs, then the mode key under them.
  const COL_X = 0.97;
  const BTN_W = 0.46, BTN_H = 0.16, BTN_Y = 0.28;
  const KNOB_Y = [1.2, 0.7];         // VOLTAGE, CURRENT; each one's name printed above it
  const BTN_CANVAS_W = 256, BTN_CANVAS_H = 128;
  const BTN_STRETCH = (BTN_W * 0.92 / (BTN_H * 0.8)) / (BTN_CANVAS_W / BTN_CANVAS_H);
  const KEY_SERIES = 0x3c424b, KEY_INDEP = 0xc27c1a;

  // The four binding posts along the bottom, left to right CH1 + (pos), CH1 −
  // (com), CH2 + (com2), CH2 − (neg): red, black, black, blue, the + and −
  // rails' colours on the screen. A wire attaches at a post's tip.
  const POST_Y = 0.36, JACK_R = 0.12, JACK_L = 0.26;
  const POSTS = { pos: [-1.08, 0xc8261d, '+'], com: [-0.74, 0x1d1d20, 'COM'],
                  com2: [-0.2, 0x1d1d20, 'CH2 +'], neg: [0.14, 0x1c55c4, '−'] };

  const independent = c => !!c && c.mode === 'independent';
  const FONT = (weight, px) => `${weight} ${Math.round(px)}px "Helvetica Neue", Arial, sans-serif`;

  // Clears a canvas plane (to bg, or see-through when bg is null) and sets it
  // to draw squeezed by 1/stretch, so text keeps its own shape on the plane.
  // Returns the 2D context and the drawable size, or null with no canvas.
  function begin(plane, stretch, bg) {
    const c = plane && plane.userData.canvas;
    if (!c) return null;
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.shadowBlur = 0;
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
    else g.clearRect(0, 0, c.width, c.height);
    g.setTransform(1 / stretch, 0, 0, 1, 0, 0);
    return { g, w: c.width * stretch, h: c.height };
  }

  // ── The readout: each channel's volts and mA, redrawn in update() ──
  //  Series: the + and − rails (red, blue); independent: CH1 and CH2 (red,
  //  amber). Volts on the left, the measured mA on the right, lit figures
  //  glowing on black glass.
  function drawPanel(panel, values, controls, m) {
    const d = begin(panel, STRETCH, '#06080b');
    if (!d) return;
    const { g, w, h } = d;
    const mA = n => (Number.isFinite(n) ? n.toFixed(1) : '---');
    const v  = n => (Number(n) || 0).toFixed(1);
    const rows = independent(controls)
      ? [{ tag: 'CH1', volts: v(values.voltage),  amps: mA(m.posAmps), colour: '#ff4a3d' },
         { tag: 'CH2', volts: v(values.voltage2), amps: mA(m.negAmps), colour: '#ffad2e' }]
      : [{ tag: '', volts: '+' + v(values.voltage), amps: mA(m.posAmps), colour: '#ff4a3d' },
         { tag: '', volts: '−' + v(values.voltage), amps: mA(m.negAmps), colour: '#38b6ff' }];

    // One size for both rows: as big as the widest row fits (figures at BIG,
    // units at 0.62 of it, a gap of 70 between volts and mA).
    const BIG = 150, left = 54, right = w - 54, tagW = 92;
    const width = row => {
      g.font = FONT(600, BIG);
      const figures = g.measureText(row.volts).width + g.measureText(row.amps).width;
      g.font = FONT(500, BIG * 0.62);
      return figures + g.measureText(' V').width + g.measureText(' mA').width + (row.tag ? tagW : 0) + 70;
    };
    const k = Math.min(1, ...rows.map(r => (right - left) / width(r)));
    rows.forEach((row, i) => {
      const y = ROWS[i] * h + BIG * k * 0.36;   // the text's baseline
      g.shadowColor = row.colour;
      g.shadowBlur = 22;
      g.fillStyle = row.colour;
      g.textBaseline = 'alphabetic';
      let x = left;
      if (row.tag) {
        g.font = FONT(600, 40);
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.globalAlpha = 0.75;
        g.fillText(row.tag, x, ROWS[i] * h);
        g.globalAlpha = 1;
        g.textBaseline = 'alphabetic';
        x += tagW;
      }
      g.textAlign = 'left';
      g.font = FONT(600, BIG * k);
      g.fillText(row.volts, x, y);
      x += g.measureText(row.volts).width;
      g.font = FONT(500, BIG * k * 0.62);
      g.fillText(' V', x, y);
      g.textAlign = 'right';
      g.fillText(' mA', right, y);
      const unit = g.measureText(' mA').width;
      g.font = FONT(600, BIG * k);
      g.fillText(row.amps, right - unit, y);
    });
    g.shadowBlur = 0;
    // A faint line between the rows, as on a two-channel meter
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(left, h * 0.5 - 2, right - left, 4);
    panel.userData.texture.needsUpdate = true;
  }

  // The mode key's label and colour: SERIES (graphite) or INDEP (amber).
  function drawButton(button, controls) {
    if (!button) return;
    const ind = independent(controls);
    button.material.color.setHex(ind ? KEY_INDEP : KEY_SERIES);
    const label = button.getObjectByName('mode-label');
    const d = begin(label, BTN_STRETCH, null);
    if (!d) return;
    const { g, w, h } = d;
    g.font = FONT(700, 66);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.fillText(ind ? 'INDEP' : 'SERIES', w / 2, h / 2 + 4, w - 16);
    label.userData.texture.needsUpdate = true;
  }

  // A plane with a canvas texture (null where there is no OffscreenCanvas).
  // It glows a little (its emissive map is the canvas), as a lit screen does.
  function canvasPlane(ctx, w, h, cw, ch, opts) {
    if (typeof OffscreenCanvas === 'undefined') return null;
    const THREE = ctx.THREE;
    const canvas = new OffscreenCanvas(cw, ch);
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    const screen = ctx.mat.surface(0xffffff, opts);
    screen.map = texture;
    screen.emissiveMap = texture;
    screen.emissive.setHex(0xffffff);
    screen.emissiveIntensity = 0.85;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screen);
    plane.userData.canvas = canvas;
    plane.userData.texture = texture;
    return plane;
  }

  // A rounded rectangle w × h, corner radius r, round the origin, on a Shape or Path.
  function roundRect(path, w, h, r) {
    const x = w / 2, y = h / 2;
    path.moveTo(-x + r, -y);
    path.lineTo(x - r, -y);
    path.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false);
    path.lineTo(x, y - r);
    path.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
    path.lineTo(-x + r, y);
    path.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false);
    path.lineTo(-x, -y + r);
    path.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false);
    return path;
  }

  // A flat frame facing +z: a w × h rounded rectangle with a (w − 2t) × (h − 2t)
  // window, `depth` deep from z = 0, its edges softly bevelled.
  function frameGeo(THREE, w, h, r, t, depth) {
    const shape = roundRect(new THREE.Shape(), w, h, r);
    shape.holes.push(roundRect(new THREE.Path(), w - 2 * t, h - 2 * t, Math.max(0.01, r - t * 0.8)));
    return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012,
                                              bevelSegments: 3, curveSegments: 8 });
  }

  // A knurled instrument knob facing +z: a skirt, a ribbed grip and a domed
  // cap with a pointer line; r its radius, t how far it stands out.
  function knob(ctx, r, t, hex) {
    const THREE = ctx.THREE;
    const g = new THREE.Group();
    const plastic = ctx.mat.surface(hex, { roughness: 0.36, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    g.add(new THREE.Mesh(ctx.lathe([[r * 1.14, 0], [r * 1.17, 0.01], [r * 1.16, t * 0.15], [r * 1.08, t * 0.2],
                                    [r * 0.98, t * 0.2]], 48), plastic));
    const RIBS = 72;
    const ribbed = new THREE.CylinderGeometry(r, r, t * 0.72, RIBS, 1, true);
    const pos = ribbed.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const k = (Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * RIBS) % 2) ? 1 : 0.95;
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
    ribbed.computeVertexNormals();
    const grip = new THREE.Mesh(ribbed, plastic);
    grip.position.y = t * 0.56;
    grip.castShadow = true;
    g.add(grip);
    const cap = new THREE.Mesh(ctx.lathe([[r * 0.99, 0], [r * 0.97, t * 0.05], [r * 0.86, t * 0.1], [r * 0.5, t * 0.13],
                                          [0, t * 0.14]], 48), plastic);
    cap.position.y = t * 0.92;
    g.add(cap);
    const line = new THREE.Mesh(new THREE.BoxGeometry(r * 0.09, 0.012, r * 0.5), ctx.mat.surface(0x4a4741, { roughness: 0.6 }));
    line.position.set(0, t * 1.04, -r * 0.5);
    g.add(line);
    g.rotation.x = Math.PI / 2;   // local +y out of the panel (+z); the pointer (−z) up
    return g;
  }

  // A banana-socket binding post facing +z: a coloured plastic collar round a
  // metal socket, its tip JACK_L in front of the panel.
  function jack(ctx, hex) {
    const THREE = ctx.THREE;
    const g = new THREE.Group();
    const R = JACK_R, L = JACK_L;
    const collar = new THREE.Mesh(ctx.lathe([[R * 1.25, 0], [R * 1.28, 0.014], [R * 1.25, 0.05], [R * 1.04, 0.064], [R, 0.08],
                                             [R, L - 0.035], [R * 0.95, L - 0.01], [R * 0.82, L], [R * 0.52, L],
                                             [R * 0.47, L - 0.012]], 40),
                                  ctx.mat.surface(hex, { roughness: 0.3, clearcoat: 0.65, clearcoatRoughness: 0.2 }));
    collar.castShadow = true;
    g.add(collar);
    g.add(new THREE.Mesh(ctx.lathe([[R * 0.47, L - 0.012], [R * 0.42, L - 0.02], [R * 0.42, L * 0.5], [0, L * 0.5]], 24),
                         ctx.mat.surface(0x8d8f93, { metalness: 0.9, roughness: 0.32 })));
    g.rotation.x = Math.PI / 2;
    return g;
  }

  // Printing on the front panel: a w × h see-through plane facing +z, drawn by
  // draw(g, at, s): at(x, y) is a panel point (x right, y up, from the plane's
  // centre) in canvas pixels and s the pixels per unit. Not in the ghost.
  function legend(ctx, w, h, draw) {
    const PX = 600;
    const mesh = ctx.print(w, h, (g, cw, ch) => draw(g, (x, y) => [cw / 2 + x * PX, ch / 2 - y * PX], PX), PX);
    mesh.rotation.x = 0;
    return mesh;
  }

  // Vent holes on a side panel: a grid of square holes, each dark with a
  // lit lower lip, on a see-through plane facing +z (turned onto the side).
  function vents(ctx, w, h, cols, rows) {
    return ctx.print(w, h, (g, cw, ch) => {
      const pitchX = cw / cols, pitchY = ch / rows, s = Math.min(pitchX, pitchY) * 0.62;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = (i + 0.5) * pitchX - s / 2, y = (j + 0.5) * pitchY - s / 2;
          g.fillStyle = 'rgba(255,255,255,0.55)';
          g.fillRect(x, y + s * 0.12, s, s);
          g.fillStyle = '#1b1a18';
          g.fillRect(x, y, s, s);
          g.fillStyle = '#3a3834';
          g.fillRect(x, y + s * 0.55, s, s * 0.45);
        }
      }
    }, 400);
  }

  // ── The model: an off-white bench supply. On its front panel, framed by
  //  the case's lip: the two-row screen (upper left), a LIMIT light beside
  //  each row, a VOLTAGE and a CURRENT knob and the mode key down the right,
  //  and the four binding posts along the bottom. Vents on both sides. ──
  function build(ctx, values, controls) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const at = (o, x, y, z) => { o.position.set(x, y, z); group.add(o); return o; };

    // The shell, its front panel and the lip framing it
    const shell = at(new THREE.Mesh(ctx.roundBox(W, H, D, 0.1),
                                    ctx.mat.surface(CASE, { roughness: 0.5, clearcoat: 0.1, clearcoatRoughness: 0.5, envMapIntensity: 0.1 })),
                     0, MID, FRONT - D / 2);
    shell.castShadow = true;
    shell.receiveShadow = true;
    at(new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, H - 0.12, 0.02), ctx.mat.surface(FACE, { roughness: 0.5, clearcoat: 0.2 })),
       0, MID, FRONT);
    at(new THREE.Mesh(frameGeo(THREE, W + 0.012, H + 0.012, 0.11, 0.086, 0.05),
                      ctx.mat.surface(LIP, { roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.35 })),
       0, MID, FRONT - 0.03);

    // Rubber feet
    const rubber = ctx.mat.surface(0x1e1e1f, { roughness: 0.85 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, FOOT, 20), rubber), sx * (W / 2 - 0.28), FOOT / 2,
           FRONT - D / 2 + sz * (D / 2 - 0.26));
      }
    }

    // The screen: black glass in a light grey bezel; the readout is drawn on it
    at(new THREE.Mesh(ctx.roundBox(SCREEN_W + 0.1, SCREEN_H + 0.1, 0.05, 0.022),
                      ctx.mat.surface(0x96928b, { roughness: 0.4, clearcoat: 0.4 })),
       SCREEN_X, SCREEN_Y, PANEL + 0.005);
    const panel = canvasPlane(ctx, SCREEN_W, SCREEN_H, CANVAS_W, CANVAS_H,
                              { roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06 });
    if (panel) {
      at(panel, SCREEN_X, SCREEN_Y, PANEL + 0.036);
      panel.name = 'readout';
      drawPanel(panel, values, controls, {});
    }

    // A LIMIT light beside each screen row: dark until that channel (series:
    // that rail) is over its limit
    const bezel = ctx.mat.surface(0xb9bcc1, { metalness: 0.85, roughness: 0.3 });
    for (const [name, k] of [['limit-light', 0], ['limit-light-2', 1]]) {
      const ring = at(new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.068, 0.03, 28), bezel), 0.53, rowY(k), PANEL + 0.008);
      ring.rotation.x = Math.PI / 2;
      const light = at(new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
                                      ctx.mat.surface(0x4a0d0d, { roughness: 0.25, clearcoat: 0.8 })),
                       0.53, rowY(k), PANEL + 0.02);
      light.rotation.x = Math.PI / 2;
      light.material.emissive.setHex(0xff2222);
      light.material.emissiveIntensity = 0;
      light.name = name;
    }

    // The controls column: a slightly raised plate, the two knobs
    at(new THREE.Mesh(ctx.roundBox(0.64, 1.25, 0.012, 0.005), ctx.mat.surface(0xb6b4af, { roughness: 0.5, clearcoat: 0.2 })),
       COL_X, 0.815, PANEL);
    for (const y of KNOB_Y) at(knob(ctx, 0.14, 0.16, 0xb6b4af), COL_X, y, PANEL + 0.006);

    // The mode key under them: a click flips SERIES / INDEP (the mode
    // control's click gesture, only on this mesh: userData.clickTarget)
    const button = at(new THREE.Mesh(ctx.roundBox(BTN_W, BTN_H, 0.07, 0.035),
                                     ctx.mat.surface(KEY_SERIES, { roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25 })),
                      COL_X, BTN_Y, PANEL + 0.03);
    button.name = 'mode-button';
    button.userData.clickTarget = true;
    const label = canvasPlane(ctx, BTN_W * 0.92, BTN_H * 0.8, BTN_CANVAS_W, BTN_CANVAS_H, { roughness: 0.4, transparent: true });
    if (label) {
      label.material.emissiveIntensity = 0.5;
      label.position.z = 0.036;
      label.name = 'mode-label';
      button.add(label);
    }
    drawButton(button, controls);

    // The binding posts
    for (const [x, hex] of Object.values(POSTS)) at(jack(ctx, hex), x, POST_Y, PANEL);

    if (!ctx.ghost) {
      // The panel's printing: what each knob, light, key and post is
      at(legend(ctx, W - 0.2, H - 0.2, (g, p, s) => {
        const text = (t, x, y, size, weight) => {
          g.font = FONT(weight || 600, size * s);
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = INK;
          g.fillText(t, ...p(x, y - MID));
        };
        text('VOLTAGE', COL_X, KNOB_Y[0] + 0.215, 0.05);
        text('CURRENT', COL_X, KNOB_Y[1] + 0.2, 0.05);
        text('MODE', COL_X, BTN_Y + 0.11, 0.045);
        text('LIMIT', 0.53, 1.38, 0.042);
        for (const [x, , name] of Object.values(POSTS)) text(name, x, 0.565, name.length > 1 ? 0.05 : 0.08, 700);
      }), 0, MID, PANEL + 0.008);

      // Vents on both sides, square holes in a grid
      for (const side of [-1, 1]) {
        const v = vents(ctx, 1.1, 0.56, 10, 5);
        v.rotation.set(0, side * Math.PI / 2, 0);
        at(v, side * (W / 2 + 0.002), MID + 0.12, FRONT - D * 0.48);
      }
    }

    return {
      group,
      pinPositions: ['pos', 'com', 'neg', 'com2'].map(k => new THREE.Vector3(POSTS[k][0], POST_Y, PANEL + JACK_L + 0.03)),   // pin order
    };
  }

  // Readings after a run; {} (and r null) on Stop puts LIMIT out. With no
  // run, draws from the part's own values and controls (a mode flip).
  function update(obj, m, r) {
    const group = obj && obj.group;
    if (!group) return;
    m = m || {};
    for (const [name, over] of [['limit-light', !!m.posOver], ['limit-light-2', !!m.negOver]]) {
      const light = group.getObjectByName(name);
      if (!light) continue;
      if (over) light.material.emissive.setHex(0xff2222);
      light.material.emissiveIntensity = over ? LIGHT_ON : 0;
    }
    const values   = (r ? r.values : obj.values) || {};
    const controls = r ? r.controls : obj.controls;
    drawPanel(group.getObjectByName('readout'), values, controls, m);
    drawButton(group.getObjectByName('mode-button'), controls);
  }


  // Each rail's current in mA, as a positive magnitude. The + rail is CH1
  // and the − rail is CH2 (V 'neg'); independent, CH2 has its own limit2.
  function measure(r) {
    const posAmps = Math.abs(r.current.pos || 0);
    const negAmps = Math.abs(r.current.neg || 0);
    const cap  = r.values.limit * 1000;
    const cap2 = (independent(r.controls) ? r.values.limit2 : r.values.limit) * 1000;
    return { posAmps, negAmps, posOver: posAmps > cap, negOver: negAmps > cap2 };
  }

  const amps = mA => String(Number((mA / 1000).toPrecision(2)));
  const overLine = (what, mA, limit) =>
    `${what} would current-limit: the load wants ${amps(mA)} A, limit ${String(limit)} A`;

  function warnings(r, m) {
    const out = [];
    const ind = independent(r.controls);
    if (m.posOver) out.push(overLine(ind ? 'CH1' : '+ rail', m.posAmps, r.values.limit));
    if (m.negOver) out.push(overLine(ind ? 'CH2' : '− rail', m.negAmps, ind ? r.values.limit2 : r.values.limit));
    return out;
  }

  const volts    = n => Number(Number(n).toPrecision(4));
  const setVolts = r => volts(r.values.voltage);

  function headline(r, m) {
    const head = `Bench supply ${number(r.label)}: `;
    const mA = n => `${n.toFixed(1)} mA`;
    if (independent(r.controls)) {
      return { text: head + `INDEP · CH1 ${setVolts(r)}V · CH2 ${volts(r.values.voltage2)}V` +
                     (m.posAmps === undefined ? '' : ` · CH1 ${mA(m.posAmps)} · CH2 ${mA(m.negAmps)}`),
               cls: 'sim-info' };
    }
    return { text: head + `SERIES ±${setVolts(r)}V` +
                   (m.posAmps === undefined ? '' : ` · + ${mA(m.posAmps)} · − ${mA(m.negAmps)}`),
             cls: 'sim-info' };
  }

  // Series: both rails track voltage and com2 rides on com. Independent:
  // two channels; CH2 names neg as the ground of its own circuit.
  function elements(v, c) {
    if (independent(c)) {
      return [{ kind: 'V', id: 'pos', pins: ['pos', 'com'],  volts: v.voltage },
              { kind: 'V', id: 'neg', pins: ['com2', 'neg'], volts: v.voltage2, ref: 'neg' }];
    }
    return [{ kind: 'V',  id: 'pos',  pins: ['pos', 'com'],  volts: v.voltage },
            { kind: 'V',  id: 'neg',  pins: ['com', 'neg'],  volts: v.voltage },
            { kind: 'SW', id: 'link', pins: ['com', 'com2'], closed: true }];
  }
  const number = label => String(label || '').replace(/^\D+/, '');

  // What Readings.part reports, by pin name, not pin order: series V is
  // pos − neg; independent, V is CH1's and channels has both. P sums
  // each V element's V × its own current (W), null if one is missing.
  function reading(r) {
    const across = (a, b) => (typeof r.pins[a] === 'number' && typeof r.pins[b] === 'number' ? r.pins[a] - r.pins[b] : null);
    let P = 0;
    for (const el of elements(r.values, r.controls).filter(e => e.kind === 'V')) {
      const v = across(el.pins[0], el.pins[1]), i = r.current[el.id];
      P = P !== null && v !== null && typeof i === 'number' ? P + v * i / 1000 : null;
    }
    if (!independent(r.controls)) return { V: across('pos', 'neg'), P };
    return { V: across('pos', 'com'), P,
             channels: [{ name: 'CH1', V: across('pos', 'com') }, { name: 'CH2', V: across('com2', 'neg') }] };
  }

  return {
    type:     'bench_supply',
    name:     'Bench supply',
    sub:      '±0–30V · current limit',
    category: 'Sources',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="22" height="16" rx="2" ' +
              'fill="currentColor" fill-opacity="0.1"/><rect x="3" y="6" width="22" height="16" rx="2"/>' +
              '<rect x="6" y="9" width="11" height="5" rx="1"/><circle cx="21" cy="11.5" r="1.3"/>' +
              '<circle cx="8" cy="18" r="1.3"/><circle cx="14" cy="18" r="1.3"/><circle cx="20" cy="18" r="1.3"/></svg>',
    prefix:   'PS',
    pins:     ['pos', 'com', 'neg', 'com2'],
    ref:      'com',
    place:    { kind: 'offboard' },
    // Wires from the posts (#133): CH1 + red, CH1 − black, CH2 + white, CH2 − blue
    wireColors: { pos: 0xef4444, com: 0x000000, com2: 0xffffff, neg: 0x2563eb },
    values:   {
      voltage: { unit: 'V', default: 12,  min: 0,     max: 30 },
      limit:   { unit: 'A', default: 0.5, min: 0.001, max: 3 },
      // CH2, used only when independent; kept from the AI (#124), greyed
      // in the inspector in series (#127)
      voltage2: { unit: 'V', default: 12,  min: 0,     max: 30, ai: false, activeWhen: { mode: 'independent', note: 'tracks CH1' } },
      limit2:   { unit: 'A', default: 0.5, min: 0.001, max: 3,  ai: false, activeWhen: { mode: 'independent', note: 'tracks CH1' } },
    },
    controls: {
      mode: { type: 'choice', options: ['series', 'independent'], default: 'series', saved: true,
              ai: false, clickAnytime: true },
    },
    gestures: { click: 'mode' },   // only on the mode button (its userData.clickTarget)

    elements,
    measure,
    warnings,
    report:   (r, m) => (independent(r.controls)
      ? `independent supply, CH1 ${setVolts(r)} V ${m.posAmps.toFixed(1)} mA, CH2 ${volts(r.values.voltage2)} V ${m.negAmps.toFixed(1)} mA`
      : `±${setVolts(r)} V supply, + rail ${m.posAmps.toFixed(1)} mA, − rail ${m.negAmps.toFixed(1)} mA`),
    headline,
    reading,

    ai: {
      about:    'A bench power supply beside the board: + (PS1.0), COM (PS1.1) and − (PS1.2) terminals, ' +
                '12 V unless given a voltage, with a current limit.',
      keywords: ['bench supply', 'power supply', 'lab supply', 'dual supply', '±12', 'current limit'],
      guide:    'Wire PS1.0 (+) to tp_N (red) and PS1.1 (COM = ground) to tn_N (black). One rail: use only + and ' +
                'COM; leave PS1.2 unwired. For ± rails also wire PS1.2 (−) to bn_N; a − side LED has its anode ' +
                'toward COM (tn) and its cathode toward − (bn). Never wire two terminals straight together. ' +
                'The current limit only warns; it does not hold the current.',
      recipe:   {
        name:  '±12 V (both rails): an LED and 1 kΩ from + to COM, and another from COM to −, its anode toward COM',
        parts: [{ type: 'bench_supply', label: 'PS1', values: { voltage: 12 } },
                { type: 'resistor', label: 'R1', holes: ['b2', 'b6'], values: { resistance: 1000 } },
                { type: 'led', label: 'LED1', holes: ['c8', 'c6'] },        // cathode c8, anode c6 (toward +)
                { type: 'resistor', label: 'R2', holes: ['g10', 'g14'], values: { resistance: 1000 } },
                { type: 'led', label: 'LED2', holes: ['h16', 'h14'] }],     // cathode h16 (toward −), anode h14 (toward COM)
        wires: [['PS1.0', 'tp_63'], ['PS1.1', 'tn_63'], ['PS1.2', 'bn_63'],
                ['tp_3', 'a2'], ['a8', 'tn_8'],
                ['tn_10', 'f10'], ['j16', 'bn_16']],
        expect: { LED1: { on: true, current: [9.9, 10.1] },
                  LED2: { on: true, current: [9.9, 10.1] },
                  PS1:  { posAmps: [9.9, 10.1], negAmps: [9.9, 10.1], posOver: false, negOver: false } },
      },
    },

    view: { build, update },

    examples: [
      {
        name:  '+12 V across 1 kΩ supplies 12 mA',
        parts: [{ type: 'bench_supply', label: 'PS1' },
                { type: 'resistor', label: 'R1', holes: ['a10', 'a14'], values: { resistance: 1000 } }],
        wires: [['PS1.0', 'tp_50'], ['PS1.1', 'tn_50'], ['tp_9', 'b10'], ['b14', 'tn_15']],
        expect: { PS1: { posAmps: [11.95, 12.05], posOver: false, negOver: false } },
      },
      {
        name:  '+12 V across 100 Ω wants 120 mA, over a 0.05 A limit',
        parts: [{ type: 'bench_supply', label: 'PS1', values: { limit: 0.05 } },
                { type: 'resistor', label: 'R1', holes: ['a10', 'a14'], values: { resistance: 100 } }],
        wires: [['PS1.0', 'tp_50'], ['PS1.1', 'tn_50'], ['tp_9', 'b10'], ['b14', 'tn_15']],
        expect: { PS1: { posAmps: [119.9, 120.1], posOver: true } },
      },
    ],
  };
});
