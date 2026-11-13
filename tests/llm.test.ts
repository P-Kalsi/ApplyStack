import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  _internals,
  askLlm,
  buildClaudeArgs,
  checkLlmBackend,
  claudeEnv,
  LlmCallError,
  LlmSetupError,
  loadLlmSettings,
  parseClaudeOutput,
  PROVIDER_DEFAULTS,
  resolveSettings,
  saveLlmSettings,
} from "../src/lib/ai/llm";

// ---------------------------------------------------------------------------
// A fake `claude` CLI: records what it receives, answers per FAKE_MODE.
// No test here ever calls a real model.
// ---------------------------------------------------------------------------

const dir = mkdtempSync(join(tmpdir(), "applystack-llm-test-"));
const fakeClaude = join(dir, "claude");
const logFile = join(dir, "calls.jsonl");
writeFileSync(
  fakeClaude,
  `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const mode = process.env.FAKE_MODE || "ok";
if (args[0] === "--version") { console.log("9.9.9 (Claude Code)"); process.exit(0); }
if (args[0] === "auth") {
  console.log(JSON.stringify({ loggedIn: process.env.FAKE_LOGGED_IN !== "0", authMethod: process.env.FAKE_AUTH || "claude.ai" }));
  process.exit(0);
}
let stdin = "";
process.stdin.on("data", (d) => (stdin += d));
process.stdin.on("end", () => {
  const sysIdx = args.indexOf("--append-system-prompt-file");
  const system = sysIdx >= 0 ? fs.readFileSync(args[sysIdx + 1], "utf8") : null;
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({
    args, stdin, system, cwd: process.cwd(),
    hasApiKey: "ANTHROPIC_API_KEY" in process.env,
    hasAuthToken: "ANTHROPIC_AUTH_TOKEN" in process.env,
    keepsOtherEnv: process.env.KEEP_ME === "yes",
  }) + "\\n");
  const calls = fs.readFileSync(process.env.FAKE_LOG, "utf8").trim().split("\\n").length;
  if (mode === "sleep") { setTimeout(() => {}, 60000); return; }
  if (mode === "flaky" && calls === 1) { process.stderr.write("boom"); process.exit(1); }
  if (mode === "error") { console.log(JSON.stringify({ type: "result", subtype: "success", is_error: true, result: "API Error: 529 overloaded" })); return; }
  if (mode === "auth") { console.log(JSON.stringify({ type: "result", is_error: true, result: "Not logged in · Please run /login" })); process.exit(1); }
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "ECHO:" + stdin, total_cost_usd: 0.0012 }));
});
`
);
chmodSync(fakeClaude, 0o755);

const configFile = join(dir, "applystack.config.json");

function calls(): Array<Record<string, unknown>> {
  if (!existsSync(logFile)) return [];
  return readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

beforeEach(() => {
  process.env.APPLYSTACK_CONFIG = configFile;
  process.env.CLAUDE_CLI_PATH = fakeClaude;
  process.env.FAKE_LOG = logFile;
  process.env.KEEP_ME = "yes";
  process.env.ANTHROPIC_API_KEY = "sk-should-never-reach-claude";
  process.env.ANTHROPIC_AUTH_TOKEN = "token-should-never-reach-claude";
  delete process.env.APPLYSTACK_LLM_PROVIDER;
  delete process.env.FAKE_MODE;
  delete process.env.FAKE_LOGGED_IN;
  delete process.env.FAKE_AUTH;
  writeFileSync(logFile, "");
  writeFileSync(configFile, JSON.stringify({ provider: "claude_cli" }));
  _internals.retryDelayMs = 0;
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

test("defaults: claude_cli with haiku/sonnet; blanks fall back per provider", () => {
  assert.deepEqual(
    { ...resolveSettings({}), source: undefined },
    { provider: "claude_cli", model_fast: "haiku", model_smart: "sonnet", timeout_seconds: null, source: undefined }
  );
  const openai = resolveSettings({ provider: "openai", model_fast: " ", model_smart: "my-model" });
  assert.equal(openai.model_fast, PROVIDER_DEFAULTS.openai.fast);
  assert.equal(openai.model_smart, "my-model");
});

test("env override wins and doesn't reuse another provider's model names", () => {
  const s = resolveSettings({ provider: "openai", model_fast: "gpt-x" }, "gemini");
  assert.equal(s.provider, "gemini");
  assert.equal(s.source, "env");
  assert.equal(s.model_fast, PROVIDER_DEFAULTS.gemini.fast);
  assert.equal(resolveSettings({}, "not-a-provider").provider, "claude_cli");
});

test("saving drops unknown keys, so an API key can never land in the config file", () => {
  saveLlmSettings({ provider: "anthropic", model_smart: "claude-sonnet-5-5", api_key: "sk-secret" });
  const raw = readFileSync(configFile, "utf8");
  assert.ok(!raw.includes("sk-secret"));
  assert.ok(!raw.includes("api_key"));
  assert.equal(loadLlmSettings().provider, "anthropic");
  assert.throws(() => saveLlmSettings({ provider: "llama-on-my-toaster" }));
});

// ---------------------------------------------------------------------------
// claude_cli pieces
// ---------------------------------------------------------------------------

test("claudeEnv strips API-billing credentials and keeps everything else", () => {
  const env = claudeEnv({ ANTHROPIC_API_KEY: "a", ANTHROPIC_AUTH_TOKEN: "b", PATH: "/bin", HOME: "/h" } as unknown as NodeJS.ProcessEnv);
  assert.deepEqual(env, { PATH: "/bin", HOME: "/h" });
});

test("buildClaudeArgs: headless JSON, model, no tools, optional system prompt file", () => {
  const args = buildClaudeArgs("haiku", "/tmp/sys.txt");
  assert.deepEqual(args.slice(0, 5), ["-p", "--output-format", "json", "--model", "haiku"]);
  assert.equal(args[args.indexOf("--tools") + 1], "");
  assert.equal(args[args.indexOf("--allowedTools") + 1], "");
  assert.equal(args[args.indexOf("--append-system-prompt-file") + 1], "/tmp/sys.txt");
  assert.ok(!buildClaudeArgs("sonnet", null).includes("--append-system-prompt-file"));
});

test("parseClaudeOutput returns result, raises on is_error, flags login problems", () => {
  assert.deepEqual(parseClaudeOutput('{"is_error":false,"result":"hi","total_cost_usd":0.5}'), { text: "hi", costUsd: 0.5 });
  assert.equal(parseClaudeOutput('noise\n{"is_error":false,"result":"last line"}').text, "last line");
  assert.throws(() => parseClaudeOutput('{"is_error":true,"result":"API Error: 500"}'), LlmCallError);
  assert.throws(() => parseClaudeOutput('{"is_error":true,"result":"Not logged in · Please run /login"}'), LlmSetupError);
  assert.throws(() => parseClaudeOutput("not json"), /non-JSON/);
});

// ---------------------------------------------------------------------------
// askLlm through the fake CLI
// ---------------------------------------------------------------------------

test("askLlm runs claude -p with the tier's model, prompt on stdin, system prompt file, no API key", async () => {
  const fast = await askLlm("parse this posting", "fast", "You extract JSON.");
  assert.equal(fast, "ECHO:parse this posting");
  const smart = await askLlm("rewrite bullets", "smart");
  assert.equal(smart, "ECHO:rewrite bullets");

  const [c1, c2] = calls();
  const args1 = c1.args as string[];
  assert.equal(args1[args1.indexOf("--model") + 1], "haiku");
  assert.equal((c2.args as string[])[(c2.args as string[]).indexOf("--model") + 1], "sonnet");
  assert.equal(c1.system, "You extract JSON.");
  assert.equal(c2.system, null);
  assert.equal(c1.hasApiKey, false, "ANTHROPIC_API_KEY must be removed");
  assert.equal(c1.hasAuthToken, false, "ANTHROPIC_AUTH_TOKEN must be removed");
  assert.equal(c1.keepsOtherEnv, true);
  assert.notEqual(c1.cwd, process.cwd(), "runs in an isolated temp dir");
  // ApplyStack's own env still has the key (only the subprocess lost it).
  assert.equal(process.env.ANTHROPIC_API_KEY, "sk-should-never-reach-claude");
});

test("askLlm retries once after a failure, then succeeds", async () => {
  process.env.FAKE_MODE = "flaky";
  assert.equal(await askLlm("hello"), "ECHO:hello");
  assert.equal(calls().length, 2);
});

test("askLlm gives up after one retry with a clear error", async () => {
  process.env.FAKE_MODE = "error";
  await assert.rejects(askLlm("hello"), (err: Error) => {
    assert.ok(err instanceof LlmCallError);
    assert.match(err.message, /claude_cli backend \(haiku\) failed twice: .*529 overloaded/);
    return true;
  });
  assert.equal(calls().length, 2);
});

test("askLlm times out each attempt", async () => {
  process.env.FAKE_MODE = "sleep";
  // 10s is the config minimum; shorten the per-attempt timeout for the test.
  const real = _internals.transport;
  _internals.transport = (a) => real({ ...a, timeoutMs: 300 });
  try {
    await assert.rejects(askLlm("hello"), /failed twice: timed out/);
    assert.equal(calls().length, 2);
  } finally {
    _internals.transport = real;
  }
});

test("login problems are setup errors: no retry", async () => {
  process.env.FAKE_MODE = "auth";
  await assert.rejects(askLlm("hello"), LlmSetupError);
  assert.equal(calls().length, 1);
});

test("missing CLI gives install instructions", async () => {
  process.env.CLAUDE_CLI_PATH = join(dir, "does-not-exist");
  await assert.rejects(askLlm("hello"), /npm install -g @anthropic-ai\/claude-code/);
});

// ---------------------------------------------------------------------------
// API providers and offline
// ---------------------------------------------------------------------------

test("API providers need their env key and fail fast without it", async () => {
  delete process.env.GEMINI_API_KEY;
  writeFileSync(configFile, JSON.stringify({ provider: "gemini" }));
  await assert.rejects(askLlm("hi"), (err: Error) => {
    assert.ok(err instanceof LlmSetupError);
    assert.match(err.message, /GEMINI_API_KEY isn't set/);
    return true;
  });
});

test("offline backend refuses model calls with a pointer to Settings", async () => {
  process.env.APPLYSTACK_LLM_PROVIDER = "offline";
  await assert.rejects(askLlm("hi"), /Settings → AI backend/);
});

// ---------------------------------------------------------------------------
// Readiness check
// ---------------------------------------------------------------------------

test("check: claude installed and logged in", async () => {
  const s = await checkLlmBackend({ fresh: true });
  assert.equal(s.ok, true);
  assert.match(s.message, /Claude Code 9\.9\.9 \(Claude Code\) is ready/);
  assert.equal(s.warning, undefined);
});

test("check: not logged in gives login instructions", async () => {
  process.env.FAKE_LOGGED_IN = "0";
  const s = await checkLlmBackend({ fresh: true });
  assert.equal(s.ok, false);
  assert.match(s.message, /not logged in.*Run `claude`/);
});

test("check: warns when Claude Code itself is set to use an API key", async () => {
  process.env.FAKE_AUTH = "api_key";
  const s = await checkLlmBackend({ fresh: true });
  assert.equal(s.ok, true);
  assert.match(s.warning ?? "", /bill that key/);
});

test("check: missing CLI and missing API key are reported, not thrown", async () => {
  process.env.CLAUDE_CLI_PATH = join(dir, "does-not-exist");
  const cli = await checkLlmBackend({ fresh: true });
  assert.equal(cli.ok, false);
  assert.match(cli.message, /isn't installed/);

  delete process.env.OPENAI_API_KEY;
  writeFileSync(configFile, JSON.stringify({ provider: "openai" }));
  const api = await checkLlmBackend({ fresh: true });
  assert.equal(api.ok, false);
  assert.match(api.message, /OPENAI_API_KEY isn't set/);

  process.env.OPENAI_API_KEY = "sk-test";
  const ok = await checkLlmBackend({ fresh: true });
  assert.equal(ok.ok, true);
  assert.match(ok.message, /gpt-6-luna \(fast\) and gpt-6\.1-sol \(smart\)/);
  delete process.env.OPENAI_API_KEY;
});
