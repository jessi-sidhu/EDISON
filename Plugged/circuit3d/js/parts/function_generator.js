// ─────────────────────────────────────────────────────────────
//  parts/function_generator.js — the function generator (issue #120).
//  The rules are docs/API-CONTRACT.md → "Part file contract" and
//  "Pattern: off-board wave source".
//
//  Off the board, two terminals: 'out' (FG1.0) and 'com' (FG1.1, the
//  ref: ground). One V with a sine wave (offset + amplitude·sin(2π·f·t))
//  from an internal node '#src' to COM, behind 50 Ω to OUT, a real
//  generator's output resistance. The clock (#119) steps the wave; a
//  plain solve reads the offset.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build / view.update) runs only in the browser and draws
//  through ctx. The panel is an OffscreenCanvas texture.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./function_generator.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  const R_OUT = 50;                   // Ω, the output resistance

  // The case: W × H × D on FOOT-high rubber feet, its front panel's face at
  // z = PANEL. The case sits behind the group's origin so the jacks' tips
  // come out near the top rails' rows: a wire from a jack to tp or tn runs
  // in front of the panel until it is past the case (app wires are arcs).
  const W = 2.7, H = 1.35, D = 1.65, FOOT = 0.06;
  const FRONT = 0.05, PANEL = FRONT + 0.01;
  const MID = FOOT + H / 2;           // the case's centre height

  const CASE = 0x7e7c78;             // off-white enamel (the shell takes little of the studio's overhead softbox, or its top burns out)
  const FACE = 0xb1afaa;             // the front panel, lit less by the sun than the top
  const LIP  = 0xa6a49f;             // the case's lip round the front panel
  const INK  = '#4f4b45';            // printing on the panel

  // The screen, upper left of the front panel, and its canvas (power-of-two
  // sizes, so r128 never has to resize an OffscreenCanvas).
  const SCREEN_W = 1.46, SCREEN_H = 0.6, SCREEN_X = -0.4, SCREEN_Y = 0.93;
  const CANVAS_W = 1024, CANVAS_H = 512;
  const STRETCH = (SCREEN_W / SCREEN_H) / (CANVAS_W / CANVAS_H);   // the canvas is drawn this much wider on the screen

  // The jacks along the bottom right, OUT (red) then COM (black); a wire
  // attaches at a jack's tip. The wave keys sit bottom left.
  const JACK_Y = 0.33, JACK_R = 0.12, JACK_L = 0.26;
  const JACKS = [[0.3, 0xc8261d], [0.78, 0x1d1d20]];   // out, com
  const KNOB = [0.83, 0.97, 0.22];                     // the big knob: x, y, radius

  const LCD = '#56c8ff';             // the screen's trace and figures

  const num  = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  // 1 → "1.0", 0.5 → "0.5", 0.25 → "0.25", 12.5 → "12.5"
  const hz   = f => (f >= 1 ? f.toFixed(1) : String(Number(f.toPrecision(2))));
  const sv   = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + ' V';   // signed volts, a real minus
  const sine = v => `${Number(v.amplitude).toFixed(2)} Vp`;

  // The panel's first row, kept in userData.text: "SINE 1.00 Vp · 1.0 Hz".
  const panelText = v => `SINE ${sine(v)} · ${hz(Number(v.frequency))} Hz`;

  const FONT = (weight, px) => `${weight} ${Math.round(px)}px "Helvetica Neue", Arial, sans-serif`;
  const signed = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);

  // ── The panel: the set sine as a trace on a faint graticule (left), and
  //  its figures (right): amplitude, frequency, then the present output
  //  while running (OUT, amber, marked on the trace's right edge) or the
  //  offset otherwise. Drawn squeezed by 1/STRETCH. ──
  function drawPanel(panel, values, vout) {
    const c = panel && panel.userData.canvas;
    if (!c) return;
    const top = panelText(values);
    const g = c.getContext('2d');
    const w = CANVAS_W * STRETCH, h = CANVAS_H;   // the drawable size, in drawn units
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.shadowBlur = 0;
    g.fillStyle = '#05080b';
    g.fillRect(0, 0, c.width, c.height);
    g.setTransform(1 / STRETCH, 0, 0, 1, 0, 0);

    // The graticule
    const x0 = w * 0.05, x1 = w * 0.47, y0 = h * 0.12, y1 = h * 0.88, ym = (y0 + y1) / 2;
    g.fillStyle = 'rgba(86,200,255,0.12)';
    for (let i = 0; i <= 4; i++) g.fillRect(x0 + (x1 - x0) * i / 4 - 1, y0, 2, y1 - y0);
    for (let j = 0; j <= 4; j++) g.fillRect(x0, y0 + (y1 - y0) * j / 4 - 1, x1 - x0, 2);

    // The trace, scaled to fill the window: offset ± amplitude, 0 V marked
    const amp = Math.abs(Number(values.amplitude) || 0), off = Number(values.offset) || 0;
    const span = Math.max(Math.abs(off) + amp, 1e-6);
    const yOf = v => ym - v * ((y1 - y0) / 2 * 0.86) / span;
    g.fillStyle = 'rgba(86,200,255,0.4)';
    g.fillRect(x0, yOf(0) - 2, x1 - x0, 4);
    g.strokeStyle = LCD;
    g.lineWidth = 7;
    g.lineJoin = 'round';
    g.shadowColor = LCD;
    g.shadowBlur = 16;
    g.beginPath();
    for (let i = 0; i <= 96; i++) {
      const t = i / 96;
      const x = x0 + (x1 - x0) * t, y = yOf(off - amp * Math.cos(2 * Math.PI * 1.25 * t));
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
    if (vout !== null) {
      g.fillStyle = '#ffc94d';
      g.shadowColor = '#ffc94d';
      g.beginPath();
      g.arc(x1, Math.min(y1, Math.max(y0, yOf(vout))), 14, 0, Math.PI * 2);
      g.fill();
    }
    g.shadowBlur = 0;
    g.font = FONT(600, 38);
    g.fillStyle = LCD;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText('SINE', x0 + 10, y0 + 8);

    // The figures, values right-aligned to the units' column
    const rows = [[Number(values.amplitude).toFixed(2), 'Vp', '', LCD],
                  [hz(Number(values.frequency)), 'Hz', '', LCD],
                  vout === null ? [signed(off), 'V', 'OFFSET', LCD] : [signed(vout), 'V', 'OUT', '#ffc94d']];
    const unitX = w * 0.84, left = w * 0.5, TAG = 30;
    const tagW = tag => { g.font = FONT(600, TAG); return tag ? g.measureText(tag).width + 20 : 0; };
    const k = Math.min(1, ...rows.map(([v, , tag]) => {
      const room = unitX - 16 - left - tagW(tag);
      g.font = FONT(600, 104);
      return room / g.measureText(v).width;
    }));
    rows.forEach(([value, unit, tag, colour], i) => {
      const y = h * (0.24 + i * 0.29) + 104 * k * 0.36;   // the row's baseline
      g.fillStyle = colour;
      g.shadowColor = colour;
      g.shadowBlur = 18;
      g.textBaseline = 'alphabetic';
      g.textAlign = 'right';
      g.font = FONT(600, 104 * k);
      g.fillText(value, unitX - 16, y);
      g.textAlign = 'left';
      g.font = FONT(600, 76 * k);
      g.fillText(unit, unitX, y);
      if (tag) {
        g.shadowBlur = 0;
        g.globalAlpha = 0.8;
        g.font = FONT(600, TAG);
        g.fillText(tag, left, y - 104 * k * 0.36 + TAG * 0.36);
        g.globalAlpha = 1;
      }
    });
    g.shadowBlur = 0;
    panel.userData.text = top;
    panel.userData.texture.needsUpdate = true;
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
    g.add(new THREE.Mesh(ctx.lathe([[r * 1.12, 0], [r * 1.15, 0.01], [r * 1.14, t * 0.12], [r * 1.06, t * 0.16],
                                    [r * 0.98, t * 0.16]], 48), plastic));
    const RIBS = 96;
    const ribbed = new THREE.CylinderGeometry(r, r, t * 0.76, RIBS, 1, true);
    const pos = ribbed.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const k = (Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * RIBS) % 2) ? 1 : 0.965;
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
    ribbed.computeVertexNormals();
    const grip = new THREE.Mesh(ribbed, plastic);
    grip.position.y = t * 0.54;
    grip.castShadow = true;
    g.add(grip);
    const cap = new THREE.Mesh(ctx.lathe([[r * 0.99, 0], [r * 0.97, t * 0.04], [r * 0.86, t * 0.08], [r * 0.5, t * 0.1],
                                          [0, t * 0.105]], 48), plastic);
    cap.position.y = t * 0.92;
    g.add(cap);
    g.rotation.x = Math.PI / 2;   // local +y out of the panel (+z)
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

  // Printing: a w × h see-through plane facing +z, drawn by draw(g, at, s):
  // at(x, y) is a point (x right, y up, from the plane's centre) in canvas
  // pixels and s the pixels per unit. Not in the ghost.
  function legend(ctx, w, h, draw) {
    const PX = 600;
    const mesh = ctx.print(w, h, (g, cw, ch) => draw(g, (x, y) => [cw / 2 + x * PX, ch / 2 - y * PX], PX), PX);
    mesh.rotation.x = 0;
    return mesh;
  }

  // Vent slots on a side panel: cols × rows horizontal slots, each dark with a
  // lit lower lip, on a see-through plane facing +z (turned onto the side).
  function vents(ctx, w, h, cols, rows) {
    return ctx.print(w, h, (g, cw, ch) => {
      const pitchX = cw / cols, pitchY = ch / rows, sw = pitchX * 0.86, sh = pitchY * 0.5;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = (i + 0.5) * pitchX - sw / 2, y = (j + 0.5) * pitchY - sh / 2;
          g.fillStyle = 'rgba(255,255,255,0.55)';
          g.fillRect(x, y + sh * 0.2, sw, sh);
          g.fillStyle = '#1b1a18';
          g.fillRect(x, y, sw, sh);
          g.fillStyle = '#3a3834';
          g.fillRect(x, y + sh * 0.55, sw, sh * 0.45);
        }
      }
    }, 400);
  }

  // ── The model: an off-white bench box. On its front panel, framed by the
  //  case's lip: the screen in a dark bezel (upper left), the big knob
  //  (right), the sine and square keys (bottom left) and the OUT and COM
  //  jacks (bottom right). Vent slots on both sides. ──
  function build(ctx, values) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const at = (o, x, y, z) => { o.position.set(x, y, z); group.add(o); return o; };

    // The shell, its front panel and the lip framing it
    const shell = at(new THREE.Mesh(ctx.roundBox(W, H, D, 0.12),
                                    ctx.mat.surface(CASE, { roughness: 0.5, clearcoat: 0.1, clearcoatRoughness: 0.5, envMapIntensity: 0.1 })),
                     0, MID, FRONT - D / 2);
    shell.castShadow = true;
    shell.receiveShadow = true;
    at(new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, H - 0.12, 0.02), ctx.mat.surface(FACE, { roughness: 0.5, clearcoat: 0.2 })),
       0, MID, FRONT);
    at(new THREE.Mesh(frameGeo(THREE, W + 0.012, H + 0.012, 0.13, 0.08, 0.05),
                      ctx.mat.surface(LIP, { roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.35 })),
       0, MID, FRONT - 0.03);

    // Rubber feet
    const rubber = ctx.mat.surface(0x1e1e1f, { roughness: 0.85 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, FOOT, 20), rubber), sx * (W / 2 - 0.26), FOOT / 2,
           FRONT - D / 2 + sz * (D / 2 - 0.24));
      }
    }

    // The screen in its dark bezel; the panel is drawn on it
    at(new THREE.Mesh(ctx.roundBox(SCREEN_W + 0.13, SCREEN_H + 0.13, 0.05, 0.03),
                      ctx.mat.surface(0x1b1c1f, { roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 })),
       SCREEN_X, SCREEN_Y, PANEL + 0.005);
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(CANVAS_W, CANVAS_H);
      const texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = 4;
      const screen = ctx.mat.surface(0xffffff, { roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06 });
      screen.map = texture;
      screen.emissiveMap = texture;
      screen.emissive.setHex(0xffffff);
      screen.emissiveIntensity = 0.85;
      const panel = at(new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), screen), SCREEN_X, SCREEN_Y, PANEL + 0.034);
      panel.name = 'readout';
      panel.userData.canvas = canvas;
      panel.userData.texture = texture;
      drawPanel(panel, values || {}, null);
    }

    // The big knob
    at(knob(ctx, KNOB[2], 0.2, 0xb6b4af), KNOB[0], KNOB[1], PANEL);

    // The wave keys: sine (lit blue, the one it makes) and square
    const keys = [[-0.93, 0x2a73cf, 'sine'], [-0.6, 0x55595f, 'square']];
    for (const [x, hex, wave] of keys) {
      at(new THREE.Mesh(ctx.roundBox(0.26, 0.19, 0.07, 0.035),
                        ctx.mat.surface(hex, { roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 })),
         x, JACK_Y, PANEL + 0.03);
      if (ctx.ghost) continue;
      at(legend(ctx, 0.2, 0.13, (g, p, s) => {
        g.strokeStyle = '#f4f6f8';
        g.lineWidth = 0.014 * s;
        g.lineJoin = 'round';
        g.beginPath();
        if (wave === 'sine') {
          for (let i = 0; i <= 40; i++) {
            const t = i / 40, [px, py] = p(-0.07 + 0.14 * t, 0.035 * Math.sin(2 * Math.PI * t));
            if (i) g.lineTo(px, py);
            else g.moveTo(px, py);
          }
        } else {
          for (const [i, [x, y]] of [[-0.07, -0.035], [-0.07, 0.035], [0, 0.035], [0, -0.035], [0.07, -0.035], [0.07, 0.035]].entries()) {
            const [px, py] = p(x, y);
            if (i) g.lineTo(px, py);
            else g.moveTo(px, py);
          }
        }
        g.stroke();
      }), x, JACK_Y, PANEL + 0.066);
    }

    // The jacks
    for (const [x, hex] of JACKS) at(jack(ctx, hex), x, JACK_Y, PANEL);

    if (!ctx.ghost) {
      // The panel's printing: the jacks' names
      at(legend(ctx, W - 0.2, H - 0.2, (g, p, s) => {
        g.font = FONT(700, 0.07 * s);
        g.textBaseline = 'middle';
        g.fillStyle = INK;
        g.textAlign = 'right';
        g.fillText('OUT', ...p(JACKS[0][0] - JACK_R * 1.4, JACK_Y - MID));
        g.textAlign = 'center';
        g.fillText('COM', ...p(JACKS[1][0], JACK_Y + 0.195 - MID));
      }), 0, MID, PANEL + 0.003);

      // Vent slots on both sides
      for (const side of [-1, 1]) {
        const v = vents(ctx, 0.9, 0.62, 3, 8);
        v.rotation.set(0, side * Math.PI / 2, 0);
        at(v, side * (W / 2 + 0.002), MID + 0.05, FRONT - D * 0.5);
      }
    }

    return {
      group,
      pinPositions: JACKS.map(([x]) => new THREE.Vector3(x, JACK_Y, PANEL + JACK_L + 0.03)),   // out, com
    };
  }

  // Readings each frame; {} (and r null) on Stop shows the offset again.
  function update(obj, m, r) {
    const group = obj && obj.group;
    if (!group) return;
    const values = (r && r.values) || obj.values || {};
    drawPanel(group.getObjectByName('readout'), values, m && num(m.vout) !== null ? m.vout : null);
  }

  // The present output: V(out) − V(com), null when unconnected.
  function measure(r) {
    const out = num(r.pins.out), com = num(r.pins.com);
    return { vout: out === null || com === null ? null : out - com };
  }

  const setSine = r => `sine ${sine(r.values)} at ${hz(Number(r.values.frequency))} Hz`;
  const offsetText = r => (Number(r.values.offset) ? `, offset ${sv(Number(r.values.offset))}` : '');
  const number = label => String(label || '').replace(/^\D+/, '');

  return {
    type:     'function_generator',
    name:     'Function generator',
    sub:      'sine · 0–10 Vp · 0.1–100 Hz',
    category: 'Sources',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="22" height="16" rx="2" ' +
              'fill="currentColor" fill-opacity="0.1"/><rect x="3" y="6" width="22" height="16" rx="2"/>' +
              '<path d="M6 13c1.5-4 3-4 4.5 0s3 4 4.5 0"/><circle cx="20" cy="11" r="1.3"/>' +
              '<circle cx="10" cy="18.5" r="1.3"/><circle cx="18" cy="18.5" r="1.3"/></svg>',
    prefix:   'FG',
    pins:     ['out', 'com'],
    ref:      'com',
    place:    { kind: 'offboard' },
    values:   {
      amplitude: { unit: 'V',  default: 1, min: 0,   max: 10 },
      frequency: { unit: 'Hz', default: 1, min: 0.1, max: 100 },
      offset:    { unit: 'V',  default: 0, min: -10, max: 10 },
    },

    elements: v => [{ kind: 'V', id: 'src', pins: ['#src', 'com'], volts: v.offset,
                      wave: { kind: 'sine', amp: v.amplitude, freq: v.frequency, offset: v.offset } },
                    { kind: 'R', id: 'rout', pins: ['#src', 'out'], ohms: R_OUT }],
    measure,
    report:   (r, m) => `${setSine(r)}${offsetText(r)}, output now ${m.vout === null ? 'not connected' : sv(m.vout)}`,
    headline: (r, m) => ({
      text: `Function generator ${number(r.label)}: ${setSine(r)}${offsetText(r)}` +
            (num(m.vout) === null ? '' : ` · output ${sv(m.vout)}`),
      cls:  'sim-info',
    }),

    ai: {
      about:    'A function generator beside the board: a sine wave between OUT (FG1.0) and COM (FG1.1, ground), ' +
                'amplitude (peak V) around an offset, at a frequency in Hz, through 50 Ω.',
      keywords: ['sine', 'signal', 'wave', 'function generator', 'oscillate', 'fade', 'breathe'],
      listed:   'in-play',
      guide:    'Wire FG1.0 (OUT) to tp_N (red) and FG1.1 (COM = ground) to tn_N (black). The output swings ' +
                'offset ± amplitude. To fade or breathe an LED: amplitude 5, offset 5 (0–10 V, so the LED is never ' +
                'reversed), frequency 1, then a place_resistor of 470 Ω from tp to the anode of a place_led whose ' +
                'cathode goes to tn.',
      recipe:   {
        name:  'A breathing LED: the generator at 5 Vp, 5 V offset, 1 Hz (0–10 V) into 470 Ω and a red LED',
        parts: [{ type: 'function_generator', label: 'FG1', values: { amplitude: 5, offset: 5, frequency: 1 } },
                { type: 'resistor', label: 'R1', holes: ['b2', 'b6'], values: { resistance: 470 } },
                { type: 'led', label: 'LED1', holes: ['c8', 'c6'] }],       // cathode c8, anode c6 (toward OUT)
        wires: [['FG1.0', 'tp_63'], ['FG1.1', 'tn_63'], ['tp_3', 'a2'], ['a8', 'tn_8']],
        // A plain solve reads the offset: (5 − 2.0) / 520.1 = 5.8 mA.
        expect: { LED1: { on: true, current: [5.6, 6.0] }, FG1: { vout: [4.6, 4.8] } },
      },
    },

    view: { build, update },

    examples: [
      {
        name:  'A 1 Vp sine with a 2 V offset into 1 kΩ: a plain solve reads the offset through 50 Ω, 1.905 V',
        parts: [{ type: 'function_generator', label: 'FG1', values: { offset: 2 } },
                { type: 'resistor', label: 'R1', holes: ['a10', 'a14'], values: { resistance: 1000 } }],
        wires: [['FG1.0', 'tp_50'], ['FG1.1', 'tn_50'], ['tp_9', 'b10'], ['b14', 'tn_15']],
        expect: { FG1: { vout: [1.9, 1.91] } },
      },
    ],
  };
});
