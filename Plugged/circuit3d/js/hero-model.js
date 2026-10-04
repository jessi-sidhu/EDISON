// ─────────────────────────────────────────────────────────────
//  hero-model.js — viewer.html?mode=hero (issues #163 and #167, the
//  Edison landing): the breadboard as a glass sketch (ref 04), opaque on
//  the landing's black, turning slowly with dashed axis lines (Quindar);
//  the parts draw in as white line art, solidify into the shaded model,
//  and the LED lights. The stages go both ways, for a replay. Drawing
//  and board are one object: each mesh carries its edges as a child, and
//  the stages only fade materials and move the camera.
//
//  The pure half (stage order, &stage=, ink, anchors, easing) loads in
//  Node. The scene half, HeroModel.create(App, opts), runs only in the
//  browser, on the App that scene.js, breadboard.js and components.js
//  built.
//
//  LOADING
//  ───────
//  Browser: a <script> after components.js; defines window.HeroModel.
//  Node:    module.exports (the pure helpers; create needs a page).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const HeroModel = factory();
  if (typeof module === 'object' && module.exports) module.exports = HeroModel;
  if (root) root.HeroModel = HeroModel;
})(typeof window !== 'undefined' ? window : null, function () {

  const STAGES     = ['empty', 'lineart', 'solid', 'lit'];
  const INK        = 0xf4f4f4;   // the landing's foreground; &ink=#rrggbb overrides
  const BG         = 0x101010;   // the landing's black, which the hero paints (opaque)
  const RAIL_POS   = '#FF3D7F';  // the + rails' neon pink
  const RAIL_NEG   = '#3D7BFF';  // the − rails' neon blue
  const SKETCH_GLOW = '#B48CFF'; // the sketch's violet: the circuit paths, LED1's sketch glow, the under-glow (ref 07)
  const BUILD_STEPS = ['paths', 'parts', 'led', 'glass', 'underglow'];   // 'lineart''s build-up, in order (storyboard 03–07)
  const FADE_MS    = 1200;       // the 'solid' cross-fade
  const DRAW_MS    = 1200;       // the draw-in: the first part starts, the last is in
  const ITEM_MS    = 400;        // one part or wire fading in
  const OUT_MS     = 700;        // back to the bare board
  const STENCIL_MS = 600;        // first load: the outline alone (storyboard 01) …
  const GRID_MS    = 600;        // … then the rails and the hole grid fade up (02)
  const STEP_MS    = { paths: 500, led: 400, glass: 500, underglow: 700 };   // the build-up's other steps ('parts' is DRAW_MS)
  const GLOW_MS    = 250;        // the halo easing in
  const EDGE_ANGLE = 20;         // degrees: a crease at least this sharp is drawn
  const DOME_ANGLE = 8;          // an LED's dome, smooth, drawn as its facets: a wire dome, not a dark blot
  const BOARD_INK  = 0.7;        // the glass slab's edges
  const HOLE_INK   = 0.42;       // the hole pockets' rims
  const FAINT_INK  = 0.18;       // the channel, the pockets' floors
  const SKETCH_INK = 0.32;       // the construction lines below the board
  const BASE_INK   = 0.55;       // the base layer's edges
  const AXIS_INK   = 0.55;
  const GLASS      = 0.05;       // the glass slab's fill (1 = the board as built) …
  const GLASS_FULL = 0.1;        // … once the build-up's 'glass' step has thickened it
  const EDGE_UP    = 0.35;       // and its edges, that much brighter
  const UNDER      = 0.35;       // the under-glow at its most, in the middle
  const SOFT_BLOOM = 0.3;        // the share of the paths' and the under-glow's light that also goes into the bloom (all of it washes white)
  const LED_BLOOM  = 0.12;       // and of LED1's sketch glow, smaller: over its paths, more saturates it white
  const SKETCH_HALO = 0.15;      // LED1's sketch glow, a share of the frame's height across
  const BASE_T     = 0.5;        // the acrylic base layer under the board (ref 07), thick
  const GROUND_Y   = -1.6;       // the dashed ground rectangle under it
  const LIT_MA     = 14.9;       // LED1 in edison/demo/led.sparky: (9 − 2.0) / 470 (test/hero-model.test.js)
  const SPIN       = 0.6;        // OrbitControls.autoRotateSpeed: about 100 s a turn
  const FOV        = 26;         // narrow, so the turn reads nearly isometric
  const ELEVATION  = 36;         // degrees above the bench (isometric is 35.3)
  const ELEVATION_WIDE = 28;     // on a wide frame (from 2.5 : 1): lower, so the board turned end-on fits the height (ref 04 is about this)
  const AZIMUTH    = -20;        // degrees round from the front, at the start (the frame alone, at 'lineart')
  const AZIMUTH_EMPTY = 25;      // starting bare ('empty'): front right, the board on the diagonal as ref 04 has it
  const FILL       = 1;          // the bare board ('empty') inside the frame's inscribed ellipse at every turn, its ends at the turn's extremes in the faded rim
  const WIDE_FROM  = 2;          // aspect: from here a wide frame ('empty' under the landing's Ask box) frames the board's box instead, bigger
  const BOX_FILL   = 0.98;       // there, the box at every turn this far inside the frame's edges
  const PUSH       = 1.08;       // from 'lineart' on, the camera this much nearer than at 'empty': a gentle push-in, the board still whole
  const MARGIN     = 0.2;        // world units round the board's footprint
  const BLOOM      = 0.4;        // the bloom's strength on the glass ('empty', 'lineart'); none once solid
  const BLOOM_R    = 0.4;        // its radius
  const EDGE_GLOW  = 0.2;        // how much of the glass's edges goes into the bloom
  const GLOW_LAYER = 1;          // the objects that bloom (the neon and the glass's edges), drawn alone into the bloom
  const HALO       = 0.22;       // the lit LED's halo, a share of the frame's height across
  const END_ON     = 0.26;       // |cos| of the camera's turn under which the board is end-on (about 15°): casing hidden
  const LIGHT_SHARE = 0.25;      // of the LED light's built intensity: a warm spill round it; the halo carries the glow

  // '#101010' → 0x101010; anything else → null.
  const hexOf = s => (typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s) ? parseInt(s.slice(1), 16) : null);

  // The &ink= param: '#101010' → 0x101010; anything else → the default ink.
  function inkOf(param) {
    const hex = hexOf(param);
    return hex === null ? INK : hex;
  }

  // The &stage= param, from location.search (with or without the '?'):
  // 'empty' starts on the bare board; anything else on the line art.
  function startStage(search) {
    return new URLSearchParams(search || '').get('stage') === 'empty' ? 'empty' : 'lineart';
  }

  // A point the camera projected ({ x, y, z } in NDC) → { x, y, visible }:
  // x, y 0 … 1 of the frame from the top left, held inside it; visible
  // only inside the frame and in front of the camera.
  const unit = v => (v > 0 ? Math.min(1, v) : 0);   // NaN (a 0 × 0 frame) → 0
  function anchorOf(p) {
    return { x: unit((p.x + 1) / 2), y: unit((1 - p.y) / 2), visible: Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z <= 1 };
  }

  // The conductive strips a saved circuit ({ components, wires }) uses,
  // through its on-board parts' legs and its wires' hole ends (an end at a
  // part's pin, and an off-board part with no holes, touch nothing):
  // { strips: [{ col, half: 'top' | 'bottom' }], rails: [{ row, from, to }] },
  // columns 0-based as the file has them; each strip once, each rail row
  // once from its lowest touched column to its highest.
  function usedStrips(circuit) {
    const strips = new Map(), rails = new Map();
    const touch = h => {
      if (!h || typeof h.col !== 'number') return;
      const half = 'abcde'.includes(h.row) ? 'top' : 'fghij'.includes(h.row) ? 'bottom' : null;
      if (half && h.row.length === 1) strips.set(h.col + half, { col: h.col, half });
      else if (['tp', 'tn', 'bn', 'bp'].includes(h.row)) {
        const r = rails.get(h.row);
        rails.set(h.row, r ? { row: h.row, from: Math.min(r.from, h.col), to: Math.max(r.to, h.col) } : { row: h.row, from: h.col, to: h.col });
      }
    };
    for (const c of (circuit && circuit.components) || []) for (const h of c.holeRefs || []) touch(h);
    for (const w of (circuit && circuit.wires) || []) { touch(w.startHole); touch(w.endHole); }
    return { strips: [...strips.values()], rails: [...rails.values()] };
  }

  // 0 → 1, soft at both ends.
  const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

  // 'empty' 0, 'lineart' 1, 'solid' 2, 'lit' 3; -1 for anything else.
  const rank = name => STAGES.indexOf(name);

  // ── The scene half ─────────────────────────────────────────
  //  opts: { ink: '#rrggbb' | null, reduced: boolean (prefers-reduced-motion), stage: the first stage }
  //  Returns { board(bb), part(def, group, label), wire(group, onBoard), start(loading) → window.Hero }.
  function create(App, opts) {
    const THREE   = window.THREE;
    const G       = App.BOARD_GEOMETRY;
    const reduced = !!opts.reduced;
    const ink     = inkOf(opts.ink);
    const first   = opts.stage === 'empty' ? 'empty' : 'lineart';
    const pen     = alpha => new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: alpha });
    const dashes  = (alpha, dash, gap) => new THREE.LineDashedMaterial({ color: ink, transparent: true, opacity: alpha, dashSize: dash, gapSize: gap });
    // The board's line art, which fades as it solidifies: [material, full
    // ink, kind]. kind (also neon's): 'edge' brightens with the build-up's
    // glass, 'grid' comes up after the stencil, 'fill' follows the glass's
    // fill, a build-up step's name follows that step.
    const inks    = [[pen(BOARD_INK), BOARD_INK, 'edge'], [pen(HOLE_INK), HOLE_INK, 'grid'], [pen(FAINT_INK), FAINT_INK, 'grid'],
                     [dashes(SKETCH_INK, 0.2, 0.16), SKETCH_INK, ''], [pen(BASE_INK), BASE_INK, 'edge']];
    const [boardMat, holeMat, faintMat, sketchMat, baseMat] = inks.map(([m]) => m);
    const edgeGlowMat = pen(EDGE_GLOW);
    inks.push([edgeGlowMat, EDGE_GLOW, 'edge']);
    const axisMat = dashes(AXIS_INK, 0.32, 0.24);
    const neon    = [];          // the glass's own extras (rail glow, edge bleed, base fill, the sketch's violet): [material, full level, kind]
    // The levels the stages tween, 0 … 1 (besides k, the cross-fade to
    // solid): grid, the rails and hole grid over the stencil; the build-up's
    // paths, led (LED1's sketch glow), glass and underglow.
    const lv      = { grid: 1, paths: 0, led: 0, glass: 0, underglow: 0 };
    const built   = new Map();   // material → { was: its as-built draw state, hollow, glass }
    const items   = [];          // each part and wire: { group, mat, s (0 hidden … 1 drawn), order, sketch (drawn in the sketch; the battery isn't) }
    const framed  = [];          // the circuit on the board (the rail anchor sits beside it)
    const glows   = [];          // each LED: { def, group, dome, lamp, power, halo }
    const marks   = new Map();   // anchors() points, world space: name → { at: Vector3, item (a part's: hidden, not visible) }
    const probe   = new THREE.PerspectiveCamera(FOV, 1, 0.1, 300);   // frame()'s, so the real camera keeps its turn
    let spindle = null, k = 0, zoom = first === 'empty' ? 0 : 1, wide = null, aimed = false;
    let glowComposer = null, bloom = null, sized = false;   // the bloom (#174), once its scripts load and the frame has a size
    let glowQuad = null;         // the bloom, drawn over the scene in one full-screen quad
    let board = null;            // the breadboard, for the circuit's paths
    const casing = [-1, 1].map(s => new THREE.Vector3(0, 0, s * G.BOARD_D / 2));   // the glass board's long top edges' middles
    const glowing = o => { o.layers.enable(GLOW_LAYER); return o; };

    // An opaque frame on the landing's black: no bench, no drag (and no
    // damping, so nothing drifts on once the turn stops).
    App.scene.background = null;
    App.renderer.setClearColor(BG, 1);
    const ground = App.scene.getObjectByName('ground');
    if (ground) ground.visible = false;
    App.controls.enabled = false;
    App.controls.enableDamping = false;
    App.renderer.domElement.style.visibility = 'hidden';   // shown once the circuit is drawn and framed

    // Each material once, with the state 'solid' puts back. hollow: in line
    // art it hides no line (a wire's tube, drawn as its centre line, and the
    // glass board); glass: what it still shows in line art, 0 … 1.
    function note(mesh, hollow, glass) {
      for (const m of [].concat(mesh.material)) {
        if (!m || built.has(m)) continue;
        built.set(m, { hollow, glass, was: { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite,
          colorWrite: m.colorWrite, polygonOffset: m.polygonOffset,
          polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits } });
      }
    }

    // Lines draw after the solids (renderOrder), which in line art write
    // depth only, so a line behind a part stays hidden.
    function asEdges(line) {
      line.userData.heroRole = 'edges';
      line.renderOrder = 1;
      return line;
    }

    // Every mesh in a group gets its own edges as a child, in penOf(mesh)
    // (none if it gives none). A wire's tube draws as its centre line; the
    // board's holes (one instanced mesh) as pockets, drawn apart.
    function outline(group, penOf, hollow, glassOf) {
      const meshes = [];
      group.traverse(o => { if (o.isMesh) meshes.push(o); });
      for (const mesh of meshes) {
        const path = mesh.geometry.type === 'TubeGeometry' && mesh.geometry.parameters.path;
        note(mesh, hollow || !!path || mesh.isInstancedMesh, glassOf ? glassOf(mesh) : 0);
        const p = !mesh.isInstancedMesh && penOf(mesh);
        if (!p) continue;
        mesh.add(asEdges(path
          ? new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.getPoints(48)), p)
          : new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, mesh.userData.ledDome ? DOME_ANGLE : EDGE_ANGLE), p)));
      }
      mix(k);
    }

    // A lead to the battery (which isn't in the sketch) runs off the
    // board's edge: its line fades out along its length towards the
    // battery's end, the higher one.
    function fadeLead(group, mat) {
      group.traverse(o => {
        if (!o.isLine || o.isLineSegments || o.userData.heroRole !== 'edges') return;
        const pos = o.geometry.attributes.position, n = pos.count, rgba = [];
        const off = pos.getY(0) > pos.getY(n - 1) ? 0 : n - 1;
        for (let i = 0; i < n; i++) rgba.push(1, 1, 1, ease((Math.abs(i - off) / (n - 1) - 0.68) / 0.24));   // full near the hole, gone a third of the way along
        o.geometry.setAttribute('color', new THREE.Float32BufferAttribute(rgba, 4));
      });
      mat.vertexColors = true;
    }

    // ── The glass board (ref 04) ───────────────────────────────
    // The slab (body and lips) is glass: a faint fill and bright edges. The
    // channel draws faint; the printed top and the rail strips not at all
    // (the neon rails stand in for them).
    const box  = new THREE.Box3();
    const tall = mesh => !mesh.isInstancedMesh && box.setFromObject(mesh).max.y - box.min.y >= 0.05;
    const boardPen   = mesh => (tall(mesh) ? boardMat : mesh.name !== 'bb-top' && mesh.geometry.parameters.depth > 0.5 ? faintMat : null);
    const boardGlass = mesh => (tall(mesh) ? 1 : 0);   // 1: shows the glass's fill

    // A buffer of line segments: [[x, y, z], [x, y, z]] pairs.
    function segments(pairs, mat) {
      const v = [];
      for (const [a, b] of pairs) v.push(...a, ...b);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      return new THREE.LineSegments(g, mat);
    }

    // Each hole a square pocket in the glass: its rim at the top and a
    // smaller floor below, so the grid reads as depth.
    function pockets(bb) {
      const s = 0.07, f = 0.04, top = 0.012, floor = -0.14, rim = [], deep = [];
      const square = (x, z, h, y) => [[[x - h, y, z - h], [x + h, y, z - h]], [[x + h, y, z - h], [x + h, y, z + h]],
                                      [[x + h, y, z + h], [x - h, y, z + h]], [[x - h, y, z + h], [x - h, y, z - h]]];
      for (const h of bb.holeData) {
        rim.push(...square(h.x, h.z, s, top));
        deep.push(...square(h.x, h.z, f, floor));
      }
      const group = new THREE.Group();
      group.add(asEdges(segments(rim, holeMat)), asEdges(segments(deep, faintMat)));
      return group;
    }

    // A strip of glow, length × width, from a canvas gradient across it
    // ([stop, level, whiteness] triples) in a colour, added to what is
    // behind it.
    function glowStrip(length, width, color, profile, kind = 'grid') {
      const c = document.createElement('canvas');
      c.width = 4; c.height = 64;
      const g = c.getContext('2d'), fill = g.createLinearGradient(0, 0, 0, 64), rgb = new THREE.Color(color);
      const at = (a, white) => `rgba(${[rgb.r, rgb.g, rgb.b].map(v => Math.round(255 * (v + (1 - v) * white))).join(', ')}, ${a})`;
      for (const [stop, a, white] of profile) fill.addColorStop(stop, at(a, white || 0));
      g.fillStyle = fill;
      g.fillRect(0, 0, 4, 64);
      const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      neon.push([mat, 1, kind]);
      const strip = glowing(new THREE.Mesh(new THREE.PlaneGeometry(length, width), mat));
      strip.renderOrder = 0.5;   // after the parts' depth, so a part in front hides it
      return strip;
    }
    // A rail: a hot core in a narrow glow, fading out short of its neighbour.
    const RAIL = [[0, 0], [0.1, 0.04], [0.25, 0.14], [0.38, 0.3], [0.46, 0.55], [0.485, 0.7, 0.12], [0.5, 0.8, 0.35], [0.515, 0.7, 0.12], [0.54, 0.55], [0.62, 0.3], [0.75, 0.14], [0.9, 0.04], [1, 0]];
    // Its light spread on the glass round it, faint.
    const SPREAD = [[0, 0], [0.3, 0.05], [0.45, 0.12], [0.5, 0.14], [0.55, 0.12], [0.7, 0.05], [1, 0]];
    // The colour bleeding into the acrylic's edge: soft, no core.
    const BLEED = [[0, 0], [0.3, 0.12], [0.5, 0.28], [0.7, 0.12], [1, 0]];

    // The neon rails (+ pink outside the + row, − blue inside the − row, as
    // a real board's stripes run), a little inside the glass, and their
    // colour bleeding into the slab's edges: along the long sides by the +
    // rails, and down the ends where each rail runs out.
    function rails() {
      const group = new THREE.Group(), L = G.BOARD_W - 1.4, X = G.BOARD_W / 2 + 0.071, Z = G.BOARD_D / 2 + 0.071, T = G.BOARD_THICK;
      for (const row of G.RAIL_ROWS) {
        const pos = G.RAIL_IS_POS[row], color = pos ? RAIL_POS : RAIL_NEG;
        const out = Math.sign(G.ROW_Z[row]) * (pos ? 1 : -1);   // + outward, − inward
        const z = G.ROW_Z[row] + out * 0.24;
        const strip = glowStrip(L, 0.9, color, RAIL), spread = glowStrip(L, 1.8, color, SPREAD);
        strip.rotation.x = spread.rotation.x = -Math.PI / 2;
        strip.position.set(0, -0.02, z);
        spread.position.set(0, -0.03, z);
        const coreMat = new THREE.LineBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3),
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        neon.push([coreMat, 1, 'grid']);
        // The core stays a crisp line however far off; a + or − at each end.
        const sign = (x, h) => (pos ? [[[x - h, 0.01, z], [x + h, 0.01, z]], [[x, 0.01, z - h], [x, 0.01, z + h]]] : [[[x - h, 0.01, z], [x + h, 0.01, z]]]);
        const core = segments([[[-L / 2, -0.015, z], [L / 2, -0.015, z]], ...sign(-L / 2 - 0.3, 0.1), ...sign(L / 2 + 0.3, 0.1)], coreMat);
        core.renderOrder = 0.5;
        group.add(spread, strip, glowing(core));
        for (const s of [-1, 1]) {           // down each end face
          const end = glowStrip(T + 0.05, 0.3, color, BLEED);
          end.rotation.set(0, s * Math.PI / 2, Math.PI / 2);
          end.position.set(s * X, -T / 2, z);
          group.add(end);
        }
        if (pos) {                           // along the long side beside it
          const side = glowStrip(L, T * 0.9, color, BLEED.map(([stop, a]) => [stop, a / 2]));   // half: with the rail and the bloom it read as a thick band
          side.position.set(0, -T / 2, Math.sign(G.ROW_Z[row]) * Z);
          if (G.ROW_Z[row] < 0) side.rotation.y = Math.PI;
          group.add(side);
        }
      }
      marks.set('rail', { at: new THREE.Vector3(0, 0, G.ROW_Z.tp - 0.24) });   // moved near the circuit once it is placed
      return group;
    }

    // The acrylic base layer the board sits on (ref 07's material layers):
    // a second slab under it, a fainter fill and edges, so the glass reads
    // thick.
    const BASE_TOP = -G.BOARD_THICK - 0.08;
    function base() {
      const geo = new THREE.BoxGeometry(G.BOARD_W + 0.14, BASE_T, G.BOARD_D + 0.14);
      const fill = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: GLASS / 2, depthWrite: false });
      neon.push([fill, GLASS / 2, 'fill']);
      const slab = new THREE.Mesh(geo, fill);
      slab.position.y = BASE_TOP - BASE_T / 2;
      slab.renderOrder = -1;
      slab.add(asEdges(new THREE.LineSegments(new THREE.EdgesGeometry(geo), baseMat)));
      return slab;
    }

    // The exploded technical drawing: dashed lines from the base's bottom
    // corners down to a dashed ground rectangle, its sides run on past the
    // corners.
    function construction() {
      const X = G.BOARD_W / 2 + 0.07, Z = G.BOARD_D / 2 + 0.07, y = BASE_TOP - BASE_T, E = 1.2, pairs = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pairs.push([[sx * X, y, sz * Z], [sx * X, GROUND_Y, sz * Z]]);
      for (const sz of [-1, 1]) pairs.push([[-X - E, GROUND_Y, sz * Z], [X + E, GROUND_Y, sz * Z]]);
      for (const sx of [-1, 1]) pairs.push([[sx * X, GROUND_Y, -Z - E], [sx * X, GROUND_Y, Z + E]]);
      const lines = segments(pairs, sketchMat);
      lines.computeLineDistances();
      lines.userData.heroRole = 'sketch';
      return lines;
    }

    // The violet under-glow (storyboard 07): a soft light under the glass
    // base, seen through the board, into the bloom.
    function underglow() {
      const group = new THREE.Group(), map = roundTexture(SKETCH_GLOW, [[0, 1], [0.45, 0.75], [0.75, 0.35], [1, 0]]);
      for (const [into, level] of [[false, UNDER], [true, UNDER * SOFT_BLOOM]]) {   // the glow, and a dim copy only into the bloom
        const mat = new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
        neon.push([mat, level, 'underglow']);
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(G.BOARD_W * 1.25, G.BOARD_D * 2.2), mat);
        if (into) plane.layers.set(GLOW_LAYER);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = BASE_TOP - BASE_T - 0.06;
        plane.renderOrder = -2;   // under the glass, which draws over it
        group.add(plane);
      }
      return group;
    }

    // The circuit paths (storyboard 03): each conductive strip the circuit
    // uses, and each stretch of rail its wires join, a thin violet glow with
    // a crisp core, a little inside the glass, into the bloom.
    const PATH = [[0, 0], [0.15, 0.12], [0.3, 0.5], [0.42, 0.68], [0.5, 0.75], [0.58, 0.68], [0.7, 0.5], [0.85, 0.12], [1, 0]];   // like a rail's, all violet
    function paths(bb, used) {
      const group = new THREE.Group(), cores = [], y = -0.02, ends = 0.2;
      const coreMat = new THREE.LineBasicMaterial({ color: SKETCH_GLOW, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      neon.push([coreMat, 0.8, 'paths']);
      const run = (x0, z0, x1, z1) => {
        const holder = new THREE.Group(), strip = glowStrip(Math.hypot(x1 - x0, z1 - z0), 0.8, SKETCH_GLOW, PATH, 'paths');
        strip.layers.disable(GLOW_LAYER);   // all of it in the bloom washes it white: a dim copy goes instead
        const ghostMat = strip.material.clone(), ghost = new THREE.Mesh(strip.geometry, ghostMat);
        neon.push([ghostMat, SOFT_BLOOM, 'paths']);
        ghost.layers.set(GLOW_LAYER);
        holder.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
        holder.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
        strip.rotation.x = ghost.rotation.x = -Math.PI / 2;
        holder.add(strip, ghost);
        group.add(holder);
        cores.push([[x0, y + 0.005, z0], [x1, y + 0.005, z1]]);
      };
      for (const { col, half } of used.strips) {
        const [r0, r1] = half === 'top' ? ['a', 'e'] : ['f', 'j'], a = bb.getHole(col, r0), b = bb.getHole(col, r1);
        if (a && b) run(a.x, a.z - ends, b.x, b.z + ends);
      }
      for (const { row, from, to } of used.rails) {
        const a = bb.getHole(from, row), b = bb.getHole(to, row);
        if (a && b) run(a.x - ends, a.z, b.x + ends, b.z);
      }
      if (cores.length) {
        const core = glowing(segments(cores, coreMat));
        core.renderOrder = 0.5;
        group.add(core);
      }
      // anchors().path: the first strip, between its last two holes (clear
      // of the parts' legs near the rails).
      const s0 = used.strips[0];
      if (s0) {
        const a = bb.getHole(s0.col, s0.half === 'top' ? 'd' : 'f'), b = bb.getHole(s0.col, s0.half === 'top' ? 'e' : 'g');
        if (a && b) marks.set('path', { at: new THREE.Vector3(a.x, 0, (a.z + b.z) / 2), level: 'paths' });
      }
      return group;
    }

    // Dashed axes, out into the faded rim (Quindar); aim() keeps them on
    // the spin axis, so the upright one is the axis it turns on.
    function axes() {
      const y = -G.BOARD_THICK / 2, X = G.BOARD_W / 2 + 2, Z = G.BOARD_D / 2 + 4;
      const group = new THREE.Group();
      const ends = [[[-X, y, 0], [X, y, 0]], [[0, y, -Z], [0, y, Z]], [[0, -2.4, 0], [0, 5.4, 0]]];
      for (const [a, b] of ends) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]), axisMat);
        line.computeLineDistances();
        line.userData.heroRole = 'axis';
        line.renderOrder = 1;
        group.add(line);
      }
      return group;
    }

    // ── The stages' levels ─────────────────────────────────────
    // 0 line art … 1 solid. Line art: every solid writes depth only (the
    // board's not even that, being glass) but the glass's faint fill; the
    // edges and the glass's glow draw. Solid: every material back as built.
    function mix(v) {
      k = v;
      const fill = GLASS + (GLASS_FULL - GLASS) * lv.glass;
      for (const [m, { was, hollow, glass }] of built) {
        if (v >= 1) { Object.assign(m, was); continue; }
        const a = glass * fill + (1 - glass * fill) * v;
        m.transparent = true;
        m.opacity = was.opacity * a;
        m.colorWrite = a > 0;
        m.depthWrite = !hollow;
        m.polygonOffset = true;          // a line on a face, or a hair under it, still draws
        m.polygonOffsetFactor = 1;
        m.polygonOffsetUnits = 4;
      }
      const of = kind => (kind === 'edge' ? 1 + EDGE_UP * lv.glass : kind === 'fill' ? fill / GLASS : kind ? lv[kind] : 1);
      for (const [m, alpha, kind] of inks.concat(neon)) {
        m.opacity = Math.min(1, alpha * of(kind)) * (1 - v);
        m.visible = m.opacity > 0;
      }
      for (const item of items) paint(item);
      if (bloom) bloom.strength = BLOOM * (1 - v);
    }

    // A part or wire at its draw-in level: its edges' ink, and hidden at 0.
    // The battery is no part of the sketch: no edges, and it shows only
    // with the solid render.
    function paint(item) {
      const a = item.sketch ? item.s * (1 - k) : 0;
      item.mat.opacity = a;
      item.mat.visible = a > 0;
      item.group.visible = item.sketch ? item.s > 0 : k > 0;
    }

    // fn(0 … 1, by time) each frame for ms; fn(1) at once with reduced
    // motion, or while no one can see the frame (no size, or a hidden tab).
    function tween(ms, fn) {
      const wrap = App.renderer.domElement.parentElement;
      if (reduced || document.hidden || !wrap || !wrap.clientWidth || !wrap.clientHeight) { fn(1); return Promise.resolve(); }
      const t0 = performance.now();
      return new Promise(resolve => {
        const step = () => {
          const t = Math.min(1, (performance.now() - t0) / ms);
          fn(t);
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    }

    function fadeTo(target) {
      if (k === target) { mix(target); return Promise.resolve(); }
      const from = k;
      return tween(FADE_MS, t => mix(from + (target - from) * ease(t)));
    }

    // The parts and wires to 1 (drawn) or 0 (gone), one after another in
    // build order (backwards going out), each over ITEM_MS, inside ms.
    function drawTo(to, ms) {
      const order = items.filter(item => item.sketch).sort((a, b) => (a.order - b.order) * (to ? 1 : -1));
      const each = Math.min(ITEM_MS, ms), gap = order.length > 1 ? (ms - each) / (order.length - 1) : 0;
      const from = order.map(item => item.s);
      return tween(ms, t => order.forEach((item, i) => {
        item.s = from[i] + (to - from[i]) * ease((t * ms - i * gap) / each);
        paint(item);
      }));
    }

    function zoomTo(to, ms) {
      if (zoom === to) return Promise.resolve();
      const from = zoom;
      return tween(ms, t => aim(from + (to - from) * ease(t)));
    }

    // ── The glow ───────────────────────────────────────────────
    // The halo's picture: a white-hot core, the LED's colour, then clear.
    function haloTexture(color) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d'), fill = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      const rgb = [color.r, color.g, color.b].map(v => v * 255);
      const at = (white, alpha) => `rgba(${rgb.map(v => Math.round(v + (255 - v) * white)).join(', ')}, ${alpha})`;
      for (const [stop, white, alpha] of [[0, 1, 1], [0.08, 0.45, 1], [0.25, 0, 1], [0.5, 0, 0.85], [0.75, 0, 0.4], [1, 0, 0]]) fill.addColorStop(stop, at(white, alpha));
      g.fillStyle = fill;
      g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    }

    // A round glow's picture in a colour: [stop, level, whiteness] from the
    // middle out.
    function roundTexture(color, profile) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d'), fill = g.createRadialGradient(64, 64, 0, 64, 64, 64), rgb = new THREE.Color(color);
      const at = (a, white) => `rgba(${[rgb.r, rgb.g, rgb.b].map(v => Math.round(255 * (v + (1 - v) * white))).join(', ')}, ${a})`;
      for (const [stop, a, white] of profile) fill.addColorStop(stop, at(a, white || 0));
      g.fillStyle = fill;
      g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    }

    // An LED's glow, ready from the start so 'lit' builds no shader: its
    // light on at intensity 0 (moved out of the part, so hiding the part
    // never changes the scene's lights), and a halo at its dome drawn over
    // everything at opacity 0. The halo goes in the scene, not the part, so
    // the framing never counts it.
    function glowFor(def, group) {
      let dome = null, lamp = null;
      group.traverse(o => { if (o.userData.ledDome) dome = o; if (o.userData.ledLight) lamp = o; });
      if (!dome || !def.view.update) return null;
      const power = lamp ? lamp.intensity * LIGHT_SHARE : 0;   // at full, it floods the board red
      if (lamp) { App.scene.attach(lamp); lamp.visible = true; lamp.intensity = 0; }
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(dome.material.color), transparent: true, opacity: 0,
        depthTest: false, depthWrite: false, sizeAttenuation: false }));
      halo.renderOrder = 2;
      halo.position.copy(dome.getWorldPosition(new THREE.Vector3()));
      App.scene.add(halo);
      glows.push({ def, group, dome, lamp, power, halo });
      glow(0);
      // Its sketch glow (the build-up's 'led' step, ref 07's LED glow
      // reference): a diffused violet dome of light, smaller than 'lit''s
      // halo, into the bloom.
      const map = roundTexture(SKETCH_GLOW, [[0, 0.72], [0.25, 0.66], [0.5, 0.46], [0.75, 0.2], [1, 0]]);   // no white core: it reads #B48CFF
      for (const [into, level] of [[false, 1], [true, LED_BLOOM]]) {   // the glow, and a dim copy only into the bloom
        const sketch = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, opacity: 0, depthTest: false, depthWrite: false, sizeAttenuation: false }));
        if (into) sketch.layers.set(GLOW_LAYER);
        sketch.renderOrder = 2;
        sketch.position.copy(halo.position);
        sketch.scale.setScalar(2 * SKETCH_HALO * Math.tan(FOV * Math.PI / 360));
        App.scene.add(sketch);
        neon.push([sketch.material, level, 'led']);
      }
      return dome;
    }

    // 0 dark … 1 lit: each halo (about HALO of the frame's height across,
    // sizeAttenuation off) and LED light.
    function glow(v) {
      const size = 2 * HALO * Math.tan(App.camera.fov * Math.PI / 360);
      for (const { lamp, power, halo } of glows) {
        halo.material.opacity = v;
        halo.scale.setScalar(size * (0.6 + 0.4 * v));
        if (lamp) lamp.intensity = power * v;
      }
    }

    // The LEDs lit at the circuit's current (their halos then ease in), or
    // dark. Returns the first dome's place in the frame, 0 … 1.
    function light(on) {
      let at = null;
      for (const { def, group, dome } of glows) {
        def.view.update({ group }, on ? { on: true, current: LIT_MA } : {});
        if (!at) {
          const p = dome.getWorldPosition(new THREE.Vector3()).project(App.camera);
          at = { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
        }
      }
      if (!on) glow(0);
      return at || { x: 0.5, y: 0.5 };
    }

    // ── The camera ─────────────────────────────────────────────
    // Where the camera sits, el above the bench, aimed at target, to keep
    // points in view: d grows until the most any of them reaches, by
    // measure(ndc), is fill. mid: target raised or lowered too, so they sit
    // mid-frame (perspective draws the near side bigger). → d.
    function distance(target, points, measure, fill, el, mid) {
      const tan = Math.tan(FOV * Math.PI / 360), dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
      let d = 40 / tan;
      const p = new THREE.Vector3();
      for (let i = 0; i < 10; i++) {
        probe.position.copy(target).addScaledVector(dir, d);
        probe.lookAt(target);
        probe.updateMatrixWorld();
        let most = 0, lo = Infinity, hi = -Infinity;
        for (const q of points) {
          most = Math.max(most, measure(p.copy(q).project(probe)));
          lo = Math.min(lo, p.y);
          hi = Math.max(hi, p.y);
        }
        if (mid) target.y += (hi + lo) / 2 * tan * d / Math.cos(el);
        d *= most / fill;
      }
      return d;
    }

    // The framings, from the board's box b, aimed at its middle as ref 04
    // has it. ellipse: a cylinder round its footprint (GROUND_Y up to its
    // top) within FILL of the frame's inscribed ellipse, so it is in view at
    // every turn. On a wide frame (the landing's stage, about 2.8 : 1) that
    // leaves it small, the turn's end-on view setting the height: there the
    // box itself (with its glass base) at every 10° of the turn, wholly
    // inside the frame, its ends reaching into the faded rim but never past
    // an edge, seen from a little lower (ELEVATION_WIDE, nearer ref 04's
    // angle) and centred up and down; it blends in from 2 : 1 to 2.5 : 1,
    // so nothing jumps across. 'empty' is d; from 'lineart' on the camera
    // is PUSH nearer. → { target, el, d, near }.
    function framings(b, aspect) {
      const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      const target = new THREE.Vector3(cx, (b.min.y + b.max.y) / 2, cz);
      const w = Math.min(1, Math.max(0, (aspect - WIDE_FROM) / 0.5));   // 0 up to 2 : 1, 1 from 2.5 : 1
      const el = (ELEVATION + (ELEVATION_WIDE - ELEVATION) * w) * Math.PI / 180;
      const r = Math.hypot(b.max.x - b.min.x, b.max.z - b.min.z) / 2 + MARGIN, ring = [], turns = [];
      for (let a = 0; a < 360; a += 15) {
        const x = cx + r * Math.cos(a * Math.PI / 180), z = cz + r * Math.sin(a * Math.PI / 180);
        ring.push(new THREE.Vector3(x, GROUND_Y, z), new THREE.Vector3(x, b.max.y, z));
      }
      const ellipse = distance(target, ring, q => Math.hypot(q.x, q.y), FILL, el, false);
      let d = ellipse;
      if (w > 0) {
        for (let a = 0; a < 360; a += 10) {
          const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180);
          for (const x of [b.min.x - cx, b.max.x - cx]) for (const y of [BASE_TOP - BASE_T, b.max.y]) for (const z of [b.min.z - cz, b.max.z - cz]) {
            turns.push(new THREE.Vector3(cx + x * c - z * s, y, cz + x * s + z * c));
          }
        }
        const centred = target.clone(), box = distance(centred, turns, q => Math.max(Math.abs(q.x), Math.abs(q.y)), BOX_FILL, el, true);
        d = ellipse + (box - ellipse) * w;
        target.y += (centred.y - target.y) * w;
      }
      return { target, el, d, near: d / PUSH };
    }

    function frame() {
      const cam = App.camera, wrap = App.renderer.domElement.parentElement;
      sized = !!(wrap && wrap.clientWidth && wrap.clientHeight);
      if (!sized) return;   // no size yet (display: none): the ResizeObserver frames it once it has one
      cam.aspect = probe.aspect = wrap.clientWidth / wrap.clientHeight;
      cam.fov = probe.fov = FOV;
      cam.updateProjectionMatrix();
      probe.updateProjectionMatrix();
      if (glowComposer) glowComposer.setSize(wrap.clientWidth, wrap.clientHeight);
      wide = framings(new THREE.Box3().setFromObject(App.scene.getObjectByName('breadboard')), cam.aspect);
      aim(zoom);
    }

    // The camera on the board, 0 framed whole ('empty') … 1 nearer (from
    // 'lineart' on), at the turn it has reached (or the starting azimuth,
    // the first time).
    function aim(z) {
      zoom = z;
      if (!wide) return;
      const cam = App.camera, ctl = App.controls;
      const az = (aimed ? Math.atan2(cam.position.x - ctl.target.x, cam.position.z - ctl.target.z) : (first === 'empty' ? AZIMUTH_EMPTY : AZIMUTH) * Math.PI / 180);
      const el = wide.el, d = 1 / ((1 - z) / wide.d + z / wide.near);
      aimed = true;
      ctl.target.copy(wide.target);
      cam.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d).add(ctl.target);
      cam.lookAt(ctl.target);
      if (spindle) spindle.position.set(ctl.target.x, 0, ctl.target.z);
    }

    // ── The bloom (#174) ───────────────────────────────────────
    // Once all of viewer.html's post-processing scripts are in. Selective,
    // so the neon blooms in its own colours and nothing else hazes: the
    // objects on GLOW_LAYER (the rails, their bleed, the glass's edges)
    // drawn alone on black through an UnrealBloomPass; render() then adds
    // that over the scene, which still draws straight to the (antialiased)
    // canvas. No scripts, no bloom: the scene alone.
    function bloomOn() {
      glowComposer = new THREE.EffectComposer(App.renderer);
      glowComposer.renderToScreen = false;
      glowComposer.addPass(new THREE.RenderPass(App.scene, App.camera, null, new THREE.Color(0x000000), 1));
      bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), BLOOM, BLOOM_R, 0);
      glowComposer.addPass(bloom);
      const add = new THREE.ShaderMaterial({
        uniforms: { glow: { value: glowComposer.renderTarget2.texture } },   // where the bloom ends up (no pass swaps)
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform sampler2D glow; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(glow, vUv).rgb, 1.0); }',
        blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false,
      });
      glowQuad = { scene: new THREE.Scene(), camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
      glowQuad.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), add));
      mix(k);
    }

    // ── Drawing ────────────────────────────────────────────────
    // The scene straight to the (antialiased) canvas; with the bloom on, the
    // glow layer through it, added over in one full-screen quad.
    let shown = null;            // resolves the first frame drawn once the canvas shows
    const firstFrame = new Promise(resolve => { shown = resolve; });
    function draw() {
      const r = App.renderer, cam = App.camera;
      r.render(App.scene, cam);
      if (glowComposer && sized && bloom.strength > 0) {
        const mask = cam.layers.mask, autoClear = r.autoClear;
        cam.layers.set(GLOW_LAYER);
        glowComposer.render();
        cam.layers.mask = mask;
        r.setRenderTarget(null);
        r.autoClear = false;
        r.render(glowQuad.scene, glowQuad.camera);
        r.autoClear = autoClear;
      }
      if (shown && r.domElement.style.visibility !== 'hidden') { shown(); shown = null; }
    }

    // Warm up: every shader the sketch will need (the parts' and wires',
    // hidden till 'lineart', the paths', the glows', the bloom's) built,
    // and drawn once, at opacity 0, while the canvas is still hidden, so
    // the build-up's first frames don't stall.
    function warmUp() {
      for (const item of items) { item.group.visible = true; item.mat.visible = true; }
      for (const [m] of inks.concat(neon)) m.visible = true;
      for (const { halo } of glows) halo.visible = true;
      App.renderer.compile(App.scene, App.camera);
      draw();
      const gl = App.renderer.getContext();   // wait for the GPU to finish it (a one-pixel read), so the cost lands here, not in the first frames shown
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      for (const item of items) paint(item);
      mix(k);
    }

    // The first arrival (storyboard 01 → 02): the stencil, the outline
    // alone, for STENCIL_MS from the first frame the canvas shows; then the
    // rails and the hole grid fade up. At once with reduced motion, or while
    // no one can see the frame.
    function arrive() {
      const wrap = App.renderer.domElement.parentElement;
      if (reduced || document.hidden || !wrap || !wrap.clientWidth || !wrap.clientHeight) { lv.grid = 1; mix(k); return Promise.resolve(); }
      return Promise.race([firstFrame, new Promise(resolve => setTimeout(resolve, 1000))])
        .then(() => tween(STENCIL_MS, () => {}))
        .then(() => levelTo('grid', 1, GRID_MS));
    }

    // ── The stages ─────────────────────────────────────────────
    // How each stage is reached from its neighbour: up from the stage below,
    // down from the one above. Each step is a promise, so a step can be a
    // timeline of sub-steps (#171 grows 'empty' → 'lineart' into the
    // storyboard's build-up here).
    function levelTo(name, to, ms) {
      if (lv[name] === to) return Promise.resolve();
      const from = lv[name];
      return tween(ms, t => { lv[name] = from + (to - from) * ease(t); mix(k); });
    }
    // 'empty' → 'lineart', the build-up (storyboard 03–07): BUILD_STEPS one
    // after another, under one slow push-in. #171.
    const steps = {
      paths:     () => levelTo('paths', 1, STEP_MS.paths),
      parts:     () => drawTo(1, DRAW_MS),
      led:       () => levelTo('led', 1, STEP_MS.led),
      glass:     () => levelTo('glass', 1, STEP_MS.glass),
      underglow: () => levelTo('underglow', 1, STEP_MS.underglow),
    };
    const BUILD_MS = DRAW_MS + STEP_MS.paths + STEP_MS.led + STEP_MS.glass + STEP_MS.underglow;
    const SKETCH = ['paths', 'led', 'glass', 'underglow'];
    const up = {
      lineart: () => Promise.all([zoomTo(1, BUILD_MS), BUILD_STEPS.reduce((p, step) => p.then(steps[step]), Promise.resolve())]),
      solid:   () => fadeTo(1),
      lit:     () => {
        const at = light(true);
        window.parent.postMessage({ type: 'edison:lit', x: at.x, y: at.y }, '*');
        return tween(GLOW_MS, glow);
      },
    };
    const down = {
      solid:   () => light(false),
      lineart: () => fadeTo(0),
      empty:   () => Promise.all([zoomTo(0, OUT_MS), drawTo(0, OUT_MS), ...SKETCH.map(name => levelTo(name, 0, OUT_MS))]),
    };

    let current = 'empty';
    // One step at a time towards name; current() is each stage as reached.
    function run(name) {
      const want = rank(name), now = rank(current);
      if (want === now) return Promise.resolve();
      const next = STAGES[now + Math.sign(want - now)];
      return Promise.resolve((want > now ? up : down)[next]()).then(() => { current = next; return run(name); });
    }

    return {
      board(bb) {
        outline(bb.group, boardPen, true, boardGlass);
        bb.group.add(pockets(bb));
        bb.group.traverse(o => { if (o.isMesh) o.renderOrder = -1; });   // the glass first, so a part in front never cuts it out
        board = bb;
        const sketch = new THREE.Group();
        sketch.add(rails(), base(), construction());
        App.scene.add(sketch);
        // The glass's edges glow too, more softly: a dim copy of each, drawn
        // only into the bloom (white at full would wash the + rails out).
        const edges = [];
        for (const root of [bb.group, sketch]) root.traverse(o => { if (o.isLine && (o.material === boardMat || o.material === baseMat)) edges.push(o); });
        for (const line of edges) {
          const ghost = new THREE.LineSegments(line.geometry, edgeGlowMat);
          ghost.layers.set(GLOW_LAYER);
          line.add(ghost);
        }
        sketch.add(underglow());
        spindle = axes();
        App.scene.add(spindle);
        const hole = bb.getHole(Math.floor(G.COLS / 2), 'e');
        if (hole) marks.set('holes', { at: new THREE.Vector3(hole.x, 0, hole.z) });
      },
      // The circuit as the file reads ({ components, wires }): its paths.
      circuit(data) {
        if (board) App.scene.add(paths(board, usedStrips(data)));
        mix(k);
      },
      // label: the part's label, for anchors() (LED1 on its dome's top, an
      // off-board part on the middle of its face towards the camera's start,
      // any other on its middle). A part off the board (the battery) is no
      // part of the sketch (the storyboard has none): it shows with the
      // solid render.
      part(def, group, label) {
        const mat = pen(1), onBoard = def.place.kind !== 'offboard', item = { group, mat, s: 0, order: 1, sketch: onBoard };
        items.push(item);
        outline(group, () => mat, false);
        if (onBoard) framed.push(group);
        const dome = glowFor(def, group);
        if (!label) return;
        group.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(group), at = b.getCenter(new THREE.Vector3());
        if (dome) dome.localToWorld(at.set(0, dome.geometry.parameters.radius, 0));
        else if (!onBoard) at.z = Math.cos((first === 'empty' ? AZIMUTH_EMPTY : AZIMUTH) * Math.PI / 180) >= 0 ? b.max.z : b.min.z;
        marks.set(label, { at, item });
      },
      // onBoard: both ends in holes. A lead to the battery draws in first,
      // fading out along its length as it runs off the board's edge.
      wire(group, onBoard) {
        const mat = pen(1);
        items.push({ group, mat, s: 0, order: onBoard ? 2 : 0, sketch: true });
        outline(group, () => mat, false);
        if (onBoard) framed.push(group);
        else fadeLead(group, mat);
      },

      // The frame, through the bloom once it is in (viewer.html's render
      // loop calls this in hero mode).
      render: draw,

      // window.Hero: ready once the circuit (loading) is in, the bloom's
      // scripts have settled (fx: true if all loaded in time; viewer.html
      // gives up on them after a few seconds), and the first stage is drawn
      // (after the draw-in). Without them, no bloom, and the hero runs on.
      start(loading, fx) {
        const ready = Promise.all([loading, fx]).then(([, ok]) => {
          if (ok) {
            try { bloomOn(); } catch { glowComposer = bloom = glowQuad = null; }   // a half-built bloom: none
          }
          for (const item of items) paint(item);
          frame();
          const rail = marks.get('rail').at, fitBox = new THREE.Box3(), b = new THREE.Box3();
          for (const o of framed) fitBox.union(b.setFromObject(o));
          if (!fitBox.isEmpty()) {   // the + rail beside the circuit
            rail.x = (fitBox.min.x + fitBox.max.x) / 2;
            rail.z = fitBox.min.z + fitBox.max.z < 0 ? G.ROW_Z.tp - 0.24 : G.ROW_Z.bp + 0.24;
          }
          new ResizeObserver(frame).observe(App.renderer.domElement.parentElement);
          App.controls.autoRotate = !reduced;
          App.controls.autoRotateSpeed = SPIN;
          warmUp();
          lv.grid = 0;
          mix(k);
          App.renderer.domElement.style.visibility = '';
          return arrive().then(() => run(first));
        });
        ready.catch(() => {});   // the viewer already warns "Could not load"
        let queue = Promise.resolve();   // the last stage asked for, settled either way: one that throws doesn't stop the next
        const at = new THREE.Vector3();
        return {
          ready,
          current: () => current,
          // The line art (edges, axes and construction lines) in a new ink,
          // '#rrggbb', for the page's light/dark toggle; anything else
          // changes nothing.
          ink(hex) {
            const v = hexOf(hex);
            if (v === null) return;
            for (const m of inks.map(([m]) => m).concat(axisMat, items.map(item => item.mat))) m.color.setHex(v);
          },
          // Points for the page's callouts, for the camera now: { LED1, R1,
          // BAT1, rail, holes, path, casing }, each { x, y, visible }
          // (anchorOf); a part's is not visible while the part is hidden,
          // the path's while the paths aren't drawn (the build-up's, gone at
          // 'solid'). casing: the middle of the glass board's long top edge
          // nearer the camera, not visible within about 15° of end-on.
          anchors() {
            const cam = App.camera;
            cam.updateMatrixWorld();
            const out = {};
            for (const [name, { at: p, item, level }] of marks) {
              const a = out[name] = anchorOf(at.copy(p).project(cam));
              if ((item && !item.group.visible) || (level && !(lv[level] * (1 - k) > 0))) a.visible = false;
            }
            const near = cam.position.distanceToSquared(casing[0]) <= cam.position.distanceToSquared(casing[1]) ? casing[0] : casing[1];
            const c = out.casing = anchorOf(at.copy(near).project(cam));
            const t = App.controls.target, az = Math.atan2(cam.position.x - t.x, cam.position.z - t.z);
            if (Math.abs(Math.cos(az)) < END_ON) c.visible = false;   // near end-on the nearer edge swaps sides: hidden, so a callout fades rather than jumps
            return out;
          },
          // The bloom's strength now: BLOOM on the glass, 0 once solid.
          bloom: () => (bloom ? bloom.strength : 0),
          stage(name) {
            if (rank(name) < 0) return Promise.reject(new Error(`Hero.stage: no stage "${name}"`));
            const next = queue.then(() => ready).then(() => run(name));   // a failed load still rejects every stage
            queue = next.catch(() => {});
            return next;
          },
        };
      },
    };
  }

  return { STAGES, INK, RAIL_POS, RAIL_NEG, SKETCH_GLOW, BUILD_STEPS, FADE_MS, inkOf, startStage, anchorOf, usedStrips, ease, rank, create };
});
