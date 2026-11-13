// Runs once when the ApplyStack server starts: check the configured AI
// backend (Claude Code installed + logged in, or the needed API key set) and
// print a clear message, instead of failing in the middle of tailoring later.
// Also starts the Discord alert loop (does nothing until a webhook is set).
//
// The import must sit inside a positive NEXT_RUNTIME === "nodejs" check so the
// edge build drops it (llm.ts needs node:child_process / node:fs).

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkLlmBackend } = await import("./lib/ai/llm");
    const status = await checkLlmBackend({ fresh: true });
    const line = `[llm] AI backend ${status.provider}: ${status.message}`;
    if (status.ok) console.info(line);
    else console.warn(`${line}\n[llm] Change it in Settings → AI backend.`);
    if (status.warning) console.warn(`[llm] ${status.warning}`);

    const { startAlertScheduler } = await import("./lib/alerts/scheduler");
    startAlertScheduler();
  }
}
