// circuit3d/viewer.html?mode=hero (issues #163 and #167, the Edison
// landing): the demo LED circuit on a glass breadboard sketch, opaque on the
// landing's black, slowly rotating with dashed axis lines (Quindar). It
// starts as the bare board ('empty') or the parts in white line art
// ('lineart'), draws the parts in, solidifies into the shaded model and then
// lights the LED and tells the page around it; the stages go both ways, for
// a replay, and anchors() hands the page live points for its callouts. The
// landing page drives it. What only a real page shows is here: the frame
// over the page, the edges on the real parts, the neon rails, the draw-in,
// the cross-fade, the glow, the message to the parent, the anchors on
// screen, ink, reduced motion, and the default viewer left as it was. The
// circuit's physics (LED1 lit at 14.9 mA) and the pure helpers (stage
// order, &stage=, anchorOf, the rail colours) are test/hero-model.test.js.
//
// Seam assumed (stated so the builder matches):
// - viewer.html?mode=hero puts window.Hero on the frame:
//     Hero.ready      a Promise that resolves once the first stage is drawn
//                     ('lineart': every part and wire in line art).
//     Hero.current()  'empty' | 'lineart' | 'solid' | 'lit': the stage last
//                     reached.
//     Hero.stage(n)   starts stage n, from any stage, and returns a Promise
//                     that resolves when n is fully reached ('solid': after
//                     the ~1.2 s cross-fade; with reduced motion, at once).
//                     current() is n by then. Calls run in order; an
//                     unknown name rejects without stopping later calls.
//     Hero.ink(hex)   recolours the line art (edges and axes) in place; a
//                     value that isn't #rrggbb changes nothing and doesn't
//                     throw.
//     Hero.anchors()  { LED1, R1, BAT1, rail, holes, path, casing } (#171 adds
//                     path, on a column strip the circuit uses, and casing,
//                     the middle of the glass board's nearer long top edge),
//                     each { x, y, visible }:
//                     x and y 0 … 1 of the frame from the top left (held
//                     inside it, and finite even while the frame is 0 × 0),
//                     for the camera now. LED1 is on its dome, R1 on its
//                     body; BAT1 is visible: false while BAT1 is hidden.
//     Hero.bloom()    the bloom pass's strength now, a number (#174): above
//                     0.3 at 'empty' and 'lineart', at most 0.05 at 'solid'
//                     and 'lit'.
// - &stage=empty starts at 'empty'; no &stage= (or any other value) starts
//   at 'lineart'.
// - Opaque: the frame paints the landing's #101010, out to its faded rim,
//   so the page behind never shows.
// - Line art: THREE.LineSegments(EdgesGeometry, LineBasicMaterial) with
//   userData.heroRole = 'edges', added inside each group App.buildPart
//   returned and inside the breadboard's group (App.createBreadboard), so the
//   drawing and the physical board are one object. White by default (each
//   channel >= 0xf0, so #fff or #f4f4f4); &ink=%23101010 makes it 0x101010.
//   The neon rails are not 'edges' (they keep their colours).
// - Wires: viewer.html's buildWireGroup groups, found as the groups in the
//   scene (outside the board and the parts) that hold a TubeGeometry mesh.
//   A wire's edges are a heroRole 'edges' line inside its group.
// - Axis lines: THREE.Line/LineSegments with a LineDashedMaterial and
//   userData.heroRole = 'axis', computeLineDistances() called.
// - 'empty' and 'lineart' draw the board as glass: its edges, and its own
//   meshes (as built) at most a faint fill (level ≤ 0.15, 1 = opaque); no
//   ground. 'empty': nothing in a part's or a wire's group draws (meshes,
//   edges, sprites); the + rails (tp, bp) glow neon pink and the − rails
//   (tn, bn) neon blue. 'lineart': the parts' and wires' meshes draw
//   nothing; from 'empty' each part and wire draws in, staggered (first to
//   last at least 0.3 s apart), all within 2 s; with reduced motion, at once.
// - In 'solid' every mesh of the parts and the board is back to its as-built
//   visibility and opacity (most 1; the LED's dome 0.88), and the edges draw
//   nothing.
// - Framed on the whole board, with only a gentle push-in at every aspect
//   (#174, replacing #163's zoom onto the circuit). The board's box is its
//   own meshes, as built. At 800 × 500: at 'empty' the box is wholly inside
//   the frame and at least 60% of its width; at the end of 'lineart' the
//   box and LED1 + R1 are wholly inside. On the landing's stage, 1440 × 517:
//   at 'empty' the box is inside the frame and at least 60% of its width;
//   at the end of 'lineart' LED1's dome is at least 12 px across and the box
//   inside top and bottom. Across 2 : 1 (999 → 1001 × 500) nothing jumps
//   (anchors().holes.y moves under 0.02). A frame that loads hidden
//   (display:none, so 0 × 0) and is shown later frames the circuit then:
//   the camera never goes NaN, at 'lineart' or at 'lit'.
// - The battery (the off-board part, BAT1) is not in the sketch (#174):
//   nothing in its group draws at 'empty' or at any frame of 'lineart',
//   while its two leads (the wires with an end at it) draw at 'lineart'; at
//   'solid' it draws with the rest.
// - The build-up (#171, storyboard 01–07). &stage=empty's first load: the
//   stencil (outline edges, no neon) in the first frames the canvas shows,
//   the rails up by 1.5 s. stage('lineart') from 'empty' resolves in
//   2.5–5 s: violet circuit paths round anchors().path first (before any
//   part is drawn in), the parts and wires drawn in one after another,
//   then a violet sketch glow round LED1's dome (a rise over its level
//   once LED1 is drawn in: the paths behind it add some), last a violet
//   under-glow seen through the glass over the board's empty bottom half
//   (rows g–i); the glow and the under-glow still there at its end. Back
//   to 'empty' all of it goes; at 'solid' no violet is left in the frame;
//   with reduced motion the build-up is done within two frames, all there.
//   Every shader program is built by Hero.ready (App.renderer.info.programs
//   no longer after 'lineart'), so no frame stalls mid-build. LED1's anchor
//   is the top of its dome.
//   Violet: blue and red well up, green below both, blue not far under red
//   (#B48CFF and its glow; not the pink rail); measured as rises over
//   'empty', whose rails' overlapping pink and blue glow already reads a
//   little violet in places.
// - Bloom (#174): at 'empty' the + rails' light spreads round their cores
//   (mean red 6–20 px either side of the core, down each pixel column, at
//   least 100; unbloomed it reads 80–82). Its scripts load only in hero
//   mode; if one fails, the hero still starts, opaque, with Hero.bloom() 0,
//   and its stages still run.
// - 'lit': the LED's dome (userData.ledDome, the part's own marker) glows
//   brighter than in 'solid', with a halo the page can see (a disc 8% of
//   the frame's height round the dome mostly bright red), and the frame
//   posts { type: 'edison:lit', x, y } to window.parent once each time it
//   lights, x and y the dome's place in the frame, 0 … 1. Leaving 'lit'
//   ('solid' or 'empty'), the halo goes.
// - Drawn with App.camera; rotation is measured as a point fixed to the
//   breadboard moving in camera space (camera orbit or a turntable group
//   both count).
//
// A material draws nothing when it is hidden, writes no colour, or is
// transparent at opacity 0; an object draws nothing when it or a parent is
// hidden or it is out of the scene.
//
// The parent page is a stub host served with page.route (a magenta page
// with the hero in an <iframe>), so "opaque" is checked the way the landing
// page will see it: the frame's corners read #101010, never the magenta
// behind. The message is read from that host's window. No network beyond
// Three.js's CDN (as every 3D test); no /api/ask (the viewer never asks).

const { test, expect } = require('@playwright/test');

const CIRCUIT   = 'edison/demo/led.sparky';
const HERO      = `/circuit3d/viewer.html?mode=hero&circuit=${CIRCUIT}`;
const HOST      = '/__hero-host.html';
const HOST_RGB  = [255, 0, 255];   // magenta: nothing in the hero draws it
const INK_BG    = [16, 16, 16];    // #101010, the landing's black, which the hero now paints
const FRAME_W   = 800, FRAME_H = 500;
const SPIN_RAFS = 30;              // animation frames to watch for rotation (~0.5 s)
const GLOW_R    = 0.08;            // the lit LED's glow: a disc this share of the frame's height
const DRAWN     = 0.8;             // a part's edges at least this (1 = full ink): drawn in
const ANCHOR_PX = 15;              // an anchor this close to its part on screen
const DOME_TOP_PX = 3;             // anchors().LED1 this close to the top of LED1's dome projected (the dome is ~8 px across at 800 × 500)
const BOARD_WIDE = 0.6;            // 'empty': the board's box at least this share of the frame's width (#174)
const DOME_PX   = 12;              // the end of 'lineart' on the landing's stage: LED1's dome at least this wide, px (#174)
const STAGE_W   = 1440, STAGE_H = 517;   // the landing's stage, the hero's real size (#174)
// The build-up's violet (#171), each a rise over 'empty' (__heroViolet). Calibrated on today's render and on a
// stand-in sketch (a violet strip, a 0.12-of-the-height sprite at LED1, a radial plane under the board, none
// bloomed): path 0 → 0.82, led 0.10 → 0.40, under 0 → 0.99; violet pixels at 'solid' today 10.
const PATH_UP   = 0.2;             // the share of violet round anchors().path
const LED_UP    = 0.12;            // round anchors().LED1: the sketch glow
const UNDER_UP  = 0.25;            // over the board's empty bottom half: the under-glow, through the glass
const SOLID_VIOLET = 50;           // violet pixels left in the whole frame at 'solid', at most
const BUILD_MIN = 2500, BUILD_MAX = 5000;   // ms: stage('lineart') from 'empty', a ~3.5 s build-up
const BLOOM_ON  = 0.3;             // Hero.bloom() above this at 'empty' and 'lineart' (#174)
const BLOOM_OFF = 0.05;            // and at most this at 'solid' and 'lit'
const GLOW_RED  = 100;             // mean red 6–20 px either side of the + rails' cores at 'empty'; unbloomed it reads 80–82, a gentle bloom (strength 0.6) 114

const hostHtml = src => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>hero host</title>
<style>html, body { margin: 0; background: rgb(${HOST_RGB.join(', ')}); }
iframe { display: block; border: 0; width: ${FRAME_W}px; height: ${FRAME_H}px; }</style></head>
<body><script>
window.__msgs = [];
addEventListener('message', e => {
  const f = document.querySelector('iframe');
  window.__msgs.push({ data: e.data, fromFrame: !!f && e.source === f.contentWindow });
});
</script><iframe src="${src}"></iframe></body></html>`;

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
    if (m.type() === 'warning' && /Could not load/.test(m.text())) errors.push('viewer: ' + m.text());
  });
  return errors;
}

// Runs in every frame before its scripts. Records each group App.buildPart
// and App.createBreadboard return (as parts.spec.js watches buildPart), with
// each mesh's as-built opacity, and puts read-only helpers on the window.
function installHeroSpy() {
  const built = { parts: [], board: null, bb: null, asBuilt: new Map() };
  window.__heroBuilt = built;
  const mats  = o => (Array.isArray(o.material) ? o.material : [o.material]).filter(Boolean);
  // How much a material draws: hidden or no colour 0, opaque 1, else its opacity.
  const eff   = m => (m.visible === false || m.colorWrite === false ? 0 : m.transparent ? m.opacity : 1);
  const note  = group => group.traverse(o => { if (o.isMesh) built.asBuilt.set(o, mats(o).map(eff)); });
  // The function is taken when read, so a page that wraps App.buildPart
  // (reads it, then sets its own) neither recurses nor counts a group twice.
  const seen  = new WeakSet();
  const watch = (app, name, onOut) => {
    let fn;
    Object.defineProperty(app, name, {
      configurable: true,
      get: () => {
        const f = fn;
        return f && ((...args) => {
          const out = f(...args);
          try { if (out && out.group && !seen.has(out.group)) { seen.add(out.group); onOut(out, args); } } catch { /* the page carries on */ }
          return out;
        });
      },
      set: f => { fn = f; },
    });
  };
  let app;
  Object.defineProperty(window, 'App', {
    configurable: true,
    get: () => app,
    set: v => {
      app = v;
      if (!v || v.__heroWatched) return;
      v.__heroWatched = true;
      watch(v, 'buildPart', (out, args) => { built.parts.push({ type: args[0], group: out.group }); note(out.group); });
      watch(v, 'createBreadboard', out => { built.board = out.group; built.bb = out; note(out.group); });
    },
  });

  // In the scene, and it and every parent shown.
  const shown  = o => { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === App.scene) return true; } return false; };
  const level  = o => (shown(o) ? Math.max(0, ...mats(o).map(eff)) : 0);   // 0 draws nothing … 1 opaque
  const byRole = (root, role) => { const out = []; root.traverse(o => { if (o.userData && o.userData.heroRole === role) out.push(o); }); return out; };
  const meshes = root => { const out = []; root.traverse(o => { if (o.isMesh) out.push(o); }); return out; };
  const drawables = root => { const out = []; root.traverse(o => { if (o.isMesh || o.isLine || o.isSprite || o.isPoints) out.push(o); }); return out; };
  const inside = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };
  // 0 hidden … 1 as built, for a mesh recorded at build time.
  const solidness = o => {
    const was = built.asBuilt.get(o), now = mats(o).map(m => (shown(o) ? eff(m) : 0));
    const k = was.map((w, i) => (w > 0 ? Math.min(1, (now[i] ?? 0) / w) : null)).filter(x => x !== null);
    return k.length ? k.reduce((a, b) => a + b, 0) / k.length : null;
  };
  const groups = () => built.parts.map(p => ({ name: p.type, group: p.group }))
    .concat(built.board ? [{ name: 'breadboard', group: built.board }] : []);
  const builtMeshes = () => groups().flatMap(g => meshes(g.group)).filter(m => built.asBuilt.has(m));
  // A part placed off the board (the battery), by its own registry entry.
  const offboard = type => !!(window.Parts && Parts.get(type) && Parts.get(type).place.kind === 'offboard');
  // A world box round a group's meshes, from their geometry (drawn or not).
  const boxOf = (group, only) => {
    const box = new THREE.Box3(), b = new THREE.Box3();
    group.updateWorldMatrix(true, true);
    for (const m of meshes(group)) {
      if (only && !only(m)) continue;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.union(b.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));
    }
    return box;
  };
  // A wire with an end at an off-board part: the battery's leads.
  const isLead = wire => {
    const tube = wire.children.find(c => c.isMesh && c.geometry && c.geometry.type === 'TubeGeometry');
    const path = tube && tube.geometry.parameters.path;
    if (!path) return false;
    tube.updateWorldMatrix(true, false);
    const ends = [path.getPoint(0), path.getPoint(1)].map(p => tube.localToWorld(p.clone()));
    return built.parts.filter(p => offboard(p.type)).some(p => { const b = boxOf(p.group).expandByScalar(0.3); return ends.some(e => b.containsPoint(e)); });
  };
  // viewer.html's wires: the groups outside the board and parts holding a tube.
  const wireGroups = () => {
    const out = [], skip = groups().map(g => g.group);
    App.scene.traverse(o => {
      if (!o.isGroup || skip.some(r => inside(o, r))) return;
      if (o.children.some(c => c.isMesh && c.geometry && c.geometry.type === 'TubeGeometry')) out.push(o);
    });
    return out;
  };
  // What a part's or a wire's group draws.
  const drawnIn = (name, group) => {
    const edges = byRole(group, 'edges');
    return {
      name,
      edges: edges.length,
      edgesDrawn: edges.filter(e => level(e) > 0.01).length,
      edgeLevel: edges.length ? Math.min(...edges.map(level)) : 0,    // the faintest of its edges: 1 when all are at full ink
      meshesDrawn: meshes(group).filter(m => level(m) > 0.01).length,
      drawn: drawables(group).filter(o => level(o) > 0.01).length,   // meshes, lines, sprites: anything that draws
    };
  };

  window.__heroLook = () => {
    const H = window.Hero;
    const dome = (() => { let d = null; built.parts.filter(p => p.type === 'led').forEach(p => p.group.traverse(o => { if (o.userData.ledDome) d = o; })); return d; })();
    const solidAll = builtMeshes().map(solidness).filter(x => x !== null);
    const ground = App.scene.getObjectByName('ground');
    return {
      current: H && typeof H.current === 'function' ? H.current() : null,
      groups: groups().map(({ name, group }) => {
        const edges = byRole(group, 'edges');
        const s = meshes(group).filter(m => built.asBuilt.has(m)).map(solidness).filter(x => x !== null);
        return {
          ...drawnIn(name, group),
          offboard: offboard(name),
          edgesGeometry: edges.filter(e => e.isLineSegments && e.geometry && e.geometry.type === 'EdgesGeometry' && mats(e).every(m => m.isLineBasicMaterial)).length,
          builtMax: Math.max(0, ...meshes(group).filter(m => built.asBuilt.has(m)).map(level)),   // its own meshes, as built: the most any draws
          leastSolid: s.length ? Math.min(...s) : null,
        };
      }),
      wires: wireGroups().map((g, i) => ({ ...drawnIn(`wire ${i + 1}`, g), lead: isLead(g) })),
      groundDrawn: !!ground && level(ground) > 0.01,
      edgesInScene: byRole(App.scene, 'edges').length,
      edgesDrawnInScene: byRole(App.scene, 'edges').filter(e => level(e) > 0.01).length,
      edgeColours: [...new Set(byRole(App.scene, 'edges').flatMap(e => mats(e).map(m => (m.color ? m.color.getHex() : null))))],
      axisColours: [...new Set(byRole(App.scene, 'axis').flatMap(a => mats(a).map(m => (m.color ? m.color.getHex() : null))))],
      axis: byRole(App.scene, 'axis').map(a => ({
        line: !!a.isLine,
        dashed: mats(a).length > 0 && mats(a).every(m => m.isLineDashedMaterial),
        distances: !!(a.geometry && a.geometry.attributes && a.geometry.attributes.lineDistance),
        drawn: level(a) > 0.01,
      })),
      heroObjects: byRole(App.scene, 'edges').length + byRole(App.scene, 'axis').length,
      solidMean: solidAll.length ? solidAll.reduce((a, b) => a + b, 0) / solidAll.length : null,
      solidMin: solidAll.length ? Math.min(...solidAll) : null,
      dome: dome ? { glow: dome.material.emissiveIntensity, level: level(dome) } : null,
    };
  };

  // A point fixed to the breadboard, in App.camera's space: it moves when the
  // camera orbits or when a group holding the board turns.
  window.__heroViewPoint = () => {
    const g = built.board;
    g.updateWorldMatrix(true, false);
    const p = g.localToWorld(new THREE.Vector3(10, 0, 3));
    App.camera.updateWorldMatrix(true, false);
    return p.applyMatrix4(new THREE.Matrix4().copy(App.camera.matrixWorld).invert()).toArray();
  };
  const toPx = () => {
    const el = App.renderer.domElement, W = el.clientWidth, H = el.clientHeight;
    App.camera.updateMatrixWorld();
    const px = v => { const p = v.clone().project(App.camera); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H, p.z]; };
    return { W, H, px };
  };
  // Where the circuit sits in the canvas, in CSS px through App.camera. The
  // LED1 and R1 rectangles are the projected world boxes of their meshes
  // only (a halo sprite or a light in the group doesn't count as the part);
  // the dome's is its own vertices projected; domeAt its centre, 0 … 1.
  window.__heroFraming = () => {
    const { W, H, px } = toPx();
    const rect = pts => ({ x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])),
                           y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1])) });
    const corners = (group, only) => {
      const box = boxOf(group, only), out = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) out.push(px(new THREE.Vector3(x, y, z)));
      return out;
    };
    const groupOf = type => built.parts.find(p => p.type === type).group;
    const led = groupOf('led'), res = groupOf('resistor');
    let dome = null;
    led.traverse(o => { if (o.userData.ledDome) dome = o; });
    const pos = dome.geometry.attributes.position, verts = [];
    for (let i = 0; i < pos.count; i++) verts.push(px(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(dome.matrixWorld)));
    const at = px(dome.getWorldPosition(new THREE.Vector3()));
    const top = px(dome.localToWorld(new THREE.Vector3(0, dome.geometry.parameters.radius, 0)));
    // The board: the box of its own meshes as built, and the middles of its
    // two long top edges (the casing callout's).
    const G = App.BOARD_GEOMETRY;
    built.board.updateWorldMatrix(true, false);
    return {
      W, H, circuit: rect([...corners(led), ...corners(res)]), r1: rect(corners(res)), dome: rect(verts), domeAt: [at[0] / W, at[1] / H], domeTop: top.slice(0, 2),
      board: rect(corners(built.board, m => built.asBuilt.has(m))),
      edgeMids: [-1, 1].map(s => px(built.board.localToWorld(new THREE.Vector3(0, 0, s * G.BOARD_D / 2))).slice(0, 2)),
    };
  };
  // The rails on screen, in CSS px: each the segments from hole to hole
  // along its row, + (tp, bp) and − (tn, bn); a hole behind the camera ends
  // a run.
  window.__heroRails = () => {
    const { px } = toPx(), bb = built.bb, G = App.BOARD_GEOMETRY;
    bb.group.updateWorldMatrix(true, false);
    const run = row => {
      const out = [];
      let prev = null;
      for (let c = 0; c < G.COLS; c++) {
        const h = bb.getHole(c, row), p = px(bb.group.localToWorld(new THREE.Vector3(h.x, 0, h.z)));
        const q = p[2] > 1 ? null : [p[0], p[1]];
        if (prev && q) out.push([...prev, ...q]);
        prev = q;
      }
      return out;
    };
    const rows = sign => G.RAIL_ROWS.filter(r => G.RAIL_IS_POS[r] === sign).flatMap(run);
    return { pos: rows(true), neg: rows(false) };
  };
  // Column strips on screen, in CSS px: each [{ col, half }] as the segment
  // from its first hole to its last (a–e, or f–j).
  window.__heroStrips = list => {
    const { px } = toPx(), bb = built.bb;
    bb.group.updateWorldMatrix(true, false);
    const at = (col, row) => { const h = bb.getHole(col, row); return px(bb.group.localToWorld(new THREE.Vector3(h.x, 0, h.z))).slice(0, 2); };
    return list.map(({ col, half }) => (half === 'top' ? [...at(col, 'a'), ...at(col, 'e')] : [...at(col, 'f'), ...at(col, 'j')]));
  };
  window.__heroFrames = n => new Promise(resolve => {
    let k = 0;
    const tick = () => (++k >= n ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });
  // A screenshot (PNG, base64) as pixels: { w, h, d } (d: RGBA bytes).
  window.__shot = async b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return { w: img.width, h: img.height, d: ctx.getImageData(0, 0, img.width, img.height).data };
  };

  // ── Reading the canvas itself (#171) ──
  // The WebGL canvas keeps its picture only until the frame is shown, so it
  // is read in a requestAnimationFrame callback that runs after the
  // viewer's own (one asked for from a task, or from such a callback, as
  // __heroFrames' are). → { w, h, d } in canvas pixels.
  const grabbed = document.createElement('canvas');
  const grab = () => {
    const src = App.renderer.domElement, w = src.width, h = src.height;
    if (grabbed.width !== w || grabbed.height !== h) { grabbed.width = w; grabbed.height = h; }
    const ctx = grabbed.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0);
    return { w, h, d: ctx.getImageData(0, 0, w, h).data };
  };
  // The sketch's violet (#B48CFF and its glow): blue and red well up, green
  // below both, blue not far under red (so not the pink rail); faint: the
  // same at a glow's edge (the under-glow).
  const violet = (r, g, b) => b >= 90 && r >= 60 && b >= g + 30 && r >= g + 10 && b >= r - 30;
  const faint  = (r, g, b) => b >= 30 && b >= g + 12 && r >= g + 4 && b >= r - 30;
  const neonPx = (r, g, b) => (r >= 150 && g <= 110 && b >= 60 && b <= 190 && r - b >= 50) || (b >= 150 && r <= 110 && g >= 60 && g <= 190 && b - g >= 50);
  const share = (img, test, inArea, x0, y0, x1, y1) => {
    let n = 0, hit = 0;
    for (let j = Math.max(0, Math.floor(y0)); j <= Math.min(img.h - 1, Math.ceil(y1)); j++) {
      for (let i = Math.max(0, Math.floor(x0)); i <= Math.min(img.w - 1, Math.ceil(x1)); i++) {
        if (!inArea(i, j)) continue;
        const k = (j * img.w + i) * 4;
        n++;
        if (test(img.d[k], img.d[k + 1], img.d[k + 2])) hit++;
      }
    }
    return n ? hit / n : 0;
  };
  // The sketch's violet now, after the next frame is drawn:
  //   path   the share of violet pixels within 2.5% of the frame's height of anchors().path
  //   led    the share within 5% of it of LED1's dome, its centre projected (the sketch glow)
  //   under  the share of faintly violet pixels at a grid of points over the
  //          board's bottom half (rows g–i, which led.sparky leaves empty):
  //          the under-glow, seen through the glass
  //   frame  violet pixels anywhere in the frame (with { frame: true })
  //   t      when the frame read was drawn (the read after it can stall)
  // __heroVioletNow reads the frame just drawn: call it straight after
  // awaiting __heroFrames.
  window.__heroViolet = async opts => { await window.__heroFrames(1); return window.__heroVioletNow(opts); };
  window.__heroVioletNow = (opts = {}) => {
    const t = performance.now();
    const img = grab(), a = window.Hero.anchors(), W = img.w, H = img.h, G = App.BOARD_GEOMETRY, bg = built.board;
    App.camera.updateMatrixWorld();
    let dome = null;
    built.parts.filter(p => p.type === 'led').forEach(p => p.group.traverse(o => { if (o.userData.ledDome) dome = o; }));
    const onScreen = v => { const p = v.clone().project(App.camera); return { x: (p.x + 1) / 2, y: (1 - p.y) / 2, z: p.z }; };
    const disc = (p, r) => {
      if (!p) return null;
      const cx = p.x * W, cy = p.y * H;
      return share(img, violet, (i, j) => Math.hypot(i - cx, j - cy) <= r, cx - r, cy - r, cx + r, cy + r);
    };
    bg.updateWorldMatrix(true, false);
    let n = 0, hit = 0;
    for (let c = 4; c <= G.COLS - 5; c += 2) {
      for (const row of ['g', 'h', 'i']) {
        const q = onScreen(bg.localToWorld(new THREE.Vector3((c - (G.COLS - 1) / 2) * G.HS + G.HS / 2, 0, G.ROW_Z[row])));
        const i = Math.round(q.x * W), j = Math.round(q.y * H);
        if (q.z > 1 || i < 0 || j < 0 || i >= W || j >= H) continue;
        const k = (j * W + i) * 4;
        n++;
        if (faint(img.d[k], img.d[k + 1], img.d[k + 2])) hit++;
      }
    }
    let frame = null;
    if (opts.frame) { frame = 0; for (let k = 0; k < img.d.length; k += 4) if (violet(img.d[k], img.d[k + 1], img.d[k + 2])) frame++; }
    return {
      path: disc(a.path, 0.025 * H),
      led: dome ? disc(onScreen(dome.getWorldPosition(new THREE.Vector3())), 0.05 * H) : null,
      under: n ? hit / n : 0,
      frame,
      t,
    };
  };

  // The first load of &stage=empty (#171), sampled frame by frame from the
  // first frame the canvas shows, for 2.5 s: neon pixels (the rails) and
  // light grey ones (the stencil's edges), every other pixel each way.
  if (/[?&]mode=hero/.test(location.search) && /[?&]stage=empty/.test(location.search)) {
    const arrival = window.__arrival = { samples: [], done: false };
    document.addEventListener('DOMContentLoaded', () => setTimeout(() => {   // after the viewer's own loop has started
      const start = performance.now();
      let t0 = null;
      const tick = () => {
        const el = window.App && App.renderer && App.renderer.domElement;
        if (el && el.style.visibility !== 'hidden' && el.width) {
          if (t0 === null) t0 = performance.now();
          const t = Math.round(performance.now() - t0);   // when this frame was drawn (the read after it can stall)
          const img = grab();
          let neon = 0, grey = 0;
          for (let j = 0; j < img.h; j += 2) {
            for (let i = 0; i < img.w; i += 2) {
              const k = (j * img.w + i) * 4, r = img.d[k], g = img.d[k + 1], b = img.d[k + 2];
              if (neonPx(r, g, b)) neon++;
              else if (Math.min(r, g, b) >= 90 && Math.max(r, g, b) - Math.min(r, g, b) <= 40) grey++;
            }
          }
          arrival.samples.push({ t, neon, grey });
          if (t > 2500) { arrival.done = true; return; }
        }
        if (performance.now() - start > 30_000) { arrival.done = true; return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, 0));
  }
}

// The viewer's scene and built board, then window.Hero and Hero.ready.
async function heroReady(frame) {
  await frame.waitForFunction(() => window.App && App.scene && App.camera && window.__heroBuilt && __heroBuilt.board, null, { timeout: 20_000, polling: 100 });
  await expect.poll(() => frame.evaluate(() => typeof window.Hero), { message: 'viewer.html?mode=hero puts window.Hero on the frame', timeout: 10_000 }).toBe('object');
  const api = await frame.evaluate(() => ({
    ready: !!(Hero.ready && typeof Hero.ready.then === 'function'),
    stage: typeof Hero.stage, current: typeof Hero.current,
  }));
  expect(api, 'Hero: { ready: Promise, stage(name), current() }').toEqual({ ready: true, stage: 'function', current: 'function' });
  await expect.poll(() => frame.evaluate(() => {
    if (!window.__heroState) {
      window.__heroState = 'waiting';
      Hero.ready.then(() => { window.__heroState = 'ready'; }, e => { window.__heroState = 'rejected: ' + e; });
    }
    return window.__heroState;
  }), { message: 'Hero.ready resolves once the circuit is drawn', timeout: 20_000 }).toBe('ready');
}

// The stub host page with the hero in its iframe. query: more of the
// hero's URL ('&stage=empty'); hidden: the iframe starts display:none (a
// page that reveals the hero later), so it loads at 0 × 0.
async function openHost(page, { hidden = false, query = '' } = {}) {
  let body = hostHtml(HERO + query);
  if (hidden) body = body.replace('<iframe ', '<iframe style="display: none" ');
  await page.route('**' + HOST, route => route.fulfill({ status: 200, contentType: 'text/html', body }));
  await page.goto(HOST);
  const iframe = page.locator('iframe');
  const frame = await (await iframe.elementHandle()).contentFrame();
  return { iframe, frame };
}

// The host's iframe resized to w × h, and the frame given a few frames to
// follow it.
async function resizeFrame(page, frame, w, h) {
  await page.evaluate(([w, h]) => { const f = document.querySelector('iframe'); f.style.width = `${w}px`; f.style.height = `${h}px`; }, [w, h]);
  await frame.evaluate(() => __heroFrames(3));
}

// Runs fn(stage name) in the frame as a promise that settles to 'resolved'
// or 'rejected: …', so a stage that doesn't exist yet fails an assertion,
// not the evaluate.
const stageTo = (frame, name) => frame.evaluate(n => Hero.stage(n).then(() => 'resolved', e => 'rejected: ' + (e && e.message)), name);

// Hero.bloom(): the bloom's strength now, a number (a string says why not).
const bloomOf = frame => frame.evaluate(() => (typeof Hero.bloom === 'function' ? Hero.bloom() : 'no Hero.bloom()'));
const bloomOn  = b => typeof b === 'number' && b > BLOOM_ON;
const bloomOff = b => typeof b === 'number' && b <= BLOOM_OFF;
const inside   = (r, f) => r.x0 >= 0 && r.y0 >= 0 && r.x1 <= f.W && r.y1 <= f.H;
const at       = r => `x ${r.x0.toFixed(0)}…${r.x1.toFixed(0)}, y ${r.y0.toFixed(0)}…${r.y1.toFixed(0)}`;

// The frame's four corners (4 px in), from a real screenshot, as [r, g, b].
async function corners(page, iframe) {
  const png = await iframe.screenshot();
  return page.evaluate(async b64 => {
    const { w, h, d } = await __shot(b64);
    const at = (x, y) => [...d.slice((y * w + x) * 4, (y * w + x) * 4 + 3)];
    const i = 4;
    return [at(i, i), at(w - 1 - i, i), at(i, h - 1 - i), at(w - 1 - i, h - 1 - i)];
  }, png.toString('base64'));
}

// The share of the pixels in a disc (radius GLOW_R of the frame's height)
// round (x, y), each 0 … 1 of the frame, that are bright red: the brightest
// channel ≥ 200, red ahead of green and of blue by 40 or more (so the host's
// magenta, were it to show, wouldn't count). From a real screenshot of the
// frame (target: the iframe's locator, or the page itself when the hero is
// top-level); a pixel of the disc outside the frame counts as not red.
async function redDisc(page, target, x, y) {
  const png = await target.screenshot();
  return page.evaluate(async ({ b64, x, y, R }) => {
    const { w, h, d } = await __shot(b64);
    const r = R * h, cx = x * w, cy = y * h, at = (i, j) => [...d.slice((j * w + i) * 4, (j * w + i) * 4 + 3)];
    let n = 0, red = 0;
    for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++) {
      for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) {
        if (Math.hypot(i - cx, j - cy) > r) continue;
        n++;
        if (i < 0 || j < 0 || i >= w || j >= h) continue;
        const [rr, g, b] = at(i, j);
        if (Math.max(rr, g, b) >= 200 && rr >= g + 40 && rr >= b + 40) red++;
      }
    }
    const ci = Math.min(w - 1, Math.max(0, Math.round(cx))), cj = Math.min(h - 1, Math.max(0, Math.round(cy)));
    return { share: n ? red / n : 0, n, centre: at(ci, cj).join(', ') };
  }, { b64: png.toString('base64'), x, y, R: GLOW_R });
}

// The neon rails in a real screenshot of the frame. Pink: red high, green
// low, blue mid (#FF3D7F and its glow); blue: blue high, red low, green mid
// (#3D7BFF). For each, how many pixels, and how many lie nearer a rail of
// their own sign (+ for pink, − for blue) than one of the other, the rails
// projected just before and just after the shot (the board turns). A
// wide glow spills past the midway line between a + and a − rail, so a
// share of each colour reads as the other's: the bar is a majority, which
// swapped colours fall far short of.
async function neonRails(page, iframe, frame) {
  const before = await frame.evaluate(() => __heroRails());
  const png = await iframe.screenshot();
  const after = await frame.evaluate(() => __heroRails());
  const rails = { pos: before.pos.concat(after.pos), neg: before.neg.concat(after.neg) };
  return page.evaluate(async ({ b64, rails }) => {
    const { w, h, d } = await __shot(b64);
    const seg = (x, y, [x0, y0, x1, y1]) => {
      const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L)) : 0;
      return Math.hypot(x - x0 - t * dx, y - y0 - t * dy);
    };
    const near = (x, y, segs) => segs.reduce((m, s) => Math.min(m, seg(x, y, s)), Infinity);
    const out = { pink: { n: 0, own: 0 }, blue: { n: 0, own: 0 } };
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = (j * w + i) * 4, r = d[k], g = d[k + 1], b = d[k + 2];
        const pink = r >= 150 && g <= 110 && b >= 60 && b <= 190 && r - b >= 50;
        const blue = b >= 150 && r <= 110 && g >= 60 && g <= 190 && b - g >= 50;
        if (!pink && !blue) continue;
        const toPos = near(i, j, rails.pos), toNeg = near(i, j, rails.neg);
        const c = pink ? out.pink : out.blue;
        c.n++;
        if (pink ? toPos < toNeg : toNeg < toPos) c.own++;
      }
    }
    return out;
  }, { b64: png.toString('base64'), rails });
}

// The + rails' glow, in a real screenshot of the frame. Down each pixel
// column a + rail crosses: its core, the brightest pink-to-white pixel
// within 30 px of the rail's row (red ≥ 120 and ahead of blue by 10, so not
// a white edge or the blue rail's core); then the light 6–20 px above and
// below that core: lit (red ≥ 64, well above the #101010 behind) and the
// mean red there. Bloom spreads the core's light into that band.
// → { columns, cores, lit (per core column), meanR (over the band) }.
async function railGlow(page, iframe, frame) {
  const { pos } = await frame.evaluate(() => __heroRails());
  const png = await iframe.screenshot();
  return page.evaluate(async ({ b64, segs }) => {
    const { w, h, d } = await __shot(b64);
    const px = (i, j) => { const k = (j * w + i) * 4; return [d[k], d[k + 1], d[k + 2]]; };
    const seen = new Set();
    let columns = 0, cores = 0, lit = 0, sumR = 0, n = 0;
    for (const [x0, y0, x1, y1] of segs) {
      if (Math.abs(x1 - x0) < 1e-6) continue;
      for (let i = Math.max(0, Math.ceil(Math.min(x0, x1))); i <= Math.min(w - 1, Math.floor(Math.max(x0, x1))); i++) {
        const yr = y0 + (y1 - y0) * (i - x0) / (x1 - x0), key = `${i}:${Math.round(yr / 80)}`;
        if (seen.has(key) || yr < -30 || yr > h + 30) continue;
        seen.add(key);
        columns++;
        let best = -1, yc = -1;
        for (let j = Math.max(0, Math.round(yr - 30)); j <= Math.min(h - 1, Math.round(yr + 30)); j++) {
          const [r, g, b] = px(i, j);
          if (r >= 120 && r >= b + 10 && r + g + b > best) { best = r + g + b; yc = j; }
        }
        if (yc < 0) continue;
        cores++;
        for (let dj = 6; dj <= 20; dj++) {
          for (const j of [yc - dj, yc + dj]) {
            if (j < 0 || j >= h) continue;
            const r = px(i, j)[0];
            n++; sumR += r;
            if (r >= 64) lit++;
          }
        }
      }
    }
    return { columns, cores, lit: cores ? lit / cores : 0, meanR: n ? sumR / n : 0 };
  }, { b64: png.toString('base64'), segs: pos });
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const near = (rgb, want, tol) => rgb.every((v, k) => Math.abs(v - want[k]) <= tol);
const partsAndWires = look => [...look.groups.filter(g => g.name !== 'breadboard'), ...look.wires];
// The column strips a saved circuit's parts and wires sit in, from the file
// (body rows only: a–e 'top', f–j 'bottom'), each once.
const stripsOf = file => {
  const seen = new Map();
  const add = h => { if (!h) return; const half = 'abcde'.includes(h.row) ? 'top' : 'fghij'.includes(h.row) ? 'bottom' : null; if (half) seen.set(`${h.col}${half}`, { col: h.col, half }); };
  for (const c of file.components) for (const h of c.holeRefs || []) add(h);
  for (const w of file.wires) { add(w.startHole); add(w.endHole); }
  return [...seen.values()];
};
// px from (x, y) to the segment [x0, y0, x1, y1].
const toSeg = (x, y, [x0, y0, x1, y1]) => {
  const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L)) : 0;
  return Math.hypot(x - x0 - t * dx, y - y0 - t * dy);
};
// A share, or why there is none.
const pct = v => (typeof v === 'number' ? v.toFixed(2) : String(v));

async function spin(frame) {
  const before = await frame.evaluate(() => __heroViewPoint());
  await frame.evaluate(n => __heroFrames(n), SPIN_RAFS);
  return dist(before, await frame.evaluate(() => __heroViewPoint()));
}

// ── 1. Line art ───────────────────────────────────────────────

test('?mode=hero: opaque #101010 over the page, every part drawn as white edges on a glass board, no solid part drawn, dashed axis lines, slowly rotating', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await page.addInitScript(installHeroSpy);
  const { iframe, frame } = await openHost(page);
  await heroReady(frame);
  const look = await frame.evaluate(() => __heroLook());
  expect(look.current, 'Hero.current() once ready').toBe('lineart');

  // Opaque on the landing's black, the rim fading to it: the corners read
  // #101010, not the magenta page behind.
  const cs = await corners(page, iframe);
  expect.soft(cs.map(c => near(c, INK_BG, 6)), `corners of the hero frame reading #101010; got ${JSON.stringify(cs)}`).toEqual([true, true, true, true]);

  // Framed on the whole board, with only a gentle push-in at every aspect
  // (#174, which replaces #163's zoom onto the circuit): the board's box
  // and LED1 + R1 wholly inside the frame.
  const fr = await frame.evaluate(() => __heroFraming());
  expect.soft(inside(fr.board, fr), `the board's box (${at(fr.board)}) wholly inside the ${fr.W}×${fr.H} frame at 'lineart'`).toBe(true);
  expect.soft(inside(fr.circuit, fr), `LED1 + R1 (${at(fr.circuit)}) wholly inside the ${fr.W}×${fr.H} frame`).toBe(true);

  // Every part in the circuit file, and the board, each drawn as its own
  // edges; the parts and wires draw no mesh, the board at most a faint glass
  // fill, and no ground.
  const file = await frame.evaluate(c => fetch('/' + c).then(r => r.json()), CIRCUIT);
  const types = file.components.map(x => x.type);
  expect(look.groups.map(g => g.name).sort(), 'groups drawn (App.buildPart once per part in the file, plus the breadboard)').toEqual([...types, 'breadboard'].sort());
  for (const g of look.groups.filter(x => !x.offboard)) {
    expect(g.edgesDrawn, `${g.name}: edges (userData.heroRole 'edges') drawn inside its group`).toBeGreaterThan(0);
  }
  for (const g of partsAndWires(look)) {
    expect(g.meshesDrawn, `${g.name}: solid meshes drawn in 'lineart'`).toBe(0);
  }
  for (const g of look.groups.filter(x => x.name !== 'breadboard' && !x.offboard)) {
    expect(g.edgesGeometry, `${g.name}: edges are LineSegments of an EdgesGeometry in a LineBasicMaterial`).toBeGreaterThan(0);
  }

  // The battery stays out of the sketch (#174): nothing in BAT1's group
  // draws, while its two leads do, running off the board's edge.
  const batIdx = file.components.findIndex(x => x.label === 'BAT1');
  expect(look.groups.filter(g => g.offboard).map(g => g.name), 'off-board parts drawn (BAT1)').toEqual([file.components[batIdx].type]);
  expect.soft(look.groups.find(g => g.offboard).drawn, 'BAT1: its meshes and lines drawn in \'lineart\'').toBe(0);
  const leads = look.wires.filter(w => w.lead);
  expect(leads.length, 'BAT1\'s leads (wires with an end at it)').toBe(file.wires.filter(w => [w.startCompIdx, w.endCompIdx].includes(batIdx)).length);
  for (const w of leads) expect(w.edgeLevel, `${w.name}, a lead of BAT1: its edges' ink in 'lineart' (1 = full)`).toBeGreaterThanOrEqual(DRAWN);

  const board = look.groups.find(g => g.name === 'breadboard');
  expect(board.builtMax, 'the board\'s own meshes in \'lineart\': at most a faint glass fill (the most any draws, 1 = opaque)').toBeLessThanOrEqual(0.15);
  expect(look.groundDrawn, 'the bench (ground) drawn').toBe(false);
  const notWhite = look.edgeColours.filter(hex => hex === null || ![hex >> 16, (hex >> 8) & 255, hex & 255].every(c => c >= 0xf0));
  expect(notWhite.map(h => h === null ? 'none' : '#' + h.toString(16).padStart(6, '0')), 'edge colours that are not white (default ink)').toEqual([]);

  // Dashed axis lines that actually dash.
  expect(look.axis.length, 'axis lines (userData.heroRole \'axis\')').toBeGreaterThan(0);
  for (const a of look.axis) expect(a, 'an axis line: a Line, LineDashedMaterial, lineDistance computed, drawn').toEqual({ line: true, dashed: true, distances: true, drawn: true });

  // Slow rotation: the board moves in the camera's view.
  expect(await spin(frame), `a point on the board moved in view over ${SPIN_RAFS} frames`).toBeGreaterThan(0.01);

  // On the landing's stage, 1440 × 517 (#174): at 'empty' the board's box
  // wide and inside the frame (its ends may reach into the faded rim); at
  // the end of 'lineart' LED1 big enough to light and the board still
  // inside top and bottom.
  await resizeFrame(page, frame, STAGE_W, STAGE_H);
  expect(await stageTo(frame, 'empty'), `Hero.stage('empty') in ${STAGE_W}×${STAGE_H}`).toBe('resolved');
  const se = await frame.evaluate(() => __heroFraming());
  expect([se.W, se.H], 'the frame\'s size after the resize').toEqual([STAGE_W, STAGE_H]);
  expect.soft(inside(se.board, se), `the board's box (${at(se.board)}) inside the ${se.W}×${se.H} frame at 'empty'`).toBe(true);
  expect.soft((se.board.x1 - se.board.x0) / se.W, `the board's width as a share of the ${se.W}×${se.H} frame's at 'empty'`).toBeGreaterThanOrEqual(BOARD_WIDE);
  expect(await stageTo(frame, 'lineart'), `Hero.stage('lineart') in ${STAGE_W}×${STAGE_H}`).toBe('resolved');
  const sl = await frame.evaluate(() => __heroFraming());
  expect.soft(sl.dome.x1 - sl.dome.x0, `LED1's dome across at the end of 'lineart' in ${sl.W}×${sl.H}, px`).toBeGreaterThanOrEqual(DOME_PX);
  expect.soft(sl.board.y0 >= 0 && sl.board.y1 <= sl.H, `the board's box (${at(sl.board)}) inside the top and bottom of the ${sl.W}×${sl.H} frame at the end of 'lineart'`).toBe(true);

  // Across 2 : 1, where the wide framing begins: no jump.
  const holesIn = async (w, h) => { await resizeFrame(page, frame, w, h); return frame.evaluate(() => Hero.anchors().holes); };
  const narrow = await holesIn(999, 500), wide = await holesIn(1001, 500);
  expect.soft(Math.abs(wide.y - narrow.y), `anchors().holes.y from 999×500 (${narrow.y.toFixed(3)}) to 1001×500 (${wide.y.toFixed(3)})`).toBeLessThan(0.02);
  expect(errors).toEqual([]);
});

// ── 2. Solid, then lit, then both ways ────────────────────────

test('Hero.stage, in a frame loaded hidden then shown: \'solid\' cross-fades the edges into the shaded parts over ~1.2 s, \'lit\' lights LED1 and posts edison:lit to the page, and \'lit\' → \'empty\' → \'lit\' hides the parts, puts the light out and posts again', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await page.addInitScript(installHeroSpy);
  // Loaded while hidden (0 × 0), as a landing page that reveals the hero
  // later does; shown once ready, it still frames the circuit.
  const { iframe, frame } = await openHost(page, { hidden: true });
  await heroReady(frame);
  // anchors() while still 0 × 0 (#174): every x and y a finite 0 … 1.
  const blind = await frame.evaluate(() => Hero.anchors());
  expect(Object.keys(blind).length, `anchors() while 0 × 0: ${JSON.stringify(Object.keys(blind))}`).toBeGreaterThan(0);
  expect.soft(Object.entries(blind).filter(([, a]) => ![a.x, a.y].every(v => Number.isFinite(v) && v >= 0 && v <= 1)).map(([k, a]) => `${k}: (${a.x}, ${a.y})`),
    'anchors() whose x or y is not a finite 0 … 1 while the frame is 0 × 0').toEqual([]);
  await page.evaluate(() => { document.querySelector('iframe').style.display = 'block'; });
  await frame.evaluate(() => __heroFrames(5));
  const shown = await frame.evaluate(() => ({ cam: App.camera.position.toArray(), ...__heroFraming() }));
  expect(shown.cam.every(Number.isFinite), `App.camera.position after loading hidden, then shown: (${shown.cam.join(', ')})`).toBe(true);
  const c = shown.circuit;
  expect(c.x0 >= 0 && c.y0 >= 0 && c.x1 <= shown.W && c.y1 <= shown.H, `LED1 + R1 wholly inside the ${shown.W}×${shown.H} frame once shown: x ${c.x0}…${c.x1}, y ${c.y0}…${c.y1}`).toBe(true);

  const lit = () => page.evaluate(() => window.__msgs.filter(m => m.data && m.data.type === 'edison:lit'));
  expect(await lit(), 'no edison:lit before \'lit\'').toEqual([]);

  // 'solid': sample every frame until the stage's promise resolves.
  const fade = await frame.evaluate(async () => {
    const t0 = performance.now();
    let done = false;
    const p = Promise.resolve(Hero.stage('solid')).then(() => { done = true; });
    const samples = [];
    while (!done && performance.now() - t0 < 10_000) {
      await new Promise(r => requestAnimationFrame(r));
      samples.push(__heroLook().solidMean);
    }
    await p;
    return { took: performance.now() - t0, samples };
  });
  expect(fade.took, 'Hero.stage(\'solid\') resolves after the cross-fade (~1.2 s), ms').toBeGreaterThanOrEqual(800);
  const mid = fade.samples.filter(s => s > 0.05 && s < 0.95);
  expect(mid.length, `frames caught mid-fade (parts partly opaque); samples ${JSON.stringify(fade.samples.map(s => s && +s.toFixed(2)))}`).toBeGreaterThan(0);

  const solid = await frame.evaluate(() => __heroLook());
  expect(solid.current, 'Hero.current() after stage(\'solid\')').toBe('solid');
  for (const g of solid.groups) expect(g.leastSolid, `${g.name}: every mesh back to its as-built opacity (1 = as built)`).toBeGreaterThanOrEqual(0.99);
  expect(solid.edgesInScene, 'the edges are still there to fade').toBeGreaterThan(0);
  expect(solid.edgesDrawnInScene, 'edges drawn after \'solid\'').toBe(0);
  expect(solid.dome, 'LED1\'s dome (userData.ledDome)').not.toBeNull();
  expect(solid.groups.find(g => g.offboard).drawn, 'BAT1: its meshes drawn at \'solid\' (it fades in with the solid render)').toBeGreaterThan(0);
  const bloomSolid = await bloomOf(frame);
  expect.soft(bloomOff(bloomSolid), `Hero.bloom() at 'solid' (≤ ${BLOOM_OFF}, the simulator crisp): ${bloomSolid}`).toBe(true);
  // #171: the sketch's violet (paths, sketch glow, under-glow) all gone.
  const violetSolid = (await frame.evaluate(() => __heroViolet({ frame: true }))).frame;
  expect.soft(violetSolid, 'violet pixels anywhere in the frame at \'solid\'').toBeLessThanOrEqual(SOLID_VIOLET);
  expect(await lit(), 'no edison:lit after \'solid\'').toEqual([]);

  // 'lit': the LED glows and the page is told, and where (0 … 1 of the frame).
  const domeAt = await frame.evaluate(async () => { await Hero.stage('lit'); return __heroFraming().domeAt; });
  const on = await frame.evaluate(() => __heroLook());
  expect(on.current, 'Hero.current() after stage(\'lit\')').toBe('lit');
  expect(on.dome.glow, `LED1's dome emissive intensity lit vs solid (${solid.dome.glow})`).toBeGreaterThan(solid.dome.glow);
  expect(on.dome.level, 'LED1\'s dome drawn').toBeGreaterThan(0.5);
  await expect.poll(async () => (await lit()).filter(m => m.fromFrame).length, { message: 'the hero frame posted { type: \'edison:lit\' } to its parent' })
    .toBeGreaterThan(0);
  const msg = (await lit()).find(m => m.fromFrame).data;
  for (const [k, i] of [['x', 0], ['y', 1]]) {
    expect(typeof msg[k], `edison:lit's ${k}: a number; message ${JSON.stringify(msg)}`).toBe('number');
    expect(msg[k] >= 0 && msg[k] <= 1, `edison:lit's ${k} (${msg[k]}) within 0 … 1 of the frame`).toBe(true);
    expect(Math.abs(msg[k] - domeAt[i]), `edison:lit's ${k} (${msg[k]}) vs LED1's dome projected (${domeAt[i].toFixed(3)})`).toBeLessThanOrEqual(0.05);
  }

  // A glow the page can see: round that point the frame is bright red.
  const glow = await redDisc(page, iframe, msg.x, msg.y);
  expect(glow.share, `share of the ${glow.n} px within ${GLOW_R * 100}% of the frame's height of (x, y) that are bright red (max channel ≥ 200, red ≥ green + 40 and ≥ blue + 40); centre px rgb(${glow.centre})`)
    .toBeGreaterThanOrEqual(0.6);
  // Lit, the camera still sound and the circuit in view; the bloom off,
  // the halo carrying the LED.
  const litView = await frame.evaluate(() => ({ cam: App.camera.position.toArray(), ...__heroFraming() }));
  expect(litView.cam.every(Number.isFinite), `App.camera.position at 'lit': (${litView.cam.join(', ')})`).toBe(true);
  expect(inside(litView.circuit, litView), `LED1 + R1 (${at(litView.circuit)}) wholly inside the ${litView.W}×${litView.H} frame at 'lit'`).toBe(true);
  const bloomLit = await bloomOf(frame);
  expect.soft(bloomOff(bloomLit), `Hero.bloom() at 'lit' (≤ ${BLOOM_OFF}): ${bloomLit}`).toBe(true);

  // Both ways, for a replay: 'lit' → 'empty' hides the parts and wires and
  // puts the light out; 'lit' again lights it and tells the page again.
  expect(await stageTo(frame, 'empty'), 'Hero.stage(\'empty\') from \'lit\'').toBe('resolved');
  const gone = await frame.evaluate(() => __heroLook());
  expect(gone.current, 'Hero.current() after \'lit\' → \'empty\'').toBe('empty');
  expect(partsAndWires(gone).filter(g => g.drawn > 0).map(g => `${g.name}: ${g.drawn}`), 'parts and wires with anything drawn after \'lit\' → \'empty\'').toEqual([]);
  const dark = await redDisc(page, iframe, msg.x, msg.y);
  expect(dark.share, `bright red share round where LED1 was lit, after 'empty' (lit: ${glow.share.toFixed(2)}); centre px rgb(${dark.centre})`).toBeLessThan(0.2);

  expect(await stageTo(frame, 'lit'), 'Hero.stage(\'lit\') from \'empty\'').toBe('resolved');
  const relit = await frame.evaluate(() => __heroLook());
  expect(relit.current, 'Hero.current() after \'empty\' → \'lit\'').toBe('lit');
  expect(relit.solidMin, 'every part and board mesh back as built after \'empty\' → \'lit\' (1 = as built)').toBeGreaterThanOrEqual(0.99);
  expect(relit.dome.glow, `LED1's dome emissive intensity lit again vs solid (${solid.dome.glow})`).toBeGreaterThan(solid.dome.glow);
  await expect.poll(async () => (await lit()).filter(m => m.fromFrame).length, { message: 'edison:lit posts from the frame after \'lit\' → \'empty\' → \'lit\'' })
    .toBe(2);
  expect(errors).toEqual([]);
});

// ── 3. Ink and reduced motion ─────────────────────────────────

// Top-level here, so window.parent is the page itself: edison:lit lands on
// its own window.
test('&ink=%23101010 colours the line art #101010 and Hero.ink recolours it live; with reduced motion nothing rotates, stages jump (\'lit\' straight from \'lineart\', \'empty\', the parts and the build-up back at once), the stage API holds up, and \'solid\' after \'lit\' puts the halo out', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installHeroSpy);
  await page.addInitScript(() => {
    window.__litPosts = 0;
    addEventListener('message', e => { if (e.data && e.data.type === 'edison:lit') { window.__litPosts++; window.__litAt = e.data; } });
  });
  await page.goto(HERO + '&ink=%23101010');
  await heroReady(page.mainFrame());

  const look = await page.evaluate(() => __heroLook());
  expect(look.edgesInScene, 'edges drawn').toBeGreaterThan(0);
  expect(look.edgeColours, 'edge colours with &ink=%23101010').toEqual([0x101010]);
  expect(look.axisColours, 'axis line colours with &ink=%23101010').toEqual([0x101010]);

  // Hero.ink(hex) recolours the line art in place (edges and axes); a bad
  // value changes nothing and doesn't throw.
  expect(await page.evaluate(() => typeof Hero.ink), 'Hero.ink').toBe('function');
  const inked = await page.evaluate(() => {
    const out = [];
    for (const v of ['#f4f4f4', '#101010', 'nope', '#12345g']) {
      let threw = null;
      try { Hero.ink(v); } catch (e) { threw = e.message; }
      const l = __heroLook();
      out.push({ ink: v, threw, edges: l.edgeColours, axis: l.axisColours });
    }
    return out;
  });
  expect(inked, 'line art colours after each Hero.ink(value), in turn').toEqual([
    { ink: '#f4f4f4', threw: null, edges: [0xf4f4f4], axis: [0xf4f4f4] },
    { ink: '#101010', threw: null, edges: [0x101010], axis: [0x101010] },
    { ink: 'nope',    threw: null, edges: [0x101010], axis: [0x101010] },
    { ink: '#12345g', threw: null, edges: [0x101010], axis: [0x101010] },
  ]);

  expect(await spin(page.mainFrame()), `a point on the board moved in view over ${SPIN_RAFS} frames (reduced motion)`).toBeLessThan(1e-4);

  // 'lit' straight from 'lineart', asked twice at once: two frames later it
  // is there (no tween), solid and lit, and the page was told once.
  const jumped = await page.evaluate(async () => {
    const both = Promise.all([Hero.stage('lit'), Hero.stage('lit')]);
    await __heroFrames(2);
    const look = __heroLook();
    const settled = await Promise.race([both.then(() => 'resolved', e => 'rejected: ' + e.message), new Promise(r => setTimeout(() => r('pending after 3 s'), 3000))]);
    return { ...look, settled };
  });
  expect(jumped.current, 'Hero.current() two frames after stage(\'lit\') from \'lineart\'').toBe('lit');
  expect(jumped.solidMin, 'every part and board mesh at its as-built opacity two frames in (1 = as built)').toBeGreaterThanOrEqual(0.99);
  expect(jumped.edgesDrawnInScene, 'edges drawn two frames after stage(\'lit\')').toBe(0);
  expect(jumped.settled, 'both stage(\'lit\') promises').toBe('resolved');

  // Once more after it settled, then a flush: messages arrive in order, so
  // every edison:lit has landed by the time the flush does.
  const posts = await page.evaluate(async () => {
    await Hero.stage('lit');
    await new Promise(r => {
      const f = e => { if (e.data === '__flush') { removeEventListener('message', f); r(); } };
      addEventListener('message', f);
      postMessage('__flush', '*');
    });
    return window.__litPosts;
  });
  expect(posts, 'edison:lit messages after stage(\'lit\') three times (two at once, one after)').toBe(1);

  // While lit, the halo shows round the place the message gave.
  const litAt = await page.evaluate(() => window.__litAt);
  const litGlow = await redDisc(page, page, litAt.x, litAt.y);
  expect(litGlow.share, `bright red share round the LED (${litAt.x.toFixed(3)}, ${litAt.y.toFixed(3)}) while lit; centre px rgb(${litGlow.centre})`).toBeGreaterThanOrEqual(0.6);

  // A bad name rejects, and the next stage still runs.
  const after = await page.evaluate(async () => {
    const timeout = () => new Promise(r => setTimeout(() => r('pending after 3 s'), 3000));
    let bad;
    try { bad = await Promise.race([Hero.stage('nope').then(() => 'resolved', () => 'rejected'), timeout()]); } catch (e) { bad = 'threw: ' + e.message; }
    const next = await Promise.race([Hero.stage('solid').then(() => 'resolved', e => 'rejected: ' + e.message), timeout()]);
    return { bad, next, current: Hero.current() };
  });
  expect(after, 'stage(\'nope\'), then stage(\'solid\')').toEqual({ bad: 'rejected', next: 'resolved', current: 'solid' });

  // Back to 'solid' from 'lit', the halo is gone (it was there while lit).
  const dark = await redDisc(page, page, litAt.x, litAt.y);
  expect(dark.share, `bright red share round the LED (${litAt.x.toFixed(3)}, ${litAt.y.toFixed(3)}) after 'solid' (lit: ${litGlow.share.toFixed(2)}); centre px rgb(${dark.centre})`).toBeLessThan(0.2);

  // 'solid' → 'empty' → 'lineart', each there two frames on: the parts and
  // wires hidden, then all drawn back at once (no draw-in with reduced motion).
  const jumps = await page.evaluate(async () => {
    const out = {};
    for (const name of ['empty', 'lineart']) {
      let done = false;
      const p = Hero.stage(name).then(() => { done = true; return 'resolved'; }, e => 'rejected: ' + e.message);
      await __heroFrames(2);
      const within2 = done;
      const l = __heroLook(), items = [...l.groups.filter(g => g.name !== 'breadboard'), ...l.wires];
      const v = await __heroViolet();
      out[name] = {
        within2,
        violet: { path: v.path, led: v.led, under: v.under },
        current: l.current,
        drawn: items.filter(g => g.drawn > 0).map(g => g.name),
        notFull: items.filter(g => !g.offboard && g.edgeLevel < 0.8).map(g => g.name),
        battery: items.filter(g => g.offboard).map(g => g.drawn),
        settled: await Promise.race([p, new Promise(r => setTimeout(() => r('pending after 3 s'), 3000))]),
      };
    }
    return out;
  });
  expect(jumps.empty.settled, 'stage(\'empty\') from \'solid\'').toBe('resolved');
  expect({ current: jumps.empty.current, drawn: jumps.empty.drawn }, 'two frames after stage(\'empty\'): the stage, and parts and wires with anything drawn').toEqual({ current: 'empty', drawn: [] });
  // #171: the build-up jumps too: done within two frames, its violet all there.
  expect.soft(jumps.lineart.within2, 'stage(\'lineart\') from \'empty\' resolved within two frames (reduced motion: the build-up jumps)').toBe(true);
  const [ve, vl] = [jumps.empty.violet, jumps.lineart.violet];
  expect.soft({ path: typeof vl.path === 'number' && vl.path >= (ve.path ?? 0) + PATH_UP, under: vl.under >= ve.under + UNDER_UP },
    `the build-up's violet two frames into 'lineart' over 'empty' (path ${pct(ve.path)} → ${pct(vl.path)}, under ${pct(ve.under)} → ${pct(vl.under)}; LED1's glow is checked in the build-up, from LED1 drawn in)`)
    .toEqual({ path: true, under: true });
  expect({ current: jumps.lineart.current, notFull: jumps.lineart.notFull, battery: jumps.lineart.battery, settled: jumps.lineart.settled },
    'two frames after stage(\'lineart\') from \'empty\': the stage, the parts and wires not yet at full ink (BAT1 aside), and BAT1\'s meshes and lines drawn (#174: none)')
    .toEqual({ current: 'lineart', notFull: [], battery: [0], settled: 'resolved' });
  expect(errors).toEqual([]);
});

// ── 4. Pin: the default viewer ────────────────────────────────
// Passes today. The default viewer (classic landing page, textbook figures)
// keeps its opaque scene and auto-rotation, with no hero objects.

test('pin: viewer.html with no mode still has an opaque scene, auto-rotates, and draws solid parts with no hero lines', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await page.addInitScript(installHeroSpy);
  await page.goto('/circuit3d/viewer.html');
  await page.waitForFunction(() => window.App && App.scene && window.__heroBuilt && __heroBuilt.board && __heroBuilt.parts.length > 0, null, { timeout: 20_000 });

  const look = await page.evaluate(() => {
    App.renderer.render(App.scene, App.camera);   // rendered and read in one task
    const gl = App.renderer.getContext(), px = new Uint8Array(4);
    gl.readPixels(2, 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { bg: !!(App.scene.background && App.scene.background.isColor), alpha: px[3], autoRotate: App.controls.autoRotate, ...__heroLook() };
  });
  expect(look.bg, 'scene.background is a colour').toBe(true);
  expect(look.alpha, 'corner pixel alpha').toBe(255);
  expect(look.autoRotate, 'App.controls.autoRotate').toBe(true);
  expect(look.heroObjects, 'hero edges/axis objects in the default viewer').toBe(0);
  expect(await page.evaluate(() => typeof THREE.EffectComposer), 'THREE.EffectComposer in the default viewer (the bloom\'s scripts load only in hero mode)').toBe('undefined');
  expect(look.solidMin, 'every part and board mesh as built (1 = as built)').toBeGreaterThanOrEqual(0.99);
  expect(await spin(page.mainFrame()), `a point on the board moved in view over ${SPIN_RAFS} frames`).toBeGreaterThan(0.01);
  expect(errors).toEqual([]);
});

// ── 5. Empty, the draw-in, anchors ────────────────────────────
// The landing's opening: the bare glass board turning (ref 04, Quindar's
// ref 03), then the parts drawing in, with the callouts pinned to
// Hero.anchors().

test('&stage=empty: the stencil, then the rails; the glass board alone, turning, + rails neon pink and − rails neon blue; stage(\'lineart\') builds up in ~3.5 s (violet circuit paths, the parts drawn in, LED1\'s sketch glow, the violet under-glow); Hero.anchors() pin LED1, R1, the path and the casing and follow the turn; back to \'empty\' the violet goes', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await page.addInitScript(installHeroSpy);
  const { iframe, frame } = await openHost(page, { query: '&stage=empty' });
  await heroReady(frame);
  const programsReady = await frame.evaluate(() => App.renderer.info.programs.length);
  const file = await frame.evaluate(c => fetch('/' + c).then(r => r.json()), CIRCUIT);

  // First load (#171, storyboard 01 → 02): the stencil first, its outline
  // edges and no neon, then the rails fade up. Read off the canvas frame by
  // frame from the first it shows (the first can take seconds headless,
  // compiling the bloom; its time is when it was drawn).
  await frame.waitForFunction(() => window.__arrival && __arrival.done, null, { timeout: 30_000, polling: 100 });
  const arrival = await frame.evaluate(() => __arrival.samples);
  const early = arrival.filter(x => x.t <= 250), later = arrival.filter(x => x.t >= 1500);
  expect(early.length > 0 && later.length > 0, `frames read in the first 250 ms and from 1.5 s on: ${JSON.stringify(arrival.map(x => x.t))}`).toBe(true);
  const railsUp = Math.max(...later.map(x => x.neon));
  expect.soft(Math.max(...early.map(x => x.neon)), `neon pixels (every other one each way) in the first 250 ms: the stencil (from 1.5 s on, ${railsUp})`).toBeLessThanOrEqual(Math.max(3, 0.02 * railsUp));
  expect.soft(Math.max(...early.map(x => x.grey)), 'light grey pixels in the first 250 ms: the stencil\'s edges').toBeGreaterThanOrEqual(100);
  expect.soft(railsUp, 'neon pixels from 1.5 s on: the rails up').toBeGreaterThanOrEqual(300);

  // The board alone, as glass.
  const empty = await frame.evaluate(() => __heroLook());
  expect(empty.current, 'Hero.current() once ready with &stage=empty (the draw-in below starts from it)').toBe('empty');
  expect(empty.wires.length, 'wires in the scene (groups outside the board and parts holding a tube), one per wire in the file').toBe(file.wires.length);
  expect.soft(partsAndWires(empty).filter(g => g.drawn > 0).map(g => `${g.name}: ${g.drawn}`), 'parts and wires with anything drawn (meshes, edges, sprites) in \'empty\'').toEqual([]);
  const board = empty.groups.find(g => g.name === 'breadboard');
  expect.soft(board.edgesDrawn, 'the board\'s edges drawn in \'empty\'').toBeGreaterThan(0);
  expect.soft(board.builtMax, 'the board\'s own meshes in \'empty\': at most a faint glass fill (the most any draws, 1 = opaque)').toBeLessThanOrEqual(0.15);
  expect.soft(await spin(frame), `a point on the board moved in view over ${SPIN_RAFS} frames ('empty' turns)`).toBeGreaterThan(0.01);

  // The rails glow, each in its own colour, read from a screenshot.
  const neon = await neonRails(page, iframe, frame);
  for (const [name, c, rail] of [['pink', neon.pink, '+'], ['blue', neon.blue, '−']]) {
    expect.soft(c.n, `neon ${name} pixels in the frame`).toBeGreaterThanOrEqual(60);
    expect.soft(c.n ? c.own / c.n : 0, `share of the ${c.n} neon ${name} pixels nearer a ${rail} rail than the other (swapped colours read under 0.3)`).toBeGreaterThanOrEqual(0.6);
  }

  // The whole board in view and wide (#174), no battery yet, and the glow
  // real: Hero.bloom() on, and the + rails' light spread round their cores.
  const fe = await frame.evaluate(() => ({ ...__heroFraming(), a: Hero.anchors() }));
  expect.soft(inside(fe.board, fe), `the board's box (${at(fe.board)}) wholly inside the ${fe.W}×${fe.H} frame at 'empty'`).toBe(true);
  expect.soft((fe.board.x1 - fe.board.x0) / fe.W, 'the board\'s width as a share of the frame\'s at \'empty\'').toBeGreaterThanOrEqual(BOARD_WIDE);
  expect.soft(fe.a.BAT1 && fe.a.BAT1.visible, `anchors().BAT1.visible at 'empty' (BAT1 hidden): ${JSON.stringify(fe.a.BAT1)}`).toBe(false);
  const bloomEmpty = await bloomOf(frame);
  expect.soft(bloomOn(bloomEmpty), `Hero.bloom() at 'empty' (> ${BLOOM_ON}): ${bloomEmpty}`).toBe(true);
  const halo = await railGlow(page, iframe, frame);
  expect(halo.cores, `pixel columns where a + rail's core was found (of ${halo.columns} it crosses)`).toBeGreaterThanOrEqual(200);
  expect.soft(halo.meanR, `mean red 6–20 px either side of the + rails' cores at 'empty' (bloom spreads their light; ${halo.lit.toFixed(1)} of 30 px lit per column)`).toBeGreaterThanOrEqual(GLOW_RED);

  // The sketch's violet at 'empty', what the build-up is measured against.
  const base = await frame.evaluate(() => __heroViolet());

  // 'lineart' (#171, storyboard 03 → 07): a build-up of ~3.5 s, resolved
  // within 5 s. The circuit paths glow violet first; the parts and wires
  // draw in, one after another; LED1's sketch glow; the glass; last the
  // violet under-glow. BAT1 is no part of the sketch (#174) and is watched
  // to stay hidden at every frame. Read off the canvas frame by frame.
  // Parts every frame; the canvas's pixels every ~120 ms (reading them is slow).
  const build = await frame.evaluate(async full => {
    const t0 = performance.now(), at = {}, samples = [];
    let settled = null, names = [], batMax = 0, read = -Infinity, last = 0, gap = 0, ledBase = null;
    Hero.stage('lineart').then(() => { settled = Math.round(performance.now() - t0); }, e => { settled = 'rejected: ' + e.message; });
    while (performance.now() - t0 < 6000) {
      await __heroFrames(1);
      const t = Math.round(performance.now() - t0);
      if (settled === null || t <= settled) gap = Math.max(gap, t - last);   // the longest wait for a frame while it built
      last = t;
      const l = __heroLook(), items = [...l.groups.filter(g => g.name !== 'breadboard' && !g.offboard), ...l.wires];
      batMax = Math.max(batMax, ...l.groups.filter(g => g.offboard).map(g => g.drawn));
      names = items.map(g => g.name);
      const ledNow = !('led' in at);
      for (const g of items) if (g.edgeLevel >= full && !(g.name in at)) at[g.name] = t;
      const done = settled !== null && names.every(n => n in at);
      const ledIn = ledNow && 'led' in at;   // LED1 just reached full ink: the end of the 'parts' step
      if (t - read >= 120 || done || ledIn) {
        read = t;
        const v = __heroVioletNow();
        samples.push({ t, path: v.path, led: v.led, under: v.under });
        if (ledIn) ledBase = v.led;
      }
      if (done) break;
    }
    return { at, names, settled, batMax, samples, gap, ledBase, programs: App.renderer.info.programs.length, current: Hero.current() };
  }, DRAWN);
  const drawIn = build;
  // A frame that stalls (a slow machine compiling the parts' shaders the
  // first time they draw) can swallow the whole timeline: then the order
  // and the stagger can't be seen, and are noted rather than failed.
  const seen = build.gap <= 400;
  if (!seen) test.info().annotations.push({ type: 'unmeasured', description: `frames up to ${build.gap} ms apart while 'lineart' built: its stagger and order not checked` });
  const never = build.names.filter(n => !(n in build.at));
  expect(never, `parts and wires never at full ink in the build-up; first at full ink (ms): ${JSON.stringify(build.at)}`).toEqual([]);
  const times = Object.values(build.at);
  if (seen) expect(Math.max(...times) - Math.min(...times), `ms from the first part drawn in to the last (staggered, not at once): ${JSON.stringify(build.at)}`).toBeGreaterThanOrEqual(300);
  expect({ current: build.current, settled: typeof build.settled }, `after stage('lineart'): the stage, and its promise (${build.settled})`).toEqual({ current: 'lineart', settled: 'number' });
  // Every shader built by Hero.ready (warmed up), none in the build-up: a
  // program built mid-way stalls a frame and swallows the timeline.
  expect(build.programs, `shader programs (App.renderer.info.programs) once 'lineart' is built vs at Hero.ready (${programsReady})`).toBe(programsReady);
  expect.soft(build.settled >= BUILD_MIN && build.settled <= BUILD_MAX, `ms until stage('lineart') from 'empty' resolved: ${build.settled} (a ~3.5 s build-up: ${BUILD_MIN}–${BUILD_MAX})`).toBe(true);

  // Its violet, in the storyboard's order: the first frame each feature
  // rises over its share at 'empty'.
  // LED1's sketch glow is measured from LED1 drawn in (the paths behind it
  // on screen already add violet there).
  const rise = (key, up, from = base[key] ?? 0, after = -1) => { const x = build.samples.find(v => v.t >= after && typeof v[key] === 'number' && v[key] >= from + up); return x ? x.t : null; };
  const peak = key => pct(Math.max(0, ...build.samples.map(v => v[key] ?? 0)));
  const ledBase = build.ledBase ?? 0;
  const tPath = rise('path', PATH_UP), tGlow = rise('led', LED_UP, ledBase, build.at.led ?? 0), tUnder = rise('under', UNDER_UP), tParts = Math.min(...times);
  expect.soft(tPath, `ms to violet round anchors().path (share ≥ 'empty' ${pct(base.path)} + ${PATH_UP}; the most seen ${peak('path')}): the circuit paths`).not.toBeNull();
  expect.soft(tGlow, `ms to violet round LED1's dome after it is drawn in (share ≥ ${pct(build.ledBase)} at ${build.at.led} ms + ${LED_UP}; the most seen ${peak('led')}): LED1's sketch glow`).not.toBeNull();
  expect.soft(tUnder, `ms to faint violet over the board's empty half (share ≥ 'empty' ${pct(base.under)} + ${UNDER_UP}; the most seen ${peak('under')}): the under-glow`).not.toBeNull();
  if (seen && tPath !== null) expect.soft(tPath, `the paths (ms) before the first part is drawn in (${tParts} ms)`).toBeLessThan(tParts);
  if (seen && tGlow !== null && tUnder !== null) expect.soft(tUnder, `the under-glow (ms) after LED1's sketch glow (${tGlow} ms)`).toBeGreaterThanOrEqual(tGlow);

  // The end of 'lineart' (#174): still the whole board (a gentle push-in,
  // no zoom onto the circuit), BAT1 hidden all the way though its leads
  // draw, and the bloom still on.
  const fl = await frame.evaluate(() => ({ ...__heroFraming(), a: Hero.anchors(), look: __heroLook() }));
  expect.soft(inside(fl.board, fl), `the board's box (${at(fl.board)}) wholly inside the ${fl.W}×${fl.H} frame at the end of 'lineart'`).toBe(true);
  expect.soft(drawIn.batMax, 'BAT1: the most of its meshes and lines drawn at any frame of the draw-in').toBe(0);
  expect.soft(fl.look.groups.find(g => g.offboard).drawn, 'BAT1: its meshes and lines drawn at the end of \'lineart\'').toBe(0);
  const leadsL = fl.look.wires.filter(w => w.lead);
  const batIdx = file.components.findIndex(x => x.label === 'BAT1');
  expect(leadsL.length, 'BAT1\'s leads (wires with an end at it)').toBe(file.wires.filter(w => [w.startCompIdx, w.endCompIdx].includes(batIdx)).length);
  for (const w of leadsL) expect(w.edgeLevel, `${w.name}, a lead of BAT1: its edges' ink at the end of 'lineart' (1 = full)`).toBeGreaterThanOrEqual(DRAWN);
  expect.soft(fl.a.BAT1 && fl.a.BAT1.visible, `anchors().BAT1.visible at the end of 'lineart' (BAT1 hidden): ${JSON.stringify(fl.a.BAT1)}`).toBe(false);
  const bloomLine = await bloomOf(frame);
  expect.soft(bloomOn(bloomLine), `Hero.bloom() at the end of 'lineart' (> ${BLOOM_ON}): ${bloomLine}`).toBe(true);
  const end = await frame.evaluate(() => __heroViolet());
  expect.soft(end.led, `violet round LED1's dome at the end of 'lineart' (share; ${pct(build.ledBase)} once LED1 was drawn in)`).toBeGreaterThanOrEqual(ledBase + LED_UP);
  expect.soft(end.under, `faint violet over the board's empty half at the end of 'lineart' (share; 'empty' ${pct(base.under)})`).toBeGreaterThanOrEqual(base.under + UNDER_UP);

  // Anchors for the callouts: each { x, y, visible } within 0 … 1, LED1 on
  // its dome and R1 on its body, and they follow the turn.
  expect(await frame.evaluate(() => typeof Hero.anchors), 'Hero.anchors, for the landing\'s callouts').toBe('function');
  const read = () => frame.evaluate(() => ({ a: Hero.anchors(), f: __heroFraming() }));
  const off = (a, r, f) => { const x = a.x * f.W, y = a.y * f.H; return Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1)); };
  const r0 = await read();
  const isAnchor = a => !!a && typeof a.x === 'number' && typeof a.y === 'number' && typeof a.visible === 'boolean' && a.x >= 0 && a.x <= 1 && a.y >= 0 && a.y <= 1;
  for (const k of ['LED1', 'R1', 'BAT1', 'rail', 'holes']) {
    expect(isAnchor(r0.a && r0.a[k]), `anchors().${k}: { x, y, visible }, x and y within 0 … 1 of the frame; got ${JSON.stringify(r0.a && r0.a[k])}`).toBe(true);
  }
  for (const k of ['path', 'casing']) {   // #171
    expect.soft(isAnchor(r0.a && r0.a[k]), `anchors().${k}: { x, y, visible }, x and y within 0 … 1 of the frame; got ${JSON.stringify(r0.a && r0.a[k])}`).toBe(true);
  }
  expect(r0.a.LED1.visible, 'anchors().LED1.visible').toBe(true);
  const toTop = r => Math.hypot(r.a.LED1.x * r.f.W - r.f.domeTop[0], r.a.LED1.y * r.f.H - r.f.domeTop[1]);
  expect.soft(toTop(r0), `anchors().LED1 ${JSON.stringify(r0.a.LED1)} from the top of LED1's dome on screen (${r0.f.domeTop.map(v => v.toFixed(1))}), px`).toBeLessThanOrEqual(DOME_TOP_PX);
  expect(off(r0.a.R1, r0.f.r1, r0.f), `anchors().R1 ${JSON.stringify(r0.a.R1)} from R1 on screen, px`).toBeLessThanOrEqual(ANCHOR_PX);
  // #171: the circuit path's on a strip the circuit uses, the casing's at the
  // middle of one of the glass board's long top edges; both in view.
  if (isAnchor(r0.a.path)) {
    expect.soft(r0.a.path.visible, 'anchors().path visible at the end of \'lineart\'').toBe(true);
    const used = stripsOf(file), segs = await frame.evaluate(list => __heroStrips(list), used);
    const toPath = Math.min(...segs.map(sg => toSeg(r0.a.path.x * r0.f.W, r0.a.path.y * r0.f.H, sg)));
    expect.soft(toPath, `anchors().path ${JSON.stringify(r0.a.path)} from the nearest strip the circuit uses (${used.map(u => u.col + u.half[0]).join(', ')}), px`).toBeLessThanOrEqual(ANCHOR_PX);
  }
  if (isAnchor(r0.a.casing)) {
    expect.soft(r0.a.casing.visible, 'anchors().casing visible at the end of \'lineart\'').toBe(true);
    const toCasing = Math.min(...r0.f.edgeMids.map(([x, y]) => Math.hypot(r0.a.casing.x * r0.f.W - x, r0.a.casing.y * r0.f.H - y)));
    expect.soft(toCasing, `anchors().casing ${JSON.stringify(r0.a.casing)} from the middle of one of the board's long top edges, px`).toBeLessThanOrEqual(20);
  }
  // ~1 s of turning: 60 frames (OrbitControls turns a fixed step a frame, so
  // a busy machine's slow frames don't shrink it).
  await frame.evaluate(() => __heroFrames(60));
  const r1 = await read();
  expect(Math.abs(r1.a.LED1.x - r0.a.LED1.x), `anchors().LED1.x over 60 frames of turning (${r0.a.LED1.x} → ${r1.a.LED1.x})`).toBeGreaterThan(0.001);
  expect.soft(toTop(r1), 'anchors().LED1 from the top of LED1\'s dome after the turn, px').toBeLessThanOrEqual(DOME_TOP_PX);

  // Both ways (#171): back to 'empty', the paths, the sketch glow and the
  // under-glow go with the parts (the glow round LED1 down by what it rose,
  // as the turn moves the rails' own glow behind it).
  expect(await stageTo(frame, 'empty'), 'Hero.stage(\'empty\') from \'lineart\'').toBe('resolved');
  const back = await frame.evaluate(() => __heroViolet());
  expect.soft(typeof back.path === 'number' && back.path <= base.path + 0.05, `violet round anchors().path back at 'empty': ${pct(back.path)} ('empty' before ${pct(base.path)})`).toBe(true);
  expect.soft(back.led, `violet round LED1's dome back at 'empty' (end of 'lineart' ${pct(end.led)})`).toBeLessThanOrEqual(end.led - LED_UP);
  expect.soft(back.under, `faint violet over the board's empty half back at 'empty' ('empty' before ${pct(base.under)})`).toBeLessThanOrEqual(base.under + 0.05);
  expect(errors).toEqual([]);
});

// ── 6. The bloom's scripts, one missing ───────────────────────
// Three r128's post-processing loads from unpkg, a script at a time; when
// one fails (offline, a blocked CDN), the hero still runs, without bloom.

test('a bloom script that fails to load (LuminosityHighPassShader): the hero still starts, opaque, with no bloom, and goes on to \'solid\'', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await page.route('**/three@0.128.0/examples/js/shaders/LuminosityHighPassShader.js', route => route.abort());
  await page.addInitScript(installHeroSpy);
  const { iframe, frame } = await openHost(page, { query: '&stage=empty' });
  await frame.waitForFunction(() => window.App && App.scene && typeof window.Hero === 'object' && window.Hero, null, { timeout: 20_000, polling: 100 });
  const ready = await frame.evaluate(() => Promise.race([Hero.ready.then(() => 'resolved', e => 'rejected: ' + (e && e.message)),
    new Promise(r => setTimeout(() => r('pending after 20 s'), 20_000))]));
  expect(ready, 'Hero.ready with LuminosityHighPassShader.js missing').toBe('resolved');
  expect(await frame.evaluate(() => Hero.current()), 'Hero.current(): the start stage (&stage=empty)').toBe('empty');
  expect(await bloomOf(frame), 'Hero.bloom() with no bloom pass').toBe(0);
  const cs = await corners(page, iframe);
  expect(cs.map(c => near(c, INK_BG, 6)), `corners of the hero frame reading #101010; got ${JSON.stringify(cs)}`).toEqual([true, true, true, true]);
  expect(await stageTo(frame, 'solid'), 'Hero.stage(\'solid\') with no bloom').toBe('resolved');
  expect(await frame.evaluate(() => Hero.current()), 'Hero.current() after stage(\'solid\')').toBe('solid');
  // The one failed load is expected; nothing else may complain.
  expect(errors.filter(e => !/Failed to load resource/.test(e)), 'console errors and page errors, but the blocked script\'s failed load').toEqual([]);
});
