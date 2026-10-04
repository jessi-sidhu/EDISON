// PreToolUse hook: keep API keys out of every agent's context. Blocks
// reading, searching, editing or shelling out to any .env file (at any
// depth) except .env.example, which only lists variable names.
// Permission deny rules don't cover grep or subprocesses; this hook does.
// Exit code 2 blocks the tool call and shows Claude the reason.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const { tool_name: tool, tool_input: args = {} } = input;

const isSecretFile = p => {
  const name = basename(String(p || ""));
  return /^\.env(\..+)?$/.test(name) && name !== ".env.example";
};

// A .env path inside a shell command: ".env", "backend/.env", ".env.local",
// but not ".env.example" and not a name that merely contains "env".
const SECRET_IN_COMMAND = /(^|[\s'"=\/<>|;&(])\.env(?!\.example\b)(\.[A-Za-z0-9_.-]+)?(?=$|[\s'";|&)>])/;

let blocked = false;
if (tool === "Bash") blocked = SECRET_IN_COMMAND.test(String(args.command || ""));
else blocked = [args.file_path, args.path, args.notebook_path].some(isSecretFile);

if (blocked) {
  process.stderr.write(
    "Blocked: .env files hold API keys and stay out of agent context. " +
    "Use .env.example for variable names, and ask the user to edit .env themselves.\n",
  );
  process.exit(2);
}
process.exit(0);
