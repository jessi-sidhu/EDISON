// ─────────────────────────────────────────────────────────────
//  components.js — the shared helpers registry parts draw with,
//                  their ghost (transparent preview) versions and
//                  their values
//
//  Registry parts (parts/*.js) draw themselves in view.build(ctx, ...):
//    App.partCtx({ ghost })  → ctx: { THREE, lead, mat, holeWorld, boardGeometry }
//    App.buildPart(type, legs, values, { ghost, controls }) → { group, pinPositions }
//      controls: the record's own settings, over the defaults (a knob's position)
//
//  Preview builder (buildPreview):
//    Returns a transparent ghost Group centred at (0,0,0).
//    Caller repositions it each frame.
//
//  Exports: App.buildPreview, App.partCtx, App.buildPart,
//           App.componentValues, App.formatValue
// ─────────────────────────────────────────────────────────────

(function (App) {

  // Tinned steel: a real metal, so it catches scene.js's studio reflections.
  const LEAD_MAT = () => new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 1, roughness: 0.3, envMapIntensity: 1.1 });

  // ─── Electrical values ───────────────────────────────────────
  //  A part's defaults come from its ValueSpecs (parts/*.js). A component
  //  copies them at placement time and carries its own values from then on.

  function registryDef(type) {
    return (window.Parts && window.Parts.get(type)) || null;
  }

  function defaultValues(type) {
    const def = registryDef(type);
    if (def) {
      const out = {};
      for (const [key, spec] of Object.entries(def.values || {})) {
        out[key] = spec.default;
        if (spec.choices && spec.choices[spec.default]) Object.assign(out, spec.choices[spec.default]);
      }
      return out;
    }
    return {};
  }

  // Values for a new instance: defaults plus anything restored from
  // a saved circuit. A registry choice then brings its own overrides, so
  // an LED given { color: 'blue' } gets blue's forward voltage.
  function componentValues(type, overrides) {
    const v = Object.assign(defaultValues(type), overrides || {});
    const def = registryDef(type);
    for (const [key, spec] of Object.entries((def && def.values) || {})) {
      if (spec.choices && spec.choices[v[key]]) Object.assign(v, spec.choices[v[key]]);
    }
    return v;
  }

  // Human-readable values of a placed component, from its ValueSpecs:
  // "470 Ω", "red", "9 V", joined by ", ". `keys` defaults to the values the
  // AI may set (ai.values, else all). '' for a part with none.
  function formatValue(comp, keys) {
    const def = registryDef(comp.type);
    const specs = (def && def.values) || {};
    const v = comp.values || componentValues(comp.type);
    const list = keys || (def && def.ai && def.ai.values) || Object.keys(specs);
    return list.filter(k => specs[k] && v[k] != null)
      .map(k => (specs[k].choices ? String(v[k]) : window.Parts.withUnit(Number(v[k]), specs[k].unit)))
      .join(', ');
  }

  // ─── Helpers ─────────────────────────────────────────────────

  function ghostMat(hexColor, opacity = 0.42) {
    return new THREE.MeshLambertMaterial({
      color: hexColor, transparent: true, opacity, depthWrite: false,
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  GHOST PREVIEW
  //
  //  Builds a transparent local-space preview of a component.
  //  The group is centred at (0, 0, 0).  Caller sets .position
  //  and .rotation.y to move it on screen.
  //
  //  type:     a registry part
  //  span:     number of holes the component spans
  //  hs:       hole spacing (HOLE_SPACING from breadboard)
  //  rotation: 0 (horizontal) or 1 (vertical)
  //  values:   optional part values, e.g. an LED's color; defaults
  //            when absent
  //
  //  A registry part's ghost is its own view.build in ghost materials.
  // ─────────────────────────────────────────────────────────────
  function buildPreview(type, span, hs, rotation, values) {
    const def = registryDef(type);
    if (def && def.place.kind === 'span') {
      const ghost = spanGhost(def, span, rotation, values);
      if (rotation === 1) ghost.rotation.y = Math.PI / 2;
      return ghost;
    }
    // An off-board part is drawn around (0, 0, 0) already; a type this
    // build doesn't know gets an empty ghost.
    const group = def ? drawPart(def, partCtx({ ghost: true }), def.pins.map(pin => ({ pin, col: null, row: null, hole: null })),
                                 values, { ghost: true }).group
                      : new THREE.Group();
    if (rotation === 1) group.rotation.y = Math.PI / 2;
    return group;
  }

  // ─────────────────────────────────────────────────────────────
  //  REGISTRY PARTS
  //
  //  ctx is everything a part's view.build may draw with. The ghost
  //  ctx swaps every material for a see-through one.
  // ─────────────────────────────────────────────────────────────
  const GHOST_ALPHA = 0.45;

  function partCtx(opts) {
    const ghost = !!(opts && opts.ghost);
    const G = App.BOARD_GEOMETRY;
    const solid = (hex, extra) => new THREE.MeshLambertMaterial(Object.assign({ color: hex }, extra));
    const mat = {
      body:  hex => (ghost ? ghostMat(hex, GHOST_ALPHA) : solid(hex)),
      metal: ()  => (ghost ? ghostMat(0xcccccc, GHOST_ALPHA) : LEAD_MAT()),
      glass: (hex, opacity) => (ghost ? ghostMat(hex, GHOST_ALPHA * 0.85)
                                      : solid(hex, { transparent: true, opacity: opacity ?? 0.88 })),
      label: hex => (ghost ? ghostMat(hex, 0.8) : solid(hex)),
      // A physically lit surface: plastic, epoxy, paint or metal by its
      // options (roughness, metalness, clearcoat, opacity, emissive, ...),
      // reflecting scene.js's studio. An opacity under 1 makes it see-through.
      surface: (hex, o) => {
        if (ghost) return ghostMat(hex, o && o.opacity < 1 ? GHOST_ALPHA * 0.85 : GHOST_ALPHA);
        // The studio lights a plastic mostly through its highlights: the board's own
        // lamps already give the diffuse light, so a matte surface takes little of it.
        const opts = Object.assign({ color: hex, roughness: 0.5, metalness: 0, envMapIntensity: o && o.metalness > 0.5 ? 1 : 0.35 }, o);
        if (opts.opacity < 1) opts.transparent = true;
        return new THREE.MeshPhysicalMaterial(opts);
      },
    };

    // A straight metal lead from one point to another (Vector3s).
    function lead(from, to, radius) {
      const r   = radius || 0.022;
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length();
      const m   = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 7), mat.metal());
      m.position.addVectors(from, to).multiplyScalar(0.5);
      if (len > 0) m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      return m;
    }

    // A round wire through points (Vector3s), each corner bent round with
    // radius `bend`: a lead that leaves a body, turns and drops into its hole.
    function bentLead(points, radius, bend) {
      const k = bend == null ? 0.07 : bend;
      const path = new THREE.CurvePath();
      let from = points[0];
      for (let i = 1; i < points.length; i++) {
        const p = points[i], next = points[i + 1];
        if (!next) { if (from.distanceTo(p) > 1e-4) path.add(new THREE.LineCurve3(from, p)); break; }
        const a = new THREE.Vector3().subVectors(from, p), b = new THREE.Vector3().subVectors(next, p);
        const d = Math.min(k, a.length() / 2, b.length() / 2);
        const p1 = p.clone().add(a.normalize().multiplyScalar(d));
        const p2 = p.clone().add(b.normalize().multiplyScalar(d));
        if (from.distanceTo(p1) > 1e-4) path.add(new THREE.LineCurve3(from, p1));
        path.add(new THREE.QuadraticBezierCurve3(p1, p.clone(), p2));
        from = p2;
      }
      const m = new THREE.Mesh(new THREE.TubeGeometry(path, 24 * points.length, radius || 0.026, 8, false), mat.metal());
      m.castShadow = true;
      return m;
    }

    // An axial part (resistor, diode): `body`, a group at the body's centre
    // `h` above the board with its +y along the leads (A → B), to draw a
    // `len`-long body in; and `leads`, one out of each end cap, bent down
    // into its hole.
    function axial(A, B, len, h, radius) {
      const along = new THREE.Vector3().subVectors(B, A).setY(0).normalize();
      const mid = A.clone().add(B).multiplyScalar(0.5);
      const body = new THREE.Group();
      body.position.set(mid.x, h, mid.z);
      body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
      const leads = [[A, -1], [B, 1]].map(([hole, sign]) => bentLead([
        mid.clone().addScaledVector(along, sign * (len / 2 - 0.03)).setY(h),
        new THREE.Vector3(hole.x, h, hole.z), new THREE.Vector3(hole.x, -0.05, hole.z)], radius || 0.026, 0.09));
      return { body, leads };
    }

    // A capsule outline for lathe(): radius r, length len centred on 0, its ends rounded over e.
    function capsule(r, len, e) {
      const h = len / 2;
      return [[0, -h], [r * 0.72, -h], [r * 0.95, -h + e * 0.4], [r, -h + e], [r, h - e], [r * 0.95, h - e * 0.4], [r * 0.72, h], [0, h]];
    }

    // A body of revolution about +y, from [radius, y] pairs listed bottom to top.
    function lathe(profile, segments) {
      return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), segments || 32);
    }

    // A w × h × d box (x, y, z) centred on the origin, every edge rounded by r.
    function roundBox(w, h, d, r) {
      const b = Math.max(1e-3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
      const x = w / 2 - b, z = d / 2 - b, c = Math.min(b * 0.5, x, z);
      // The outline as points, each corner a quarter circle, with no repeated
      // end point (a near-duplicate folds the bevel).
      const pts = [];
      for (const [cx, cz, a0] of [[x - c, -z + c, -Math.PI / 2], [x - c, z - c, 0], [-x + c, z - c, Math.PI / 2], [-x + c, -z + c, Math.PI]]) {
        for (let i = 0; i <= 4; i++) {
          const a = a0 + (i / 4) * Math.PI / 2;
          pts.push(new THREE.Vector2(cx + c * Math.cos(a), cz + c * Math.sin(a)));
        }
      }
      const s = new THREE.Shape(pts);
      const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-3, h - 2 * b), bevelEnabled: true, bevelThickness: b,
                                                 bevelSize: b, bevelSegments: 4, curveSegments: 6 });
      geo.rotateX(-Math.PI / 2);
      geo.center();
      return geo;
    }

    // A W × H pixel canvas texture, drawn by draw(g, W, H): printed text,
    // a sensor's track, a wrap-around sleeve.
    function paint(W, H, draw) {
      let canvas;
      if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(W, H);
      else { canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; }
      draw(canvas.getContext('2d'), W, H);
      const texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = 4;
      return texture;
    }

    // Printing: a flat w × h label facing +y, drawn by draw(g, W, H) on a
    // canvas of `px` pixels per world unit. Place it just above a face.
    function print(w, h, draw, px) {
      const texture = paint(Math.max(16, Math.round(w * (px || 512))), Math.max(16, Math.round(h * (px || 512))), draw);
      const m = ghost ? ghostMat(0xffffff, 0.8)
                      : new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
      m.map = texture;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      mesh.rotation.x = -Math.PI / 2;
      return mesh;
    }

    // A hole's centre on the board surface, as breadboard.js lays it out.
    function holeWorld(col, row) {
      return new THREE.Vector3((col - (G.COLS - 1) / 2) * G.HS, 0, G.ROW_Z[row]);
    }

    return { THREE, ghost, lead, bentLead, axial, capsule, lathe, roundBox, paint, print, mat, holeWorld, boardGeometry: G };
  }

  // legs: one { col, row } per pin, in pin order (Parts.legsOf gives them).
  function buildPart(type, legs, values, opts) {
    const def = registryDef(type);
    if (!def) return null;
    return drawPart(def, partCtx(opts), legs, values, opts);
  }

  // Drawn with the record's controls (opts.controls) over the defaults.
  function drawPart(def, ctx, legs, values, opts) {
    const own = (opts && opts.controls) || {};
    const controls = {};
    for (const [key, c] of Object.entries(def.controls || {})) controls[key] = Object.hasOwn(own, key) ? own[key] : c.default;
    const out = def.view.build(ctx, componentValues(def.type, values), controls, legs);
    if (opts && opts.ghost) out.group.traverse(o => { o.castShadow = false; });
    return out;
  }

  // The ghost of a 2-lead registry part, centred on (0,0,0). Like every
  // other ghost it is turned with .rotation.y = π/2 for rotation 1, by
  // buildPreview and again by interaction.js on hover. A vertical part's
  // legs sit down a column across the centre channel (wider than a hole
  // pitch), so that ghost is drawn along z inside a -π/2 wrapper that the
  // outer turn cancels. Rotation 0: legs `span` holes apart along a row.
  function spanGhost(def, span, rotation, values) {
    const rows  = App.BOARD_GEOMETRY.BODY_ROWS;
    const start = Math.max(0, rows.length / 2 - Math.ceil(span / 2));
    const down  = rotation === 1 && rows[start + span];
    const legs  = down
      ? [{ col: 0, row: rows[start] }, { col: 0, row: rows[start + span] }]
      : [{ col: 0, row: rows[0] }, { col: span, row: rows[0] }];
    legs.forEach((leg, i) => { leg.pin = def.pins[i]; });
    const base = partCtx({ ghost: true });
    const mid  = base.holeWorld(legs[0].col, legs[0].row).add(base.holeWorld(legs[1].col, legs[1].row)).multiplyScalar(0.5);
    const ctx  = Object.assign({}, base, { holeWorld: (col, row) => base.holeWorld(col, row).sub(mid) });
    const model = drawPart(def, ctx, legs, values, { ghost: true }).group;
    if (!down) return model;
    model.rotation.y = -Math.PI / 2;
    const group = new THREE.Group();
    group.add(model);
    return group;
  }

  // ── Exports ────────────────────────────────────────────────
  App.partCtx       = partCtx;
  App.buildPart     = buildPart;
  App.buildPreview  = buildPreview;

  App.componentValues = componentValues;
  App.formatValue     = formatValue;

})(window.App = window.App || {});
