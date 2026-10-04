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
//
//  The crop prompt (#159): one per part or wire, on an enlarged crop the
//  page labelled with the board's column numbers and row letters, asking
//  where each lead (or wire tip) enters the board as [y, x] on 0–1000 over
//  the crop. Guarded by the golden test/fixtures/prompts/photo-crop.txt.
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

// What a crop shows: 'resistor (470)', 'led' (no value), 'jumper wire'.
function cropShows(item) {
  const it = item && typeof item === 'object' ? item : {};
  if (it.kind === 'wire') return 'jumper wire';
  const type  = typeof it.type === 'string' && it.type.trim() ? it.type.trim() : 'part';
  const value = typeof it.value === 'number' ? (Number.isFinite(it.value) && it.value ? String(it.value) : '')
    : typeof it.value === 'string' ? it.value.trim() : '';
  return value ? `${type} (${value})` : type;
}

// item: { kind: 'part' | 'wire', type, value }, as the Reading has them.
const PHOTO_CROP_PROMPT = item => [
  'Enlarged crop of a top-down breadboard photo. Hole column numbers are written above and below the photo and ' +
    'row letters a-j (rail rows +/-) at its left and right edges, each aligned with its line of holes. ' +
    `It shows a ${cropShows(item)}. ` +
    'Find where each metal lead (or wire tip) disappears into the plastic of the board - not where the part body is. ' +
    'Leads are often bent and may span any number of columns; parts often lean. Ignore hands, multimeter probes and tools. ' +
    (item && item.kind === 'wire' ? 'Point to each end of the wire ("off" if an end leaves the crop/board). ' : 'Point to each lead. ') +
    'Points are [y, x] normalized to 0-1000 over this whole image. ' +
    'LED pins "anode"/"cathode" if you can tell, else "?"; others "1","2",...',
  'Short JSON only: {"found":true,"type":"...","leads":[["1",[y,x]],["2",[y,x]]],"conf":0.8}',
].join('\n');

// The crop answer's schema. Each lead is the prompt's [pin, [y, x]] pair, or
// [pin, "off"]: a list whose entries are a string or a list of numbers.
const PHOTO_CROP_SCHEMA = {
  type: 'OBJECT',
  properties: {
    found: { type: 'BOOLEAN' },
    type:  { type: 'STRING' },
    leads: { type: 'ARRAY', items: { type: 'ARRAY', items: { anyOf: [{ type: 'STRING' }, { type: 'ARRAY', items: { type: 'NUMBER' } }] } } },
    conf:  { type: 'NUMBER' },
  },
  required: ['found', 'type', 'leads', 'conf'],
};

module.exports = { PHOTO_PROMPT, PHOTO_SCHEMA, PHOTO_CROP_PROMPT, PHOTO_CROP_SCHEMA };
