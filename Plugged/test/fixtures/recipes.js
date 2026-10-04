// The example builds the system prompt's recipes copy, at column C = 2
// (issue #10). One source for test/server.test.js and test/simulate.test.js.
//
// Every hole, body and rail, holds at most one lead or wire end. LED actions
// are holeA = cathode (-), holeB = anode (+). BAT1.0 is +, BAT1.1 is -.
//
// The battery sits off the high-column end of the board, so its wires go to
// the rails at the highest column, tp_N and tn_N (issue #12).

// The board's highest column, read from GEOMETRY.COLS in breadboard.js (the
// one source of truth for board size; that file only loads in a browser).
const HIGHEST_COL = (() => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'circuit3d', 'js', 'breadboard.js'), 'utf8');
  const m = /\bCOLS:\s*(\d+)/.exec(src);
  if (!m) throw new Error('recipes.js: no COLS in breadboard.js GEOMETRY');
  return +m[1];
})();

// One LED: resistor on row a, LED on row b, the wires in their own holes.
//   col 2: a2 resistor, b2 wire from tp_3
//   col 6: a6 resistor, b6 LED anode
//   col 8: b8 LED cathode, c8 wire to tn_8
const ONE_LED = [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  { tool: 'add_wire', from: 'BAT1.0', to: `tp_${HIGHEST_COL}`, color: 'red' },
  { tool: 'add_wire', from: 'BAT1.1', to: `tn_${HIGHEST_COL}`, color: 'black' },
  { tool: 'place_resistor', holeA: 'a2', holeB: 'a6' },
  { tool: 'place_led', holeA: 'b8', holeB: 'b6' },
  { tool: 'add_wire', from: 'tp_3', to: 'b2', color: 'red' },
  { tool: 'add_wire', from: 'c8', to: 'tn_8', color: 'black' },
];

// Two LEDs in parallel: both across columns 6 and 8, one shared resistor.
//   col 6: a6 resistor, b6 LED1 anode, d6 LED2 anode
//   col 8: b8 LED1 cathode, c8 ground wire, d8 LED2 cathode
const PARALLEL_2 = [
  ...ONE_LED,
  { tool: 'place_led', holeA: 'd8', holeB: 'd6' },
];

// Two LEDs in series: resistor -> LED1 -> LED2 -> ground.
//   col 6: a6 resistor, b6 LED1 anode
//   col 8: b8 LED1 cathode, c8 LED2 anode
//   col 10: c10 LED2 cathode, d10 wire to tn_10
const SERIES_2 = [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  { tool: 'add_wire', from: 'BAT1.0', to: `tp_${HIGHEST_COL}`, color: 'red' },
  { tool: 'add_wire', from: 'BAT1.1', to: `tn_${HIGHEST_COL}`, color: 'black' },
  { tool: 'place_resistor', holeA: 'a2', holeB: 'a6' },
  { tool: 'place_led', holeA: 'b8', holeB: 'b6' },
  { tool: 'place_led', holeA: 'c10', holeB: 'c8' },
  { tool: 'add_wire', from: 'tp_3', to: 'b2', color: 'red' },
  { tool: 'add_wire', from: 'd10', to: 'tn_10', color: 'black' },
];

// ── Actions -> the simulator's input ──────────────────────────
// What Chat.acceptBuild does to the board, reduced to what analyze() reads:
// type, pins (for arity) and holeRefs for parts; startHole/endHole or
// startComp/startPinIdx for wires. Columns are 0-based, as App.parseHole
// gives them.

const HOLE = /^(tp|tn|bp|bn)_(\d+)$|^([a-j])(\d+)$/i;
const PART = { place_resistor: 'resistor', place_led: 'led', place_buzzer: 'buzzer', place_button: 'button' };

function holeRef(s) {
  const m = HOLE.exec(String(s));
  if (!m) throw new Error('not a hole: ' + s);
  return { col: +(m[2] || m[4]) - 1, row: (m[1] || m[3]).toLowerCase() };
}

function toCircuit(actions) {
  let components = [], wires = [], batteries = [];
  const pins = () => [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];

  function end(s) {
    const bat = /^BAT(\d+)\.(\d+)$/i.exec(String(s));
    if (bat) {
      const comp = batteries[+bat[1] - 1];
      if (!comp) throw new Error('no battery for ' + s);
      return { comp, pin: +bat[2] };
    }
    return { hole: holeRef(s) };
  }

  for (const a of actions) {
    if (a.tool === 'delete_all') { components = []; wires = []; batteries = []; }
    else if (a.tool === 'place_battery') {
      const b = { type: 'battery', pins: pins(), holeRefs: null };
      batteries.push(b);
      components.push(b);
    } else if (PART[a.tool]) {
      components.push({ type: PART[a.tool], pins: pins(), holeRefs: [holeRef(a.holeA), holeRef(a.holeB)] });
    } else if (a.tool === 'add_wire') {
      const s = end(a.from), t = end(a.to);
      wires.push({
        startHole: s.hole || null, startComp: s.comp || null, startPinIdx: s.pin,
        endHole:   t.hole || null, endComp:   t.comp || null, endPinIdx:   t.pin,
      });
    } else throw new Error('unknown action ' + a.tool);
  }
  return { components, wires };
}

// Every hole an action puts a lead or wire end in, lower-cased. Battery pins
// are not holes.
function holesUsed(actions) {
  const out = [];
  for (const a of actions) {
    if (PART[a.tool]) out.push(a.holeA, a.holeB);
    if (a.tool === 'add_wire') out.push(a.from, a.to);
  }
  return out.map(s => String(s).toLowerCase()).filter(s => HOLE.test(s));
}

module.exports = { HIGHEST_COL, ONE_LED, PARALLEL_2, SERIES_2, toCircuit, holesUsed };
