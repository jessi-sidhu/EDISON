// ─────────────────────────────────────────────────────────────
//  storage.js — which localStorage keys hold whose circuits
//
//  Circuits are kept per signed-in user; with nobody signed in they live
//  under "guest". Signing in adopts guest circuits and those saved before
//  circuits were kept per user.
//
//  EXPORTS
//  ───────
//  Browser: window.SparkyStorage (the dashboard and the editor both load it)
//  Node:    module.exports, so a test runner can call it.
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const S = factory();
  if (typeof module === 'object' && module.exports) module.exports = S;
  if (root) root.SparkyStorage = S;
})(typeof window !== 'undefined' ? window : null, function () {

  const UID_KEY         = 'sparky_current_uid';
  const LEGACY_PROJECTS = 'sparky_local_projects';
  const LEGACY_STARRED  = 'sparky_starred';

  function projectsKey(uid) { return LEGACY_PROJECTS + ':' + (uid || 'guest'); }
  function currentUid(storage) { return storage.getItem(UID_KEY); }

  function readList(storage, key) {
    try {
      const v = JSON.parse(storage.getItem(key) || '[]');
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  }

  // Move the list under fromKey onto the front of toKey's list. An item
  // already there (by sameItem) keeps the copy that was there.
  function mergeInto(storage, fromKey, toKey, sameItem) {
    const into  = readList(storage, toKey);
    const extra = readList(storage, fromKey).filter(p => !into.some(q => sameItem(p, q)));
    if (extra.length) storage.setItem(toKey, JSON.stringify(extra.concat(into)));
    storage.removeItem(fromKey);
  }

  const sameProject = (a, b) => !!(a && b && a.id === b.id);
  const sameId      = (a, b) => a === b;

  function signIn(storage, uid) {
    storage.setItem(UID_KEY, uid);
    mergeInto(storage, LEGACY_PROJECTS, projectsKey(uid), sameProject);
    mergeInto(storage, projectsKey(null), projectsKey(uid), sameProject);
    mergeInto(storage, LEGACY_STARRED, starredKey(uid), sameId);
  }

  // Forget who is signed in. Their projects stay under their own key, so the
  // next person to sign in on this browser sees only their own.
  function signOut(storage) {
    storage.removeItem(UID_KEY);
    storage.removeItem('sparky_username');
  }

  function starredKey(uid) { return LEGACY_STARRED + ':' + (uid || 'guest'); }

  return { projectsKey, starredKey, currentUid, signIn, signOut };
});
