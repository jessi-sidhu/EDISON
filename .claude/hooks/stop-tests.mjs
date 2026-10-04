// Stop hook: when Claude is about to finish with uncommitted changes in
// Plugged/, run the unit tests first. If they fail, block the stop (exit 2)
// and hand Claude the failures, so "done" always means "tests pass".
// Skips quietly when nothing changed, when deps aren't installed, when npm
// can't be started, or when this stop was itself caused by this hook
// (stop_hook_active), so it can't loop. On Windows npm is npm.cmd, so it is
// run through a shell there.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {}
if (input.stop_hook_active) process.exit(0);

const app = join(process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), "Plugged");
if (!existsSync(join(app, "node_modules"))) process.exit(0);

let changed = "";
try {
  changed = execFileSync("git", ["status", "--porcelain", "--", "."], { cwd: app, encoding: "utf8" });
} catch {
  process.exit(0);
}
if (!/\.(m?js|html|json)$/m.test(changed)) process.exit(0);

// On Windows the shell gets one command string: shell plus an args array
// triggers a Node deprecation warning (DEP0190).
const opts = { cwd: app, encoding: "utf8", timeout: 120_000 };
const run = process.platform === "win32"
  ? spawnSync("npm test --silent", { ...opts, shell: true })
  : spawnSync("npm", ["test", "--silent"], opts);
if (run.status === 0) process.exit(0);
// npm couldn't be started (a spawn error with no signal): not a test failure.
// A timeout or output overflow kills npm with a signal, so those still block.
if (run.error && !run.signal) process.exit(0);

const out = `${run.stdout || ""}${run.stderr || ""}`.split("\n").slice(-40).join("\n");
process.stderr.write(
  `Unit tests are failing in Plugged/ (npm test). Fix them before finishing, ` +
  `or tell the user plainly which tests fail and why.\n\n${out}\n`,
);
process.exit(2);
