// ─────────────────────────────────────────────────────────────
//  inspector.js — the value inspector (issue #29)
//
//  Selecting a part shows its label, one row per value and one per
//  control, all read from its definition: no per-type code.
//    - number:  a text input and its unit; Enter commits. Checked with
//               Parts.checkValue: a refusal shows its reason inline and
//               changes nothing, and the kit hint shows when there is one.
//    - choice:  a dropdown.
//    - slider:  a range input; a drag is one gesture (app.js).
//    - toggle / momentary: a checkbox. A momentary one works only while
//               the simulation runs, like a click on the part.
//  A value whose activeWhen doesn't hold (e.g. a supply's CH2 in series)
//  is greyed: its input disabled, its note beside the name (#127).
//  A value edit is App.setValues (one undo step, re-simulates while
//  running); a control edit is App.controlEdit (the gesture dispatcher).
//
//  rows() and edit() are pure; show/hide/sync are the browser layer.
//
//  EXPORTS
//  ───────
//  Browser: window.Inspector
//  Node:    module.exports = Inspector
//
//  Inspector.rows(def, comp) → Row[]   values (def.ai.values, else all), then controls;
//                                       a value off by its activeWhen adds disabled: true, note
//  Inspector.edit(comp, key, raw) → { ok: true, values, hint? } | { ok: false, reason }
//  Inspector.mount(el) · show(comp) · hide() · sync() · current()
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const Inspector = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = Inspector;
  if (root) root.Inspector = Inspector;
})(typeof window !== 'undefined' ? window : null, function (root) {

  function registry() {
    return root && root.Parts ? root.Parts : require('./parts/registry.js');
  }

  const own = (o, k) => !!o && Object.hasOwn(o, k) && o[k] != null;

  // A value's activeWhen note when it doesn't apply now (its control is
  // off the option, by the saved setting or else the default), else null.
  function offNote(def, spec, comp) {
    const aw = spec && spec.activeWhen;
    if (!aw) return null;
    const key   = Object.keys(aw).find(k => k !== 'note');
    const ctrls = (comp && comp.controls) || {};
    const c     = (def.controls || {})[key];
    const now   = own(ctrls, key) ? ctrls[key] : c && c.default;
    return now === aw[key] ? null : aw.note;
  }

  // ── Rows ─────────────────────────────────────────────────────
  // Which values get a row: def.ai.values when set, else every value
  // (the rule App.formatValue uses). A value off by its activeWhen gets
  // disabled: true and its note; it still shows its value.
  function rows(def, comp) {
    const specs = def.values || {};
    const shown = (def.ai && def.ai.values) || Object.keys(specs);
    const vals  = (comp && comp.values) || {};
    const ctrls = (comp && comp.controls) || {};
    const out = [];

    for (const [key, spec] of Object.entries(specs)) {
      if (!shown.includes(key)) continue;
      const value = own(vals, key) ? vals[key] : spec.default;
      const row = spec.choices
        ? { kind: 'choice', key, options: Object.keys(spec.choices), value }
        : { kind: 'number', key, unit: spec.unit, value, min: spec.min, max: spec.max, series: spec.series };
      const note = offNote(def, spec, comp);
      if (note) Object.assign(row, { disabled: true, note });
      out.push(row);
    }

    for (const [key, spec] of Object.entries(def.controls || {})) {
      const value = own(ctrls, key) ? ctrls[key] : spec.default;
      if (spec.type === 'slider') {
        const row = { kind: 'slider', key, value, min: spec.min, max: spec.max, step: spec.step, saved: spec.saved };
        if (spec.unit !== undefined) row.unit = spec.unit;
        out.push(row);
      } else if (spec.type === 'choice') {
        out.push({ kind: 'option', key, options: [...spec.options], value, saved: spec.saved });
      } else {
        out.push({ kind: spec.type, key, value, saved: spec.saved });
      }
    }
    return out;
  }

  // ── Edit ─────────────────────────────────────────────────────
  // raw: the input's text, a number, or a choice's name. A number's text
  // is parsed; anything else goes to checkValue as it is, so its reason
  // names what was typed.
  function edit(comp, key, raw) {
    const Parts = registry();
    const def   = Parts.get(comp.type);
    const spec  = def && def.values && Object.hasOwn(def.values, key) ? def.values[key] : null;
    const off   = spec && offNote(def, spec, comp);
    if (off) return { ok: false, reason: `${key} is not used in this mode (${off})` };
    let value = raw;
    if (spec && !spec.choices && typeof raw === 'string') {
      const text = raw.trim();
      const n = Number(text);
      value = text !== '' && Number.isFinite(n) ? n : text;
    }
    const check = Parts.checkValue(comp.type, key, value);
    if (!check.ok) return { ok: false, reason: check.reason };
    const out = { ok: true, values: { [key]: check.value } };
    if (check.hint) out.hint = check.hint;
    return out;
  }

  // ── Browser ──────────────────────────────────────────────────

  let panel = null;     // #inspector
  let shownComp = null; // the part on show, or null

  function mount(el) {
    panel = el;
    if (!panel) return;
    panel.hidden = true;
    panel.addEventListener('keydown', onKey);
  }

  // Keys on a focused control. A text box keeps its own (the browser's text
  // undo; the editor already leaves inputs alone). A dropdown, checkbox or
  // slider has no undo of its own, so Ctrl/Cmd+Z (Shift: redo) is the
  // board's; any other key stays here, so Backspace or S/P/W never reach
  // the board.
  function onKey(e) {
    const t = e.target;
    if (t.tagName !== 'SELECT' && t.tagName !== 'INPUT') return;
    if (t.tagName === 'INPUT' && t.type === 'text') return;
    e.stopPropagation();
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) root.App.redo(); else root.App.undo();
    }
  }

  // After an edit redraws the rows, focus goes back to the same row's
  // control (a number's text selected), so typing stays in the inspector.
  function refocus(key) {
    const row = panel && rowEl(key);
    const c = row && row.querySelector('input, select');
    if (!c || c === document.activeElement) return;
    c.focus();
    if (c.type === 'text') c.select();
  }

  const rowsEl  = () => panel.querySelector('#inspector-rows');
  const rowEl   = key => panel.querySelector(`.inspector-row[data-key="${key}"]`);

  function setNote(row, cls, text) {
    const n = row && row.querySelector('.' + cls);
    if (!n) return;
    n.textContent = text || '';
    n.hidden = !text;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // A value edit: refused, the reason inline; accepted, App.setValues.
  // again: refocus the row's control afterwards (Enter, a dropdown pick),
  // not after a blur, where the user has clicked elsewhere.
  function commitValue(comp, key, raw, again) {
    const row = rowEl(key);
    const res = edit(comp, key, raw);
    if (!res.ok) {
      setNote(row, 'inspector-hint', '');
      setNote(row, 'inspector-error', res.reason);
      return;
    }
    const before = (comp.values || {})[key];
    if (before !== res.values[key]) root.App.setValues(comp, res.values);   // redraws, and shows the part again
    const now = rowEl(key);
    setNote(now, 'inspector-error', '');
    setNote(now, 'inspector-hint', res.hint);
    if (again) refocus(key);
  }

  function controlEdit(comp, key, value, done) {
    const App = root.App;
    if (!App.controlEdit(comp, key, value, done)) sync();
    else if (!App.simRunning) sync();
  }

  function numberRow(comp, r, row) {
    const field = el('div', 'inspector-field');
    const input = el('input', 'inspector-input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.value = String(r.value);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commitValue(comp, r.key, input.value, true); }
    });
    // Leaving the box commits too (a click on the label, or on Run: the
    // value lands before the run). Not for a box an edit already replaced,
    // another part, or the value it already shows.
    input.addEventListener('change', () => {
      if (!input.isConnected || shownComp !== comp) return;
      const now = own(comp.values, r.key) ? comp.values[r.key] : r.value;
      if (input.value.trim() === String(now)) return;
      commitValue(comp, r.key, input.value, false);
    });
    field.append(input, el('span', 'inspector-unit', r.unit));
    row.append(field);
  }

  function choiceRow(comp, r, row) {
    const select = el('select', 'inspector-input');
    for (const name of r.options) {
      const o = el('option', null, name);
      o.value = name;
      select.append(o);
    }
    select.value = r.value;
    select.addEventListener('change', () => commitValue(comp, r.key, select.value, true));
    row.append(select);
  }

  // A choice control (e.g. a supply's mode): its options, set through App
  // like the other controls, not as a value.
  function optionRow(comp, r, row) {
    const select = el('select', 'inspector-input');
    for (const name of r.options) {
      const o = el('option', null, name);
      o.value = name;
      select.append(o);
    }
    select.value = r.value;
    select.addEventListener('change', () => controlEdit(comp, r.key, select.value, true));
    row.append(select);
  }

  function sliderRow(comp, r, row) {
    const field = el('div', 'inspector-field');
    const input = el('input', 'inspector-slider');
    input.type = 'range';
    input.min = r.min; input.max = r.max; input.step = r.step;
    input.value = r.value;
    const read = el('span', 'inspector-unit', readout(r.value, r.unit));
    input.addEventListener('input',  () => { read.textContent = readout(input.value, r.unit); controlEdit(comp, r.key, Number(input.value), false); });
    input.addEventListener('change', () => controlEdit(comp, r.key, Number(input.value), true));
    field.append(input, read);
    row.append(field);
  }

  function checkRow(comp, r, row) {
    const box = el('input', 'inspector-check');
    box.type = 'checkbox';
    box.checked = !!r.value;
    box.addEventListener('change', () => controlEdit(comp, r.key, box.checked, true));
    row.querySelector('.inspector-key').prepend(box);
    if (r.kind === 'momentary') row.querySelector('.inspector-key').title = 'Works while the simulation runs';
  }

  function readout(v, unit) {
    return unit ? `${v}${unit === '%' ? '' : ' '}${unit}` : String(v);
  }

  const BUILD = { number: numberRow, choice: choiceRow, option: optionRow, slider: sliderRow, toggle: checkRow, momentary: checkRow };

  function show(comp) {
    if (!panel) return;
    const def = comp && registry().get(comp.type);
    if (!def) { hide(); return; }
    shownComp = comp;
    panel.querySelector('#inspector-label').textContent = comp.label || def.name;
    const list = rowsEl();
    list.textContent = '';
    const all = rows(def, comp);
    for (const r of all) {
      const row = el('div', 'inspector-row');
      row.dataset.key  = r.key;
      row.dataset.kind = r.kind;
      const key = el('label', 'inspector-key', r.key);
      if (r.kind === 'number' || r.kind === 'choice') {
        const note = el('span', 'inspector-off');
        note.hidden = true;
        key.append(note);
      }
      row.append(key);
      BUILD[r.kind](comp, r, row);
      const hint = el('div', 'inspector-hint');   hint.hidden = true;
      const err  = el('div', 'inspector-error');  err.hidden  = true;
      row.append(hint, err);
      list.append(row);
    }
    if (!all.length) list.append(el('div', 'inspector-empty', 'Nothing to set on this part.'));
    panel.hidden = false;
    sync();
  }

  function hide() {
    shownComp = null;
    if (!panel) return;
    panel.hidden = true;
    rowsEl().textContent = '';
  }

  // A value row greyed (disabled, its note shown) or not, as rows() says:
  // a mode flip changes it in place, so no rebuild mid-drag.
  function setOff(row, r) {
    const note = row.querySelector('.inspector-off');
    if (!note) return;
    const input = row.querySelector('input, select');
    row.classList.toggle('inspector-row-disabled', !!r.disabled);
    if (input) input.disabled = !!r.disabled;
    note.textContent = r.note || '';
    note.hidden = !r.disabled;
  }

  // Controls follow the part (a run, Stop, a click on the part); a focused
  // input or a slider mid-drag is left as the user has it. Value rows grey
  // out or come back as their activeWhen says.
  function sync() {
    if (!panel || !shownComp) return;
    const def = registry().get(shownComp.type);
    if (!def) return;
    for (const r of rows(def, shownComp)) {
      const row = rowEl(r.key);
      if (!row) continue;
      setOff(row, r);
      const input = row.querySelector('input, select');
      if (!input) continue;
      if (input.type === 'checkbox') {
        input.checked  = !!r.value;
        input.disabled = r.kind === 'momentary' && !root.App.simRunning;
      } else if (r.kind !== 'number' && input !== document.activeElement) {
        input.value = r.value;
        if (r.kind === 'slider') row.querySelector('.inspector-unit').textContent = readout(r.value, r.unit);
      }
    }
  }

  return { rows, edit, mount, show, hide, sync, current: () => shownComp };
});
