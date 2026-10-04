// ─────────────────────────────────────────────────────────────
//  parts/registry.js — the parts registry. Every part file calls
//  Parts.define({...}); everything else reads parts from here.
//  The rules are docs/API-CONTRACT.md → "Part file contract".
//
//  Pure: no THREE, no document, no App.
//
//  EXPORTS
//  ───────
//  Browser: window.Parts
//  Node:    module.exports (require('circuit3d/js/parts') gives the same object)
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const Parts = factory();
  if (typeof module === 'object' && module.exports) module.exports = Parts;
  if (root) root.Parts = Parts;
})(typeof window !== 'undefined' ? window : null, function () {

  const CATEGORIES = ['Passives', 'Sources', 'Semiconductors', 'I/O', 'Instruments'];
  const UNITS      = ['Ω', 'V', 'A', 'F', 'H', '%', '°C', 'lux', 'Hz'];
  const FIELDS     = ['type', 'name', 'sub', 'category', 'icon', 'prefix', 'pins', 'ref', 'place', 'values',
                      'controls', 'gestures', 'elements', 'measure', 'warnings', 'report', 'headline', 'line',
                      'reading', 'ai', 'view', 'examples', 'pinout', 'wireColors'];
  const REQUIRED   = ['type', 'name', 'sub', 'category', 'icon', 'prefix', 'pins', 'place',
                      'elements', 'report', 'ai', 'view', 'examples'];
  const TYPE_RE    = /^[a-z][a-z0-9_]*$/;
  const PREFIX_RE  = /^[A-Z]{1,3}$/;
  const PIN_RE     = /^[A-Za-z0-9]+$/;
  const ICON_BYTES = 2048;
  const PINOUT_STYLES = ['dip'];
  const PINOUT_LABEL  = 6;      // characters (U+2212 is one)
  const BODY_ROWS  = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const RAIL_ROWS  = ['tp', 'tn', 'bp', 'bn'];

  // Element kinds: which fields name pins, which must be numbers.
  const ELEMENTS = {
    R:  { pins: ['pins'],        nums: ['ohms'] },
    V:  { pins: ['pins'],        nums: ['volts'] },
    I:  { pins: ['pins'],        nums: ['amps'] },
    SW: { pins: ['pins'],        nums: [] },
    D:  { pins: ['pins'],        nums: ['vf', 'ron'] },
    E:  { pins: ['out', 'ctrl'], nums: ['gain'] },
    G:  { pins: ['out', 'ctrl'], nums: ['gain'] },
    C:  { pins: ['pins'],        nums: ['farads'] },
  };
  const RESERVED = ['L'];

  const SERIES = {
    E12: [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2],
    E24: [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0,
          3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1],
  };

  class PartDefinitionError extends Error {
    constructor(message, problems) {
      super(message);
      this.name = 'PartDefinitionError';
      this.problems = problems || [];
    }
  }

  const registry = new Map();   // type → frozen definition

  // ── Small helpers ────────────────────────────────────────────────────────

  const isObj   = o => o !== null && typeof o === 'object' && !Array.isArray(o);
  const list    = a => (Array.isArray(a) ? a.join(', ') : String(a));
  const sameSet = (a, b) => Array.isArray(a) && a.length === b.length && b.every(x => a.includes(x));
  const toolOf  = def => (def.ai && def.ai.tool) || 'place_' + def.type;

  function utf8Bytes(s) {
    let n = 0;
    for (const ch of s) {
      const cp = ch.codePointAt(0);
      n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    }
    return n;
  }

  function unknownFields(obj, allowed, at, bad) {
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) bad(`unknown field "${at ? at + '.' : ''}${k}"`);
  }

  function text(obj, key, max, at, bad, required) {
    const s = obj[key];
    if (s === undefined) { if (required) bad(`${at} is required`); return; }
    if (typeof s !== 'string' || !s) bad(`${at} must be a non-empty string`);
    else if (s.length > max) bad(`${at} must be at most ${max} characters; got ${s.length}`);
  }

  function deepFreeze(o) {
    if (o === null || typeof o !== 'object' || Object.isFrozen(o)) return o;
    Object.freeze(o);
    for (const k of Object.getOwnPropertyNames(o)) deepFreeze(o[k]);
    return o;
  }

  // A number as text, with a real minus sign: -5 → "−5".
  function plain(n) {
    return (n < 0 ? '−' : '') + String(Number(Math.abs(n).toPrecision(12)));
  }

  // A value with its unit, SI-prefixed for Ω V A F H: 1200 Ω → "1.2 kΩ".
  // Exported as Parts.withUnit, the one SI formatter (inspector, server).
  const SI = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  function withUnit(n, unit) {
    const sep = unit === '%' ? '' : ' ';
    if (!['Ω', 'V', 'A', 'F', 'H'].includes(unit) || n === 0) return plain(n) + sep + unit;
    const a = Math.abs(n);
    const [f, p] = SI.find(([f]) => a >= f) || SI[SI.length - 1];
    return (n < 0 ? '−' : '') + String(Number((a / f).toPrecision(3))) + ' ' + p + unit;
  }

  // Defaults as a part's elements() receives them. A choice's overrides
  // (e.g. { vf: 2.0 }) are merged in beside the choice's name.
  function defaultValues(values) {
    const out = {};
    for (const [key, spec] of Object.entries(isObj(values) ? values : {})) {
      if (!isObj(spec)) continue;
      out[key] = spec.default;
      if (isObj(spec.choices) && isObj(spec.choices[spec.default])) Object.assign(out, spec.choices[spec.default]);
    }
    return out;
  }

  function defaultControls(controls) {
    const out = {};
    for (const [key, c] of Object.entries(isObj(controls) ? controls : {})) if (isObj(c)) out[key] = c.default;
    return out;
  }

  // ── define() rules ───────────────────────────────────────────────────────

  function checkPlace(place, pins, bad) {
    if (!isObj(place)) return bad('place must be a Placement object');
    const allowed = { span: ['kind', 'span', 'rotations'], footprint: ['kind', 'legs', 'straddle', 'rotations'],
                      offboard: ['kind'] }[place.kind];
    if (!allowed) return bad(`place.kind "${place.kind}" must be span, footprint or offboard`);
    unknownFields(place, allowed, 'place', bad);
    const rot = place.rotations;

    if (place.kind === 'span') {
      if (pins && pins.length !== 2) bad(`a span part has exactly 2 pins; got ${pins.length}`);
      const s = place.span;
      if (!isObj(s) || ![s.min, s.max, s.default].every(n => Number.isInteger(n) && n >= 1)) {
        bad('place.span must be { min, max, default }, whole numbers of columns, at least 1');
      } else {
        unknownFields(s, ['min', 'max', 'default'], 'place.span', bad);
        if (s.min > s.max) bad(`place.span min ${s.min} is above max ${s.max}`);
        else if (s.default < s.min || s.default > s.max) bad(`place.span default ${s.default} must be within ${s.min}–${s.max}`);
      }
      if (!sameSet(rot, ['h']) && !sameSet(rot, ['h', 'v'])) bad(`place.rotations must be ['h'] or ['h', 'v']; got ${list(rot)}`);
    }

    if (place.kind === 'footprint') {
      if (pins && pins.length < 3) bad(`a footprint part has 3 or more pins; got ${pins.length}`);
      const legs = place.legs;
      if (!Array.isArray(legs) || !legs.every(l => Array.isArray(l) && l.length === 2 && l.every(Number.isInteger))) {
        bad('place.legs must be a list of [dCol, dRow] whole-number offsets');
      } else {
        if (pins && legs.length !== pins.length) bad(`${pins.length} pins but the footprint has ${legs.length} legs; it needs one leg per pin`);
        if (legs.length && (legs[0][0] !== 0 || legs[0][1] !== 0)) bad('place.legs[0] must be [0, 0]: pin 0 is the anchor');
        if (new Set(legs.map(String)).size !== legs.length) bad('place.legs has two legs at the same offset');
      }
      if (place.straddle !== undefined && typeof place.straddle !== 'boolean') bad('place.straddle must be true or false');
      if (place.straddle) {
        if (!sameSet(rot, [0, 180])) bad(`a straddle chip's place.rotations must be [0, 180]; got ${list(rot)}`);
      } else if (!sameSet(rot, [0, 180]) && !sameSet(rot, [0, 90, 180, 270])) {
        bad(`place.rotations must be [0, 180] or [0, 90, 180, 270]; got ${list(rot)}`);
      }
    }
  }

  // activeWhen: { <choice control>: <one of its options>, note }: the value
  // applies only while that control has that option (the inspector greys it
  // out otherwise, with the note).
  function checkActiveWhen(aw, controls, at, bad) {
    at += '.activeWhen';
    if (!isObj(aw)) return bad(`${at} must be an object { <control>: <option>, note }`);
    const keys = Object.keys(aw).filter(k => k !== 'note');
    if (keys.length !== 1) bad(`${at} must name exactly one control; got ${keys.length}`);
    else {
      const key = keys[0];
      const c = isObj(controls) && Object.hasOwn(controls, key) ? controls[key] : null;
      if (!isObj(c)) bad(`${at} names control "${key}", which is not in controls`);
      else if (c.type !== 'choice') bad(`${at} names control "${key}", which is not a choice`);
      else if (!Array.isArray(c.options) || !c.options.includes(aw[key])) {
        bad(`${at}: "${aw[key]}" is not one of controls.${key}'s options (${list(c.options || [])})`);
      }
    }
    if (typeof aw.note !== 'string' || !aw.note || aw.note.length > 24) bad(`${at}.note must be text of 1–24 characters`);
  }

  function checkValues(values, controls, bad) {
    if (!isObj(values)) return bad('values must be an object of ValueSpecs');
    for (const [key, spec] of Object.entries(values)) {
      const at = 'values.' + key;
      if (!isObj(spec)) { bad(`${at} must be a ValueSpec object`); continue; }
      // ai: false keeps the value out of the AI's tools; the inspector still shows it.
      if (spec.ai !== undefined && spec.ai !== false) bad(`${at}.ai may only be false`);
      if (spec.activeWhen !== undefined) checkActiveWhen(spec.activeWhen, controls, at, bad);
      if ('choices' in spec) {
        unknownFields(spec, ['choices', 'default', 'ai', 'activeWhen'], at, bad);
        const names = isObj(spec.choices) ? Object.keys(spec.choices) : [];
        if (!names.length) { bad(`${at}.choices must name at least one choice`); continue; }
        for (const c of names) if (!isObj(spec.choices[c])) bad(`${at}.choices.${c} must be an object of overrides`);
        if (!names.includes(spec.default)) bad(`${at}.default "${spec.default}" is not one of its choices (${names.join(', ')})`);
        continue;
      }
      unknownFields(spec, ['unit', 'default', 'min', 'max', 'series', 'ai', 'activeWhen'], at, bad);
      if (spec.unit === undefined) bad(`${at}.unit is required`);
      else if (!UNITS.includes(spec.unit)) bad(`${at}.unit "${spec.unit}" must be one of ${UNITS.join(', ')}`);
      if (spec.series !== undefined && !SERIES[spec.series]) bad(`${at}.series "${spec.series}" must be E12 or E24`);
      const missing = ['default', 'min', 'max'].filter(f => !Number.isFinite(spec[f]));
      for (const f of missing) bad(`${at}.${f} is required (a number)`);
      if (missing.length) continue;
      if (spec.min > spec.max) bad(`${at}.min ${spec.min} is above max ${spec.max}`);
      else if (spec.default < spec.min || spec.default > spec.max) {
        bad(`${at}.default ${spec.default} must be within min–max (${spec.min}–${spec.max})`);
      }
    }
  }

  function checkControls(controls, bad) {
    if (!isObj(controls)) return bad('controls must be an object of ControlSpecs');
    for (const [key, c] of Object.entries(controls)) {
      const at = 'controls.' + key;
      if (!isObj(c)) { bad(`${at} must be a ControlSpec object`); continue; }
      // Every type may add ai: false (kept out of set_control) and
      // clickAnytime (its click gesture also works while editing).
      const common = ['type', 'default', 'saved', 'ai', 'clickAnytime'];
      if (c.ai !== undefined && c.ai !== false) bad(`${at}.ai may only be false`);
      if (c.clickAnytime !== undefined && typeof c.clickAnytime !== 'boolean') bad(`${at}.clickAnytime must be true or false`);
      if (c.type === 'toggle' || c.type === 'momentary') {
        unknownFields(c, common, at, bad);
        if (typeof c.default !== 'boolean' || typeof c.saved !== 'boolean') bad(`${at} needs default and saved, true or false`);
        else if (c.type === 'momentary' && (c.default || c.saved)) bad(`${at}: a momentary control must have default false and saved false`);
      } else if (c.type === 'slider') {
        unknownFields(c, [...common, 'min', 'max', 'step', 'unit'], at, bad);
        const missing = ['default', 'min', 'max', 'step'].filter(f => !Number.isFinite(c[f]));
        for (const f of missing) bad(`${at}.${f} is required (a number)`);
        if (typeof c.saved !== 'boolean') bad(`${at}.saved must be true or false`);
        if (c.unit !== undefined && !UNITS.includes(c.unit)) bad(`${at}.unit "${c.unit}" must be one of ${UNITS.join(', ')}`);
        if (missing.length) continue;
        if (c.step <= 0) bad(`${at}.step must be above 0`);
        if (c.min > c.max) bad(`${at}.min ${c.min} is above max ${c.max}`);
        else if (c.default < c.min || c.default > c.max) bad(`${at}.default ${c.default} must be within ${c.min}–${c.max}`);
      } else if (c.type === 'choice') {
        unknownFields(c, [...common, 'options'], at, bad);
        const o = c.options;
        if (!Array.isArray(o) || o.length < 2 || !o.every(x => typeof x === 'string' && x)) bad(`${at}.options must list 2 or more names`);
        else if (new Set(o).size !== o.length) bad(`${at}.options names an option twice`);
        else if (!o.includes(c.default)) bad(`${at}.default "${c.default}" is not one of its options (${o.join(', ')})`);
        if (typeof c.saved !== 'boolean') bad(`${at}.saved must be true or false`);
      } else {
        bad(`${at}.type "${c.type}" must be toggle, momentary, slider or choice`);
      }
    }
  }

  function checkGestures(gestures, controls, bad) {
    if (!isObj(gestures)) return bad('gestures must be { click?, scroll? }');
    for (const [g, key] of Object.entries(gestures)) {
      if (g !== 'click' && g !== 'scroll') bad(`gestures.${g} is not a gesture; use click or scroll`);
      else if (!isObj(controls) || !Object.hasOwn(controls, key)) bad(`gestures.${g} names control "${key}", which is not in controls`);
    }
  }

  function checkElement(el, i, pins, bad) {
    const at = `elements[${i}]`;
    if (!isObj(el)) return bad(`${at} must be an Element object`);
    if (RESERVED.includes(el.kind)) return bad(`${at}: element kind ${el.kind} is reserved (not supported until Phase 5–6)`);
    const spec = ELEMENTS[el.kind];
    if (!spec) return bad(`${at}.kind "${el.kind}" is not an element kind; use ${Object.keys(ELEMENTS).join(', ')}`);
    for (const f of spec.pins) {
      const p = el[f];
      if (!Array.isArray(p) || p.length !== 2) { bad(`${at} (${el.kind}) ${f} must name 2 pins`); continue; }
      for (const n of p) {
        const ok = typeof n === 'string' && ((pins || []).includes(n) || /^#[A-Za-z0-9_]+$/.test(n));
        if (!ok) bad(`${at} pin "${n}" is not one of the part's pins or an internal "#name"`);
      }
    }
    for (const f of spec.nums) if (!Number.isFinite(el[f])) bad(`${at} (${el.kind}) ${f} must be a number`);
    if (el.kind === 'R' && Number.isFinite(el.ohms) && el.ohms <= 0) bad(`${at} (R) ohms must be above 0; got ${el.ohms}`);
    if (el.kind === 'V' && el.ref !== undefined && !(Array.isArray(el.pins) && el.pins.includes(el.ref))) bad(`${at} (V) ref "${el.ref}" must be one of its pins`);
    if (el.kind === 'SW' && typeof el.closed !== 'boolean') bad(`${at} (SW) closed must be true or false`);
    if (el.kind === 'D' && el.vz !== undefined && !Number.isFinite(el.vz)) bad(`${at} (D) vz must be a number`);
    if (el.kind === 'E') {
      const pinOk = n => typeof n === 'string' && ((pins || []).includes(n) || /^#[A-Za-z0-9_]+$/.test(n));
      if (el.rails !== undefined && (!Array.isArray(el.rails) || el.rails.length !== 2 || !el.rails.every(pinOk))) bad(`${at} (E) rails must name 2 pins, [vneg, vpos]`);
      for (const f of ['rout', 'headroom']) if (el[f] !== undefined && !(Number.isFinite(el[f]) && el[f] >= 0)) bad(`${at} (E) ${f} must be a number, 0 or more`);
      if (el.ilim !== undefined && !(Number.isFinite(el.ilim) && el.ilim > 0)) bad(`${at} (E) ilim must be a number above 0`);
    }
  }

  function checkExample(ex, at, bad) {
    if (!isObj(ex)) return bad(`${at} must be an Example object`);
    unknownFields(ex, ['name', 'parts', 'wires', 'expect'], at, bad);
    if (typeof ex.name !== 'string' || !ex.name) bad(`${at}.name is required`);
    if (!Array.isArray(ex.parts) || !ex.parts.length) bad(`${at}.parts must list at least one part`);
    if (!Array.isArray(ex.wires)) bad(`${at}.wires must be a list`);
    if (!isObj(ex.expect)) bad(`${at}.expect must be an object`);
  }

  function checkAi(ai, values, pins, bad) {
    if (!isObj(ai)) return bad('ai must be an AiSpec object');
    unknownFields(ai, ['tool', 'about', 'keywords', 'values', 'guide', 'recipe', 'everyday', 'mustWire', 'listed', 'recipes'], 'ai', bad);
    if (ai.tool !== undefined && (typeof ai.tool !== 'string' || !TYPE_RE.test(ai.tool))) {
      bad(`ai.tool "${ai.tool}" must be lower case letters, digits and _`);
    }
    text(ai, 'about', 200, 'ai.about', bad, true);
    text(ai, 'guide', 400, 'ai.guide', bad, false);
    const k = ai.keywords;
    if (k === undefined) bad('ai.keywords is required');
    else if (!Array.isArray(k)) bad('ai.keywords must be a list of words');
    else {
      if (k.length > 8) bad(`ai.keywords has ${k.length}; at most 8 are allowed`);
      for (const w of k) if (typeof w !== 'string' || !w || w !== w.toLowerCase()) bad(`ai.keywords "${w}" must be lower case`);
    }
    // The value keys the AI may set, as tool params. Default: all of them.
    if (ai.values !== undefined) {
      if (!Array.isArray(ai.values)) bad('ai.values must be a list of value keys');
      else {
        const keys = isObj(values) ? Object.keys(values) : [];
        for (const k of ai.values) if (typeof k !== 'string' || !keys.includes(k)) bad(`ai.values "${k}" is not one of the part's values (${keys.join(', ')})`);
        if (new Set(ai.values).size !== ai.values.length) bad('ai.values names a value twice');
      }
    }
    // The pins that must be wired; the server names one that goes nowhere.
    if (ai.mustWire !== undefined) {
      if (!Array.isArray(ai.mustWire)) bad('ai.mustWire must be a list of pin names');
      else {
        for (const n of ai.mustWire) if (typeof n !== 'string' || !(pins || []).includes(n)) bad(`ai.mustWire "${n}" is not one of the part's pins (${list(pins || [])})`);
        if (new Set(ai.mustWire).size !== ai.mustWire.length) bad('ai.mustWire names a pin twice');
      }
    }
    // In the set the server sends when a message names no part.
    if (ai.everyday !== undefined && typeof ai.everyday !== 'boolean') bad('ai.everyday must be true or false');
    if (ai.listed !== undefined && ai.listed !== 'in-play') bad(`ai.listed "${ai.listed}" must be 'in-play'`);
    if (ai.recipe !== undefined) checkExample(ai.recipe, 'ai.recipe', bad);
    if (ai.recipes !== undefined) {
      if (!Array.isArray(ai.recipes)) bad('ai.recipes must be a list of Examples');
      else ai.recipes.forEach((ex, i) => checkExample(ex, `ai.recipes[${i}]`, bad));
    }
  }

  // Calls elements/measure/warnings/report on the defaults and a sample
  // result, to check element kinds and pins and the text-length limits.
  function checkBehaviour(def, pins, bad) {
    const values = defaultValues(def.values);
    const controls = defaultControls(def.controls);
    let els = [];
    if (typeof def.elements !== 'function') {
      if (def.elements !== undefined) bad('elements must be a function (values, controls) → Element[]');
    } else {
      try { els = def.elements(values, controls); } catch (e) { bad(`elements() threw: ${e.message}`); els = null; }
      if (els !== null && (!Array.isArray(els) || !els.length)) { bad('elements() must return a non-empty list of Elements'); els = null; }
      if (els) els.forEach((el, i) => checkElement(el, i, pins, bad));
      els = els || [];
    }

    const r = { label: (def.prefix || 'X') + '1', values, controls, pins: {}, current: {}, modes: {} };
    for (const p of pins || []) r.pins[p] = 0;
    els.forEach((el, i) => {
      const id = isObj(el) && el.id !== undefined ? el.id : i;
      r.current[id] = 0;
      if (isObj(el) && el.kind === 'D') r.modes[id] = 'off';
      if (isObj(el) && el.kind === 'E' && (el.rails !== undefined || el.ilim !== undefined)) r.modes[id] = 'linear';
    });

    let m = {};
    const run = (name, fn) => {
      if (fn === undefined) return undefined;
      if (typeof fn !== 'function') { bad(`${name} must be a function`); return undefined; }
      try { return fn(r, m); } catch (e) { bad(`${name}() threw: ${e.message}`); return undefined; }
    };
    if (def.measure !== undefined) {
      m = run('measure', def.measure);
      if (!isObj(m)) { if (typeof def.measure === 'function') bad('measure() must return a flat object'); m = {}; }
    }
    const w = run('warnings', def.warnings);
    if (def.warnings !== undefined && w !== undefined) {
      if (!Array.isArray(w)) bad('warnings() must return a list of strings');
      else for (const s of w) {
        if (typeof s !== 'string') bad('warnings() must return a list of strings');
        else if (s.length > 120) bad(`warnings() lines must be at most 120 characters; got ${s.length}`);
      }
    }
    // Optional results-panel lines: headline(r, m) → { text, cls },
    // line(r, m) → { text, cls } | null. Only their type is checked here.
    for (const f of ['headline', 'line']) {
      if (def[f] !== undefined && typeof def[f] !== 'function') bad(`${f} must be a function (r, m) → { text, cls }`);
    }
    // Optional Readings.part override: reading(r) → { V?, P?, channels? }.
    const own = run('reading', def.reading);
    if (typeof def.reading === 'function' && own !== undefined && !isObj(own)) bad('reading() must return an object { V?, P?, channels? }');
    const rep = run('report', def.report);
    if (typeof def.report === 'function' && rep !== undefined) {
      if (typeof rep !== 'string') bad('report() must return a string');
      else if (rep.length > 80) bad(`report() must be at most 80 characters; got ${rep.length}`);
    }
  }

  // Optional pin-out diagram (#132): { title, style: 'dip', labels }, one
  // short name per pin in pin order. A DIP lists 1..n/2 down the left and
  // n/2+1..n up the right, so it needs an even pin count.
  function checkPinout(p, pins, bad) {
    if (!isObj(p)) return bad('pinout must be an object { title, style, labels }');
    unknownFields(p, ['title', 'style', 'labels'], 'pinout', bad);
    text(p, 'title', 32, 'pinout.title', bad, true);
    if (p.style === undefined) bad(`pinout.style is required (${PINOUT_STYLES.join(', ')})`);
    else if (!PINOUT_STYLES.includes(p.style)) bad(`pinout.style "${p.style}" must be one of ${PINOUT_STYLES.join(', ')}`);
    else if (p.style === 'dip' && pins && pins.length % 2) bad(`pinout style "dip" needs an even number of pins; got ${pins.length}`);
    if (!Array.isArray(p.labels)) return bad('pinout.labels must be a list of short pin names, one per pin');
    if (pins && p.labels.length !== pins.length) {
      bad(`pinout.labels has ${p.labels.length} labels; it needs one per pin (${pins.length})`);
    }
    p.labels.forEach((l, i) => {
      const at = `pinout.labels[${i}]`;
      if (typeof l !== 'string') bad(`${at} must be a string; got ${JSON.stringify(l)}`);
      else if (!l.trim()) bad(`${at} must not be empty`);
      else if ([...l].length > PINOUT_LABEL) bad(`${at} "${l}" must be at most ${PINOUT_LABEL} characters; got ${[...l].length}`);
    });
  }

  function problemsOf(def) {
    const problems = [];
    const bad = msg => problems.push(msg);
    if (!isObj(def)) return ['a part definition must be an object'];

    unknownFields(def, FIELDS, '', bad);
    for (const f of REQUIRED) if (def[f] === undefined) bad(`${f} is required`);

    if (def.type !== undefined) {
      if (typeof def.type !== 'string' || !TYPE_RE.test(def.type)) {
        bad(`type "${def.type}" must be lower case letters, digits and _, starting with a letter`);
      } else if (registry.has(def.type)) bad(`type "${def.type}" is already defined`);
    }
    text(def, 'name', 24, 'name', bad, false);
    text(def, 'sub', 32, 'sub', bad, false);
    if (def.category !== undefined && !CATEGORIES.includes(def.category)) {
      bad(`category "${def.category}" must be one of ${CATEGORIES.join(', ')}`);
    }
    if (def.icon !== undefined) {
      if (typeof def.icon !== 'string') bad('icon must be a string of inline <svg> markup');
      else {
        if (!/^\s*<svg[\s>]/i.test(def.icon)) bad('icon must be inline <svg> markup, starting with <svg');
        const n = utf8Bytes(def.icon);
        if (n > ICON_BYTES) bad(`icon must be at most 2 KB (${ICON_BYTES} bytes of UTF-8); got ${n} bytes`);
      }
    }
    if (def.prefix !== undefined) {
      if (typeof def.prefix !== 'string' || !PREFIX_RE.test(def.prefix)) bad(`prefix "${def.prefix}" must be 1–3 capital letters`);
      else for (const other of registry.values()) {
        if (other.prefix === def.prefix) bad(`prefix "${def.prefix}" is already used by ${other.type}`);
      }
    }

    let pins = null;
    if (def.pins !== undefined) {
      if (!Array.isArray(def.pins)) bad('pins must be a list of pin names');
      else {
        pins = def.pins;
        if (pins.length < 2 || pins.length > 16) bad(`pins must have 2–16 names; got ${pins.length}`);
        const seen = new Set();
        for (const p of pins) {
          if (typeof p !== 'string' || !PIN_RE.test(p)) bad(`pin "${p}" must be letters and digits only`);
          else if (seen.has(p)) bad(`pin "${p}" appears twice; pin names must be unique`);
          seen.add(p);
        }
      }
    }
    if (def.ref !== undefined && !(pins || []).includes(def.ref)) {
      bad(`ref "${def.ref}" is not one of the pins (${list(pins || [])})`);
    }

    if (def.wireColors !== undefined) {
      if (!isObj(def.wireColors)) bad('wireColors must be an object { <pin>: <24-bit colour> }');
      else for (const [pin, c] of Object.entries(def.wireColors)) {
        if (!(pins || []).includes(pin)) bad(`wireColors.${pin} is not one of the pins (${list(pins || [])})`);
        if (!Number.isInteger(c) || c < 0 || c > 0xffffff) bad(`wireColors.${pin} must be a 24-bit colour, an integer 0..0xffffff`);
      }
    }
    if (def.place !== undefined) checkPlace(def.place, pins, bad);
    if (def.values !== undefined) checkValues(def.values, def.controls, bad);
    if (def.controls !== undefined) checkControls(def.controls, bad);
    if (def.gestures !== undefined) checkGestures(def.gestures, def.controls, bad);
    checkBehaviour(def, pins, bad);

    // ai: false keeps a part from the AI (no tool, no prompt line); a missing ai is still refused.
    if (def.ai !== undefined && def.ai !== false) {
      checkAi(def.ai, def.values, pins, bad);
      if (isObj(def.ai)) {
        const tool = toolOf(def);
        for (const other of registry.values()) {
          if (toolOf(other) === tool && other.type !== def.type) bad(`ai.tool "${tool}" is already used by ${other.type}`);
        }
      }
    }
    if (def.view !== undefined) {
      if (!isObj(def.view)) bad('view must be a ViewSpec object');
      else {
        unknownFields(def.view, ['build', 'update', 'show'], 'view', bad);
        if (typeof def.view.build !== 'function') bad('view.build is required (a function)');
        if (def.view.update !== undefined && typeof def.view.update !== 'function') bad('view.update must be a function');
        if (def.view.show !== undefined && typeof def.view.show !== 'function') bad('view.show must be a function');
      }
    }
    if (def.pinout !== undefined) checkPinout(def.pinout, pins, bad);
    if (def.examples !== undefined) {
      if (!Array.isArray(def.examples) || !def.examples.length) bad('examples must list at least 1 known-answer circuit');
      else def.examples.forEach((ex, i) => checkExample(ex, `examples[${i}]`, bad));
    }
    return problems;
  }

  // ── Interfaces ───────────────────────────────────────────────────────────

  function define(def) {
    const problems = problemsOf(def);
    if (problems.length) {
      const who = isObj(def) && typeof def.type === 'string' && def.type ? `"${def.type}"` : '(no type)';
      const msg = `Part ${who} is invalid (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n  - ` + problems.join('\n  - ');
      throw new PartDefinitionError(msg, problems);
    }
    deepFreeze(def);
    registry.set(def.type, def);
    return def;
  }

  function get(type) {
    return registry.get(type) || null;
  }

  function all() {
    const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    return [...registry.values()].sort((a, b) =>
      CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || byName(a, b));
  }

  // Whether a part can be placed facing either way by hand (F in place
  // mode swaps its two holes): a 2-lead span part with an anode and a
  // cathode. Decided from the definition, never from a type name.
  function isFlippable(def) {
    if (!def || !def.place || def.place.kind !== 'span') return false;
    const pins = def.pins;
    return Array.isArray(pins) && pins.length === 2 && pins.includes('anode') && pins.includes('cathode');
  }

  // Tests only.
  function reset() {
    registry.clear();
  }

  // The nearest E-series value, across decades (by ratio). null if none.
  function nearestKit(value, series) {
    const base = SERIES[series];
    if (!base || !Number.isFinite(value) || value <= 0) return null;
    const d = Math.floor(Math.log10(value));
    let best = null;
    let bestErr = Infinity;
    for (let e = d - 1; e <= d + 1; e++) {
      for (const m of base) {
        const v = Number((m * Math.pow(10, e)).toPrecision(12));
        const err = Math.abs(Math.log(v / value));
        if (err < bestErr) { best = v; bestErr = err; }
      }
    }
    return best;
  }

  function checkValue(type, key, value) {
    const def = get(type);
    if (!def) return { ok: false, reason: `unknown part type "${type}"` };
    const spec = def.values && Object.hasOwn(def.values, key) ? def.values[key] : null;
    if (!spec) return { ok: false, reason: `${def.type} has no value "${key}"` };
    if (spec.choices) {
      const names = Object.keys(spec.choices);
      return names.includes(value) ? { ok: true, value } : { ok: false, reason: `${key} must be one of ${names.join(', ')}` };
    }
    const range = `${withUnit(spec.min, spec.unit)}–${withUnit(spec.max, spec.unit)}`;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      const got = typeof value === 'string' ? JSON.stringify(value)
        : value !== null && typeof value === 'object' ? (Array.isArray(value) ? 'an array' : 'an object')
        : String(value);
      return { ok: false, reason: `${key} must be a number, ${range}; got ${got}` };
    }
    if (value < spec.min || value > spec.max) return { ok: false, reason: `${key} must be ${range}; got ${plain(value)}` };
    const kit = spec.series ? nearestKit(value, spec.series) : null;
    if (kit === null || Math.abs(kit - value) <= 1e-9 * Math.abs(value)) return { ok: true, value };
    return { ok: true, value, hint: 'closest kit value: ' + withUnit(kit, spec.unit) };
  }

  // Today's hole address, 1-based column: body "a12", rails "tp_12".
  function holeName(col, row) {
    return /^[a-j]$/.test(row) ? row + (col + 1) : row + '_' + (col + 1);
  }

  // "a test span", "an LED": the part's name for placement reasons.
  function partPhrase(def, lead) {
    const words = String(lead ? lead + ' ' + def.name : def.name).split(' ')
      .map(w => (/[A-Z]/.test(w) && /^[A-Z0-9-]{2,}$/.test(w) ? w : w.toLowerCase()));
    const first = words[0];
    const an = /^[A-Z]{2,}/.test(first) ? /^[AEFHILMNORSX]/.test(first) : /^(8|11|18)/.test(first) || /^[aeiou]/.test(first);
    return (an ? 'an ' : 'a ') + words.join(' ');
  }

  function checkSpan(def, legs, holes, bodyRows) {
    const [a, b] = legs;
    const { min, max } = def.place.span;
    const range = min === max ? String(min) : `${min}–${max}`;
    const whose = partPhrase(def) + "'s leads";
    if (a.row === b.row) {
      const d = Math.abs(a.col - b.col);
      if (d < min || d > max) return `${whose} must be ${range} columns apart; ${holes[0]} to ${holes[1]} is ${d}.`;
      return null;
    }
    if (a.col === b.col) {
      if (!def.place.rotations.includes('v')) return `${partPhrase(def)} can't be placed vertically; put both leads on one row, ${range} columns apart.`;
      const top = bodyRows.slice(0, 5);
      const bottom = bodyRows.slice(5);
      const across = (top.includes(a.row) && bottom.includes(b.row)) || (top.includes(b.row) && bottom.includes(a.row));
      if (!across) return 'a part placed vertically must cross the centre gap (one leg in a–e, one in f–j).';
      return null;
    }
    return `${whose} must be on one row, ${range} columns apart, or straight across the centre gap; ${holes[0]} to ${holes[1]} is neither.`;
  }

  function checkPlacement(type, legs, holeMap, board) {
    const def = get(type);
    if (!def) return { ok: false, reason: `unknown part type "${type}"` };
    if (def.place.kind === 'offboard') return { ok: true };
    const fail = reason => ({ ok: false, reason });
    const n = def.pins.length;
    const cols = board && Number.isFinite(board.cols) ? board.cols : Infinity;
    const bodyRows = (board && board.bodyRows) || BODY_ROWS;

    if (!Array.isArray(legs) || legs.length !== n) return fail(`${partPhrase(def)} needs ${n} leads, one per pin.`);
    // A footprint leg past row a or j (Parts.footprintLegs gives it row null).
    const anchor = legs[0];
    if (def.place.kind === 'footprint' && anchor && typeof anchor.row === 'string' && Number.isInteger(anchor.col)
        && legs.some(l => l && l.row == null && Number.isInteger(l.col))) {
      if (def.place.straddle) return fail('a chip must sit across the centre gap (rows e and f).');
      const edge = bodyRows.indexOf(anchor.row) < bodyRows.length / 2 ? bodyRows[0] : bodyRows[bodyRows.length - 1];
      return fail(`${partPhrase(def, n + '-pin')} at ${anchor.hole || holeName(anchor.col, anchor.row)} would run past row ${edge}.`);
    }
    if (legs.some(l => !l || typeof l.row !== 'string' || !Number.isInteger(l.col))) return fail(`${partPhrase(def)} needs every lead in a hole.`);
    const holes = legs.map(l => l.hole || holeName(l.col, l.row));

    const off = legs.find(l => l.col < 0 || l.col >= cols);
    if (off) {
      const what = def.place.kind === 'footprint' ? partPhrase(def, n + '-pin') : partPhrase(def);
      return fail(`${what} at column ${legs[0].col + 1} would run past column ${off.col < 0 ? 1 : cols}.`);
    }
    const i = legs.findIndex(l => !bodyRows.includes(l.row) && !RAIL_ROWS.includes(l.row));
    if (i >= 0) return fail(`${holes[i]} is not a hole on the board.`);

    if (def.place.kind === 'span') {
      const reason = checkSpan(def, legs, holes, bodyRows);
      if (reason) return fail(reason);
    }
    if (def.place.straddle) {
      const rows = new Set(legs.map(l => l.row));
      const [e, f] = [bodyRows[4], bodyRows[5]];
      if (rows.size !== 2 || !rows.has(e) || !rows.has(f)) return fail('a chip must sit across the centre gap (rows e and f).');
    }

    const seen = new Set();
    for (let k = 0; k < legs.length; k++) {
      const h = holes[k];
      const where = bodyRows.includes(legs[k].row) ? `in column ${legs[k].col + 1}` : 'on that rail';
      if (seen.has(h)) return fail(`two leads can't share ${h}. A hole holds one lead; use another hole ${where}.`);
      seen.add(h);
      const o = holeMap && holeMap.get(h);
      if (!o) continue;
      const holds = o.wire !== undefined ? 'the end of a wire' : `${o.label}'s pin ${o.pin}`;
      return fail(`${h} already holds ${holds}. A hole holds one lead; use another hole ${where}.`);
    }
    return { ok: true };
  }

  // A record's legs, one per pin: [{ pin, col, row, hole }]. `col` is the
  // record's 0-based column; `hole` is "a12" / "tp_12", or null off the board.
  // Legs come back in the part's pins order: a holeRef matches its pin by
  // name, or by index when it has no name. Refs naming an unknown pin go last.
  function legsOf(comp) {
    const def = comp && get(comp.type);
    const pins = def ? def.pins : [];
    const refs = comp && Array.isArray(comp.holeRefs) ? comp.holeRefs : [];
    const named = ref => ref && ref.pin != null;
    const leg = (pin, ref) => (ref ? { pin, col: ref.col, row: ref.row, hole: holeName(ref.col, ref.row) }
                                   : { pin, col: null, row: null, hole: null });
    const used = new Set();
    const legs = pins.map((pin, i) => {
      let k = refs.findIndex((ref, j) => !used.has(j) && named(ref) && String(ref.pin) === pin);
      if (k < 0 && i < refs.length && !used.has(i) && !named(refs[i])) k = i;
      if (k < 0) return leg(pin, null);
      used.add(k);
      return leg(pin, refs[k]);
    });
    refs.forEach((ref, j) => {
      if (used.has(j) || !ref) return;
      legs.push(leg(named(ref) ? String(ref.pin) : String(j), ref));
    });
    return legs;
  }

  // A footprint part's legs from an anchor hole (pin 0) and a rotation, one
  // { pin, col, row, hole } per pin in pin order. Offsets turn clockwise as
  // seen on the board (+col right, +row toward j): 0 (dc, dr), 90 (−dr, dc),
  // 180 (−dc, −dr), 270 (dr, −dc). Legs off the board still come back, so
  // checkPlacement can say why: a column outside the board as it is, a row
  // past a or j as row null. hole is null for a leg left of column 1 or
  // past a or j. anchor: "e20" or { col, row }.
  // null for a non-footprint part, an anchor that isn't a body hole, or a
  // rotation not in place.rotations.
  const TURN = { 0: (c, r) => [c, r], 90: (c, r) => [-r, c], 180: (c, r) => [-c, -r], 270: (c, r) => [r, -c] };
  function footprintLegs(type, anchor, rotation) {
    const def = get(type);
    if (!def || def.place.kind !== 'footprint' || !def.place.rotations.includes(rotation)) return null;
    let at = anchor;
    if (typeof anchor === 'string') {
      const m = /^([a-j])(\d+)$/i.exec(anchor.trim());
      at = m ? { col: Number(m[2]) - 1, row: m[1].toLowerCase() } : null;
    }
    const r0 = at ? BODY_ROWS.indexOf(at.row) : -1;
    if (r0 < 0 || !Number.isInteger(at.col)) return null;
    return def.place.legs.map(([dc, dr], i) => {
      const [c, r] = TURN[rotation](dc, dr);
      const col = at.col + c, row = BODY_ROWS[r0 + r] || null;
      return { pin: def.pins[i], col, row, hole: row && col >= 0 ? holeName(col, row) : null };
    });
  }

  return { PartDefinitionError, define, get, all, reset, nearestKit, withUnit, checkValue, checkPlacement, legsOf, footprintLegs, isFlippable };
});
