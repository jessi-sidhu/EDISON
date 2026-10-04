// In-page helpers for the UI pitch mockups (evaluated before each direction's JS).
window.MX = (function () {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  function el(tag, cls, html, parent, before) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) { if (before) parent.insertBefore(e, before); else parent.appendChild(e); }
    return e;
  }
  function fonts(q) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?' + q + '&display=swap';
    document.head.appendChild(l);
    return new Promise(r => { l.onload = () => document.fonts.ready.then(r); l.onerror = r; });
  }
  // A part's on-screen point (viewport px), fy = fraction up its bounding box.
  function project(label, fy = 0.7, dx = 0, dz = 0) {
    const c = App.state.components.find(c => c.label === label);
    if (!c || !c.group) return null;
    App.camera.updateMatrixWorld();
    const box = new THREE.Box3().setFromObject(c.group);
    const v = box.getCenter(new THREE.Vector3()).setY(box.min.y + fy * (box.max.y - box.min.y));
    v.x += dx; v.z += dz;
    const p = v.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }
  // A world point (board coords) to viewport px.
  function projectWorld(x, y, z) {
    App.camera.updateMatrixWorld();
    const p = new THREE.Vector3(x, y, z).project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }
  function holeXY(name) {
    const { col, row } = App.parseHole(name);
    const h = App.state.breadboard.getHole(col, row);
    return projectWorld(h.world.x, h.world.y, h.world.z);
  }
  // The chat as chat.js writes it: .chat-msg.user (text) / .chat-msg.ai (formatReply).
  function chat(msgs) {
    const box = $('#sparky-messages');
    const w = $('#sparky-welcome');
    if (w) w.classList.add('hidden');
    const out = [];
    for (const [role, text] of msgs) {
      const e = document.createElement('div');
      e.className = 'chat-msg ' + role;
      if (role === 'ai') e.innerHTML = (window.SparkyChat && SparkyChat.formatReply) ? SparkyChat.formatReply(text) : text;
      else e.textContent = text;
      box.appendChild(e);
      out.push(e);
    }
    box.scrollTop = box.scrollHeight;
    return out;
  }
  // A polyline SVG overlay (fixed, viewport coords).
  function svgLayer(id) {
    let s = document.getElementById(id);
    if (!s) {
      s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.id = id;
      s.setAttribute('width', innerWidth); s.setAttribute('height', innerHeight);
      s.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;overflow:visible';
      document.body.appendChild(s);
    }
    return s;
  }
  function svg(parent, tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    parent.appendChild(e);
    return e;
  }
  // Frame the board + instruments inside the canvas, keeping a view direction.
  // dir: camera offset direction from the target; pad: px kept clear on each side of the canvas.
  function fit(dir, pad) {
    const V = THREE.Vector3;
    const pts = [];
    for (const h of ['tp_1', 'bn_1', 'tp_63', 'bn_63']) { const { col, row } = App.parseHole(h); const o = App.state.breadboard.getHole(col, row); pts.push(o.world.clone()); }
    for (const c of App.state.components) {
      if (!c.group) continue;
      const b = new THREE.Box3().setFromObject(c.group);
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new V(x, y, z));
    }
    const d = new V(...dir).normalize();
    const r = App.renderer.domElement.getBoundingClientRect();
    const box = { l: pad.l, r: r.width - pad.r, t: pad.t, b: r.height - pad.b };
    const target = new V(); pts.forEach(p => target.add(p)); target.multiplyScalar(1 / pts.length);
    let dist = 40;
    const proj = () => {
      App.camera.position.copy(target).addScaledVector(d, dist); App.camera.lookAt(target); App.camera.updateMatrixWorld();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts) { const q = p.clone().project(App.camera); const x = (q.x + 1) / 2 * r.width, y = (1 - q.y) / 2 * r.height; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return { x0, x1, y0, y1 };
    };
    for (let it = 0; it < 6; it++) {
      let lo = 5, hi = 200;
      for (let k = 0; k < 30; k++) { dist = (lo + hi) / 2; const b = proj(); const fits = b.x0 >= box.l && b.x1 <= box.r && b.y0 >= box.t && b.y1 <= box.b; if (fits) hi = dist; else lo = dist; }
      dist = hi;
      const b = proj();
      const cx = (b.x0 + b.x1) / 2 - (box.l + box.r) / 2, cy = (b.y0 + b.y1) / 2 - (box.t + box.b) / 2;
      const right = new V().setFromMatrixColumn(App.camera.matrixWorld, 0), up = new V().setFromMatrixColumn(App.camera.matrixWorld, 1);
      const wpp = 2 * dist * Math.tan(App.camera.fov * Math.PI / 360) / r.height;
      target.addScaledVector(right, cx * wpp).addScaledVector(up, -cy * wpp);
    }
    proj();
    App.controls.target.copy(target); App.controls.update(); App.requestRender();
  }
  return { fit, $, $$, el, fonts, project, projectWorld, holeXY, chat, svgLayer, svg };
})();
