// ─────────────────────────────────────────────────────────────
//  photo-prompt.js — what /api/photo asks the AI (#139)
//
//  One box prompt for both readers: every part and wire with its type,
//  a value guess, conf and a box_2d [ymin, xmin, ymax, xmax] on 0–1000
//  around the whole item, legs included, plus each power rail's printed
//  sign by side. No leg points: the reader starts each leg at an end of
//  its box and the page snaps it. The compact example at the end is the
//  one json_object mode (DeepSeek) needs.
//
//  Guarded by the golden test/fixtures/prompts/photo.txt.
// ─────────────────────────────────────────────────────────────

const ITEM_TYPES = ['resistor', 'led', 'capacitor', 'ic', 'button', 'battery', 'diode', 'transistor', 'potentiometer', 'other', 'wire'];

const PHOTO_PROMPT = [
  'Perspective-corrected top-down photo of a real breadboard. Detect every component and every jumper wire. ' +
    'For each give its type, a value guess, conf (0 to 1), and box_2d [ymin, xmin, ymax, xmax] normalized to 0-1000 ' +
    'that encloses the whole item INCLUDING all its metal leads down to where they enter the board ' +
    '(leads may span many columns). Ignore hands, probes and tools.',
  'Also read the power rails: the long strips along the board\'s two long edges, each marked with a printed + or - ' +
    '(often a red or blue line). Name them by side using the board\'s printed row letters: aOuter is the strip ' +
    'farthest from row a, aInner the strip between it and row a, jInner the strip next to row j, jOuter the strip ' +
    'farthest from row j. Give each one\'s printed sign: "+", "-", or "?" if you can\'t read it.',
  'If there is no breadboard in the photo, answer {"visible":false,"items":[]}.',
  `Short JSON only: {"items":[{"type":"${ITEM_TYPES.join('|')}","value":"220 or null","conf":0.8,` +
    '"box_2d":[ymin,xmin,ymax,xmax]}],"rails":{"aOuter":"+","aInner":"-","jInner":"+","jOuter":"-"}}',
].join('\n');

const SIGN = { type: 'STRING', enum: ['+', '-', '?'] };

// Gemini's responseSchema (upper-case type names).
const PHOTO_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type:   { type: 'STRING', enum: ITEM_TYPES },
          value:  { type: 'STRING', nullable: true },
          conf:   { type: 'NUMBER' },
          box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } },
        },
        required: ['type', 'value', 'conf', 'box_2d'],
      },
    },
    rails: {
      type: 'OBJECT',
      properties: { aOuter: SIGN, aInner: SIGN, jInner: SIGN, jOuter: SIGN },
      required: ['aOuter', 'aInner', 'jInner', 'jOuter'],
    },
    visible: { type: 'BOOLEAN' },
  },
  required: ['items', 'rails'],
};

module.exports = { PHOTO_PROMPT, PHOTO_SCHEMA };
