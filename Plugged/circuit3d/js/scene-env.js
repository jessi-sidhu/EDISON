// ─────────────────────────────────────────────────────────────
//  scene-env.js — Edison's 3D environment (issues #187, #188)
//
//  In Edison (<html data-ui="edison">, but not the landing's hero viewer)
//  scene.js's flat 'ground' is hidden (kept: the hero finds it by name) and
//  a group named 'scene-env' draws the bench instead:
//    - a bevelled graphite slab, its top face at BENCH_Y, ruled like a
//      cutting mat: minor lines at the hole pitch (0.1 in), majors at inches,
//      both through the board's columns, a border, and a ruler along the front
//      edge (tenth, half and inch ticks, 0 at column 1). The ruling is mixed
//      into a MeshStandardMaterial's colour, so it still takes light and shadow;
//    - the ruler's numbers, a B612 canvas texture on a plane over the slab;
//    - a "pristine grid" (Ben Golus) floor in the void 8 below the slab: a
//      fragment-shader grid antialiased by derivatives, fading out radially
//      and dimmed under the slab, on the background colour (--scene-bg);
//    - a soft neutral spot pool (no shadows) and a cool rim light; scene.js's
//      ambient, sun and fill are turned down to suit.
//  The vignette is CSS: #canvas-wrap::after in css/theme-edison.css.
//  Off-board parts (instruments, the battery) sit on the slab: app.js's
//  atSpot seats them at App.BENCH_Y, which this file sets (classic: unset, 0).
//
//  Render on demand (app.js, #109): it is all built here, as the page loads,
//  before the first frame. Nothing animates and there are no time uniforms.
//  The one later frame: the ruler is redrawn once B612 has loaded.
//  Only circuit3d/index.html loads it, after scene.js and board-geometry.js
//  and before app.js; viewer.html (the textbook figures, the hero) never does.
//
//  EXPORTS
//  ───────
//  Browser: window.SceneEnv
//  Node:    module.exports = { shouldRun, BENCH_Y, rulerTicks }
//
//  shouldRun(dataset)  true only for data-ui="edison" without data-mode="hero"
//  BENCH_Y             -(BOARD_THICK + 0.025): the bottom of the board's edge
//                      banding, the slab's top face, where off-board parts stand
//  rulerTicks(cols, first = 1)
//                      the ruler's ticks for columns first…cols, one per column
//                      (the hole pitch is a tenth of an inch), 0 at column 1:
//                      [{ col, x, inches, kind, len, label }]
//                        x       the column's world x (column 1 at -(COLS-1)/2 * HS)
//                        inches  (col - 1) / 10
//                        kind    'inch' every 10th column from column 1,
//                                'half' every 5th between, else 'tenth'
//                        len     the tick's length in from the front border
//                        label   the inch number on inch ticks ('0', '1', '−1'), else null
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const SceneEnv = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = SceneEnv;
  if (root) root.SceneEnv = SceneEnv;
})(typeof window !== 'undefined' ? window : null, function (win) {

  const inNode  = typeof module === 'object' && module.exports;
  const GEO     = inNode ? require('./board-geometry.js') : win.App.BOARD_GEOMETRY;
  const BENCH_Y = -(GEO.BOARD_THICK + 0.025);
  const COL1_X  = -(GEO.COLS - 1) / 2 * GEO.HS;   // column 1's x (breadboard.js)
  const PER_INCH = 10;                            // columns per inch: the pitch is 0.1 in

  function shouldRun(dataset) {
    return !!dataset && dataset.ui === 'edison' && dataset.mode !== 'hero';
  }

  // The ruler: tick widths and lengths (world units), the numbers' canvas.
  const RULER = {
    tick: {   //        width   length in from the front border
      tenth: { w: 0.012, len: 0.22 },
      half:  { w: 0.014, len: 0.42 },
      inch:  { w: 0.016, len: 0.70 },
    },
    colour: '#B9C6D2', opacity: 0.8,
    font:   '46px B612',  canvasFont: '46px "B612", Menlo, monospace',
    canvas: [4096, 128],  edgePx: 30,
    numbersIn: 0.98,      // the numbers' centre line, in from the front border
  };

  function rulerTicks(cols, first = 1) {
    const out = [];
    for (let col = first; col <= cols; col++) {
      const n    = col - 1;                                    // columns from column 1
      const at   = ((n % PER_INCH) + PER_INCH) % PER_INCH;
      const kind = at === 0 ? 'inch' : at === PER_INCH / 2 ? 'half' : 'tenth';
      out.push({
        col, x: COL1_X + n * GEO.HS, inches: n / PER_INCH, kind, len: RULER.tick[kind].len,
        label: kind === 'inch' ? String(n / PER_INCH).replace('-', '−') : null,
      });
    }
    return out;
  }

  // The slab and its ruled top (the pitch's graphite "Hybrid").
  const SLAB = {
    w: 52, d: 22, thick: 1.4, radius: 0.9, bevel: 0.16, centre: [2, 1.6],
    colour: '#1A1D21', roughness: 0.78,
  };
  const MAT = {
    line:   '#8FA3B5',
    inset:  1.1,                            // the border, in from the slab's edge
    minorW: 0.03,  minorA: 0.13,            // line widths in cells: minors every column,
    majorW: 0.009, majorA: 0.38,            // majors every inch
    borderW: 0.025, borderA: 0.55, innerIn: 0.3, innerW: 0.01, innerA: 0.6,
    tickA:  0.7,
    band:   0.95,                           // no grid in the ruler's band along the front
  };

  // The void below the slab.
  const GRID = {
    y: BENCH_Y - 8,
    minor: '#173F50', minorStep: 1.0, minorW: 0.02,  minorA: 0.4,
    major: '#2A8FAE', majorStep: 4.0, majorW: 0.012, majorA: 0.5,
    offset:   [COL1_X, 0],
    centre:   SLAB.centre, fadeIn: 16, fadeOut: 64,
    poolHalf: [SLAB.w / 2 + 0.5, SLAB.d / 2 + 0.5], poolSoft: 8, poolDark: 0.05,   // dimmer under the slab
    size:     600,
  };

  // scene.js's lights, turned down, plus the pool and the rim. The pool has
  // no shadows; the board stays well inside its cone, because the parts are
  // Lambert (lit per vertex) and a cone edge across a big face would smear.
  const LIGHT = {
    ambient: 0.38, sun: 0.7, fill: 0.22,
    pool: { colour: '#FFF1DC', intensity: 0.55, angle: 0.6, penumbra: 1, pos: [-2, 32, 8], target: [2, 0, 0.8] },
    rim:  { colour: '#8FB0FF', intensity: 0.35, pos: [8, 10, -24] },
  };

  // Line widths stay true in world units, antialiased by derivatives; once a
  // cell is smaller than a pixel a line fades to its mean coverage (no moire).
  const GLSL_GRID = `
    float pristineGrid(vec2 uv, vec2 lineWidth) {
      vec4 uvDDXY = vec4(dFdx(uv), dFdy(uv));
      vec2 uvDeriv = vec2(length(uvDDXY.xz), length(uvDDXY.yw));
      bvec2 invertLine = bvec2(lineWidth.x > 0.5, lineWidth.y > 0.5);
      vec2 targetWidth = vec2(invertLine.x ? 1.0 - lineWidth.x : lineWidth.x, invertLine.y ? 1.0 - lineWidth.y : lineWidth.y);
      vec2 drawWidth = clamp(targetWidth, uvDeriv, vec2(0.5));
      vec2 lineAA = uvDeriv * 1.5;
      vec2 gridUV = abs(fract(uv) * 2.0 - 1.0);
      gridUV.x = invertLine.x ? gridUV.x : 1.0 - gridUV.x;
      gridUV.y = invertLine.y ? gridUV.y : 1.0 - gridUV.y;
      vec2 grid2 = smoothstep(drawWidth + lineAA, drawWidth - lineAA, gridUV);
      grid2 *= clamp(targetWidth / drawWidth, 0.0, 1.0);
      grid2 = mix(grid2, targetWidth, clamp(uvDeriv * 2.0 - 1.0, 0.0, 1.0));
      grid2.x = invertLine.x ? 1.0 - grid2.x : grid2.x;
      grid2.y = invertLine.y ? 1.0 - grid2.y : grid2.y;
      return mix(grid2.x, 1.0, grid2.y);
    }
    float axisLine(float c, float w) {
      float d = fwidth(c);
      float ww = max(w, d);
      return (1.0 - smoothstep(ww - d, ww + d, abs(c))) * clamp(w / ww, 0.0, 1.0);
    }
    float sdBox(vec2 p, vec2 h, float r) { vec2 q = abs(p) - h + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  `;

  // An opaque plane in the background colour, the grid drawn on it.
  function gridFloor(bg) {
    const v2 = a => new THREE.Vector2(a[0], a[1]);
    const mat = new THREE.ShaderMaterial({
      extensions: { derivatives: true },   // WebGL1; built in on WebGL2
      uniforms: {
        uBg:        { value: bg.clone() },
        uMinorCol:  { value: new THREE.Color(GRID.minor) },
        uMajorCol:  { value: new THREE.Color(GRID.major) },
        uMinorStep: { value: GRID.minorStep }, uMinorW: { value: GRID.minorW }, uMinorA: { value: GRID.minorA },
        uMajorStep: { value: GRID.majorStep }, uMajorW: { value: GRID.majorW }, uMajorA: { value: GRID.majorA },
        uOffset:    { value: v2(GRID.offset) },
        uCentre:    { value: v2(GRID.centre) },
        uFadeIn:    { value: GRID.fadeIn },    uFadeOut: { value: GRID.fadeOut },
        uPoolHalf:  { value: v2(GRID.poolHalf) },
        uPoolSoft:  { value: GRID.poolSoft },  uPoolDark: { value: GRID.poolDark },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform vec3  uBg, uMinorCol, uMajorCol;
        uniform float uMinorStep, uMinorW, uMinorA, uMajorStep, uMajorW, uMajorA;
        uniform vec2  uOffset, uCentre, uPoolHalf;
        uniform float uFadeIn, uFadeOut, uPoolSoft, uPoolDark;
        varying vec3 vWorld;
        ${GLSL_GRID}
        void main() {
          vec2  p     = vWorld.xz;
          vec2  g     = p - uOffset;
          float minor = pristineGrid(g / uMinorStep, vec2(uMinorW));
          float major = pristineGrid(g / uMajorStep, vec2(uMajorW));
          float fade  = 1.0 - smoothstep(uFadeIn, uFadeOut, length(p - uCentre));
          float pool  = mix(uPoolDark, 1.0, smoothstep(0.0, uPoolSoft, sdBox(p - uCentre, uPoolHalf, 0.6)));
          vec3  col   = mix(uBg, uMinorCol, minor * uMinorA * fade * pool);
          col         = mix(col, uMajorCol, major * uMajorA * fade * pool);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(GRID.size, GRID.size), mat);
    m.rotation.x  = -Math.PI / 2;
    m.position.y  = GRID.y;
    m.renderOrder = -1;
    m.name        = 'env-grid';
    return m;
  }

  // The front border's z and the ruled area's half size.
  const half   = [SLAB.w / 2 - MAT.inset, SLAB.d / 2 - MAT.inset];
  const frontZ = SLAB.centre[1] + half[1];

  // The slab's top: the grid, border and ruler ticks mixed into the colour
  // after <color_fragment>, so the light and the shadows still fall on them.
  function matMaterial() {
    const mat = new THREE.MeshStandardMaterial({ color: SLAB.colour, roughness: SLAB.roughness, metalness: 0 });
    mat.extensions = { derivatives: true };   // WebGL1; built in on WebGL2
    const T = RULER.tick;
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, {
        uLine:    { value: new THREE.Color(MAT.line) },
        uHalf:    { value: new THREE.Vector2(half[0], half[1]) },
        uCentre:  { value: new THREE.Vector2(SLAB.centre[0], SLAB.centre[1]) },
        uTopY:    { value: BENCH_Y },
        uCol1X:   { value: COL1_X },
        uPitch:   { value: GEO.HS },
        uTickW:   { value: new THREE.Vector3(T.tenth.w, T.half.w, T.inch.w) },
        uTickLen: { value: new THREE.Vector3(T.tenth.len, T.half.len, T.inch.len) },
      });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEnvWorld;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvEnvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vEnvWorld;
          uniform vec3  uLine, uTickW, uTickLen;
          uniform vec2  uHalf, uCentre;
          uniform float uTopY, uCol1X, uPitch;
          ${GLSL_GRID}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec2  p      = vEnvWorld.xz;
            float onTop  = step(uTopY - 0.05, vEnvWorld.y);
            vec2  g      = p - vec2(uCol1X, 0.0);                 // x from column 1
            float minor  = pristineGrid(g / uPitch, vec2(${MAT.minorW.toFixed(3)}));
            float major  = pristineGrid(g / (uPitch * ${PER_INCH.toFixed(1)}), vec2(${MAT.majorW.toFixed(3)}));
            vec2  q      = abs(p - uCentre) - uHalf;
            float e      = max(q.x, q.y);
            float inside = step(e, 0.0);
            float border = axisLine(e, ${MAT.borderW.toFixed(3)}) + ${MAT.innerA.toFixed(2)} * axisLine(e + ${MAT.innerIn.toFixed(2)}, ${MAT.innerW.toFixed(3)});
            float dz     = uCentre.y + uHalf.y - p.y;              // in from the front border
            float s1     = uPitch, s5 = uPitch * ${(PER_INCH / 2).toFixed(1)}, s10 = uPitch * ${PER_INCH.toFixed(1)};
            float t1     = axisLine(g.x - s1  * floor(g.x / s1  + 0.5), uTickW.x) * step(dz, uTickLen.x);
            float t5     = axisLine(g.x - s5  * floor(g.x / s5  + 0.5), uTickW.y) * step(dz, uTickLen.y);
            float t10    = axisLine(g.x - s10 * floor(g.x / s10 + 0.5), uTickW.z) * step(dz, uTickLen.z);
            float ticks  = max(max(t1, t5), t10) * step(0.0, dz) * step(abs(p.x - uCentre.x), uHalf.x);
            float band   = step(dz, ${MAT.band.toFixed(2)}) * step(0.0, dz);
            float ink    = (minor * ${MAT.minorA.toFixed(2)} + major * ${MAT.majorA.toFixed(2)}) * inside * (1.0 - band)
                         + border * ${MAT.borderA.toFixed(2)} + ticks * ${MAT.tickA.toFixed(2)};
            diffuseColor.rgb = mix(diffuseColor.rgb, uLine, clamp(ink, 0.0, 1.0) * onTop);
          }`);
    };
    return mat;
  }

  // A rounded, bevelled slab whose top face is at BENCH_Y.
  function slab() {
    const { w, d, thick, radius, bevel } = SLAB;
    const x0 = -w / 2 + bevel, z0 = -d / 2 + bevel, x1 = w / 2 - bevel, z1 = d / 2 - bevel;
    const r  = Math.max(0.01, radius - bevel);   // the bevel grows the outline back by bevel
    const s  = new THREE.Shape();
    s.moveTo(x0 + r, z0); s.lineTo(x1 - r, z0); s.quadraticCurveTo(x1, z0, x1, z0 + r);
    s.lineTo(x1, z1 - r); s.quadraticCurveTo(x1, z1, x1 - r, z1); s.lineTo(x0 + r, z1);
    s.quadraticCurveTo(x0, z1, x0, z1 - r); s.lineTo(x0, z0 + r); s.quadraticCurveTo(x0, z0, x0 + r, z0);
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: thick - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
      bevelSegments: 5, curveSegments: 12,
    });
    geo.rotateX(Math.PI / 2);              // extruded along -y
    geo.translate(SLAB.centre[0], BENCH_Y - bevel, SLAB.centre[1]);   // the top bevel's face at BENCH_Y
    const m = new THREE.Mesh(geo, matMaterial());
    m.receiveShadow = true;
    m.name = 'env-slab';
    return m;
  }

  // The inch numbers over the ruler's ticks: a canvas the width of the ruled
  // area, drawn now in whatever font is ready and again once B612 is.
  function ruler(App) {
    const span = 2 * half[0], left = SLAB.centre[0] - half[0];
    const [cw, ch] = RULER.canvas;
    const canvas = win.document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const firstCol = Math.ceil((left - COL1_X) / GEO.HS) + 1;
    const lastCol  = Math.floor((left + span - COL1_X) / GEO.HS) + 1;
    const numbers  = rulerTicks(lastCol, firstCol).filter(t => t.label !== null);
    const draw = () => {
      const g = canvas.getContext('2d');
      g.clearRect(0, 0, cw, ch);
      g.fillStyle = RULER.colour;
      g.font = RULER.canvasFont;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const t of numbers) {
        const px = (t.x - left) / span * cw;
        if (px >= RULER.edgePx && px <= cw - RULER.edgePx) g.fillText(t.label, px, ch / 2);
      }
    };
    draw();
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = Math.min(8, App.renderer ? App.renderer.capabilities.getMaxAnisotropy() : 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(span, span * ch / cw), new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: RULER.opacity, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,   // over the slab at any distance
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(SLAB.centre[0], BENCH_Y + 0.004, frontZ - RULER.numbersIn);
    m.name = 'env-ruler';

    // Once B612 is there (fonts.css loads late, so after the page's load
    // event): redraw, upload and ask for the one frame that shows it.
    const fonts = win.document.fonts;
    if (fonts && fonts.load) {
      const redraw = () => fonts.load(RULER.font).then(faces => {
        if (!faces.length) return;
        draw();
        tex.needsUpdate = true;
        if (App.requestRender) App.requestRender();
      }).catch(() => {});
      if (win.document.readyState === 'complete') redraw();
      else win.addEventListener('load', redraw, { once: true });
    }
    return m;
  }

  // Turns scene.js's lights down and adds the pool and the rim.
  function lights(scene, env) {
    for (const o of scene.children) {
      if (o.isAmbientLight) o.intensity = LIGHT.ambient;
      else if (o.isDirectionalLight) o.intensity = o.castShadow ? LIGHT.sun : LIGHT.fill;
    }
    const P = LIGHT.pool;
    const pool = new THREE.SpotLight(P.colour, P.intensity, 0, P.angle, P.penumbra, 1);
    pool.position.set(...P.pos);
    pool.target.position.set(...P.target);
    pool.name = 'env-pool';
    const rim = new THREE.DirectionalLight(LIGHT.rim.colour, LIGHT.rim.intensity);
    rim.position.set(...LIGHT.rim.pos);
    rim.name = 'env-rim';
    env.add(pool, pool.target, rim);
  }

  // Hides the ground, adds the bench and sets the height app.js seats
  // off-board parts at.
  function build(App) {
    const scene = App.scene;
    if (!scene || typeof THREE === 'undefined') return;
    const ground = scene.getObjectByName('ground');
    if (ground) ground.visible = false;
    const env = new THREE.Group();
    env.name = 'scene-env';
    lights(scene, env);
    env.add(slab(), ruler(App), gridFloor(scene.background));
    scene.add(env);
    App.BENCH_Y = BENCH_Y;
  }

  if (win && win.document && shouldRun(win.document.documentElement.dataset)) build(win.App);

  return { shouldRun, BENCH_Y, rulerTicks };
});
