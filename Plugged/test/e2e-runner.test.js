// Tests for the low-priority e2e wrapper (issue #111): scripts/e2e.js spawns
// the test runner, forwarding its args and passing the child's exit code
// through. On the Mac only it first lowers its own CPU priority.
//
// The platform rule (Aarmen's call):
//   - process.platform === 'darwin': scripts/e2e.js calls os.setPriority(15)
//     on itself before spawning, so the runner (and its browsers) inherit it.
//   - Every other platform (Windows, Linux CI): no priority change; the runner
//     runs at the same priority as whoever started scripts/e2e.js.
//
// The E2E_RUNNER contract (the builder implements exactly this):
//   - When env E2E_RUNNER is set, it is the absolute path to a JS file.
//     scripts/e2e.js runs it as `node <E2E_RUNNER> <args...>`, i.e.
//     spawn(process.execPath, [process.env.E2E_RUNNER, ...process.argv.slice(2)])
//     with stdio 'inherit' (no shell needed: process.execPath may contain spaces).
//   - When E2E_RUNNER is unset, it runs `playwright test <args...>`.
//   - It exits with the child's exit code (1 if the child died on a signal).
// Only this file sets E2E_RUNNER; the real `npm run e2e` never does.
//
// Each fixture is a throwaway JS file in os.tmpdir(), removed afterwards.
// Fixtures write with process.stdout.write, not console.log: with FORCE_COLOR
// in the env, console.log wraps a number in ANSI colour codes.

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const appDir = path.resolve(__dirname, '..');
const e2eScript = path.join(appDir, 'scripts/e2e.js');

// Spawns `node <script> <args...>` with E2E_RUNNER pointing at a fixture.
function run(script, args, runner) {
  const res = spawnSync(process.execPath, [script, ...args], {
    cwd: appDir,
    env: { ...process.env, E2E_RUNNER: runner },
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (res.error) throw res.error;
  return res;
}

// Status 0 and the printed stdout, with stderr in the message so a missing
// scripts/e2e.js shows up as "Cannot find module" rather than a parse error.
function runOk(args, runner) {
  const res = run(e2eScript, args, runner);
  assert.equal(res.status, 0, `scripts/e2e.js should exit 0 here; stderr:\n${res.stderr}`);
  return res.stdout.trim();
}

describe('scripts/e2e.js runs the e2e runner', () => {
  let dir;
  let printPriority;
  let printArgs;
  let exit3;
  let exit0;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-runner-'));
    const write = (name, src) => {
      const file = path.join(dir, name);
      fs.writeFileSync(file, src);
      return file;
    };
    printPriority = write('print-priority.js', "process.stdout.write(String(require('node:os').getPriority()));\n");
    printArgs = write('print-args.js', 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');
    exit3 = write('exit-3.js', 'process.exit(3);\n');
    exit0 = write('exit-0.js', 'process.exit(0);\n');
  });
  afterAll(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  // The priority the fixture reports when run directly, with no wrapper.
  function directPriority() {
    const res = run(printPriority, [], printPriority);
    assert.equal(res.status, 0, res.stderr);
    return Number(res.stdout.trim());
  }

  test.skipIf(process.platform !== 'darwin')(
    'on macOS the runner it spawns reports a priority of at least 10 (below normal)',
    () => {
      // Control: run directly, the fixture is below 10, so a pass below
      // proves scripts/e2e.js lowered it (not an already-niced shell).
      const direct = directPriority();
      assert.ok(direct < 10, `precondition: the test process must start below priority 10, got ${direct}`);

      const printed = runOk([], printPriority);
      assert.ok(
        printed !== '' && Number(printed) >= 10,
        `expected the runner's priority >= 10, got ${JSON.stringify(printed)}`,
      );
    },
    30_000,
  );

  test.skipIf(process.platform === 'darwin')(
    'off macOS the runner it spawns keeps the same priority as its parent',
    () => {
      const direct = directPriority();
      const printed = runOk([], printPriority);
      assert.equal(printed, String(direct), `expected the runner's priority to stay ${direct}, got ${JSON.stringify(printed)}`);
    },
    30_000,
  );

  test('it forwards its args to the runner unchanged', () => {
    const printed = runOk(['e2e/x.spec.js', '--workers=1'], printArgs);
    assert.deepEqual(JSON.parse(printed || 'null'), ['e2e/x.spec.js', '--workers=1']);
  }, 30_000);

  // Table-driven: a failing run must fail /ship, a passing run must not.
  test.each([
    ['a failing runner (exit 3)', () => exit3, 3],
    ['a passing runner (exit 0)', () => exit0, 0],
  ])('it exits with the runner\'s exit code: %s', (_name, fixture, expected) => {
    const res = run(e2eScript, [], fixture());
    assert.equal(
      res.status,
      expected,
      `expected scripts/e2e.js to exit ${expected}, got ${res.status}; stderr:\n${res.stderr}`,
    );
  }, 30_000);
});
