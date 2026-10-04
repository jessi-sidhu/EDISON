# Usable Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every issue from the 2026-09-26 review so Sparky runs correctly on a local machine.

**Architecture:**
- The app stays plain browser scripts on the shared `window.App` object.
- Logic that needs tests moves into small UMD modules: `ids.js`, `chat.js`,
  `history.js`, `board-io.js` and `storage.js`. Like `simulate.js`, each one
  attaches to `window` in the browser and uses `module.exports` under Node,
  so Vitest can load it.
- The simulator's path search is replaced by modified nodal analysis (MNA).

**Tech Stack:** vanilla JS, Three.js r128, Node 20 (zero-dependency server), Vitest 3.2 with `tdd-guard-vitest`.

**Spec:** `docs/superpowers/specs/2026-09-27-usable-baseline-design.md`

## Global Constraints

- Node 20.19 is installed, so use Vitest `~3.2.7`. Vitest 5 needs Node ≥ 22.12.
- The browser code has no build step. New modules are loaded with plain
  `<script>` tags, in dependency order.
- `backend/server.js` keeps zero npm dependencies at runtime. Test tools are
  devDependencies only.
- Components are named by per-type index: `battery_0` is the first battery,
  `led_1` the second LED.
- Every behaviour change is driven by a failing Vitest test first, as
  tdd-guard enforces.
- Each task is one commit, ending in
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

These inputs are the most likely to hurt a user. Each one gets a test in the
task that owns the code.

1. **A floating part** (placed, but wired to nothing) must not break the
   solve → Task 2, test "a floating resistor does not disturb the circuit".
2. **Batteries wired directly in parallel** must report `unsolvable`, not
   throw → Task 2, test "batteries wired straight together are unsolvable,
   not a crash".
3. **An AI action that names a part that doesn't exist** counts as failed,
   without a crash → Task 3, test "unknown battery ref fails without
   throwing".
4. **An oversized `/api/ask` body** gets a 413, and the server keeps running
   → Task 7, test "rejects a body over 256 KB with 413".
5. **A signed-in user with circuits from before this change** keeps them →
   Task 6, test "adopts legacy unkeyed projects on sign-in".

---

### Task 1: Vitest and the tdd-guard reporter

**Files:**
- Modify: `package.json`
- Create: `vitest.config.mjs`
- Modify: `test/simulate.test.js`

**Interfaces:**
- Produces:
  - `npm test`, which runs `vitest run`
  - test files are CommonJS, using `require`, with Vitest globals
    (`test`, `describe`)

- [ ] **Step 1: Install**

Run: `npm install --save-dev vitest@~3.2.7 tdd-guard-vitest@^0.2.0`
Expected: adds both to `devDependencies`.

- [ ] **Step 2: Config and script**

`vitest.config.mjs`:
```js
import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.js'],
    reporters: ['default', ['tdd-guard-vitest', { projectRoot: root }]],
  },
})
```

In `package.json` `scripts`, add `"test": "vitest run"`.

- [ ] **Step 3: Port `test/simulate.test.js`**
  - Delete the two lines `const test = require('node:test');` and the header
    line "Run with: node --test". `test` is now a Vitest global.
  - Replace each `test(name, { skip: '...' }, fn)` with `test.skip(name, fn)`.

- [ ] **Step 4: Run**

Run: `npm test`
Expected: `9 passed | 3 skipped`. `.claude/tdd-guard/data/test.json` exists.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "Run tests with Vitest and report them to tdd-guard"`

---

### Task 2: Simulator — modified nodal analysis

**Files:**
- Modify: `circuit3d/js/simulate.js`: replace `findAllPaths`,
  `traversalOrder`, `nodeSig` and `analyze`.
- Test: `test/simulate.test.js`

**Interfaces:**
- Consumes: `buildGraph(components, wires)` → `[{ comp, nodes: [rootId…] }]`,
  which is unchanged.
- Produces: `analyze(components, wires)` returns:
  ```
  { status: 'empty' | 'no-battery' | 'ok' | 'unsolvable',
    lines, ledsOn, buzzersOn,
    nodeVoltages: { [rootId]: volts },
    currents: number[] | [],
    shorted: boolean }
  ```
  - `currents[i]` is the current through component i, positive from pin 0
    to pin 1 inside the part.
  - An LED conducting forwards therefore has a negative value, because pin 1
    is the anode.
  - It is `null` for a pressed button.
- Module exports: `{ PROPS, UnionFind, bbNodeId, buildGraph, analyze, install }`.

- [ ] **Step 1: Rewrite the tests to the new result, and add the new cases**

Replace everything from `// ── Series` to the end of the file with:
```js
// Forward current through an LED: pin 1 (anode) to pin 0 (cathode).
const ledI = (r, i) => -r.currents[i];

test('series battery, resistor, LED: (9-2)/470', () => {
  const bat = battery();
  const res = comp('resistor', [h(5, 'a'), h(10, 'a')]);
  const led = comp('led',      [h(15, 'a'), h(10, 'a')]); // pin0 cathode, pin1 anode
  const wires = [wire(h(2, 'tp'), h(5, 'a')), wire(h(15, 'a'), h(2, 'tn'))];

  const r = Sim.analyze([bat, res, led], wires);

  assert.equal(r.status, 'ok');
  assert.ok(Math.abs(mA(ledI(r, 2)) - 14.894) < 0.01, `got ${mA(ledI(r, 2))}`);
  assert.equal(r.ledsOn.length, 1);
  assert.ok(hasLine(r, 'LED ON  (14.9 mA)'), texts(r).join(' | '));
});

// Two LEDs behind one 470R: 14.894 mA through the resistor, 7.447 mA each (#8).
test('parallel LEDs behind one resistor split its current (#8)', () => {
  const bat  = battery();
  const res  = comp('resistor', [h(5, 'a'), h(10, 'a')]);
  const led1 = comp('led', [h(1, 'tn'), h(10, 'a')]);
  const led2 = comp('led', [h(3, 'tn'), h(10, 'a')]);
  const r = Sim.analyze([bat, res, led1, led2], [wire(h(2, 'tp'), h(5, 'a'))]);

  assert.ok(Math.abs(mA(r.currents[1]) - 14.894) < 0.01, `resistor ${mA(r.currents[1])}`);
  assert.ok(Math.abs(mA(ledI(r, 2)) - 7.447) < 0.01, `led1 ${mA(ledI(r, 2))}`);
  assert.ok(Math.abs(mA(ledI(r, 3)) - 7.447) < 0.01, `led2 ${mA(ledI(r, 3))}`);
  assert.equal(r.ledsOn.length, 2);
});

// 9V - 470R - X - 470R - GND: V(X) = 4.5 V (#9).
test('voltage divider: V(midpoint) = 4.5 V (#9)', () => {
  const bat = battery();
  const r1  = comp('resistor', [h(5, 'a'),  h(10, 'a')]);
  const r2  = comp('resistor', [h(10, 'a'), h(15, 'a')]);
  const wires = [wire(h(2, 'tp'), h(5, 'a')), wire(h(15, 'a'), h(2, 'tn'))];
  const r = Sim.analyze([bat, r1, r2], wires);

  assert.ok(Math.abs(r.nodeVoltages.bb_top_10 - 4.5) < 1e-6, `got ${r.nodeVoltages.bb_top_10}`);
  assert.ok(Math.abs(mA(r.currents[1]) - 9.574) < 0.01);
});

test('reversed LED: stays dark and says so (#10)', () => {
  const bat = battery();
  const res = comp('resistor', [h(5, 'a'), h(10, 'a')]);
  const led = comp('led',      [h(10, 'a'), h(15, 'a')]); // cathode toward the resistor
  const wires = [wire(h(2, 'tp'), h(5, 'a')), wire(h(15, 'a'), h(2, 'tn'))];
  const r = Sim.analyze([bat, res, led], wires);

  assert.equal(r.ledsOn.length, 0);
  assert.ok(hasLine(r, 'backwards'), texts(r).join(' | '));
});

test('LED across the battery with no resistor is reported as a short', () => {
  const bat = battery();
  const led = comp('led', [h(1, 'tn'), h(1, 'tp')]);
  const r = Sim.analyze([bat, led], []);

  assert.equal(r.shorted, true);
  assert.equal(r.ledsOn.length, 0);
  assert.ok(hasLine(r, 'Short circuit'), texts(r).join(' | '));
});

test('a wire straight across the battery is a short', () => {
  const r = Sim.analyze([battery()], [wire(h(4, 'tp'), h(4, 'tn'))]);

  assert.equal(r.shorted, true);
  assert.ok(hasLine(r, 'Short circuit'), texts(r).join(' | '));
});

test('resistor and LED not wired to the battery leave the circuit open', () => {
  const bat = battery();
  const res = comp('resistor', [h(5, 'a'), h(10, 'a')]);
  const led = comp('led',      [h(15, 'a'), h(10, 'a')]);
  const r = Sim.analyze([bat, res, led], []);

  assert.equal(r.status, 'ok');
  assert.equal(r.ledsOn.length, 0);
  assert.ok(hasLine(r, 'Circuit open'), texts(r).join(' | '));
  assert.ok(hasLine(r, 'Battery terminals not connected'), texts(r).join(' | '));
});

// Two 9 V in series drive (18 - 2) / 470 = 34.043 mA (#11).
test('two 9V batteries in series add up (#11)', () => {
  const batA = comp('battery', [h(1, 'tp'),  h(20, 'a')]);
  const batB = comp('battery', [h(20, 'a'), h(1, 'tn')]);
  const res  = comp('resistor', [h(5, 'a'), h(10, 'a')]);
  const led  = comp('led',      [h(15, 'a'), h(10, 'a')]);
  const wires = [wire(h(2, 'tp'), h(5, 'a')), wire(h(15, 'a'), h(2, 'tn'))];
  const r = Sim.analyze([batA, batB, res, led], wires);

  assert.ok(Math.abs(mA(ledI(r, 3)) - 34.043) < 0.01, `got ${mA(ledI(r, 3))}`);
});

test('red and green LEDs in parallel: only the lower-Vf red one lights', () => {
  const bat   = battery();
  const res   = comp('resistor', [h(5, 'a'), h(10, 'a')]);
  const red   = comp('led', [h(1, 'tn'), h(10, 'a')]);
  const green = comp('led', [h(3, 'tn'), h(10, 'a')],
    { values: { color: 'green', forwardVoltage: 2.2, thresholdCurrent: 0.001, maxCurrent: 0.020 } });
  const r = Sim.analyze([bat, res, red, green], [wire(h(2, 'tp'), h(5, 'a'))]);

  assert.deepEqual(r.ledsOn, [red]);
});

test('a floating resistor does not disturb the circuit', () => {
  const bat   = battery();
  const res   = comp('resistor', [h(5, 'a'), h(10, 'a')]);
  const led   = comp('led',      [h(15, 'a'), h(10, 'a')]);
  const loose = comp('resistor', [h(30, 'f'), h(34, 'f')]);
  const wires = [wire(h(2, 'tp'), h(5, 'a')), wire(h(15, 'a'), h(2, 'tn'))];
  const r = Sim.analyze([bat, res, led, loose], wires);

  assert.equal(r.status, 'ok');
  assert.ok(Math.abs(mA(ledI(r, 2)) - 14.894) < 0.01);
});

test('a push button opens and closes the circuit', () => {
  const build = pressed => {
    const bat = battery();
    const btn = comp('button', [h(3, 'a'), h(6, 'a')], { pressed });
    const res = comp('resistor', [h(6, 'a'), h(10, 'a')]);
    const led = comp('led', [h(15, 'a'), h(10, 'a')]);
    const wires = [wire(h(2, 'tp'), h(3, 'a')), wire(h(15, 'a'), h(2, 'tn'))];
    return Sim.analyze([bat, btn, res, led], wires);
  };
  assert.equal(build(false).ledsOn.length, 0);
  assert.equal(build(true).ledsOn.length, 1);
});

test('batteries wired straight together are unsolvable, not a crash', () => {
  const a = battery();
  const b = comp('battery', [h(9, 'tp'), h(9, 'tn')], { values: { voltage: 6 } });
  const r = Sim.analyze([a, b], []);

  assert.equal(r.status, 'unsolvable');
  assert.ok(hasLine(r, 'cannot be solved'), texts(r).join(' | '));
});

test('empty board and battery-less board report their own status', () => {
  assert.equal(Sim.analyze([], []).status, 'empty');
  const noBat = Sim.analyze([comp('resistor', [h(5, 'a'), h(10, 'a')])], []);
  assert.equal(noBat.status, 'no-battery');
  assert.ok(hasLine(noBat, 'No battery in circuit.'));
});
```
Keep the existing `buildGraph merges columns…` test unchanged. Also change
the header comment to: "Golden tests for the simulate.js solver. Run with:
npm test".

- [ ] **Step 2: Run, and expect failures**

Run: `npm test`
Expected: FAIL. `r.currents` is undefined, and there's no `unsolvable`
status and no `shorted` flag.

- [ ] **Step 3: Implement.** In `simulate.js`, delete `MAX_PATHS`,
`MAX_STEPS`, `traversalOrder`, `nodeSig`, `findAllPaths` and the old
`analyze`, and add:

```js
  // ── Nodal analysis ──────────────────────────────────────────
  //  Modified nodal analysis: node voltages plus one current per battery.
  //  An LED is piecewise linear: open when off, and Vf in series with R_ON
  //  when on. The on/off pattern is found by flipping the single most
  //  inconsistent LED until none is, so the same circuit always gives the
  //  same answer.
  const R_ON       = 0.1;    // ohm, LED on-state series resistance
  const GMIN       = 1e-9;   // S from every node to the reference, keeps floating parts solvable
  const SHORT_AMPS = 1.0;    // battery current treated as a short circuit
  const OPEN_AMPS  = 1e-6;   // below this nothing is flowing
  const PIVOT_EPS  = 1e-12;

  function solveLinear(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < PIVOT_EPS) return null;
      if (p !== c) { const t = M[c]; M[c] = M[p]; M[p] = t; }
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / M[c][c];
        if (f === 0) continue;
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let s = M[r][n];
      for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
      x[r] = s / M[r][r];
    }
    return x;
  }

  // One linear solve for a fixed set of LEDs that are on.
  // Returns { v(node), batteryCurrent: Map(comp -> amps) } or null.
  function solveMNA(graph, bats, ledOn) {
    const ref = bats[0].nodes[1];
    const index = new Map();
    graph.forEach(g => g.nodes.forEach(n => {
      if (n !== ref && !index.has(n)) index.set(n, index.size);
    }));
    const N = index.size, size = N + bats.length;
    const A = Array.from({ length: size }, () => new Array(size).fill(0));
    const b = new Array(size).fill(0);
    const at = n => (n === ref ? -1 : index.get(n));

    function conductance(n1, n2, g) {
      const i = at(n1), j = at(n2);
      if (i >= 0) A[i][i] += g;
      if (j >= 0) A[j][j] += g;
      if (i >= 0 && j >= 0) { A[i][j] -= g; A[j][i] -= g; }
    }
    function inject(n, amps) { const i = at(n); if (i >= 0) b[i] += amps; }

    for (let i = 0; i < N; i++) A[i][i] += GMIN;

    graph.forEach(g => {
      const { comp, nodes } = g;
      const p = propsOf(comp);
      if (comp.type === 'resistor' || comp.type === 'buzzer') {
        if (p.resistance > 0) conductance(nodes[0], nodes[1], 1 / p.resistance);
      } else if (comp.type === 'led' && ledOn.get(comp)) {
        const anode = nodes[LED_ANODE_PIN], cathode = nodes[1 - LED_ANODE_PIN];
        const vf = p.forwardVoltage || 0;
        conductance(anode, cathode, 1 / R_ON);
        inject(anode, vf / R_ON);
        inject(cathode, -vf / R_ON);
      }
    });

    bats.forEach((bat, k) => {
      const row = N + k, pos = at(bat.nodes[0]), neg = at(bat.nodes[1]);
      if (pos >= 0) { A[pos][row] += 1; A[row][pos] += 1; }
      if (neg >= 0) { A[neg][row] -= 1; A[row][neg] -= 1; }
      b[row] = propsOf(bat.comp).voltage || 0;
    });

    const x = solveLinear(A, b);
    if (!x) return null;
    const batteryCurrent = new Map(bats.map((bat, k) => [bat.comp, x[N + k]]));
    return { v: n => (n === ref ? 0 : x[index.get(n)]), batteryCurrent };
  }

  function forwardCurrent(led, sol, on) {
    if (!on) return 0;
    const vf = propsOf(led.comp).forwardVoltage || 0;
    return (sol.v(led.nodes[LED_ANODE_PIN]) - sol.v(led.nodes[1 - LED_ANODE_PIN]) - vf) / R_ON;
  }

  // Find the consistent on/off pattern. Returns { sol, ledOn, settled } or null.
  function solveCircuit(graph, bats) {
    const leds  = graph.filter(g => g.comp.type === 'led');
    const ledOn = new Map(leds.map(l => [l.comp, false]));
    const rounds = 4 * leds.length + 10;
    for (let round = 0; round < rounds; round++) {
      const sol = solveMNA(graph, bats, ledOn);
      if (!sol) return null;
      let worst = null, worstBy = 1e-9;
      leds.forEach(l => {
        const vf = propsOf(l.comp).forwardVoltage || 0;
        const vd = sol.v(l.nodes[LED_ANODE_PIN]) - sol.v(l.nodes[1 - LED_ANODE_PIN]);
        const by = ledOn.get(l.comp) ? vf - vd : vd - vf;   // volts past the switching point
        if (by > worstBy) { worst = l; worstBy = by; }
      });
      if (!worst) return { sol, ledOn, settled: true };
      ledOn.set(worst.comp, !ledOn.get(worst.comp));
    }
    const sol = solveMNA(graph, bats, ledOn);
    return sol ? { sol, ledOn, settled: false } : null;
  }

  // Open-circuit voltage across an LED, i.e. with only that LED switched off.
  function openVoltage(graph, bats, ledOn, led) {
    const off = new Map(ledOn); off.set(led.comp, false);
    const sol = solveMNA(graph, bats, off);
    return sol ? sol.v(led.nodes[LED_ANODE_PIN]) - sol.v(led.nodes[1 - LED_ANODE_PIN]) : 0;
  }

  function resistorAdvice(led, voc) {
    const p = propsOf(led.comp);
    const minR = Math.ceil((voc - (p.forwardVoltage || 0)) / p.maxCurrent);
    return { minR, stock: stockResistor(minR) };
  }
```

Then replace `overCurrentLine(comp, I, netV)` with this version, which takes
the advice instead of a voltage:
```js
  function overCurrentLine(comp, I, advice) {
    const max = propsOf(comp).maxCurrent;
    if (!max || I <= max) return null;
    return {
      text: "  " + comp.type.toUpperCase() + " is over its " + (max * 1000).toFixed(0) +
            " mA rating at " + (I * 1000).toFixed(1) + " mA. Needs at least " + advice.minR +
            " ohm in series, so use " + advice.stock + " ohm.",
      cls: "sim-err",
    };
  }
```

And the new `analyze`:
```js
  function analyze(components, wires) {
    const blank = { lines: [], ledsOn: [], buzzersOn: [], nodeVoltages: {}, currents: [], shorted: false };

    if (!components.length) {
      return Object.assign({}, blank, {
        status: 'empty',
        lines: [{ text: 'No components placed.', cls: 'sim-warn' }],
      });
    }

    const graph = buildGraph(components, wires);
    const bats  = graph.filter(g => g.comp.type === 'battery');
    const lines = [];

    components.filter(c => c.type === 'button').forEach((btn, i) => {
      const state = btn.pressed ? '🟢 CLOSED (current flowing)' : '⭕ OPEN — click to press';
      lines.push({ text: `Button ${i + 1}: ${state}`, cls: btn.pressed ? 'sim-on' : 'sim-info' });
    });

    if (!bats.length) {
      return Object.assign({}, blank, {
        status: 'no-battery',
        lines: [{ text: 'No battery in circuit.', cls: 'sim-warn' }],
      });
    }

    bats.forEach((bat, bi) => lines.push({ text: `Battery ${bi + 1}: ${propsOf(bat.comp).voltage}V`, cls: 'sim-info' }));

    // A wire straight across a battery merges its terminals into one node.
    if (bats.some(bat => bat.nodes[0] === bat.nodes[1])) {
      lines.push({ text: '  ⚠ Short circuit — no resistance in path!', cls: 'sim-err' });
      return Object.assign({}, blank, { status: 'ok', lines, shorted: true });
    }

    const solved = solveCircuit(graph, bats);
    if (!solved) {
      lines.push({ text: '  ⚠ This circuit cannot be solved. Two batteries may be wired straight into each other.', cls: 'sim-err' });
      return Object.assign({}, blank, { status: 'unsolvable', lines });
    }
    const { sol, ledOn, settled } = solved;
    if (!settled) lines.push({ text: '  Some LEDs could not settle on or off, so this result is approximate.', cls: 'sim-warn' });

    const nodeVoltages = {};
    graph.forEach(g => g.nodes.forEach(n => { nodeVoltages[n] = sol.v(n); }));

    const currents = graph.map(g => {
      const { comp, nodes } = g;
      if (comp.type === 'battery') return sol.batteryCurrent.get(comp);
      if (comp.type === 'button') return comp.pressed ? null : 0;
      if (comp.type === 'led') return -forwardCurrent(g, sol, ledOn.get(comp));
      const R = propsOf(comp).resistance;
      return R > 0 ? (sol.v(nodes[0]) - sol.v(nodes[1])) / R : 0;
    });

    const shortBat = bats.find(bat => Math.abs(sol.batteryCurrent.get(bat.comp)) > SHORT_AMPS);
    if (shortBat) {
      const led = graph.find((g, i) => g.comp.type === 'led' && -currents[i] > SHORT_AMPS);
      if (led) {
        const advice = resistorAdvice(led, openVoltage(graph, bats, ledOn, led));
        lines.push({ text: '  Short circuit. The LED sits straight across the battery with no current-limiting resistor.', cls: 'sim-err' });
        lines.push({ text: `  Put a resistor in series: at least ${advice.minR} ohm, so use a ${advice.stock} ohm.`, cls: 'sim-info' });
      } else {
        lines.push({ text: '  ⚠ Short circuit — no resistance in path!', cls: 'sim-err' });
      }
      return Object.assign({}, blank, { status: 'ok', lines, nodeVoltages, currents, shorted: true });
    }

    const ledsOn = [], buzzersOn = [];
    let backwards = 0;
    graph.forEach((g, i) => {
      const { comp } = g;
      const p = propsOf(comp);
      if (comp.type === 'led') {
        const I = -currents[i];
        if (ledOn.get(comp) && I >= p.thresholdCurrent) {
          ledsOn.push(comp);
          lines.push({ text: `  💡 LED ON  (${(I * 1000).toFixed(1)} mA)`, cls: 'sim-on' });
          const over = overCurrentLine(comp, I, resistorAdvice(g, openVoltage(graph, bats, ledOn, g)));
          if (over) lines.push(over);
        } else if (!ledOn.get(comp)) {
          const reverse = sol.v(g.nodes[1 - LED_ANODE_PIN]) - sol.v(g.nodes[LED_ANODE_PIN]);
          if (reverse >= (p.forwardVoltage || 0)) {
            backwards++;
            lines.push({ text: '  LED is backwards. Current cannot flow from cathode to anode. Flip it around.', cls: 'sim-warn' });
          }
        } else {
          lines.push({ text: '  LED: current too low.', cls: 'sim-warn' });
        }
      }
      if (comp.type === 'buzzer' && Math.abs(currents[i]) >= p.thresholdCurrent) {
        buzzersOn.push(comp);
        lines.push({ text: `  🔔 BUZZER ON  (${(Math.abs(currents[i]) * 1000).toFixed(1)} mA)`, cls: 'sim-on' });
      }
    });

    const flowing = bats.some(bat => Math.abs(sol.batteryCurrent.get(bat.comp)) > OPEN_AMPS);
    if (!flowing && !ledsOn.length && !buzzersOn.length && !backwards) {
      lines.push({ text: '  Circuit open — no complete path.', cls: 'sim-warn' });
      bats.forEach(bat => {
        const linked = graph.some(g => g.comp !== bat.comp &&
          g.nodes.some(n => n === bat.nodes[0] || n === bat.nodes[1]));
        if (!linked) lines.push({ text: '  ⚠ Battery terminals not connected to anything.', cls: 'sim-warn' });
      });
    } else if (flowing && !ledsOn.length && !buzzersOn.length && !backwards) {
      lines.push({ text: '  No output components in circuit path.', cls: 'sim-info' });
    }

    return { status: 'ok', lines, ledsOn, buzzersOn, nodeVoltages, currents, shorted: false };
  }
```
Update the file header's NODE MODEL and EXPORTS comments to describe nodal
analysis and the new exports. Change the export line to
`return { PROPS, UnionFind, bbNodeId, buildGraph, analyze, install };`.

- [ ] **Step 4: Run**

Run: `npm test`
Expected: all simulate tests pass, 0 skipped.

- [ ] **Step 5: Commit** — `git commit -am "Replace path search with nodal analysis (fixes #8, #9, #11)"`

---

### Task 3: One component-naming scheme, and chat moved into its own module

**Files:**
- Create: `circuit3d/js/ids.js`, `circuit3d/js/chat.js`
- Modify:
  - `circuit3d/index.html`: delete the inline `<script>` (lines 307–740);
    load `ids.js` before `app.js` and `chat.js` after it.
  - `circuit3d/js/app.js`: `saveCircuit`, `exportMarkdown` and
    `exportState` use `App.componentId`.
- Test: `test/ids.test.js`, `test/chat.test.js`

**Interfaces:**
- Produces (`ids.js`, browser `App.*`, Node `module.exports`):
  - `componentId(components, comp)` → `"led_1"`, using the per-type index
  - `parsePinRef(str)` → `{ type, n, pin }`, or `null`
  - `findComponent(components, type, n)` → the component, or `null`
- Produces (`chat.js`, Node `module.exports`):
  - `resolveEndpoint(str, board)` → `{ hole: {col,row} }`, or
    `{ comp, pin }`, or `null`
  - `applyActions(actions, board)` → `{ applied, failed }`
  - `board` is
    `{ components(), parseHole(str), getHole(col,row), placeResistor(hA,hB), placeLED, placeBuzzer, placeButton, placeBattery(x,z), clearAll(), addWire(a,b,colorHex) → boolean }`

- [ ] **Step 1: Failing tests**

`test/ids.test.js`:
```js
const assert = require('node:assert');
const Ids = require('../circuit3d/js/ids.js');

const parts = [{ type: 'resistor' }, { type: 'led' }, { type: 'battery' }, { type: 'led' }];

test('componentId counts within the part type', () => {
  assert.equal(Ids.componentId(parts, parts[2]), 'battery_0');
  assert.equal(Ids.componentId(parts, parts[3]), 'led_1');
});

test('parsePinRef and findComponent round-trip a pin reference', () => {
  assert.deepEqual(Ids.parsePinRef('battery_0_pin1'), { type: 'battery', n: 0, pin: 1 });
  assert.equal(Ids.parsePinRef('a12'), null);
  assert.equal(Ids.findComponent(parts, 'battery', 0), parts[2]);
  assert.equal(Ids.findComponent(parts, 'battery', 1), null);
});
```

`test/chat.test.js`:
```js
const assert = require('node:assert');
const Chat = require('../circuit3d/js/chat.js');

function fakeBoard(parts) {
  const wires = [];
  return {
    wires,
    components: () => parts,
    parseHole: s => { const m = /^([a-j])(\d+)$/.exec(s); if (!m) throw new Error('bad'); return { row: m[1], col: +m[2] - 1 }; },
    getHole: (col, row) => ({ col, row }),
    placeResistor: () => {}, placeLED: () => {}, placeBuzzer: () => {}, placeButton: () => {},
    placeBattery: () => {}, clearAll: () => {},
    addWire: (a, b) => { wires.push([a, b]); return true; },
  };
}

test('battery_0 resolves to the first battery even when it is not component 0', () => {
  const bat = { type: 'battery' };
  const board = fakeBoard([{ type: 'resistor' }, { type: 'led' }, bat]);
  assert.deepEqual(Chat.resolveEndpoint('battery_0_pin0', board), { comp: bat, pin: 0 });
});

test('unknown battery ref fails without throwing', () => {
  const board = fakeBoard([{ type: 'resistor' }]);
  const out = Chat.applyActions([{ tool: 'add_wire', from: 'battery_3_pin0', to: 'a5', color: 'red' }], board);
  assert.deepEqual(out, { applied: 0, failed: 1 });
  assert.equal(board.wires.length, 0);
});
```

- [ ] **Step 2: Run** — `npm test`. Expected: FAIL, "Cannot find module".
Then create both files as stubs that export empty functions, and run again.
Expected: assertion failures.

- [ ] **Step 3: Implement `ids.js`**
```js
// ─────────────────────────────────────────────────────────────
//  ids.js — component names shared by the board export, saved files,
//  the AI and the code that applies AI actions.
//  "<type>_<n>" where n counts parts of that type only, so battery_0
//  is always the first battery.
// ─────────────────────────────────────────────────────────────
(function (root, factory) {
  const Ids = factory();
  if (typeof module === 'object' && module.exports) module.exports = Ids;
  if (root) Object.assign(root.App = root.App || {}, Ids);
})(typeof window !== 'undefined' ? window : null, function () {
  function componentId(components, comp) {
    return comp.type + '_' + components.filter(c => c.type === comp.type).indexOf(comp);
  }
  function parsePinRef(str) {
    const m = /^([a-z]+)_(\d+)_pin(\d+)$/i.exec(String(str));
    return m ? { type: m[1].toLowerCase(), n: +m[2], pin: +m[3] } : null;
  }
  function findComponent(components, type, n) {
    return components.filter(c => c.type === type)[n] || null;
  }
  return { componentId, parsePinRef, findComponent };
});
```

- [ ] **Step 4: Implement `chat.js`.** Move the inline chat script from
`index.html` into it.
  - The pure part is `resolveEndpoint` and `applyActions`. Everything else
    stays browser-only, inside `if (typeof window !== 'undefined')`.
  - Delete `remove_component` and `remove_wire`, both in the preview and in
    the code that applies actions.
  - Delete the local `parseHole`.

The pure part:
```js
(function (root, factory) {
  const Chat = factory();
  if (typeof module === 'object' && module.exports) module.exports = Chat;
  if (root) root.PluggedChat = Chat;
})(typeof window !== 'undefined' ? window : null, function () {
  const Ids = typeof module === 'object' && module.exports ? require('./ids.js') : window.App;

  const COLOR_MAP = { red: 0xef4444, yellow: 0xfbbf24, green: 0x22c55e,
                      blue: 0x3b82f6, black: 0x111111, white: 0xffffff };
  const BATTERY_SPOT = { x: 13, z: 0 };

  function colorHex(name) { return COLOR_MAP[String(name || '').toLowerCase()] || COLOR_MAP.red; }

  function holeOf(str, board) {
    try { const { col, row } = board.parseHole(str); return board.getHole(col, row); }
    catch { return null; }
  }

  function resolveEndpoint(str, board) {
    const ref = Ids.parsePinRef(str);
    if (ref) {
      const comp = Ids.findComponent(board.components(), ref.type, ref.n);
      return comp ? { comp, pin: ref.pin } : null;
    }
    const hole = holeOf(str, board);
    return hole ? { hole } : null;
  }

  const PLACE = { place_resistor: 'placeResistor', place_led: 'placeLED',
                  place_buzzer: 'placeBuzzer', place_button: 'placeButton' };

  function applyOne(a, board) {
    if (PLACE[a.tool]) {
      const hA = holeOf(a.holeA, board), hB = holeOf(a.holeB, board);
      if (!hA || !hB) return false;
      board[PLACE[a.tool]](hA, hB);
      return true;
    }
    if (a.tool === 'place_battery') { board.placeBattery(BATTERY_SPOT.x, BATTERY_SPOT.z); return true; }
    if (a.tool === 'delete_all')    { board.clearAll(); return true; }
    if (a.tool === 'add_wire') {
      const from = resolveEndpoint(a.from, board), to = resolveEndpoint(a.to, board);
      return !!(from && to && board.addWire(from, to, colorHex(a.color)));
    }
    return false;
  }

  function applyActions(actions, board) {
    let applied = 0, failed = 0;
    (actions || []).forEach(a => {
      let ok = false;
      try { ok = applyOne(a, board); } catch (e) { console.warn('Action failed:', a, e.message); }
      if (ok) applied++; else failed++;
    });
    return { applied, failed };
  }

  return { resolveEndpoint, applyActions, colorHex, BATTERY_SPOT };
});
```

Then the browser glue, appended in the same file under
`if (typeof window !== 'undefined') { … }`:
- All the former inline functions: `askSparky`, `sparkyAddMsg`,
  `sparkyTyping`, `sparkyPreviewActions`, `_buildWireGhost`,
  `sparkyAcceptChanges`, `sparkyDeclineChanges`, `_sparkyClearGhosts`,
  `sparkyAsk`, `sparkyQuick`, and the `DOMContentLoaded` listener. Assign
  each one onto `window` so the inline `onclick` attributes still work.
- Build `board` from `App`:
```js
  const board = {
    components: () => App.state.components,
    parseHole:  s => App.parseHole(s),
    getHole:    (c, r) => App.state.breadboard.getHole(c, r),
    placeResistor: (a, b) => App.placeResistor(a, b),
    placeLED:      (a, b) => App.placeLED(a, b),
    placeBuzzer:   (a, b) => App.placeBuzzer(a, b),
    placeButton:   (a, b) => App.placeButton(a, b),
    placeBattery:  (x, z) => App.placeBattery(x, z),
    clearAll:      () => App.clearAll(),
    addWire(from, to, hex) {
      const end = e => e.hole
        ? { world: e.hole.world.clone(), holeRef: { col: e.hole.col, row: e.hole.row }, pinMesh: null }
        : (e.comp.pinMeshes[e.pin]
            ? { world: e.comp.pinMeshes[e.pin].userData.world.clone(), holeRef: null, pinMesh: e.comp.pinMeshes[e.pin] }
            : null);
      const s = end(from), t = end(to);
      if (!s || !t) return false;
      const saved = App.state.wireColor;
      App.state.wireColor = hex;
      App.state.wireStart = s;
      App.finishWire(t);
      App.state.wireColor = saved;
      return true;
    },
  };
```
- `sparkyAcceptChanges` reports the outcome:
```js
    const { applied, failed } = Chat.applyActions(actions, board);
    sparkyAddMsg(`✓ Applied ${applied} change${applied !== 1 ? 's' : ''} to your circuit.` +
      (failed ? ` ${failed} could not be applied.` : ''), 'system');
```
- In `sparkyPreviewActions`, battery ghosts use `Chat.BATTERY_SPOT`. The
  `pendingPins` keys start at `battery_0` if the actions include
  `delete_all` before `place_battery`, and at the existing battery count
  otherwise. Pin refs resolve through `resolveEndpoint`.

- [ ] **Step 5: Switch `app.js` to `componentId`**
  - `saveCircuit`: `id: App.componentId(state.components, c)`.
  - `exportMarkdown`: `const id = App.componentId(comps, c);`. For battery
    rows and the wire table, use
    `${App.componentId(comps, w.startComp)}_pin${w.startPinIdx}` (same for
    the end), and `const id = App.componentId(comps, b)` in the
    battery cheat-sheet.
  - `exportState`: `id: App.componentId(state.components, c)`, and wire
    endpoints use `App.componentId(state.components, w.startComp) + '_pin' + w.startPinIdx`.

- [ ] **Step 6: Script tags in `index.html`**
```html
<script src="js/ids.js"></script>
<script src="js/app.js"></script>
<script src="js/chat.js"></script>
```

- [ ] **Step 7: Run** — `npm test`. Expected: PASS.

- [ ] **Step 8: Commit** — `git add -A && git commit -m "Name components per type everywhere; move chat into chat.js"`

---

### Task 4: One undo step per AI build

**Files:**
- Create: `circuit3d/js/history.js`
- Modify:
  - `circuit3d/js/app.js`: use it for `pushHistory`, `undo`, `redo` and the
    new `App.batch`.
  - `circuit3d/js/chat.js`: accepting a build runs through `App.batch`.
  - `circuit3d/index.html`: load `history.js` before `app.js`.
- Test: `test/history.test.js`

**Interfaces:**
- Produces: `createHistory({ snapshot, apply, limit })` →
  `{ push(), undo() → bool, redo() → bool, batch(fn), clear(), size() }`
  - `push` does nothing while a batch is running.
  - `batch(fn)` pushes once, then runs `fn`.

- [ ] **Step 1: Failing test**, `test/history.test.js`:
```js
const assert = require('node:assert');
const { createHistory } = require('../circuit3d/js/history.js');

function counterBoard() {
  const s = { n: 0 };
  const h = createHistory({ snapshot: () => s.n, apply: v => { s.n = v; }, limit: 60 });
  const change = () => { h.push(); s.n++; };
  return { s, h, change };
}

test('a batch of changes is undone in one step', () => {
  const { s, h, change } = counterBoard();
  h.batch(() => { change(); change(); change(); });
  assert.equal(s.n, 3);
  assert.equal(h.undo(), true);
  assert.equal(s.n, 0);
  assert.equal(h.redo(), true);
  assert.equal(s.n, 3);
});

test('history keeps at most limit entries', () => {
  const s = { n: 0 };
  const h = createHistory({ snapshot: () => s.n, apply: v => { s.n = v; }, limit: 2 });
  for (let i = 0; i < 5; i++) { h.push(); s.n++; }
  assert.equal(h.size(), 2);
});
```

- [ ] **Step 2: Run** — `npm test`. Expected: FAIL (missing module). Add a
stub, run again, and expect assertion failures.

- [ ] **Step 3: Implement `history.js`**
```js
// history.js — snapshot undo/redo. Every change snapshots the board before
// it runs; undo re-applies a snapshot. batch() groups many changes into one.
(function (root, factory) {
  const H = factory();
  if (typeof module === 'object' && module.exports) module.exports = H;
  if (root) (root.App = root.App || {}).createHistory = H.createHistory;
})(typeof window !== 'undefined' ? window : null, function () {
  function createHistory({ snapshot, apply, limit }) {
    const undoStack = [], redoStack = [];
    let batching = 0;
    function push() {
      if (batching) return;
      undoStack.push(snapshot());
      if (undoStack.length > limit) undoStack.shift();
      redoStack.length = 0;
    }
    function undo() {
      if (!undoStack.length) return false;
      redoStack.push(snapshot());
      apply(undoStack.pop());
      return true;
    }
    function redo() {
      if (!redoStack.length) return false;
      undoStack.push(snapshot());
      apply(redoStack.pop());
      return true;
    }
    function batch(fn) {
      push();
      batching++;
      try { return fn(); } finally { batching--; }
    }
    function clear() { undoStack.length = 0; redoStack.length = 0; }
    return { push, undo, redo, batch, clear, size: () => undoStack.length };
  }
  return { createHistory };
});
```

- [ ] **Step 4: Wire up `app.js`**
  - Replace `undoStack`, `redoStack` and the bodies of `pushHistory`,
    `clearHistory`, `App.undo` and `App.redo` with:
```js
  const history = App.createHistory({ snapshot, apply: applySnapshot, limit: HISTORY_LIMIT });
  function pushHistory() { if (!_historyMuted) history.push(); }
  function clearHistory() { history.clear(); }
  App.undo = function () {
    if (!history.undo()) { App.setHint('Nothing to undo', 1500); return; }
    App.setHint('Undo · Ctrl+Shift+Z to redo', 1800);
  };
  App.redo = function () {
    if (!history.redo()) { App.setHint('Nothing to redo', 1500); return; }
    App.setHint('Redo', 1800);
  };
  App.batch = function (fn) {
    try { return history.batch(fn); } finally { refreshCounts(); }
  };
```
  - `history` must be created after `snapshot` and `applySnapshot` are
    defined. Keep `_historyMuted` for `restoreBoard`.
  - In `chat.js` `sparkyAcceptChanges`:
    `const { applied, failed } = App.batch(() => Chat.applyActions(actions, board));`
  - Load `history.js` before `app.js` in `index.html`.

- [ ] **Step 5: Run** — `npm test`. Expected: PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "Undo an accepted AI build in one step"`

---

### Task 5: Rebuilding a file keeps wire references lined up

**Files:**
- Create: `circuit3d/js/board-io.js`
- Modify:
  - `circuit3d/js/app.js`: `rebuildBoard` uses it.
  - `circuit3d/index.html` and `circuit3d/viewer.html`: load it.
- Test: `test/board-io.test.js`

**Interfaces:**
- Produces: `rebuildComponents(list, place)` → an array the same length as
  `list`. Each entry is `place(c)`'s return value, or `null` if it returned
  nothing or threw.

- [ ] **Step 1: Failing test**, `test/board-io.test.js`:
```js
const assert = require('node:assert');
const { rebuildComponents } = require('../circuit3d/js/board-io.js');

test('a part that fails to rebuild leaves a null so later indexes line up', () => {
  const out = rebuildComponents(['ok', 'bad', 'ok2'], c => (c === 'bad' ? null : c.toUpperCase()));
  assert.deepEqual(out, ['OK', null, 'OK2']);
});
```

- [ ] **Step 2: Run** — expect FAIL (missing module). Add a stub, then
expect an assertion failure.

- [ ] **Step 3: Implement**
```js
// board-io.js — helpers for turning saved circuit data back into a board.
(function (root, factory) {
  const IO = factory();
  if (typeof module === 'object' && module.exports) module.exports = IO;
  if (root) Object.assign(root.App = root.App || {}, IO);
})(typeof window !== 'undefined' ? window : null, function () {
  // Saved wires point at parts by index, so a part that cannot be rebuilt
  // must still take up its slot.
  function rebuildComponents(list, place) {
    return (list || []).map(c => {
      try { return place(c) || null; } catch { return null; }
    });
  }
  return { rebuildComponents };
});
```

- [ ] **Step 4: Use it in `rebuildBoard`.** Replace the loop that builds
`rebuilt` with:
```js
    const rebuilt = App.rebuildComponents(data.components, c => {
      const before = state.components.length;
      const holes = c.holeRefs?.length === 2
        ? [bb.getHole(c.holeRefs[0].col, c.holeRefs[0].row), bb.getHole(c.holeRefs[1].col, c.holeRefs[1].row)]
        : null;
      if (c.type === 'battery' && c.position) App.placeBattery(c.position.x, c.position.z, c.values);
      else if (holes && holes[0] && holes[1]) {
        const place = { resistor: App.placeResistor, led: App.placeLED,
                        buzzer: App.placeBuzzer, button: App.placeButton }[c.type];
        if (place) place(holes[0], holes[1], c.values);
      }
      return state.components.length > before ? state.components[state.components.length - 1] : null;
    });
```
  The existing wire loop already checks `rebuilt[idx]`, so a `null` slot
  skips its wires. Add `<script src="js/board-io.js"></script>` before
  `app.js` in `index.html`.

- [ ] **Step 5: Run** — `npm test`. Expected: PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "Keep wire indexes aligned when a saved part fails to rebuild"`

---

### Task 6: Per-user saved circuits, and sign-out no longer deletes them

**Files:**
- Create: `circuit3d/js/storage.js`
- Modify:
  - `circuit3d/js/app.js`: use `projectsKey(currentUid(localStorage))`.
  - `dashboard.html`: sign-in adopts old data, sign-out stops deleting,
    starred favourites are per user.
  - `circuit3d/index.html`: load `storage.js` before `app.js`.
- Test: `test/storage.test.js`

**Interfaces:**
- Produces (`window.SparkyStorage`, Node `module.exports`):
  - `projectsKey(uid)` → `'sparky_local_projects:' + (uid || 'guest')`
  - `starredKey(uid)` → `'sparky_starred:' + (uid || 'guest')`
  - `currentUid(storage)` → the uid string, or `null`
  - `signIn(storage, uid)`: sets `sparky_current_uid`, then moves
    `guest` and the old unkeyed `sparky_local_projects` into the user's list,
    matching entries by `id`, and removes both source keys. It moves the
    unkeyed `sparky_starred` the same way.
  - `signOut(storage)`: removes `sparky_current_uid` and `sparky_username`.

- [ ] **Step 1: Failing tests**, `test/storage.test.js`:
```js
const assert = require('node:assert');
const S = require('../circuit3d/js/storage.js');

function fake(seed) {
  const m = new Map(Object.entries(seed || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
           removeItem: k => m.delete(k), m };
}

test('adopts legacy unkeyed projects on sign-in', () => {
  const s = fake({ sparky_local_projects: JSON.stringify([{ id: 'a' }]) });
  S.signIn(s, 'u1');
  assert.deepEqual(JSON.parse(s.getItem(S.projectsKey('u1'))), [{ id: 'a' }]);
  assert.equal(s.getItem('sparky_local_projects'), null);
  assert.equal(S.currentUid(s), 'u1');
});

test('sign-in merges guest projects without duplicating ids', () => {
  const s = fake({
    [S.projectsKey('u1')]:   JSON.stringify([{ id: 'a', name: 'mine' }]),
    [S.projectsKey(null)]:   JSON.stringify([{ id: 'a', name: 'guest copy' }, { id: 'b' }]),
  });
  S.signIn(s, 'u1');
  assert.deepEqual(JSON.parse(s.getItem(S.projectsKey('u1'))).map(p => p.id), ['b', 'a']);
  assert.equal(s.getItem(S.projectsKey(null)), null);
});

test('sign-out keeps the user\'s projects', () => {
  const s = fake({ [S.projectsKey('u1')]: '[{"id":"a"}]', sparky_current_uid: 'u1', sparky_username: 'x' });
  S.signOut(s);
  assert.equal(S.currentUid(s), null);
  assert.equal(s.getItem('sparky_username'), null);
  assert.equal(s.getItem(S.projectsKey('u1')), '[{"id":"a"}]');
});
```

- [ ] **Step 2: Run** — expect FAIL (missing module). Add a stub, then
expect assertion failures.

- [ ] **Step 3: Implement `storage.js`**
```js
// storage.js — which localStorage keys hold whose circuits.
// Circuits are kept per signed-in user; with nobody signed in they live
// under "guest". Signing in adopts guest and pre-per-user circuits.
(function (root, factory) {
  const S = factory();
  if (typeof module === 'object' && module.exports) module.exports = S;
  if (root) root.SparkyStorage = S;
})(typeof window !== 'undefined' ? window : null, function () {
  const UID_KEY = 'sparky_current_uid';
  const LEGACY_PROJECTS = 'sparky_local_projects';
  const LEGACY_STARRED  = 'sparky_starred';

  const projectsKey = uid => LEGACY_PROJECTS + ':' + (uid || 'guest');
  const starredKey  = uid => LEGACY_STARRED  + ':' + (uid || 'guest');
  const currentUid  = storage => storage.getItem(UID_KEY);

  function readList(storage, key) {
    try { const v = JSON.parse(storage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; }
    catch { return []; }
  }

  // Newer entries first; an id already in the target keeps the target's copy.
  function mergeInto(storage, fromKey, toKey, sameItem) {
    const from = readList(storage, fromKey);
    if (!from.length) { storage.removeItem(fromKey); return; }
    const into = readList(storage, toKey);
    const extra = from.filter(f => !into.some(t => sameItem(f, t)));
    storage.setItem(toKey, JSON.stringify(extra.concat(into)));
    storage.removeItem(fromKey);
  }

  function signIn(storage, uid) {
    storage.setItem(UID_KEY, uid);
    const byId = (a, b) => a && b && a.id === b.id;
    mergeInto(storage, LEGACY_PROJECTS, projectsKey(uid), byId);
    mergeInto(storage, projectsKey(null), projectsKey(uid), byId);
    mergeInto(storage, LEGACY_STARRED, starredKey(uid), (a, b) => a === b);
  }

  function signOut(storage) {
    storage.removeItem(UID_KEY);
    storage.removeItem('sparky_username');
  }

  return { projectsKey, starredKey, currentUid, signIn, signOut };
});
```

- [ ] **Step 4: Wire it in**
  - **`app.js`:** replace the `LS_KEY` constant with
    `const LS_KEY = SparkyStorage.projectsKey(SparkyStorage.currentUid(localStorage));`
  - **`index.html`:** add `<script src="js/storage.js"></script>` before
    `app.js`.
  - **`dashboard.html`:**
    - Add `<script src="circuit3d/js/storage.js"></script>` before the inline
      script.
    - Change `LS_KEY` and `STARRED_KEY` from `const` to `let`, starting as
      guest keys.
    - In `onAuthStateChanged`, after `_currentUser = user`, add:
      ```js
      SparkyStorage.signIn(localStorage, user.uid);
      LS_KEY = SparkyStorage.projectsKey(user.uid);
      STARRED_KEY = SparkyStorage.starredKey(user.uid);
      renderMyCircuits();
      ```
    - Replace `clearAppStorage`'s body with:
      ```js
      SparkyStorage.signOut(localStorage);
      sessionStorage.removeItem('sparky_load_circuit');
      _circuitsCache = [];
      _sparksCache   = [];
      ```
    - Update its comment to: "Sign-out forgets who is signed in; each user's
      circuits stay under their own key".
  - Move the `let LS_KEY` / `let STARRED_KEY` declarations above
    `onAuthStateChanged`, because the callback now assigns them.

- [ ] **Step 5: Run** — `npm test`. Expected: PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "Keep circuits per user; signing out no longer deletes them"`

---

### Task 7: Server — delete unused routes, proxy-aware rate limit, request size limit

**Files:**
- Modify: `backend/server.js`
- Test: `test/server.test.js`

**Interfaces:**
- Produces:
  - `module.exports = { server, clientKey, findCircuitProblems, MAX_BODY_BYTES }`
  - `listen()` only runs when `require.main === module`.
  - `clientKey(req)` → the first `x-forwarded-for` entry when
    `process.env.TRUST_PROXY === '1'`, otherwise `req.socket.remoteAddress`.

- [ ] **Step 1: Failing tests**, `test/server.test.js`:
```js
const assert = require('node:assert');
process.env.AI_PROVIDER = 'fixture';
const { server, clientKey } = require('../backend/server.js');

let base;
beforeAll(() => new Promise(r => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
afterAll(() => new Promise(r => server.close(r)));

test('clientKey trusts X-Forwarded-For only when TRUST_PROXY=1', () => {
  const req = { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, socket: { remoteAddress: '10.0.0.9' } };
  delete process.env.TRUST_PROXY;
  assert.equal(clientKey(req), '10.0.0.9');
  process.env.TRUST_PROXY = '1';
  assert.equal(clientKey(req), '1.2.3.4');
  delete process.env.TRUST_PROXY;
});

test('rejects a body over 256 KB with 413', async () => {
  const res = await fetch(base + '/api/ask', { method: 'POST', body: 'x'.repeat(300 * 1024),
                                               headers: { 'Content-Type': 'application/json' } });
  assert.equal(res.status, 413);
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);
});

test('the removed OAuth and Cloudant routes are gone', async () => {
  assert.equal((await fetch(base + '/api/auth/google')).status, 404);
  assert.equal((await fetch(base + '/api/circuits')).status, 404);
});
```

- [ ] **Step 2: Run** — expect FAIL: `server` isn't exported, and the file
listens on port 5001 when it's required.

- [ ] **Step 3: Implement**
  - Delete the OAuth and Cloudant constants, `getCloudantToken`,
    `cloudantRequest`, `ensureCloudantIndex`, `authenticateRequest`,
    `oauthPopupPage`, `sendOAuthPopup`, and the route blocks for
    `/api/auth/google`, `/api/auth/callback`, `/api/auth/me` and
    `/api/circuits`.
  - Delete their two startup warnings, and the Cloudant call in `listen`.
  - Update the header comment's endpoint list to `/api/ask` and
    `/api/health`.
  - Add:
```js
const MAX_BODY_BYTES = 256 * 1024;

// Behind a proxy (Render, etc.) every request comes from the proxy, so the
// limit would be shared by all visitors. Only trust the header when told to:
// anyone can send an X-Forwarded-For.
function clientKey(req) {
  if (process.env.TRUST_PROXY === '1') {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || 'unknown';
}
```
  - In `askRateLimited`, use `const ip = clientKey(req);`.
  - Replace the `/api/ask` body read with:
```js
    let body = '', size = 0, tooBig = false;
    req.on('data', chunk => {
      if (tooBig) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooBig = true;
        sendJSON(res, 413, { reply: 'That request is too large.', actions: [] });
        req.resume();
        return;
      }
      body += chunk;
    });
    req.on('end', async () => {
      if (tooBig) return;
      // … existing try/catch unchanged
    });
```
  - Replace the bottom `server.listen(...)` block with:
```js
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`⚡ Sparky AI  →  http://localhost:${PORT}`);
    console.log(`   AI    : ${process.env.AI_PROVIDER || 'gemini'}`);
    console.log(`   Model : ${GEMINI_MODEL}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
  });
}

module.exports = { server, clientKey, findCircuitProblems, MAX_BODY_BYTES };
```
  - Only print the `GEMINI_API_KEY` warning when `AI_PROVIDER` is unset or
    `gemini`.

- [ ] **Step 4: Run** — `npm test`. Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -am "Server: drop unused OAuth/Cloudant routes, per-visitor rate limit, 256 KB body cap"`

---

### Task 8: Small fixes and docs

**Files:** `circuit3d/js/interaction.js:460`, `circuit3d/viewer.html`, `firebase.json`, `README.md`, `features.md`

- [ ] **Step 1: Clear All confirmation**
  (`interaction.js:460`) — change the text to
  `` `Delete all ${n} item${n === 1 ? '' : 's'} on the board? You can undo this with Ctrl+Z.` ``
  and update the comment above it, which says "there is no undo".

- [ ] **Step 2: Viewer uses saved values.** In `viewer.html`, pass the
saved values to the builders, and load `board-io.js` for consistency:
  - `App.buildResistor(hA, hB, c.values?.resistance)`
  - `App.buildLED(hA, hB, c.values?.color)`

- [ ] **Step 3: `firebase.json` ignore list** — add `"test/**"`,
`"docs/**"`, `"vitest.config.mjs"` and `"*.png"`.

- [ ] **Step 4: README**
  - Delete the Google OAuth setup section, and the `GOOGLE_*` and
    `CLOUDANT_*` rows in the `.env` table.
  - Add `TRUST_PROXY`: "Set to 1 behind a proxy such as Render so the rate
    limit applies per visitor".
  - Add a Tests section: `npm install`, then `npm test`.
  - In Project structure, list `ids.js`, `chat.js`, `history.js`,
    `board-io.js`, `storage.js`, and describe `simulate.js` as "Circuit
    simulation (nodal analysis)".
  - In "How the simulation works", replace the path steps with nodal
    analysis: it solves every node voltage, LEDs switch on or off until the
    result is consistent, and parallel branches and series batteries are
    exact.
  - Delete the backend paragraph's sentence about OAuth and Cloudant.

- [ ] **Step 5: `features.md`**
  - In the Simulation section, replace the Limitations paragraph with a line
    saying the voltage at every point and the current through every part
    are calculated.
  - Change the sign-out bullet to "Sign out keeps your circuits; the next
    person to sign in sees only their own."
  - In Backend, delete the OAuth/Cloudant bullet and add "Requests over
    256 KB are rejected".
  - In Tests, change the command to `npm test`.

- [ ] **Step 6: Run** — `npm test`. Expected: PASS.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "Clear All wording, viewer values, hosting ignores, docs"`

---

### Task 9: Check it in the browser

- [ ] **Step 1:** `cd backend && AI_PROVIDER=fixture PORT=5055 node server.js` (in the background).

- [ ] **Step 2:** Open `http://localhost:5055/circuit3d/index.html`, and
check each of these:
  1. Place a battery, resistor and LED, wire them, then Run Simulation. The
     LED lights and shows about 14.9 mA.
  2. Clear the board. In the chat, send
     `Build a single LED circuit with a current limiting resistor.` (the
     recorded fixture), then press Accept. It reports "Applied 8 changes",
     and the simulation lights the LED.
  3. Press Ctrl+Z once. The whole AI build disappears.
  4. Reload the page. The auto-saved circuit comes back when opened from
     the dashboard entry in localStorage (`sparky_local_projects:guest`).
  5. Open `http://localhost:5055/landing.html` and press "Try it out". The
     demo circuit loads and simulates.
  6. The browser console shows no errors.

- [ ] **Step 3:** Stop the server. Fix anything that fails, as its own
commit, with a test where the fix is logic.
