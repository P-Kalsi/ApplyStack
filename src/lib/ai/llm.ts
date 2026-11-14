// The one place ApplyStack talks to a language model.
//
//   askLlm(prompt, tier = "fast", system?) -> Promise<string>
//
// Every AI step in the app calls askLlm. It reads the backend + model choice
// from settings (applystack.config.json, editable in Settings → AI backend),
// routes "fast" steps (parsing, extraction) and "smart" steps (resume writing)
// to different models, applies a timeout with one retry, and logs provider,
// model and duration for every call.
//
// Backends:
//   claude_cli  Claude Code headless mode (`claude -p`) using the local user's
//               own Claude login. ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN are
//               removed from the subprocess env so the plan is used, never an
//               API key.
//   codex_cli   OpenAI Codex CLI non-interactive mode (`codex exec`) using the
//               local user's own ChatGPT sign-in. OPENAI_API_KEY / CODEX_API_KEY
//               are removed from the subprocess env so the plan is used.
//   anthropic / openai / gemini
//               Direct API calls through the Vercel AI SDK (one code path for
//               all three). Keys come from env vars only.
//   offline     No model at all; callers use the deterministic engine instead.
//
// Server-only: uses child_process and fs. Never import from client components.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { configPath, readConfig, writeConfig } from "../config";

export { configPath };

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type Provider = "claude_cli" | "codex_cli" | "anthropic" | "openai" | "gemini" | "offline";
export type Tier = "fast" | "smart";
export type ModelProvider = Exclude<Provider, "offline">;

export const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "claude_cli", label: "Claude Code (your Claude plan)" },
  { value: "codex_cli", label: "Codex CLI (your ChatGPT plan)" },
  { value: "anthropic", label: "Anthropic API key" },
  { value: "openai", label: "OpenAI API key" },
  { value: "gemini", label: "Gemini API key" },
  { value: "offline", label: "Offline (no AI, deterministic)" },
];

/**
 * Default models per provider: a cheap/fast one and a stronger writer.
 * Checked against each provider's docs in Nov 2026; update here when they
 * change. claude_cli takes Claude Code's aliases, which track the latest model;
 * codex_cli takes the model ids listed for Codex with ChatGPT sign-in.
 */
export const PROVIDER_DEFAULTS: Record<ModelProvider, Record<Tier, string>> = {
  claude_cli: { fast: "haiku", smart: "sonnet" },
  codex_cli: { fast: "gpt-6-luna", smart: "gpt-6.1-sol" },
  anthropic: { fast: "claude-haiku-5-5", smart: "claude-sonnet-5-5" },
  openai: { fast: "gpt-6-luna", smart: "gpt-6.1-sol" },
  gemini: { fast: "gemini-3.1-flash-lite", smart: "gemini-3.5-flash" },
};

/** API keys are read from these env vars only; never stored in the config file. */
export const API_KEY_ENV: Record<"anthropic" | "openai" | "gemini", string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

const DEFAULT_TIMEOUT_SECONDS: Record<Tier, number> = { fast: 90, smart: 240 };
const MAX_OUTPUT_TOKENS: Record<Tier, number> = { fast: 4096, smart: 8192 };

const SettingsFileSchema = z.object({
  provider: z.enum(["claude_cli", "codex_cli", "anthropic", "openai", "gemini", "offline"]).default("claude_cli"),
  model_fast: z.string().max(120).optional(),
  model_smart: z.string().max(120).optional(),
  timeout_seconds: z.number().int().min(10).max(900).optional(),
});

export type LlmSettingsInput = z.infer<typeof SettingsFileSchema>;

export interface LlmSettings {
  provider: Provider;
  model_fast: string;
  model_smart: string;
  /** Per-attempt timeout; null = tier default. */
  timeout_seconds: number | null;
  /** Where the provider choice came from. */
  source: "config" | "env" | "default";
}

/** Fill blanks with provider defaults; pure, unit-tested. */
export function resolveSettings(raw: Partial<LlmSettingsInput>, envProvider?: string): LlmSettings {
  const parsed = SettingsFileSchema.safeParse(raw);
  const file: LlmSettingsInput = parsed.success ? parsed.data : { provider: "claude_cli" };
  const envChoice = SettingsFileSchema.shape.provider.safeParse(envProvider);
  const provider: Provider = envProvider && envChoice.success ? envChoice.data : file.provider;
  const source: LlmSettings["source"] =
    envProvider && envChoice.success ? "env" : raw.provider ? "config" : "default";
  const defaults = provider === "offline" ? { fast: "", smart: "" } : PROVIDER_DEFAULTS[provider];
  // Model names saved for one provider are meaningless for another.
  const sameProvider = provider === file.provider;
  return {
    provider,
    model_fast: (sameProvider && file.model_fast?.trim()) || defaults.fast,
    model_smart: (sameProvider && file.model_smart?.trim()) || defaults.smart,
    timeout_seconds: file.timeout_seconds ?? null,
    source,
  };
}

/** Current settings: config file, then APPLYSTACK_LLM_PROVIDER env override. */
export function loadLlmSettings(): LlmSettings {
  const raw = readConfig() as Partial<LlmSettingsInput>;
  return resolveSettings(raw, process.env.APPLYSTACK_LLM_PROVIDER);
}

/** Validate and write the config file. Unknown keys (e.g. an api_key) are dropped. */
export function saveLlmSettings(input: unknown): LlmSettings {
  const parsed = SettingsFileSchema.parse(input);
  const clean: LlmSettingsInput = {
    provider: parsed.provider,
    ...(parsed.model_fast?.trim() ? { model_fast: parsed.model_fast.trim() } : {}),
    ...(parsed.model_smart?.trim() ? { model_smart: parsed.model_smart.trim() } : {}),
    ...(parsed.timeout_seconds ? { timeout_seconds: parsed.timeout_seconds } : {}),
  };
  // Keep the other sections of the file (internship feed, alerts) as they are.
  const existing = readConfig();
  writeConfig({ ...clean, ...(existing.feed !== undefined ? { feed: existing.feed } : {}) });
  statusCache.clear();
  return loadLlmSettings();
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Misconfiguration the user must fix (not retried). */
export class LlmSetupError extends Error {
  readonly kind = "setup";
}

/** A call that failed after retrying. */
export class LlmCallError extends Error {
  readonly kind = "call";
}

class TimeoutError extends Error {}

// ---------------------------------------------------------------------------
// claude_cli backend
// ---------------------------------------------------------------------------

/** Env for `claude` subprocesses: never pass API-billing credentials. */
export function claudeEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...base };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

export function buildClaudeArgs(model: string, systemPromptFile: string | null): string[] {
  const args = [
    "-p",
    "--output-format", "json",
    "--model", model,
    // --tools "" removes every built-in tool; --allowedTools "" grants no
    // auto-approvals. ApplyStack only needs text back.
    "--tools", "",
    "--allowedTools", "",
    "--strict-mcp-config", // no MCP servers
    "--no-session-persistence", // don't fill the user's session history
  ];
  if (systemPromptFile) args.push("--append-system-prompt-file", systemPromptFile);
  return args;
}

export interface ClaudeResult {
  text: string;
  costUsd: number | null;
}

/** Parse `claude -p --output-format json` stdout. */
export function parseClaudeOutput(stdout: string): ClaudeResult {
  const trimmed = stdout.trim();
  let data: Record<string, unknown> | null = null;
  for (const candidate of [trimmed, trimmed.split("\n").pop() ?? ""]) {
    try {
      data = JSON.parse(candidate);
      break;
    } catch {
      // try the last line (stdout can carry stray lines before the JSON)
    }
  }
  if (!data || typeof data !== "object") {
    throw new LlmCallError(`Claude Code returned non-JSON output: ${trimmed.slice(0, 200) || "(empty)"}`);
  }
  const message = typeof data.result === "string" ? data.result : "";
  if (data.is_error === true || String(data.subtype ?? "").startsWith("error")) {
    const detail = message || String(data.subtype ?? "unknown error");
    if (/log ?in|logged in|authenticat|oauth|credential|\/login/i.test(detail)) {
      throw new LlmSetupError(
        `Claude Code isn't logged in (${detail.slice(0, 160)}). Run \`claude\` in a terminal once and sign in with your Claude account.`
      );
    }
    throw new LlmCallError(`Claude Code returned an error: ${detail.slice(0, 300)}`);
  }
  if (!message) throw new LlmCallError("Claude Code returned an empty result.");
  const cost = typeof data.total_cost_usd === "number" ? data.total_cost_usd : null;
  return { text: message, costUsd: cost };
}

/** Command for spawning claude; CLAUDE_CLI_PATH overrides the PATH lookup. */
function claudeCommand(): string {
  return process.env.CLAUDE_CLI_PATH || "claude";
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Spawn a process with stdin, a hard timeout, and no shell injection surface. */
function runProcess(
  command: string,
  args: string[],
  opts: { input?: string; timeoutMs: number; cwd?: string; env?: NodeJS.ProcessEnv; missing?: string }
): Promise<RunResult> {
  const missing =
    opts.missing ??
    "Claude Code isn't installed (the `claude` command wasn't found). Install it with `npm install -g @anthropic-ai/claude-code`, run `claude` once to sign in, or set CLAUDE_CLI_PATH.";
  return new Promise((resolve, reject) => {
    // On Windows, npm installs `claude.cmd`, which needs cmd.exe. Arguments
    // are fixed flags, model names and a temp-file path (the prompt goes via
    // stdin), so quoting each one is enough.
    const win = process.platform === "win32";
    const child = spawn(win ? `"${command}"` : command, win ? args.map((a) => `"${a.replace(/"/g, '""')}"`) : args, {
      cwd: opts.cwd,
      env: opts.env,
      shell: win,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill();
      reject(new TimeoutError(`timed out after ${Math.round(opts.timeoutMs / 1000)}s`));
    }, opts.timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err.code === "ENOENT") reject(new LlmSetupError(missing));
      else reject(err);
    });
    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // Windows runs commands through cmd.exe, which reports a missing program
      // as exit code 1 / 9009 instead of ENOENT.
      if (code !== 0 && /is not recognized as an internal or external command|command not found/i.test(stderr)) {
        reject(new LlmSetupError(missing));
        return;
      }
      resolve({ code, stdout, stderr });
    });
    child.stdin.on("error", () => {
      // process exited before reading stdin; the close handler reports it
    });
    child.stdin.end(opts.input ?? "");
  });
}

async function callClaudeCli(
  prompt: string,
  model: string,
  system: string | undefined,
  timeoutMs: number
): Promise<ClaudeResult> {
  // Fresh empty working dir: no project CLAUDE.md, hooks or MCP config apply.
  const dir = mkdtempSync(join(tmpdir(), "applystack-llm-"));
  try {
    let systemFile: string | null = null;
    if (system) {
      systemFile = join(dir, "system.txt");
      writeFileSync(systemFile, system);
    }
    const res = await runProcess(claudeCommand(), buildClaudeArgs(model, systemFile), {
      input: prompt, // via stdin: avoids Windows' 32K command-line limit
      timeoutMs,
      cwd: dir,
      env: claudeEnv(),
    });
    if (!res.stdout.trim()) {
      throw new LlmCallError(
        `Claude Code exited with code ${res.code}${res.stderr.trim() ? `: ${res.stderr.trim().slice(0, 300)}` : ""}`
      );
    }
    return parseClaudeOutput(res.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// codex_cli backend
// ---------------------------------------------------------------------------

const CODEX_MISSING =
  "Codex CLI isn't installed (the `codex` command wasn't found). Install it with `npm install -g @openai/codex`, run `codex login` once to sign in with ChatGPT, or set CODEX_CLI_PATH.";

/** Env for `codex` subprocesses: never pass API-billing credentials. */
export function codexEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...base };
  delete env.OPENAI_API_KEY;
  delete env.CODEX_API_KEY;
  return env;
}

function codexCommand(): string {
  return process.env.CODEX_CLI_PATH || "codex";
}

export function buildCodexArgs(model: string, lastMessageFile: string): string[] {
  return [
    "exec",
    "--model", model,
    "--sandbox", "read-only", // ApplyStack only needs text back
    "--skip-git-repo-check", // runs in an empty temp folder
    "--ephemeral", // don't save a session to the user's history
    "--output-last-message", lastMessageFile,
    "-", // prompt from stdin
  ];
}

/**
 * Codex has no separate system-prompt flag, so the instructions go first in
 * the prompt, clearly fenced from the task.
 */
export function codexPrompt(prompt: string, system: string | undefined): string {
  if (!system) return prompt;
  return `<instructions>\n${system}\n</instructions>\n\nFollow the instructions above. Do not run commands or read files; answer from the text below only.\n\n<task>\n${prompt}\n</task>`;
}

async function callCodexCli(
  prompt: string,
  model: string,
  system: string | undefined,
  timeoutMs: number
): Promise<ClaudeResult> {
  const dir = mkdtempSync(join(tmpdir(), "applystack-codex-"));
  try {
    const outFile = join(dir, "last-message.txt");
    const res = await runProcess(codexCommand(), buildCodexArgs(model, outFile), {
      input: codexPrompt(prompt, system),
      timeoutMs,
      cwd: dir,
      env: codexEnv(),
      missing: CODEX_MISSING,
    });
    let text = "";
    try {
      text = readFileSync(outFile, "utf8").trim();
    } catch {
      text = res.code === 0 ? res.stdout.trim() : "";
    }
    if (res.code !== 0 || !text) {
      const detail = (res.stderr || res.stdout).trim().split("\n").slice(-4).join(" ").slice(0, 300);
      if (/not logged in|unauthori[sz]ed|\b401\b|codex login|please (log|sign) in/i.test(detail)) {
        throw new LlmSetupError(
          `Codex CLI isn't signed in (${detail.slice(0, 160)}). Run \`codex login\` in a terminal once and sign in with your ChatGPT account.`
        );
      }
      if (/model/i.test(detail) && /not (found|supported|available)|unknown|does not exist/i.test(detail)) {
        throw new LlmSetupError(`Codex doesn't accept the model "${model}" (${detail.slice(0, 160)}). Change it in Settings → AI backend.`);
      }
      throw new LlmCallError(`Codex CLI exited with code ${res.code}${detail ? `: ${detail}` : " and no answer"}`);
    }
    return { text, costUsd: null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// anthropic / openai / gemini backends (Vercel AI SDK)
// ---------------------------------------------------------------------------

async function callApi(
  provider: "anthropic" | "openai" | "gemini",
  prompt: string,
  model: string,
  system: string | undefined,
  tier: Tier,
  timeoutMs: number
): Promise<ClaudeResult> {
  const envName = API_KEY_ENV[provider];
  const apiKey = process.env[envName];
  if (!apiKey) {
    throw new LlmSetupError(`${envName} isn't set. Add it to .env.local and restart ApplyStack, or pick another backend.`);
  }
  const { generateText } = await import("ai");
  let languageModel;
  if (provider === "anthropic") {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    languageModel = createAnthropic({ apiKey })(model);
  } else if (provider === "openai") {
    const { createOpenAI } = await import("@ai-sdk/openai");
    languageModel = createOpenAI({ apiKey })(model);
  } else {
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    languageModel = createGoogleGenerativeAI({ apiKey })(model);
  }
  try {
    const { text } = await generateText({
      model: languageModel,
      ...(system ? { instructions: system } : {}),
      prompt,
      maxOutputTokens: MAX_OUTPUT_TOKENS[tier],
      maxRetries: 0, // askLlm owns retrying
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    if (!text) throw new LlmCallError(`${provider} returned an empty response.`);
    return { text, costUsd: null };
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new TimeoutError(`timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 401 || status === 403) {
      throw new LlmSetupError(`${provider} rejected the API key in ${envName} (HTTP ${status}).`);
    }
    if (status === 404) {
      throw new LlmSetupError(`${provider} doesn't recognise the model "${model}". Change it in Settings → AI backend.`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// askLlm
// ---------------------------------------------------------------------------

type Transport = (args: {
  provider: ModelProvider;
  prompt: string;
  model: string;
  system: string | undefined;
  tier: Tier;
  timeoutMs: number;
}) => Promise<ClaudeResult>;

const defaultTransport: Transport = ({ provider, prompt, model, system, tier, timeoutMs }) =>
  provider === "claude_cli"
    ? callClaudeCli(prompt, model, system, timeoutMs)
    : provider === "codex_cli"
      ? callCodexCli(prompt, model, system, timeoutMs)
      : callApi(provider, prompt, model, system, tier, timeoutMs);

/** Swappable for unit tests only. */
export const _internals = { transport: defaultTransport, retryDelayMs: 1500 };

/**
 * Ask the configured model a question and return its text answer.
 * "fast" = parsing/extraction steps; "smart" = resume and cover-letter writing.
 * Times out per attempt and retries once; setup problems are not retried.
 */
export async function askLlm(prompt: string, tier: Tier = "fast", system?: string | null): Promise<string> {
  const settings = loadLlmSettings();
  if (settings.provider === "offline") {
    throw new LlmSetupError("The AI backend is set to Offline. Pick a model backend in Settings → AI backend.");
  }
  const provider = settings.provider;
  const model = tier === "smart" ? settings.model_smart : settings.model_fast;
  const timeoutMs = (settings.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS[tier]) * 1000;

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    try {
      const { text, costUsd } = await _internals.transport({
        provider,
        prompt,
        model,
        system: system ?? undefined,
        tier,
        timeoutMs,
      });
      const cost = costUsd !== null ? ` est_cost=$${costUsd.toFixed(4)}` : "";
      console.info(
        `[llm] ok provider=${provider} model=${model} tier=${tier} attempt=${attempt} ${((Date.now() - started) / 1000).toFixed(1)}s${cost}`
      );
      return text;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[llm] fail provider=${provider} model=${model} tier=${tier} attempt=${attempt} ${((Date.now() - started) / 1000).toFixed(1)}s: ${msg}`
      );
      if (err instanceof LlmSetupError) throw err;
      if (attempt === 1) await new Promise((r) => setTimeout(r, _internals.retryDelayMs));
    }
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new LlmCallError(`The ${provider} backend (${model}) failed twice: ${msg}`);
}

// ---------------------------------------------------------------------------
// Readiness check (startup, settings changes, before each AI action)
// ---------------------------------------------------------------------------

export interface LlmStatus {
  ok: boolean;
  provider: Provider;
  model_fast: string;
  model_smart: string;
  message: string;
  /** Non-blocking caveat, e.g. Claude Code is configured to use an API key. */
  warning?: string;
}

const statusCache = new Map<string, { at: number; status: LlmStatus }>();
const STATUS_TTL_MS = 5 * 60_000;

export async function checkLlmBackend(opts: { fresh?: boolean } = {}): Promise<LlmStatus> {
  const s = loadLlmSettings();
  const key = `${s.provider}|${s.model_fast}|${s.model_smart}`;
  const cached = statusCache.get(key);
  if (!opts.fresh && cached && Date.now() - cached.at < STATUS_TTL_MS) return cached.status;

  const base = { provider: s.provider, model_fast: s.model_fast, model_smart: s.model_smart };
  let status: LlmStatus;

  if (s.provider === "offline") {
    status = { ...base, ok: true, message: "Offline: the deterministic engine runs without any model." };
  } else if (s.provider === "claude_cli") {
    status = await checkClaudeCli(base);
  } else if (s.provider === "codex_cli") {
    status = await checkCodexCli(base);
  } else {
    const envName = API_KEY_ENV[s.provider];
    status = process.env[envName]
      ? { ...base, ok: true, message: `${envName} is set. Using ${s.model_fast} (fast) and ${s.model_smart} (smart).` }
      : { ...base, ok: false, message: `${envName} isn't set. Add it to .env.local and restart ApplyStack, or pick another backend.` };
  }

  statusCache.set(key, { at: Date.now(), status });
  return status;
}

async function checkClaudeCli(base: Omit<LlmStatus, "ok" | "message">): Promise<LlmStatus> {
  const env = claudeEnv();
  try {
    const version = await runProcess(claudeCommand(), ["--version"], { timeoutMs: 20_000, env });
    if (version.code !== 0) {
      return { ...base, ok: false, message: `\`claude --version\` failed: ${(version.stderr || version.stdout).trim().slice(0, 200)}` };
    }
    const auth = await runProcess(claudeCommand(), ["auth", "status", "--json"], { timeoutMs: 20_000, env });
    let info: { loggedIn?: boolean; authMethod?: string } = {};
    try {
      info = JSON.parse(auth.stdout.trim());
    } catch {
      // older CLI without `auth status --json`; fall through to the generic check
    }
    if (info.loggedIn === false) {
      return {
        ...base,
        ok: false,
        message: "Claude Code is installed but not logged in. Run `claude` in a terminal once and sign in with your Claude account.",
      };
    }
    const versionText = version.stdout.trim().split("\n")[0];
    const status: LlmStatus = {
      ...base,
      ok: true,
      message: `Claude Code ${versionText} is ready${info.authMethod ? ` (login: ${info.authMethod})` : ""}. Using ${base.model_fast} (fast) and ${base.model_smart} (smart).`,
    };
    if (info.authMethod && /api[_ ]?key/i.test(info.authMethod)) {
      status.warning =
        "Claude Code itself is configured with an API key (e.g. apiKeyHelper), so calls will bill that key rather than your Claude plan.";
    }
    return status;
  } catch (err) {
    return { ...base, ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

async function checkCodexCli(base: Omit<LlmStatus, "ok" | "message">): Promise<LlmStatus> {
  const env = codexEnv();
  try {
    const version = await runProcess(codexCommand(), ["--version"], { timeoutMs: 20_000, env, missing: CODEX_MISSING });
    if (version.code !== 0) {
      return { ...base, ok: false, message: `\`codex --version\` failed: ${(version.stderr || version.stdout).trim().slice(0, 200)}` };
    }
    const login = await runProcess(codexCommand(), ["login", "status"], { timeoutMs: 20_000, env, missing: CODEX_MISSING });
    const said = `${login.stdout}\n${login.stderr}`.trim();
    if (login.code !== 0 || /not logged in/i.test(said)) {
      return {
        ...base,
        ok: false,
        message: "Codex CLI is installed but not signed in. Run `codex login` in a terminal once and sign in with your ChatGPT account.",
      };
    }
    const versionText = version.stdout.trim().split("\n")[0];
    const status: LlmStatus = {
      ...base,
      ok: true,
      message: `${versionText} is ready (${said.split("\n")[0] || "signed in"}). Using ${base.model_fast} (fast) and ${base.model_smart} (smart).`,
    };
    if (/api key/i.test(said) && !/chatgpt/i.test(said)) {
      status.warning = "Codex CLI is signed in with an API key, so calls will bill that key rather than your ChatGPT plan. Run `codex login` to switch to ChatGPT sign-in.";
    }
    return status;
  } catch (err) {
    return { ...base, ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Throw a clear LlmSetupError before starting multi-step AI work. */
export async function assertLlmReady(): Promise<LlmSettings> {
  const status = await checkLlmBackend();
  if (!status.ok) throw new LlmSetupError(status.message);
  return loadLlmSettings();
}
