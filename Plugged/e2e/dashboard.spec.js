// The dashboard's first click works (issue #63): the circuit grid is built
// once, for the signed-in user, so the cards on screen when the "Checking
// sign-in…" gate lifts are the ones a click lands on. And a circuit opened
// from the dashboard survives a reload of the editor.
//
// Real Google sign-in can't be automated, so Firebase is replaced by a small
// fake compat SDK: auth reports a signed-in user after a delay (or when the
// test says so), and Firestore holds no sparks. No real AI or Firebase call.
const { test, expect } = require('@playwright/test');
const { TWO_LEDS, ONE_RESISTOR } = require('./fixtures/circuits');

const UID = 'test-uid';
const USER_KEY = `sparky_local_projects:${UID}`;   // SparkyStorage.projectsKey(UID)

// Stands in for firebase-app-compat.js; the auth and firestore scripts are
// served empty. window.__holdAuth (set before load) keeps the auth callback
// waiting until the test calls window.__fireAuth().
const FAKE_FIREBASE = `(function () {
  const user = { uid: '${UID}', email: 'tester@example.com', displayName: 'Tester' };
  const callbacks = [];
  window.__authFired = false;
  window.__fireAuth = function () {
    if (window.__authFired) return;
    window.__authFired = true;
    callbacks.forEach(cb => cb(user));
  };
  const auth = {
    currentUser: null,
    onAuthStateChanged(cb) {
      callbacks.push(cb);
      if (!window.__holdAuth) setTimeout(window.__fireAuth, 500);
      return function () {};
    },
    signOut: () => Promise.resolve(),
  };
  const none  = { docs: [], empty: true, size: 0, forEach() {} };
  const query = { orderBy: () => query, where: () => query, limit: () => query, get: () => Promise.resolve(none) };
  const doc   = { set: () => Promise.resolve(), delete: () => Promise.resolve(), get: () => Promise.resolve({ exists: false, data: () => undefined }) };
  window.firebase = {
    initializeApp: () => ({}),
    auth: () => auth,
    firestore: () => ({ collection: () => Object.assign({ doc: () => doc }, query) }),
  };
})();`;

// Fake Firebase, no web fonts, a stubbed /api/ask, and this user's two saved
// circuits, seeded once per tab so a reload doesn't reset them.
async function setUp(page, { holdAuth = false } = {}) {
  await page.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: route.request().url().endsWith('/firebase-app-compat.js') ? FAKE_FIREBASE : '',
  }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: 'ok', actions: [] } }));
  await page.addInitScript(({ key, list, hold }) => {
    if (hold && location.pathname.endsWith('/dashboard.html')) window.__holdAuth = true;
    if (sessionStorage.getItem('__e2e_seeded')) return;
    sessionStorage.setItem('__e2e_seeded', '1');
    localStorage.setItem(key, JSON.stringify(list));
  }, { key: USER_KEY, list: [TWO_LEDS, ONE_RESISTOR], hold: holdAuth });
}

// Open the dashboard and wait for the gate to lift.
async function openDashboard(page) {
  await page.goto('/dashboard.html');
  await expect(page.locator('#auth-gate')).toBeHidden();
}

// One real mouse click on the middle of an element, where it is right now.
async function clickOnce(page, locator) {
  const box = await locator.boundingBox();
  expect(box, 'element to click is on screen').not.toBeNull();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const editorReady = page => page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
const boardCounts = page => page.evaluate(() => [App.state.components.length, App.state.wires.length]);
const savedList   = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || '[]'), USER_KEY);

test('while sign-in is still being checked, the grid holds no guest circuits or guest empty state', async ({ page }) => {
  await setUp(page, { holdAuth: true });
  await page.goto('/dashboard.html');
  await expect(page.locator('#auth-gate')).toBeVisible();

  // Built now, these would be the guest's (empty) list, thrown away the
  // moment auth reports the real user.
  await expect(page.locator('#circuits-grid > *')).toHaveCount(0);
  await expect(page.locator('#circuits-empty')).toHaveCount(0);
});

test('no grid element that existed before sign-in resolved is thrown away when the gate lifts', async ({ page }) => {
  await setUp(page, { holdAuth: true });
  await page.goto('/dashboard.html');
  await expect(page.locator('#auth-gate')).toBeVisible();

  // Anything automation (or a quick user) could have grabbed before the gate
  // lifted must still be the element on screen after it.
  const before = await page.evaluate(() => {
    window.__early = [...document.querySelectorAll('#circuits-grid > *, #circuits-empty')];
    return window.__early.length;
  });
  await page.evaluate(() => window.__fireAuth());
  await expect(page.locator('#auth-gate')).toBeHidden();

  const detached = await page.evaluate(() => window.__early
    .filter(el => !el.isConnected)
    .map(el => el.id || el.className));
  expect(detached, `${before} element(s) existed before sign-in resolved`).toEqual([]);
});

test('the cards shown when the gate lifts stay the same elements (pins current behaviour)', async ({ page }) => {
  await setUp(page);
  await openDashboard(page);
  await expect(page.locator('.circuit-card')).toHaveCount(2);
  await page.evaluate(() => {
    window.__cards = [...document.querySelectorAll('#circuits-grid > *')];
  });
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__cards.every(el => el.isConnected))).toBe(true);
  // And the signed-in user with circuits never sees the empty state.
  await expect(page.locator('#circuits-empty')).not.toBeVisible();
});

test('one click on a circuit card right after the gate lifts opens that circuit in the editor', async ({ page }) => {
  test.setTimeout(90_000);
  await setUp(page);
  await openDashboard(page);

  await clickOnce(page, page.locator('.circuit-card', { hasText: 'Two LEDs' }));
  await page.waitForURL('**/circuit3d/index.html');
  await editorReady(page);
  await expect(page.locator('#circuit-name-field')).toHaveText('Two LEDs');
  expect(await boardCounts(page)).toEqual([4, 4]);
});

test('one click on the "+ New Circuit" card right after the gate lifts opens a new circuit', async ({ page }) => {
  test.setTimeout(90_000);
  await setUp(page);
  await openDashboard(page);

  await clickOnce(page, page.locator('#circuits-grid .new-card'));
  await page.waitForURL('**/circuit3d/index.html');
  await editorReady(page);
  expect(await boardCounts(page)).toEqual([0, 0]);
});

test('one click on "+ New Circuit" right after the gate lifts opens a new, empty circuit, not the one last open in this tab', async ({ page }) => {
  test.setTimeout(90_000);
  await setUp(page);
  await openDashboard(page);
  // This tab last had Two LEDs open in the editor.
  await page.evaluate(id => sessionStorage.setItem('sparky_open_circuit', id), TWO_LEDS.id);

  await clickOnce(page, page.locator('#topbar-actions').getByRole('button', { name: '+ New Circuit' }));
  await page.waitForURL('**/circuit3d/index.html');
  await editorReady(page);
  expect(await boardCounts(page)).toEqual([0, 0]);
  await expect(page.locator('#circuit-name-field')).not.toHaveText('Two LEDs');
});

test('one click on Sparks right after the gate lifts switches to the Sparks tab', async ({ page }) => {
  await setUp(page);
  await openDashboard(page);

  await clickOnce(page, page.locator('#nav-sparks'));
  await expect(page.locator('#tab-sparks')).toHaveClass(/\bactive\b/);
  await expect(page.locator('#nav-sparks')).toHaveClass(/\bactive\b/);
  await expect(page.locator('#topbar-title')).toHaveText('Sparks');
});

test('a circuit opened from the dashboard is still open after reloading the editor, with no new Untitled saved', async ({ page }) => {
  test.setTimeout(90_000);
  await setUp(page);
  await openDashboard(page);

  await clickOnce(page, page.locator('.circuit-card', { hasText: 'Two LEDs' }));
  await page.waitForURL('**/circuit3d/index.html');
  await editorReady(page);
  expect(await boardCounts(page)).toEqual([4, 4]);

  await page.reload();
  await editorReady(page);
  await expect(page.locator('#circuit-name-field')).toHaveText('Two LEDs');
  expect(await boardCounts(page)).toEqual([4, 4]);
  expect(await page.evaluate(() => App.state.circuitId)).toBe(TWO_LEDS.id);

  await page.waitForTimeout(1200);   // auto-save runs 800 ms after the last change
  expect((await savedList(page)).map(p => p.name).sort()).toEqual(['Just a resistor', 'Two LEDs']);
});

test('signing out forgets which circuit this tab had open', async ({ page }) => {
  await setUp(page);
  await page.route('**/landing.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>landing</title>' }));
  await openDashboard(page);
  await page.evaluate(id => sessionStorage.setItem('sparky_open_circuit', id), TWO_LEDS.id);

  await clickOnce(page, page.getByRole('button', { name: 'Log Out' }));
  await page.waitForURL('**/landing.html');
  expect(await page.evaluate(() => sessionStorage.getItem('sparky_open_circuit'))).toBeNull();
});
