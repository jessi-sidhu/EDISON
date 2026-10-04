// ─────────────────────────────────────────────────────────────
//  tools/smoke.js — overload smoke (issue #99)
//
//  On every plugged:sim, each part whose readings.part(label).over is
//  true goes dark (scorched), and a part that has just gone over puffs
//  smoke (a few sprites rising and fading, PUFF_MS) above it. It stays
//  scorched, with no new puff, while still over (a time run solves every
//  frame), clears when a later solve says it is fine, and plugged:sim-stop
//  clears every scorch and puff. At most MAX_PUFFS puffs are alive; a
//  new one ends the oldest. Visual only: the simulator is unchanged.
//
//  Scorching gives each mesh of the part its own darkened clone of its
//  material (colour and emissive), so parts sharing a material are
//  untouched. Clearing puts the original back, carrying over what the
//  part's view changed on the clone meanwhile (an LED's glow intensity),
//  with its own colours.
//
//  EXPORTS
//  ───────
//  Browser: window.Smoke (DOM wiring runs only when document exists)
//  Node:    module.exports
//
//  scorchList(readings, labels) → labels, in the given order, whose
//      readings.part(label).over is true; [] for no readings
//  MAX_PUFFS                    the most puffs alive at once
//  Browser only: scorched() → labels scorched now; activePuffs() → count;
//      puffsStarted() → puffs started since page load (only goes up)
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const Smoke = factory();
  if (typeof module === 'object' && module.exports) module.exports = Smoke;
  if (root) root.Smoke = Smoke;
})(typeof window !== 'undefined' ? window : null, function () {

  const MAX_PUFFS = 8;

  function scorchList(readings, labels) {
    if (!readings) return [];
    return labels.filter(label => {
      const p = readings.part(label);
      return !!(p && p.over);
    });
  }

  const api = { scorchList, MAX_PUFFS };
  if (typeof document !== 'undefined') wire();

  function wire() {
    const DARK     = 0.25;   // a scorched colour is this share of the original
    const PUFF_MS  = 1500;   // one puff's life
    const SPRITES  = 4;      // sprites in a puff
    const RISE     = 1.4;    // world units a sprite climbs over its life

    const scorches = new Map();   // comp → { group, mats: [{ mesh, orig, clone, color }] }
    let puffs = [];               // { group, sprites: [{ sprite, dx, dz, delay }], born }
    let started = 0;              // puffs started since page load
    let raf = 0;
    let texture = null;           // one soft round smoke texture, shared by every sprite

    // ── Scorch ──────────────────────────────────────────────────

    // App.selectItem tints a selected part's emissive on its own clones,
    // so step out of the selection around our swaps, as redrawPart does.
    function unselected(comp, work) {
      const sel = !!(App.state.selected && App.state.selected.item === comp);
      if (sel) App.deselect();
      work();
      if (sel) App.selectItem(comp, 'component');
    }

    function scorch(comp) {
      unselected(comp, () => scorchNow(comp));
    }

    function scorchNow(comp) {
      const mats = [];
      comp.group.traverse(o => {
        if (!o.isMesh || !o.material || Array.isArray(o.material) || !o.material.color) return;
        const orig  = o.material;
        const clone = orig.clone();
        clone.color.multiplyScalar(DARK);
        if (clone.emissive) clone.emissive.multiplyScalar(DARK);   // an LED dome's own glow too
        o.material = clone;
        mats.push({ mesh: o, orig, clone, color: orig.color.clone(), emissive: orig.emissive ? orig.emissive.clone() : null });
      });
      scorches.set(comp, { group: comp.group, mats });
    }

    function unscorch(comp) {
      if (!scorches.has(comp)) return;
      unselected(comp, () => unscorchNow(comp));
    }

    function unscorchNow(comp) {
      const s = scorches.get(comp);
      scorches.delete(comp);
      const paint = (m, color, emissive) => {
        m.color.copy(color);
        if (emissive && m.emissive) m.emissive.copy(emissive);
      };
      s.mats.forEach(({ mesh, orig, clone, color, emissive }) => {
        // Our clone, or a copy of it a selection left behind (deselect keeps
        // its copy): either way the original goes back on.
        const now = mesh.material;
        if (now && now.color && !Array.isArray(now)) {
          orig.copy(now);                 // what the view changed meanwhile (an LED's glow) …
          paint(orig, color, emissive);   // … with the original colours
          if (now !== clone) now.dispose();
        }
        mesh.material = orig;
        clone.dispose();
      });
    }

    // ── Puffs ───────────────────────────────────────────────────

    function smokeTexture() {
      if (texture) return texture;
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0,   'rgba(255,255,255,1)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
      grad.addColorStop(1,   'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      texture = new THREE.CanvasTexture(c);
      return texture;
    }

    function endPuff(p) {
      if (p.group.parent) p.group.parent.remove(p.group);
      p.sprites.forEach(s => s.sprite.material.dispose());   // the sprite geometry is THREE's shared one
    }

    function startPuff(comp) {
      const box = new THREE.Box3().setFromObject(comp.group);
      if (box.isEmpty()) return;
      while (puffs.length >= MAX_PUFFS) endPuff(puffs.shift());
      const group = new THREE.Group();
      group.position.set((box.min.x + box.max.x) / 2, box.max.y + 0.1, (box.min.z + box.max.z) / 2);
      const sprites = [];
      for (let k = 0; k < SPRITES; k++) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: smokeTexture(), color: 0x4a4a4a, transparent: true, opacity: 0, depthWrite: false,
        }));
        sprite.scale.set(0.3, 0.3, 0.3);
        group.add(sprite);
        sprites.push({ sprite, dx: (Math.random() - 0.5) * 0.3, dz: (Math.random() - 0.5) * 0.3, delay: k * 0.12 });
      }
      App.scene.add(group);
      puffs.push({ group, sprites, born: performance.now() });
      started++;
      if (!raf) raf = requestAnimationFrame(tick);
    }

    function tick(now) {
      raf = 0;
      puffs = puffs.filter(p => {
        const t = (now - p.born) / PUFF_MS;
        if (t >= 1) { endPuff(p); return false; }
        p.sprites.forEach(({ sprite, dx, dz, delay }) => {
          const u = Math.max(0, Math.min(1, (t - delay) / (1 - delay)));
          sprite.position.set(dx * (1 + u), u * RISE, dz * (1 + u));
          const size = 0.3 + 0.7 * u;
          sprite.scale.set(size, size, size);
          sprite.material.opacity = 0.75 * Math.min(1, u * 6) * (1 - u);
        });
        return true;
      });
      if (puffs.length) raf = requestAnimationFrame(tick);
    }

    function clearPuffs() {
      puffs.forEach(endPuff);
      puffs = [];
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    // ── Events ──────────────────────────────────────────────────

    document.addEventListener('plugged:sim', e => {
      const readings = e.detail && e.detail.readings;
      const comps = App.state.components.filter(c => c.label != null && c.group);
      const over = new Set(scorchList(readings, comps.map(c => c.label)));
      const hot = comps.filter(c => over.has(c.label));
      // Puff only for a part that has just gone over, not a redrawn one.
      const was = new Set(scorches.keys());
      // Fine now, gone, or redrawn (a new model): give its materials back.
      [...scorches.keys()].forEach(c => {
        if (!hot.includes(c) || scorches.get(c).group !== c.group) unscorch(c);
      });
      hot.forEach(c => {
        if (!scorches.has(c)) scorch(c);
        if (!was.has(c)) startPuff(c);
      });
    });

    document.addEventListener('plugged:sim-stop', () => {
      clearPuffs();
      [...scorches.keys()].forEach(unscorch);
    });

    api.scorched    = () => [...scorches.keys()].map(c => c.label);
    api.activePuffs = () => puffs.length;
    api.puffsStarted = () => started;
  }

  return api;
});
