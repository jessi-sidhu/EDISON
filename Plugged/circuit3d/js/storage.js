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
  //
  // The source is removed before the merged list is written, so a big list
  // is never stored twice: two copies of a heavy user's circuits (with their
  // thumbnails) can pass the ~5 MB quota. If the write still does not fit,
  // the source is put back and nothing is lost.
  function mergeInto(storage, fromKey, toKey, sameItem) {
    const raw   = storage.getItem(fromKey);
    if (raw === null) return;
    const into  = readList(storage, toKey);
    const extra = readList(storage, fromKey).filter(p => !into.some(q => sameItem(p, q)));
    storage.removeItem(fromKey);
    if (!extra.length) return;
    try {
      storage.setItem(toKey, JSON.stringify(extra.concat(into)));
    } catch (e) {
      storage.setItem(fromKey, raw);
      console.warn('Could not move saved circuits to your account (storage full):', e.name);
    }
  }

  const sameProject = (a, b) => !!(a && b && a.id === b.id);
  const sameId      = (a, b) => a === b;

  function signIn(storage, uid) {
    // Never throws: this runs inside the dashboard's auth callback, and an
    // exception there would leave the sign-in gate covering the page.
    try {
      storage.setItem(UID_KEY, uid);
    } catch (e) {
      // Storage is full. The editor stays on the guest list, so leave every
      // list where it is rather than move circuits somewhere it won't look.
      console.warn('Could not record who is signed in (storage full):', e.name);
      return;
    }
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
