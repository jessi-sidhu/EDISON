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

  const LEAD_MAT = () => new THREE.MeshLambertMaterial({ color: 0xc0c0c0 });

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

  // A number with its unit, SI-prefixed for Ω V A F H: 1000 Ω → "1 kΩ".
  // The same format as Parts.checkValue's reasons.
  const SI = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  function withUnit(n, unit) {
    const sep = unit === '%' ? '' : ' ';
    if (!['Ω', 'V', 'A', 'F', 'H'].includes(unit) || n === 0) return String(n) + sep + unit;
    const a = Math.abs(n);
    const [f, p] = SI.find(([f]) => a >= f) || SI[SI.length - 1];
    return (n < 0 ? '−' : '') + String(Number((a / f).toPrecision(3))) + ' ' + p + unit;
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
      .map(k => (specs[k].choices ? String(v[k]) : withUnit(Number(v[k]), specs[k].unit)))
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

    // A hole's centre on the board surface, as breadboard.js lays it out.
    function holeWorld(col, row) {
      return new THREE.Vector3((col - (G.COLS - 1) / 2) * G.HS, 0, G.ROW_Z[row]);
    }

    return { THREE, lead, mat, holeWorld, boardGeometry: G };
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
