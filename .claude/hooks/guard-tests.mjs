// PreToolUse hook for the test-writer and builder subagents (set in their
// .claude/agents/*.md frontmatter), so their split of work is enforced, not
// trusted:
//   node guard-tests.mjs only-tests  → test-writer may edit test files only
//   node guard-tests.mjs no-tests    → builder may not edit test files
// A test file is anything under a test/ or e2e/ folder, or named *.test.* /
// *.spec.*. Windows backslash paths are normalised to "/" before matching.
// Exit code 2 blocks the edit and tells the agent why.
import { readFileSync } from "node:fs";

const mode = process.argv[2];
let file;
try {
  file = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.file_path;
} catch {
  process.exit(0);
}
if (!file) process.exit(0);

const p = file.replaceAll("\\", "/");
const isTestFile = /(^|\/)(test|e2e)\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);

if (mode === "only-tests" && !isTestFile) {
  process.stderr.write(
    `Blocked: the test-writer only writes tests (test/ or e2e/). ${file} is app code; the builder changes it.\n`,
  );
  process.exit(2);
}
if (mode === "no-tests" && isTestFile) {
  process.stderr.write(
    `Blocked: the builder doesn't edit tests. If ${file} looks wrong, stop and report why instead of changing it.\n`,
  );
  process.exit(2);
}
process.exit(0);
