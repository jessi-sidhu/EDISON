// ─────────────────────────────────────────────────────────────
//  sidebar.js — the parts sidebar, generated from the registry (issue #29)
//
//  One group per category, in the contract's order, each item showing the
//  part's icon, name and sub. A search box filters by name, type and
//  ai.keywords. Clicking an item enters place mode (app.js listens on
//  #sidebar, so generated items need no handler of their own).
//
//  groups() is pure; render() is the thin browser layer on top.
//
//  EXPORTS
//  ───────
//  Browser: window.Sidebar
//  Node:    module.exports = Sidebar
//
//  Sidebar.groups(parts, query) → [{ category, parts: [{ type, name, sub, icon }] }]
//  Sidebar.render(list, search, parts)   fills `list`, filters on `search`
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const Sidebar = factory();
  if (typeof module === 'object' && module.exports) module.exports = Sidebar;
  if (root) root.Sidebar = Sidebar;
})(typeof window !== 'undefined' ? window : null, function () {

  const CATEGORIES = ['Passives', 'Sources', 'Semiconductors', 'I/O', 'Instruments'];

  // q: already trimmed and lower-cased; '' matches everything.
  function matches(def, q) {
    if (!q) return true;
    const words = [def.name, def.type].concat((def.ai && def.ai.keywords) || []);
    return words.some(w => typeof w === 'string' && w.toLowerCase().includes(q));
  }

  function groups(parts, query) {
    const q = String(query || '').trim().toLowerCase();
    return CATEGORIES
      .map(category => ({
        category,
        parts: (parts || [])
          .filter(d => d.category === category && matches(d, q))
          .map(d => ({ type: d.type, name: d.name, sub: d.sub, icon: d.icon })),
      }))
      .filter(g => g.parts.length);
  }

  // ── Browser ───────────────────────────────────────────────────
  // Every part is drawn once; a search hides what doesn't match, so an
  // item keeps its `active` class while the list is filtered.

  function itemEl(p) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'comp-item';
    btn.dataset.type = p.type;
    const icon = document.createElement('span');
    icon.className = 'comp-item-icon';
    icon.innerHTML = p.icon;   // the part file's own SVG (checked by Parts.define)
    const text = document.createElement('div');
    text.className = 'comp-item-text';
    const name = document.createElement('span');
    name.className = 'comp-item-name';
    name.textContent = p.name;
    const sub = document.createElement('span');
    sub.className = 'comp-item-sub';
    sub.textContent = p.sub;
    text.append(name, sub);
    btn.append(icon, text);
    return btn;
  }

  function render(list, search, parts) {
    list.textContent = '';
    for (const g of groups(parts, '')) {
      const group = document.createElement('div');
      group.className = 'comp-group';
      group.dataset.category = g.category;
      const label = document.createElement('div');
      label.className = 'comp-group-label';
      label.textContent = g.category;
      group.append(label, ...g.parts.map(itemEl));
      list.append(group);
    }

    function filter() {
      const shown = new Set(groups(parts, search.value).flatMap(g => g.parts.map(p => p.type)));
      list.querySelectorAll('.comp-group').forEach(group => {
        let any = false;
        group.querySelectorAll('.comp-item[data-type]').forEach(item => {
          item.hidden = !shown.has(item.dataset.type);
          if (!item.hidden) any = true;
        });
        group.hidden = !any;
      });
    }
    if (search) search.addEventListener('input', filter);
  }

  return { CATEGORIES, groups, render };
});
