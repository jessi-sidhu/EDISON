// The buzzer as a registry part, issue #26: its tone starts and stops in
// parts/buzzer.js view.update, called after every simulation with the
// buzzer's measure() ({ sounding, current }) and with {} on Stop. Headless
// Chrome can't be heard, so the page gets a stand-in AudioContext that
// records every oscillator, and Parts.get is wrapped so the test sees each
// view.update call. /api/ask is stubbed; no AI is called. Guest only.
const { test, expect } = require('@playwright/test');

const simLines = page => page.locator('#sim-results .sim-line').allTextContents();

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// A stand-in Web Audio API, installed before the page's scripts run.
function fakeAudio() {
  window.__oscillators = [];
  window.__gains = [];
  class Param {
    constructor(v) { this.value = v; }
    setTargetAtTime(v) { this.value = v; }
    setValueAtTime(v) { this.value = v; }
    linearRampToValueAtTime(v) { this.value = v; }
    exponentialRampToValueAtTime(v) { this.value = v; }
    cancelScheduledValues() {}
  }
  class Node { connect(n) { return n; } disconnect() {} }
  class Oscillator extends Node {
    constructor() { super(); this.type = 'sine'; this.frequency = new Param(440); this.started = false; this.stopped = false; window.__oscillators.push(this); }
    start() { this.started = true; }
    stop() { this.stopped = true; }
  }
  class Gain extends Node {
    constructor() { super(); this.gain = new Param(1); window.__gains.push(this); }
  }
  class Ctx {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = new Node(); }
    createOscillator() { return new Oscillator(); }
    createGain() { return new Gain(); }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  window.AudioContext = Ctx;
  window.webkitAudioContext = Ctx;
}

// Is a tone playing? An oscillator started and not stopped, with its gain up.
const tone = page => page.evaluate(() => {
  const live = window.__oscillators.filter(o => o.started && !o.stopped);
  const loud = window.__gains.some(g => g.gain.value > 0);
  return { started: window.__oscillators.filter(o => o.started).length, playing: live.length > 0 && loud };
});

// BAT1 → tp_2 / tn_12; tp_3 → a3; R1 b3–b7; BZ1 c7–c9; a9 → tn_9.
// I = 9 / (470 + 42) = 17.6 mA.
async function buildBuzzer(page) {
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    const end  = s => { const h = hole(s); return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null }; };
    const wireHoles = (a, b) => { App.state.wireStart = end(a); App.finishWire(end(b)); };
    const wireBat = (k, b) => {
      const bat = App.state.components.find(c => c.type === 'battery');
      const pm  = bat.pinMeshes[k];
      App.state.wireStart = { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
      App.finishWire(end(b));
    };
    App.placePart('battery', { x: 13, z: 0 });
    wireBat(0, 'tp_2');
    wireBat(1, 'tn_12');
    App.placePart('resistor', [hole('b3'), hole('b7')]);
    App.placePart('buzzer', [hole('c7'), hole('c9')]);
    wireHoles('tp_3', 'a3');
    wireHoles('a9', 'tn_9');
  });
}

test('the buzzer sounds after Run and goes quiet after Stop, through parts/buzzer.js view.update', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(fakeAudio);
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);

  const hasUpdate = await page.evaluate(() => {
    const d = window.Parts && Parts.get('buzzer');
    return !!(d && d.view && typeof d.view.update === 'function');
  });
  expect(hasUpdate, "window.Parts.get('buzzer').view.update in the editor").toBe(true);

  await buildBuzzer(page);
  expect(await page.evaluate(() => App.state.components.map(c => c.label))).toEqual(['BAT1', 'R1', 'BZ1']);

  // Record what the buzzer's view.update is given (the definition is frozen,
  // so wrap Parts.get instead).
  await page.evaluate(() => {
    window.__updates = [];
    const get = Parts.get;
    Parts.get = type => {
      const d = get(type);
      if (type !== 'buzzer' || !d) return d;
      const update = (obj, m, r) => { window.__updates.push(JSON.parse(JSON.stringify(m || {}))); return d.view.update(obj, m, r); };
      return Object.assign({}, d, { view: Object.assign({}, d.view, { update }) });
    };
  });
  expect((await tone(page)).playing, 'silent before Run').toBe(false);

  await page.locator('#sim-run-btn').click();
  await expect.poll(async () => (await simLines(page)).join(' | ')).toContain('🔔 BUZZER ON  (17.6 mA)');
  const ran = await page.evaluate(() => window.__updates);
  expect(ran.some(m => m.sounding === true), `view.update got { sounding: true }: ${JSON.stringify(ran)}`).toBe(true);
  await expect.poll(async () => (await tone(page)).playing, { message: 'a tone plays while it sounds' }).toBe(true);

  await page.locator('#sim-stop-btn').click();
  const stopped = await page.evaluate(() => window.__updates);
  expect(stopped.slice(ran.length).some(m => m.sounding !== true), `view.update ran on Stop without sounding: ${JSON.stringify(stopped)}`).toBe(true);
  await expect.poll(async () => (await tone(page)).playing, { message: 'the tone stops after Stop' }).toBe(false);
  expect(errors).toEqual([]);
});
