// The Edison UI flag (issue #147, Edison E1): edison/ui-flag.js decides which
// UI a page shows and sets <html data-ui>. Pure, so it is tested here on plain
// object stubs; the page round trip (?ui=edison, then classic unchanged) is
// E2's e2e/edison-skin.spec.js.
//
// Run with:  npm test
//
// API these tests are written against (contract: docs/API-CONTRACT.md →
// "Edison and the course hub"; plan: docs/superpowers/plans/
// 2026-10-01-edison-ui-revamp.md → Task E1), UMD like simulate.js:
// window.UiFlag in the page (booting itself), module.exports in Node.
//   resolve(search, stored)  → 'edison' | 'classic'. ?ui=edison|classic wins,
//                              then a valid stored value, else 'classic'.
//   apply(doc, ui)           sets doc.documentElement.dataset.ui = ui.
//   allowedCircuit(path)     true only for a .sparky under edison/ or
//                            circuit3d/labs/, with no traversal and no scheme.
//   boot(win)                resolve from win.location.search and the saved
//                            value, save a ?ui= choice, apply to win.document.
//                            Never throws, even with storage blocked.
//   switchTo(ui, win)        save ui (try/catch), then win.location.assign()
//                            the same URL without the ui param, or with
//                            ui=<ui> when the save failed, so the switch
//                            still works for that load (orchestrator call).
//   data-ui-fixed            a page whose <html> has data-ui="edison"
//                            data-ui-fixed (edison/course.html, index.html)
//                            stays Edison: boot ignores ?ui= and the saved
//                            value there, and writes nothing (orchestrator call).
//   framed pages             a page inside an iframe (win.top !== win; the
//                            landing page's hero viewer.html?ui=edison) shows
//                            the ?ui= it is given but never saves it: only the
//                            page the visitor is on sets the saved choice
//                            (orchestrator call, issue #149).
//   KEY                      the storage key, 'plugged.ui'.

const assert = require('node:assert');

// Loaded per test, so a module that can't load in Node fails each test by name.
function UiFlag() {
  let mod;
  try { mod = require('../edison/ui-flag.js'); } catch (e) {
    assert.fail(`edison/ui-flag.js can't be loaded in Node: ${e.message.split('\n')[0]}`);
  }
  for (const fn of ['resolve', 'apply', 'allowedCircuit', 'boot', 'switchTo'])
    assert.strictEqual(typeof mod[fn], 'function', `UiFlag.${fn} is a function (exports: ${Object.keys(mod).join(', ')})`);
  return mod;
}

// A page-like window: location, a <html> element and a working localStorage.
// `writes` lists every setItem call, so a test can prove nothing was written.
// It is a top-level window (its own top, as in a browser); a framed test
// replaces win.top with the page around it.
function fakeWin(search, saved = {}, dataset = {}) {
  const store = new Map(Object.entries(saved));
  const writes = [];
  const win = {
    store,
    writes,
    location: { search, href: `http://localhost:5001/circuit3d/index.html${search}`, assign() {} },
    document: { documentElement: { dataset } },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { writes.push([k, v]); store.set(k, String(v)); },
    },
  };
  win.top = win;
  return win;
}

// Storage that refuses to work, the two ways browsers do it: a private window
// or blocked site data throws from getItem/setItem, and some browsers (Chrome
// with all cookies blocked) throw from reading window.localStorage itself.
const BLOCKED = [
  ['getItem and setItem throw', win => {
    const deny = () => { const e = new Error('The operation is insecure.'); e.name = 'SecurityError'; throw e; };
    win.localStorage = { getItem: deny, setItem: deny };
  }],
  ['reading localStorage throws', win => {
    Object.defineProperty(win, 'localStorage', {
      get() { const e = new Error('Access is denied for this document.'); e.name = 'SecurityError'; throw e; },
    });
  }],
];

test.each([
  ['?ui=edison', null, 'edison'], ['?ui=classic', 'edison', 'classic'],
  ['', 'edison', 'edison'], ['', null, 'classic'], ['', 'purple', 'classic'],
  ['?ui=EDISON', null, 'classic'], ['?lab=lab2&ui=edison', null, 'edison'],
])('resolve(%s, %s) → %s', (search, stored, want) => {
  expect(UiFlag().resolve(search, stored)).toBe(want);
});

test('apply sets data-ui on <html>', () => {
  const doc = { documentElement: { dataset: {} } };
  UiFlag().apply(doc, 'edison');
  expect(doc.documentElement.dataset.ui).toBe('edison');
});

test.each([
  ['edison/demo/inverting-amp.sparky', true], ['circuit3d/labs/lab1.sparky', true],
  ['../backend/server.js', false], ['edison/../backend/x.sparky', false],
  ['edison/demo/x.js', false], ['https://evil.example/x.sparky', false], ['', false],
  // Added beyond the plan: an absolute path, encoded or deeper traversal, a
  // query string, a look-alike folder, and the null the viewer gets from
  // URLSearchParams.get when there is no ?circuit= at all.
  ['/edison/demo/x.sparky', false], ['edison/%2e%2e/backend/x.sparky', false],
  ['circuit3d/labs/../../backend/x.sparky', false], ['edison/demo/x.sparky?raw=1', false],
  ['edisonx/demo.sparky', false], [null, false], [undefined, false],
  // Review: Windows-style backslash traversal is refused; a doubled slash
  // still resolves under /edison/, so it is allowed (pinned).
  ['edison\\..\\backend\\x.sparky', false], ['edison//x.sparky', true],
])('allowedCircuit(%s) → %s', (p, ok) => {
  expect(UiFlag().allowedCircuit(p)).toBe(ok);
});

test('the storage key is plugged.ui', () => {
  expect(UiFlag().KEY).toBe('plugged.ui');
});

test('boot saves a ?ui= choice and a later load with no ?ui= reads it back', () => {
  const Flag = UiFlag();

  const first = fakeWin('?ui=edison');
  Flag.boot(first);
  expect(first.document.documentElement.dataset.ui, '?ui=edison shows Edison').toBe('edison');
  expect(first.store.get('plugged.ui'), '?ui=edison is saved').toBe('edison');

  const later = fakeWin('', Object.fromEntries(first.store));
  Flag.boot(later);
  expect(later.document.documentElement.dataset.ui, 'the saved choice wins with no ?ui=').toBe('edison');

  const back = fakeWin('?ui=classic', Object.fromEntries(first.store));
  Flag.boot(back);
  expect(back.document.documentElement.dataset.ui, '?ui=classic beats the saved edison').toBe('classic');
  expect(back.store.get('plugged.ui'), '?ui=classic is saved').toBe('classic');

  const junk = fakeWin('?ui=purple', { 'plugged.ui': 'edison' });
  Flag.boot(junk);
  expect(junk.document.documentElement.dataset.ui, 'an unknown ?ui= falls back to the saved choice').toBe('edison');
  expect(junk.store.get('plugged.ui'), 'an unknown ?ui= is not saved').toBe('edison');
});

// Review focus 2 (plan): a private window or blocked storage must still show
// Edison for this page load, and the page must never throw.
test.each(BLOCKED)('blocked localStorage (%s): boot with ?ui=edison still shows Edison and does not throw', (how, block) => {
  const Flag = UiFlag();
  const win = fakeWin('?ui=edison');
  block(win);
  expect(() => Flag.boot(win)).not.toThrow();
  expect(win.document.documentElement.dataset.ui).toBe('edison');
});

// The choice saved: the next URL drops ?ui= and the saved value carries it.
// The save failed: the next URL carries ui=<choice> itself (once, replacing
// any old ui=), or the switch would do nothing on a blocked-storage page.
test.each([
  ['working storage', null, () => {}],
  ...BLOCKED.map(([how, block]) => [how, 'classic', block]),
])('switchTo("classic") with %s reloads the same page, keeping the other params (ui param: %s)', (how, wantUi, block) => {
  const Flag = UiFlag();
  const win = fakeWin('?lab=lab2&ui=edison', { 'plugged.ui': 'edison' });
  const went = [];
  win.location.assign = url => { went.push(url); };
  block(win);

  expect(() => Flag.switchTo('classic', win)).not.toThrow();
  expect(went.length, 'one navigation').toBe(1);
  const url = new URL(went[0], win.location.href);
  expect(url.pathname).toBe('/circuit3d/index.html');
  expect(url.searchParams.getAll('ui'), wantUi ? 'the unsaved choice rides in the URL, once' : 'the ui param is dropped')
    .toEqual(wantUi ? [wantUi] : []);
  expect(url.searchParams.get('lab'), 'other params are kept').toBe('lab2');
  if (how === 'working storage') expect(win.store.get('plugged.ui'), 'the choice is saved').toBe('classic');
});

test.each(BLOCKED)('blocked localStorage (%s): switchTo("edison") from a page with no ?ui= adds ui=edison', (how, block) => {
  const Flag = UiFlag();
  const win = fakeWin('?lab=lab2');
  const went = [];
  win.location.assign = url => { went.push(url); };
  block(win);

  expect(() => Flag.switchTo('edison', win)).not.toThrow();
  const url = new URL(went[0], win.location.href);
  expect(url.searchParams.get('ui'), 'the unsaved choice rides in the URL').toBe('edison');
  expect(url.searchParams.get('lab'), 'other params are kept').toBe('lab2');
});

// Edison-only pages (edison/course.html, edison/index.html) declare
// <html data-ui="edison" data-ui-fixed> and always render Edison.
test.each([
  ['?ui=classic', null], ['', 'classic'], ['?ui=classic', 'classic'], ['?ui=edison', 'classic'],
])('a data-ui-fixed Edison page stays Edison with search %j and saved %j, and writes nothing', (search, stored) => {
  const Flag = UiFlag();
  const win = fakeWin(search, stored ? { 'plugged.ui': stored } : {}, { ui: 'edison', uiFixed: '' });
  expect(() => Flag.boot(win)).not.toThrow();
  expect(win.document.documentElement.dataset.ui, 'the fixed page shows Edison').toBe('edison');
  expect(win.writes, 'the fixed page does not touch the saved choice').toEqual([]);
});

// Pin: data-ui="edison" alone (no data-ui-fixed) is just a starting value;
// ?ui=classic still wins and is saved, as on any page.
test('a page with data-ui="edison" but no data-ui-fixed still follows ?ui=classic', () => {
  const Flag = UiFlag();
  const win = fakeWin('?ui=classic', { 'plugged.ui': 'edison' }, { ui: 'edison' });
  Flag.boot(win);
  expect(win.document.documentElement.dataset.ui).toBe('classic');
  expect(win.store.get('plugged.ui')).toBe('classic');
});

// A page inside an iframe: the landing page's hero board is
// viewer.html?circuit=…&ui=edison. It shows the UI it is asked for, but the
// saved choice belongs to the page the visitor is on, so a classic visitor
// opening the Edison landing page stays classic (orchestrator, issue #149).
test.each([
  ['?ui=edison', null, 'edison'], ['?ui=classic', 'edison', 'classic'],
])('framed (win.top is the page around it): boot with %s shows it and writes nothing (saved %j)', (search, stored, want) => {
  const Flag = UiFlag();
  const win = fakeWin(search, stored ? { 'plugged.ui': stored } : {});
  win.top = fakeWin('');
  expect(() => Flag.boot(win)).not.toThrow();
  expect(win.document.documentElement.dataset.ui, `a framed page with ${search}`).toBe(want);
  expect(win.writes, 'a framed page does not touch the saved choice').toEqual([]);
});

// Review (#149): a framed page takes its UI from ?ui= only, never from the
// saved choice. The classic landing page frames viewer.html with no ?ui=;
// a visitor who once saved "edison" must still see the classic preview there.
test('framed with no ?ui= and a saved "edison": shows classic and writes nothing', () => {
  const Flag = UiFlag();
  const win = fakeWin('', { 'plugged.ui': 'edison' });
  win.top = fakeWin('');
  Flag.boot(win);
  expect(win.document.documentElement.dataset.ui, 'the framed preview ignores the saved choice').toBe('classic');
  expect(win.writes).toEqual([]);
});

// Pin: a top-level page (win.top === win) still saves its ?ui= choice.
test('top-level (win.top === win): boot with ?ui=edison still saves it', () => {
  const Flag = UiFlag();
  const win = fakeWin('?ui=edison');
  expect(win.top).toBe(win);
  Flag.boot(win);
  expect(win.document.documentElement.dataset.ui).toBe('edison');
  expect(win.writes).toEqual([['plugged.ui', 'edison']]);
});
