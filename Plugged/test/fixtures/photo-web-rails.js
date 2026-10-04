// The web photo set's spike rail names → the app's (#137, #175). Shared by
// test/photo-import-truth.test.js and test/photo-eval.test.js, which checks
// scripts/photo-eval.js's own conversion against this one.
//
// photos.json `rails` gives each sign's offset in pitches in the j-on-top
// frame (row j at 0, row a at 11); a strip under 3.4 pitches from its side's
// body row is the inner one (the PhotoGrid snap rule). A side with no rails
// listed gets BB830's strips and signs.

const DEFAULT_STRIP = { 'a:+': 'aOuter', 'a:-': 'aInner', 'j:+': 'jInner', 'j:-': 'jOuter' };
const DEFAULT_SIGNS = { aOuter: '+', aInner: '-', jInner: '+', jOuter: '-' };

// photos.json rails → { 'a:+': strip, … } and the printed sign of each strip.
function railsOf(photo) {
  const strips = Object.assign({}, DEFAULT_STRIP), signs = {};
  for (const side of ['a', 'j']) {
    const listed = ['+', '-'].filter(s => photo.rails[`${side}:${s}`] != null);
    for (const s of listed) {
      const v = photo.rails[`${side}:${s}`];
      const dist = side === 'a' ? v - 11 : -v;
      strips[`${side}:${s}`] = side + (dist < 3.4 ? 'Inner' : 'Outer');
    }
    for (const where of ['Outer', 'Inner']) {
      const s = listed.find(x => strips[`${side}:${x}`] === side + where);
      signs[side + where] = s || DEFAULT_SIGNS[side + where];
    }
  }
  return { strips, signs };
}

// A truth hole → a Reading v1 hole: 'rail:<a|j>:<+|->:N' → 'rail:<strip>:N';
// null or blank → '?'; anything else as is.
function holeOf(h, strips) {
  if (h == null || !String(h).trim()) return '?';
  const s = String(h).trim();
  const m = /^rail:([aj]):([+-]):(\d+)$/.exec(s);
  return m ? `rail:${strips[m[1] + ':' + m[2]]}:${m[3]}` : s;
}

module.exports = { railsOf, holeOf };
