// ─────────────────────────────────────────────────────────────
//  scene.js — Three.js scene, camera, renderer, lights
// ─────────────────────────────────────────────────────────────

(function (App) {

  const canvas    = document.getElementById('canvas');
  const container = document.getElementById('canvas-wrap');

  // ── Scene ──────────────────────────────────────────────────
  const scene = new THREE.Scene();
  // Edison sets --scene-bg on <html>; classic leaves it unset.
  const sceneBg = getComputedStyle(document.documentElement).getPropertyValue('--scene-bg').trim();
  scene.background = new THREE.Color(/^#[0-9a-f]{6}$/i.test(sceneBg) ? sceneBg : 0xdcdad4);

  // ── Camera ─────────────────────────────────────────────────
  // The only copy of each view: home (start + reset button) and the
  // isometric angle saved thumbnails are shot from.
  App.CAMERA = {
    home:  { pos: [0, 22, 30], target: [0, 0, 0] },
    thumb: { pos: [20, 22, 20], target: [0, 0, 0] },
  };

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
  camera.position.set(...App.CAMERA.home.pos);
  camera.lookAt(...App.CAMERA.home.target);

  // ── Renderer ───────────────────────────────────────────────
  // viewer.html?mode=hero (issue #163) marks <html data-mode="hero"> and draws over the landing page: a canvas with alpha.
  const alpha    = document.documentElement.dataset.mode === 'hero';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !navigator.webdriver, alpha });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // ── Orbit Controls ─────────────────────────────────────────
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping  = true;
  controls.dampingFactor  = 0.08;
  // No polar angle cap — let user orbit freely all the way around
  controls.minDistance    = 2;
  controls.maxDistance    = 120;
  controls.panSpeed       = 1.8;
  controls.zoomSpeed      = 1.2;
  controls.screenSpacePanning = true;        // pan parallel to screen, not floor
  // Left: orbit, Middle: zoom, Right: pan
  controls.mouseButtons = {
    LEFT:   THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT:  THREE.MOUSE.PAN,
  };
  controls.target.set(...App.CAMERA.home.target);

  // Suppress browser right-click menu on canvas so right-drag pan works
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ── Lighting ───────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.70));

  const sun = new THREE.DirectionalLight(0xfffaf0, 1.05);
  sun.position.set(18, 35, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { near: 1, far: 120, left: -30, right: 30, top: 30, bottom: -30 });
  sun.shadow.bias = -0.0003;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xd0e8ff, 0.35);
  fill.position.set(-12, 8, -8);
  scene.add(fill);

  // ── Studio reflections ─────────────────────────────────────
  // The parts' metal and glossy plastic (components.js mat.surface and
  // mat.metal, MeshStandard/Physical) reflect a soft studio: a dim room with
  // a big overhead softbox and two strip lights, prefiltered once by PMREM.
  // Lambert materials (the board, wires, the classic parts) ignore it.
  function studio() {
    const room = new THREE.Scene();
    const geo  = new THREE.BoxGeometry(1, 1, 1);
    const wall = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x2c2c2e, side: THREE.BackSide }));
    wall.scale.set(40, 20, 40);
    wall.position.y = 8;
    room.add(wall);
    const floor = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x5a5854 }));
    floor.scale.set(40, 0.2, 40);
    floor.position.y = -1.9;
    room.add(floor);
    // [width, height, depth, x, y, z, brightness]
    for (const [w, h, d, x, y, z, k] of [[14, 0.2, 10, 0, 17, 2, 7], [0.2, 8, 16, -19, 9, 0, 3.2],
                                          [0.2, 6, 12, 19, 8, -4, 2.2], [16, 6, 0.2, 0, 7, 19, 1.6]]) {
      const panel = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k * 0.96) }));
      panel.scale.set(w, h, d);
      panel.position.set(x, y, z);
      room.add(panel);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    const map   = pmrem.fromScene(room, 0.04).texture;
    pmrem.dispose();
    geo.dispose();
    return map;
  }
  scene.environment = studio();

  // ── Ground / Workbench ─────────────────────────────────────
  // Edison sets --scene-ground on <html> so the bench reads as the bezel; classic leaves it unset.
  const sceneGround = getComputedStyle(document.documentElement).getPropertyValue('--scene-ground').trim();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshLambertMaterial({ color: /^#[0-9a-f]{6}$/i.test(sceneGround) ? sceneGround : 0x706b65 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.21;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  // ── Resize ─────────────────────────────────────────────────
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (App.requestRender) App.requestRender();   // set by app.js; the first frame covers the first resize
  }
  resize();
  new ResizeObserver(resize).observe(container);

  // ── Exports ────────────────────────────────────────────────
  App.scene    = scene;
  App.camera   = camera;
  App.renderer = renderer;
  App.controls = controls;

  // Back to the home view (the reset-camera button calls this).
  App.resetCamera = function () {
    controls.target.set(...App.CAMERA.home.target);
    camera.position.set(...App.CAMERA.home.pos);
    controls.update();
  };

})(window.App = window.App || {});
