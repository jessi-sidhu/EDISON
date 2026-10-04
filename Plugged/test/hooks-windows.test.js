// Tests for the Claude Code hooks in .claude/hooks/ on Windows (issue #80):
// guard-tests.mjs must see a backslash path under test/ or e2e/ as a test
// file, protect-secrets.mjs must treat "\" as a path separator before .env,
// and stop-tests.mjs must not report failing tests when npm can't be run.
// Each hook is spawned as its own node process, fed a JSON payload on stdin,
// and judged by its exit code (2 blocks, 0 allows).

const assert = require('node:assert');
const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const hooks = path.resolve(__dirname, '../../.claude/hooks');
const guardTests = path.join(hooks, 'guard-tests.mjs');
const protectSecrets = path.join(hooks, 'protect-secrets.mjs');
const stopTests = path.join(hooks, 'stop-tests.mjs');

// Environment without the npm_* variables vitest inherits from `npm test`,
// so a nested npm run in a fixture isn't steered by the outer one.
function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('npm_')) env[k] = v;
  }
  return { ...env, ...extra };
}

function runHook(hookPath, args, payload, env = cleanEnv()) {
  const run = spawnSync(process.execPath, [hookPath, ...args], {
    input: JSON.stringify(payload),
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (run.error) throw run.error;
  return run.status;
}

describe('guard-tests.mjs', () => {
  const guard = (mode, file) => runHook(guardTests, [mode], { tool_input: { file_path: file } });

  test('a Windows path to a golden prompt file counts as a test file', () => {
    const file = String.raw`C:\r\Plugged\test\fixtures\prompts\demo-led.txt`;
    assert.equal(guard('no-tests', file), 2, 'builder (no-tests) must be blocked from test\\ fixtures');
    assert.equal(guard('only-tests', file), 0, 'test-writer (only-tests) must be allowed into test\\ fixtures');
  });

  test('a Windows path under e2e\\ counts as a test file', () => {
    const file = String.raw`C:\r\Plugged\e2e\helpers\board.js`;
    assert.equal(guard('no-tests', file), 2, 'builder (no-tests) must be blocked from e2e\\ helpers');
    assert.equal(guard('only-tests', file), 0, 'test-writer (only-tests) must be allowed into e2e\\ helpers');
  });

  test('a Windows path to app code is not a test file', () => {
    const file = String.raw`C:\r\Plugged\src\sim.js`;
    assert.equal(guard('only-tests', file), 2, 'test-writer (only-tests) must be blocked from app code');
    assert.equal(guard('no-tests', file), 0, 'builder (no-tests) must be allowed into app code');
  });

  // Pin: the POSIX behaviour the fix must not change.
  test.each([
    ['/r/Plugged/test/fixtures/prompts/demo-led.txt', 2, 0],
    ['/r/Plugged/e2e/helpers/board.js', 2, 0],
    ['Plugged/test/ids.test.js', 2, 0],
    ['/r/Plugged/src/sim.js', 0, 2],
  ])('POSIX path %s: no-tests exits %i, only-tests exits %i', (file, noTests, onlyTests) => {
    assert.equal(guard('no-tests', file), noTests);
    assert.equal(guard('only-tests', file), onlyTests);
  });
});

describe('protect-secrets.mjs', () => {
  const bash = command => runHook(protectSecrets, [], { tool_name: 'Bash', tool_input: { command } });

  test('type backend\\.env (Windows separator) is blocked', () => {
    assert.equal(bash(String.raw`type backend\.env`), 2);
  });

  // Pin: the POSIX block and the .env.example allowance must survive the fix.
  test.each([
    ['cat backend/.env', 2],
    ['cat .env.example', 0],
    [String.raw`type backend\.env.example`, 0],
  ])('%s exits %i', (command, status) => {
    assert.equal(bash(command), status);
  });
});

describe('stop-tests.mjs', () => {
  const git = (cwd, ...args) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, stdio: 'pipe' });

  // A throwaway project dir: a git repo whose Plugged/ has node_modules/, a
  // committed package.json with the given test script, and an untracked x.js
  // so the hook's "anything changed?" check passes. Never the real repo:
  // there the hook would run the real `npm test` and recurse.
  function fixture(testScript) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-tests-'));
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

  const dirs = [];
  afterAll(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });
  const makeFixture = script => {
    const d = fixture(script);
    dirs.push(d);
    return d;
  };

  // POSIX-only: Windows runs npm through cmd.exe, so a missing npm is status 1 there, not a spawn error.
  test.skipIf(process.platform === 'win32')('exits 0 when npm cannot be run at all (not a test failure)', () => {
    const project = makeFixture('node -e "process.exit(1)"');
    // PATH holds only node and git, so spawning npm fails (as npm.cmd does on
    // Windows without a shell). npm sits next to node, so don't reuse its dir.
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-tests-bin-'));
    dirs.push(bin);
    const gitPath = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    fs.symlinkSync(process.execPath, path.join(bin, 'node'));
    fs.symlinkSync(gitPath, path.join(bin, 'git'));
    const status = runHook(stopTests, [], {}, cleanEnv({ PATH: bin, CLAUDE_PROJECT_DIR: project }));
    assert.equal(status, 0);
  }, 60_000);

  // Pin: a real failing test run must still block the stop.
  test('exits 2 when npm test really fails', () => {
    const project = makeFixture('node -e "process.exit(1)"');
    assert.equal(runHook(stopTests, [], {}, cleanEnv({ CLAUDE_PROJECT_DIR: project })), 2);
  }, 60_000);

  // Pin: a passing test run lets Claude stop.
  test('exits 0 when npm test passes', () => {
    const project = makeFixture('node -e "process.exit(0)"');
    assert.equal(runHook(stopTests, [], {}, cleanEnv({ CLAUDE_PROJECT_DIR: project })), 0);
  }, 60_000);
});
