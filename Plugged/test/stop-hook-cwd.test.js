// Tests for the Stop hook's choice of tree (issue #88): stop-tests.mjs must
// test the tree the session is working in (the `cwd` from its stdin JSON,
// resolved to its git top level), not always $CLAUDE_PROJECT_DIR. It falls
// back to $CLAUDE_PROJECT_DIR when cwd is missing or not inside a git repo.
// Each case builds two throwaway fixtures, one whose `npm test` passes and
// one whose `npm test` fails, and judges the hook by its exit code
// (2 blocks, 0 allows).

const assert = require('node:assert');
const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const stopTests = path.resolve(__dirname, '../../.claude/hooks/stop-tests.mjs');

const PASS = 'node -e "process.exit(0)"';
const FAIL = 'node -e "process.exit(1)"';

// Environment without the npm_* variables vitest inherits from `npm test`,
// so a nested npm run in a fixture isn't steered by the outer one.
function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('npm_')) env[k] = v;
  }
  return { ...env, ...extra };
}

function runHook(stdin, env) {
  const run = spawnSync(process.execPath, [stopTests], {
    input: JSON.stringify(stdin),
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (run.error) throw run.error;
  return run.status;
}

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, stdio: 'pipe' });

// A throwaway project dir: a git repo whose Plugged/ has node_modules/, a
// committed package.json with the given test script, and an untracked x.js
// so the hook's "anything changed?" check passes. Never the real repo:
// there the hook would run the real `npm test` and recurse.
function fixture(testScript) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-cwd-'));
  const app = path.join(dir, 'Plugged');
  fs.mkdirSync(path.join(app, 'node_modules'), { recursive: true });
  fs.writeFileSync(
    path.join(app, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '1.0.0', private: true, scripts: { test: testScript } }),
  );
  git(dir, 'init', '-q');
  git(dir, 'add', 'Plugged/package.json');
  git(dir, 'commit', '-q', '-m', 'init');
  fs.writeFileSync(path.join(app, 'x.js'), 'module.exports = 1;\n');
  return dir;
}

describe('stop-tests.mjs tests the session\'s own tree (cwd)', () => {
  const dirs = [];
  let passing;
  let failing;

  beforeAll(() => {
    passing = fixture(PASS);
    failing = fixture(FAIL);
    dirs.push(passing, failing);
  });
  afterAll(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  test('cwd in a passing tree wins over a failing CLAUDE_PROJECT_DIR: exits 0', () => {
    const status = runHook({ cwd: passing }, cleanEnv({ CLAUDE_PROJECT_DIR: failing }));
    assert.equal(status, 0, 'the hook must test the cwd tree (passing), not CLAUDE_PROJECT_DIR (failing)');
  }, 60_000);

  // The reverse of the case above: proves cwd wins in both directions, not
  // that the hook just defaults to 0 or 2.
  test('cwd in a failing tree wins over a passing CLAUDE_PROJECT_DIR: exits 2', () => {
    const status = runHook({ cwd: failing }, cleanEnv({ CLAUDE_PROJECT_DIR: passing }));
    assert.equal(status, 2, 'the hook must test the cwd tree (failing), not CLAUDE_PROJECT_DIR (passing)');
  }, 60_000);

  test('cwd in a subfolder resolves to the git top level: exits 0', () => {
    const status = runHook({ cwd: path.join(passing, 'Plugged') }, cleanEnv({ CLAUDE_PROJECT_DIR: failing }));
    assert.equal(status, 0, 'cwd <passing>/Plugged must resolve to <passing> and test <passing>/Plugged');
  }, 60_000);

  // Pin: the fallback must survive the fix.
  test('no cwd in stdin falls back to CLAUDE_PROJECT_DIR: exits 2', () => {
    const status = runHook({}, cleanEnv({ CLAUDE_PROJECT_DIR: failing }));
    assert.equal(status, 2, 'with no cwd the hook must test CLAUDE_PROJECT_DIR (failing)');
  }, 60_000);

  // Pin: a cwd outside any git repo must fall back, not skip.
  test('cwd outside any git repo falls back to CLAUDE_PROJECT_DIR: exits 2', () => {
    const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-cwd-norepo-'));
    dirs.push(notRepo);
    const status = runHook({ cwd: notRepo }, cleanEnv({ CLAUDE_PROJECT_DIR: failing }));
    assert.equal(status, 2, 'a non-repo cwd must fall back to CLAUDE_PROJECT_DIR (failing)');
  }, 60_000);

  // A session sitting in some other git repo (no Plugged/ folder) must not
  // make the hook skip: it should fall back to CLAUDE_PROJECT_DIR.
  test('cwd inside a git repo that has no Plugged/ folder falls back to CLAUDE_PROJECT_DIR: exits 2', () => {
    const otherRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-cwd-noplugged-'));
    dirs.push(otherRepo);
    fs.writeFileSync(path.join(otherRepo, 'README.md'), 'not the app\n');
    git(otherRepo, 'init', '-q');
    git(otherRepo, 'add', 'README.md');
    git(otherRepo, 'commit', '-q', '-m', 'init');
    const status = runHook({ cwd: otherRepo }, cleanEnv({ CLAUDE_PROJECT_DIR: failing }));
    assert.equal(status, 2, 'a repo cwd with no Plugged/ must fall back to CLAUDE_PROJECT_DIR (failing)');
  }, 60_000);
});
