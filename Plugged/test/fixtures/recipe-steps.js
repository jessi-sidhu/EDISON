// A part's ai.recipe (an Example, docs/API-CONTRACT.md → "Example") as the
// AI actions it stands for, and the recipe block the server writes into the
// system prompt, parsed back into actions (#43 follow-up). One source for
// test/seven-segment-recipe.test.js and any later part with a recipe.
//
// Example → actions:
//   1. { tool: 'delete_all' }
//   2. each part, in `parts` order (labels follow placement order):
//        off-board   { tool }                          e.g. place_battery
//        span        { tool, holeA: holes[0], holeB: holes[1] }
//        footprint   { tool, hole: holes[0], direction } where direction
//                    (right/down/left/up, Chat.ROTATION) is the one whose
//                    footprintLegs are exactly `holes`
//      plus the part's own `values`, as tool arguments (resistance: 470).
//   3. each wire [from, to] as { tool: 'add_wire', from, to }.
//
// The prompt's recipe block (the shape of the hand-written recipes already
// in the prompt):
//   a heading line that says RECIPE (any case) and names the part's tool
//   (place_seven_segment) or its name ("7-segment display"), then numbered
//   steps, one per line, 1..k:
//     1. delete_all
//     2. place_battery
//     3. add_wire: BAT1.0 -> tp_63 (red)
//     5. place_seven_segment: hole=f30, direction=right
//     6. place_resistor: holeA=b33, holeB=b37, resistance=470
//   Arguments are key=value, comma-separated; add_wire's are FROM -> TO.
//   Anything after "(" or "←" in an argument is a comment. The block ends
//   at the first line after step 1 that is not a step.

const Parts = require('../../circuit3d/js/parts');
const Chat  = require('../../circuit3d/js/chat.js');

const toolOf = def => (def.ai && def.ai.tool) || `place_${def.type}`;

function recipeActions(ex) {
  const out = [{ tool: 'delete_all' }];
  for (const p of ex.parts) {
    const def = Parts.get(p.type);
    if (!def) throw new Error(`recipe part ${p.label}: no part type "${p.type}"`);
    const a = { tool: toolOf(def) };
    if (def.place.kind === 'span') {
      a.holeA = p.holes[0];
      a.holeB = p.holes[1];
    } else if (def.place.kind === 'footprint') {
      const dir = Object.keys(Chat.ROTATION).find(d => {
        const legs = Parts.footprintLegs(def.type, p.holes[0], Chat.ROTATION[d]);
        return legs && legs.map(l => l.row + (l.col + 1)).join(' ') === p.holes.join(' ');
      });
      if (!dir) throw new Error(`recipe part ${p.label}: no direction puts its legs in ${p.holes.join(' ')}`);
      a.hole = p.holes[0];
      a.direction = dir;
    }
    Object.assign(a, p.values || {});
    out.push(a);
  }
  for (const [from, to] of ex.wires) out.push({ tool: 'add_wire', from, to });
  return out;
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const STEP = /^\s*(\d+)\.\s+([a-z_]+)\s*(?::\s*(.*))?$/;
const uncomment = s => s.split(/[(←]/)[0].trim();
const argValue = s => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s);

// The recipe block for `def` in `prompt`: { heading, steps: actions } or null.
function parseRecipeSteps(prompt, def) {
  const lines = String(prompt).split('\n');
  const names = [toolOf(def), def.name].map(n => new RegExp(escapeRe(n), 'i'));
  const at = lines.findIndex(l => /recipe/i.test(l) && names.some(re => re.test(l)));
  if (at < 0) return null;
  const steps = [];
  for (const line of lines.slice(at + 1)) {
    const m = STEP.exec(line);
    if (!m) { if (steps.length) break; continue; }
    if (Number(m[1]) !== steps.length + 1) throw new Error(`recipe step numbered ${m[1]}, expected ${steps.length + 1}: "${line}"`);
    const a = { tool: m[2] };
    const args = m[3] ? m[3].trim() : '';
    if (a.tool === 'add_wire') {
      const w = /^(\S+)\s*->\s*(\S+)/.exec(uncomment(args) || args);
      if (!w) throw new Error(`add_wire step without FROM -> TO: "${line}"`);
      a.from = w[1];
      a.to = w[2];
    } else if (args) {
      for (const part of args.split(',')) {
        const kv = /^([A-Za-z_]+)\s*=\s*(\S+)$/.exec(uncomment(part));
        if (!kv) throw new Error(`step argument is not key=value: "${part.trim()}" in "${line}"`);
        a[kv[1]] = argValue(kv[2]);
      }
    }
    steps.push(a);
  }
  return { heading: lines[at], steps };
}

module.exports = { recipeActions, parseRecipeSteps };
