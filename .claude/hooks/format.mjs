// PostToolUse hook: format the file Claude just edited, using whatever
// formatter the project has installed. Silently does nothing otherwise,
// so it is safe before the stack is chosen.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

let file;
try {
  file = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.file_path;
} catch {
  process.exit(0);
}
if (!file || !existsSync(file) || file.includes("node_modules")) process.exit(0);

const ext = extname(file);
const run = (bin, args) => {
  try {
    execFileSync(bin, args, { cwd: root, stdio: "ignore", timeout: 20_000 });
  } catch {
    // A formatter failure must never block Claude.
  }
};

const prettier = join(root, "node_modules", ".bin", "prettier");
const biome = join(root, "node_modules", ".bin", "biome");
const webExts = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json", ".css", ".scss", ".html", ".md", ".vue", ".svelte", ".astro"];

if (webExts.includes(ext)) {
  if (existsSync(biome)) run(biome, ["format", "--write", file]);
  else if (existsSync(prettier)) run(prettier, ["--write", "--ignore-unknown", file]);
} else if (ext === ".py") {
  run("ruff", ["format", file]);
}
