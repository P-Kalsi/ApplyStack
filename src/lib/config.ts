// applystack.config.json: per-computer settings (AI backend, internship feed,
// Discord alerts). Never holds secrets: API keys and the Discord webhook URL
// come from environment variables only.
//
// Each feature owns one part of the file and saves it through writeConfig(),
// which keeps the other parts intact.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type ConfigFile = Record<string, unknown>;

export function configPath(): string {
  return process.env.APPLYSTACK_CONFIG || join(process.cwd(), "applystack.config.json");
}

export function readConfig(): ConfigFile {
  const path = configPath();
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as ConfigFile) : {};
  } catch {
    console.warn(`[config] ${path} is not valid JSON; using defaults.`);
    return {};
  }
}

/** Replace the file with `next` (callers merge from readConfig() first). */
export function writeConfig(next: ConfigFile): void {
  writeFileSync(configPath(), JSON.stringify(next, null, 2) + "\n");
}
