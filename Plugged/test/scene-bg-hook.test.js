// The scene's --scene-bg hook (issue #147): circuit3d/js/scene.js
// takes the CSS variable --scene-bg on <html> (a hex colour) as the 3D scene
// background when it is set, and keeps classic's #dcdad4 when it isn't
// (contract: docs/API-CONTRACT.md → "Edison and the course hub" → Page hooks;
// edison/DESIGN.md §4: Edison's viewport is the bezel, #1E2225).
//
// Run with:  npm test
//
// scene.js runs as written in a Node vm. Three.js and the DOM around it are
// stubbed: THREE.Color records the colour it is given (THREE r128 takes a
// number or a clean "#rrggbb"; anything else it warns about and draws black),
// every other THREE class and DOM object is an inert stand-in, and
// getComputedStyle answers --scene-bg with the value under test. The page
// half (the real computed colour in a browser) is e2e/edison-skin.spec.js.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const SCENE = path.join(__dirname, '..', 'circuit3d', 'js', 'scene.js');
const CLASSIC = 0xdcdad4;

// An object that is anything: any property is another one, and it can be
// called or constructed. Stands in for the parts of THREE and the DOM that
// scene.js touches but this test doesn't look at.
function inert() {
  return new Proxy(function () {}, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (typeof k === 'symbol' || k in t) return t[k];
      return (t[k] = inert());
    },
    apply: () => inert(),
    construct: () => inert(),
  });
}

class Color {
  constructor(...args) { this.given = args; }
  set(v) { this.given = [v]; return this; }
  setHex(v) { this.given = [v]; return this; }
  setStyle(v) { this.given = [v]; return this; }
}
class Scene { add() {} }

// Runs scene.js with --scene-bg set to `cssValue` ('' when unset) and returns
// the background colour as a number, or a description of what THREE was given.
function sceneBackground(cssValue) {
  const asked = [];
  const win = vm.createContext({
    THREE: new Proxy({ Color, Scene }, { get: (t, k) => (k in t ? t[k] : (t[k] = inert())) }),
    document: { documentElement: inert(), body: inert(), getElementById: () => inert() },
    navigator: { webdriver: true },
    devicePixelRatio: 1,
    ResizeObserver: inert(),
    getComputedStyle: () => ({
      getPropertyValue: name => { asked.push(name); return name === '--scene-bg' ? cssValue : ''; },
    }),
    console,
  });
  win.window = win;
  vm.runInContext(fs.readFileSync(SCENE, 'utf8'), win, { filename: 'circuit3d/js/scene.js' });

  const bg = win.App && win.App.scene && win.App.scene.background;
  assert.ok(bg instanceof Color, 'scene.js sets App.scene.background to a THREE.Color');
  const v = bg.given[0];
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) return parseInt(v.slice(1), 16);
  return `THREE.Color given ${JSON.stringify(bg.given)}${asked.includes('--scene-bg') ? '' : ' (--scene-bg never read)'}`;
}

test.each([
  ['#1E2225', 0x1e2225],
  ['#1e2225', 0x1e2225],
  // Browsers may hand a custom property back with its leading space.
  [' #1E2225', 0x1e2225],
  // Pins (pass today): classic, with --scene-bg unset, keeps its background,
  // and a value that isn't a hex colour never reaches THREE.Color.
  ['', CLASSIC],
  ['not-a-colour', CLASSIC],
])('the scene background with --scene-bg "%s"', (css, want) => {
  const got = sceneBackground(css);
  expect(got, `--scene-bg "${css}": expected 0x${want.toString(16)}, got ${typeof got === 'number' ? '0x' + got.toString(16) : got}`).toBe(want);
});
