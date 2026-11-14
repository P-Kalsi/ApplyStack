import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A fake `codex` CLI: records what it receives and answers per FAKE_MODE.
const dir = mkdtempSync(join(tmpdir(), "applystack-codex-test-"));
const fake = join(dir, "codex");
const log = join(dir, "calls.jsonl");
writeFileSync(
  fake,
  `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("codex-cli 1.4.2"); process.exit(0); }
if (args[0] === "login" && args[1] === "status") {
  const m = process.env.FAKE_LOGIN || "chatgpt";
  if (m === "none") { console.error("Not logged in"); process.exit(1); }
  console.error(m === "apikey" ? "Logged in using an API key - sk-proj-***abcd" : "Logged in using ChatGPT");
  process.exit(0);
}
let stdin = "";
process.stdin.on("data", (d) => (stdin += d));
process.stdin.on("end", () => {
  const out = args[args.indexOf("--output-last-message") + 1];
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, stdin, cwd: process.cwd(), openai: "OPENAI_API_KEY" in process.env, codexKey: "CODEX_API_KEY" in process.env }) + "\\n");
  const mode = process.env.FAKE_MODE || "ok";
  if (mode === "auth") { console.error("Error: 401 Unauthorized. Please run codex login"); process.exit(1); }
  if (mode === "model") { console.error("Error: model 'gpt-9' is not supported when using Codex with a ChatGPT account"); process.exit(1); }
  console.error("[progress] thinking...");
  fs.writeFileSync(out, "  {\\"ok\\": true}  \\n");
  console.log("{\\"ok\\": true}");
});
`
);
chmodSync(fake, 0o755);
process.env.CODEX_CLI_PATH = fake;
process.env.FAKE_LOG = log;
process.env.APPLYSTACK_CONFIG = join(dir, "applystack.config.json");
process.env.APPLYSTACK_LLM_PROVIDER = "codex_cli";

import { _internals, askLlm, buildCodexArgs, checkLlmBackend, codexEnv, codexPrompt, LlmSetupError, loadLlmSettings, PROVIDER_DEFAULTS } from "../src/lib/ai/llm";

const calls = () => readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

beforeEach(() => {
  writeFileSync(log, "");
  delete process.env.FAKE_MODE;
  delete process.env.FAKE_LOGIN;
  _internals.retryDelayMs = 0;
});

test("codex_cli defaults: Luna for fast, 6.1 Sol for smart", () => {
  assert.deepEqual(PROVIDER_DEFAULTS.codex_cli, { fast: "gpt-6-luna", smart: "gpt-6.1-sol" });
  const s = loadLlmSettings();
  assert.equal(s.provider, "codex_cli");
  assert.equal(s.model_smart, "gpt-6.1-sol");
});

test("codex exec arguments: read-only, no git check, ephemeral, prompt on stdin", () => {
  assert.deepEqual(buildCodexArgs("gpt-6-luna", "/tmp/out.txt"), [
    "exec", "--model", "gpt-6-luna", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral",
    "--output-last-message", "/tmp/out.txt", "-",
  ]);
  assert.match(codexPrompt("TASK", "RULES"), /^<instructions>\nRULES\n<\/instructions>[\s\S]*<task>\nTASK\n<\/task>$/);
  assert.equal(codexPrompt("TASK", undefined), "TASK");
});

test("codexEnv removes API keys so the ChatGPT plan is used", () => {
  const env = codexEnv({ PATH: "/bin", OPENAI_API_KEY: "sk", CODEX_API_KEY: "ck", HOME: "/h" } as unknown as NodeJS.ProcessEnv);
  assert.deepEqual(env, { PATH: "/bin", HOME: "/h" });
});

test("askLlm through codex: last message, system folded in, no keys, temp folder", async () => {
  process.env.OPENAI_API_KEY = "sk-should-not-leak";
  try {
    const text = await askLlm("Return ok as JSON", "smart", "You are a JSON bot.");
    assert.equal(text, '{"ok": true}');
    const [c] = calls();
    assert.equal(c.args[c.args.indexOf("--model") + 1], "gpt-6.1-sol");
    assert.match(c.stdin, /<instructions>\nYou are a JSON bot\.\n<\/instructions>/);
    assert.match(c.stdin, /<task>\nReturn ok as JSON\n<\/task>/);
    assert.equal(c.openai, false);
    assert.equal(c.codexKey, false);
    assert.match(c.cwd, /applystack-codex-/);
  } finally {
    delete process.env.OPENAI_API_KEY;
  }
});

test("codex sign-in and model problems are setup errors, not retried", async () => {
  process.env.FAKE_MODE = "auth";
  await assert.rejects(askLlm("x"), (e: Error) => e instanceof LlmSetupError && /codex login/.test(e.message));
  assert.equal(calls().length, 1, "no retry");
  writeFileSync(log, "");
  process.env.FAKE_MODE = "model";
  await assert.rejects(askLlm("x"), (e: Error) => e instanceof LlmSetupError && /Settings → AI backend/.test(e.message));
});

test("readiness check: signed in with ChatGPT, not signed in, API key warning, not installed", async () => {
  let s = await checkLlmBackend({ fresh: true });
  assert.equal(s.ok, true);
  assert.match(s.message, /codex-cli 1\.4\.2 is ready \(Logged in using ChatGPT\)/);
  process.env.FAKE_LOGIN = "none";
  s = await checkLlmBackend({ fresh: true });
  assert.equal(s.ok, false);
  assert.match(s.message, /codex login/);
  process.env.FAKE_LOGIN = "apikey";
  s = await checkLlmBackend({ fresh: true });
  assert.equal(s.ok, true);
  assert.match(s.warning!, /API key/);
  const saved = process.env.CODEX_CLI_PATH;
  process.env.CODEX_CLI_PATH = join(dir, "no-such-codex");
  s = await checkLlmBackend({ fresh: true });
  assert.equal(s.ok, false);
  assert.match(s.message, /npm install -g @openai\/codex/);
  process.env.CODEX_CLI_PATH = saved;
});
