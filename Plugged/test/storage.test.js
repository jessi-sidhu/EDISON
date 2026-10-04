// Tests for storage.js: which localStorage keys hold whose circuits.

const assert = require('node:assert');
const S = require('../circuit3d/js/storage.js');

// Stands in for window.localStorage.
function fake(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem:    k => (m.has(k) ? m.get(k) : null),
    setItem:    (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
}

// Like a browser's localStorage near its ~5 MB limit: setItem throws once
// the total stored would pass the quota.
function fakeWithQuota(quota, seed) {
  const s = fake(seed);
  const m = new Map(Object.entries(seed || {}));
  const size = () => [...m.values()].reduce((n, v) => n + v.length, 0);
  return Object.assign(s, {
    getItem:    k => (m.has(k) ? m.get(k) : null),
    removeItem: k => m.delete(k),
    setItem: (k, v) => {
      const next = size() - (m.has(k) ? m.get(k).length : 0) + String(v).length;
      if (next > quota) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, String(v));
    },
  });
}

test('sign-in moves a large legacy list even when two copies would not fit', () => {
  const big = JSON.stringify([{ id: 'a', thumbnail: 'x'.repeat(600) }]);
  const s = fakeWithQuota(1000, { sparky_local_projects: big });

  S.signIn(s, 'u1');

  assert.equal(s.getItem(S.projectsKey('u1')), big);
  assert.equal(s.getItem('sparky_local_projects'), null);
});

test('when storage is already full, sign-in does not throw and loses nothing', () => {
  const mine  = JSON.stringify([{ id: 'm', thumbnail: 'y'.repeat(500) }]);
  const guest = JSON.stringify([{ id: 'g', thumbnail: 'z'.repeat(450) }]);
  const seed  = { [S.projectsKey('u1')]: mine, [S.projectsKey(null)]: guest };
  const full  = Object.values(seed).reduce((n, v) => n + v.length, 0);
  const s = fakeWithQuota(full, seed);   // not one more byte fits

  S.signIn(s, 'u1');

  assert.equal(s.getItem(S.projectsKey(null)), guest, 'guest circuits must not be lost');
  assert.equal(s.getItem(S.projectsKey('u1')), mine);
});

test('adopts legacy unkeyed projects on sign-in', () => {
  const s = fake({ sparky_local_projects: JSON.stringify([{ id: 'a' }]) });
  S.signIn(s, 'u1');
  assert.deepEqual(JSON.parse(s.getItem(S.projectsKey('u1'))), [{ id: 'a' }]);
  assert.equal(s.getItem('sparky_local_projects'), null);
  assert.equal(S.currentUid(s), 'u1');
});

test('sign-in merges guest projects in front, keeping the user\'s copy of a shared id', () => {
  const s = fake({
    [S.projectsKey('u1')]: JSON.stringify([{ id: 'a', name: 'mine' }]),
    [S.projectsKey(null)]: JSON.stringify([{ id: 'a', name: 'guest copy' }, { id: 'b' }]),
  });
  S.signIn(s, 'u1');
  assert.deepEqual(JSON.parse(s.getItem(S.projectsKey('u1'))), [{ id: 'b' }, { id: 'a', name: 'mine' }]);
  assert.equal(s.getItem(S.projectsKey(null)), null);
});

test('starred sparks are kept per user, adopting the old unkeyed list on sign-in', () => {
  const s = fake({ sparky_starred: '["x","y"]', [S.starredKey('u1')]: '["y","z"]' });
  S.signIn(s, 'u1');
  assert.deepEqual(JSON.parse(s.getItem(S.starredKey('u1'))), ['x', 'y', 'z']);
  assert.equal(s.getItem('sparky_starred'), null);
  assert.equal(S.starredKey(null), 'sparky_starred:guest');
});

test('sign-out forgets who is signed in but keeps their projects', () => {
  const s = fake({ [S.projectsKey('u1')]: '[{"id":"a"}]', sparky_current_uid: 'u1', sparky_username: 'x' });
  S.signOut(s);
  assert.equal(S.currentUid(s), null);
  assert.equal(s.getItem('sparky_username'), null);
  assert.equal(s.getItem(S.projectsKey('u1')), '[{"id":"a"}]');
});
