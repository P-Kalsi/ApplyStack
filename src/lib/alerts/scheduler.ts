// Background loop for Discord alerts. Started once from instrumentation.ts on
// server start; checks every minute whether an alert run is due, so changes in
// Settings (on/off, interval, filters) apply without a restart.

import { discordWebhookUrl, loadFeedSettings } from "../jobs/feed-settings";
import { loadAlertState, runAlertCheck } from "./discord";

const g = globalThis as unknown as { __applystackAlerts?: { timer: NodeJS.Timeout; running: boolean } };

export function isAlertDue(lastRunAt: string | null, intervalMinutes: number, now = Date.now()): boolean {
  if (!lastRunAt) return true;
  const last = Date.parse(lastRunAt);
  return Number.isNaN(last) || now - last >= intervalMinutes * 60_000;
}

async function tick() {
  const state = g.__applystackAlerts;
  if (!state || state.running) return;
  const settings = loadFeedSettings();
  if (!settings.alerts.enabled || !discordWebhookUrl()) return;
  if (!isAlertDue(loadAlertState().last_run_at, settings.alerts.interval_minutes)) return;
  state.running = true;
  try {
    const res = await runAlertCheck();
    (res.ok ? console.info : console.warn)(`[alerts] ${res.message}`);
  } catch (err) {
    console.warn(`[alerts] ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    state.running = false;
  }
}

export function startAlertScheduler(): void {
  if (g.__applystackAlerts) return;
  const timer = setInterval(tick, 60_000);
  timer.unref?.();
  g.__applystackAlerts = { timer, running: false };
  setTimeout(tick, 15_000).unref?.();
  const s = loadFeedSettings();
  if (discordWebhookUrl()) {
    console.info(
      s.alerts.enabled
        ? `[alerts] Discord alerts on: checking every ${s.alerts.interval_minutes} min while ApplyStack runs.`
        : "[alerts] Discord alerts are off (Settings → Internship feed & alerts)."
    );
  }
}
