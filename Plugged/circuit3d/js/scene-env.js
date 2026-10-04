// ─────────────────────────────────────────────────────────────
//  scene-env.js — Edison's 3D environment: the grid floor (issue #187)
//
//  In Edison (<html data-ui="edison">, but not the landing's hero viewer)
//  scene.js's flat 'ground' is hidden (kept: the hero finds it by name) and
//  a group named 'scene-env' draws the floor instead, at BENCH_Y:
//    - a "pristine grid" (Ben Golus): a fragment-shader grid antialiased by
//      derivatives, hole-pitch minors and 2-unit majors, fading out radially
//      and dimmed round the board, on the background colour (--scene-bg);
//    - a shadow catcher, so the board and instruments still cast shadows.
//  Off-board parts (instruments, the battery) sit on the floor: app.js's
//  atSpot seats them at App.BENCH_Y, which this file sets (classic: unset, 0).
//
//  Render on demand (app.js, #109): it is all built here, as the page loads,
//  before the first frame. Nothing animates and there are no time uniforms.
//  Only circuit3d/index.html loads it, after scene.js and board-geometry.js
//  and before app.js; viewer.html (the textbook figures, the hero) never does.
//
//  EXPORTS
//  ───────
//  Browser: window.SceneEnv
//  Node:    module.exports = { shouldRun, BENCH_Y }
//
//  shouldRun(dataset)  true only for data-ui="edison" without data-mode="hero"
//  BENCH_Y             -(BOARD_THICK + 0.025): the bottom of the board's edge
//                      banding, where the floor is and off-board parts stand
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const SceneEnv = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = SceneEnv;
  if (root) root.SceneEnv = SceneEnv;
})(typeof window !== 'undefined' ? window : null, function (win) {

  const inNode  = typeof module === 'object' && module.exports;
  const GEO     = inNode ? require('./board-geometry.js') : win.App.BOARD_GEOMETRY;
  const BENCH_Y = -(GEO.BOARD_THICK + 0.025);

  function shouldRun(dataset) {
    return !!dataset && dataset.ui === 'edison' && dataset.mode !== 'hero';
  }

  // The floor's look (the pitch's grid, on the bezel background).
  const GRID = {
    minor: '#1B5266', minorStep: 0.4, minorW: 0.04,  minorA: 0.5,    // the hole pitch
    major: '#29ABCA', majorStep: 2.0, majorW: 0.018, majorA: 0.55,
    offset:   [-14.0, 4.8],                // lines run through the board's hole columns
    centre:   [2, 0], fadeIn: 12, fadeOut: 46,
    poolHalf: [13.5, 4.1], poolSoft: 3.2, poolDark: 0.25,   // dimmer round the board
    size:     600,
  };
  const SHADOW = { opacity: 0.45, size: 120 };

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
          float pool  = mix(uPoolDark, 1.0, smoothstep(0.0, uPoolSoft, sdBox(p, uPoolHalf, 0.6)));
          vec3  col   = mix(uBg, uMinorCol, minor * uMinorA * fade * pool);
          col         = mix(col, uMajorCol, major * uMajorA * fade * pool);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(GRID.size, GRID.size), mat);
    m.rotation.x  = -Math.PI / 2;
    m.position.y  = BENCH_Y;
    m.renderOrder = -1;
    m.name        = 'env-grid';
    return m;
  }

  // A transparent plane that shows only the shadows cast on it.
  function shadowCatcher() {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(SHADOW.size, SHADOW.size),
                             new THREE.ShadowMaterial({ opacity: SHADOW.opacity }));
    m.rotation.x    = -Math.PI / 2;
    m.position.y    = BENCH_Y + 0.002;
    m.receiveShadow = true;
    m.name          = 'env-shadow';
    return m;
  }

  // Hides the ground, adds the floor and sets the bench height app.js seats
  // off-board parts at.
  function build(App) {
    const scene = App.scene;
    if (!scene || typeof THREE === 'undefined') return;
    const ground = scene.getObjectByName('ground');
    if (ground) ground.visible = false;
    const env = new THREE.Group();
    env.name = 'scene-env';
    env.add(gridFloor(scene.background), shadowCatcher());
    scene.add(env);
    App.BENCH_Y = BENCH_Y;
  }

  if (win && win.document && shouldRun(win.document.documentElement.dataset)) build(win.App);

  return { shouldRun, BENCH_Y };
});
