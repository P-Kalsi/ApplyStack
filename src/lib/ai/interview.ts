// Interview prep with the configured AI backend (smart tier), checked by
// src/lib/interview/prep.ts. One automatic retry when a story breaks a rule;
// what's still wrong after that is shown to you.

import { z } from "zod";
import { callStructured } from "./structured";
import { assertLlmReady } from "./llm";
import { buildPrepPrompt, checkPrep, prepFeedback, type CheckedPrep, type RawPrep } from "../interview/prep";
import type { JobRow, VaultSnapshot } from "../types";

const s = (max: number) => z.string().max(max).default("");
const RawSchema = z.object({
  stories: z
    .array(
      z.object({
        title: s(120),
        requirement: s(200),
        situation: s(800),
        task: s(800),
        action: s(1200),
        result: s(800),
        reflection_prompt: s(300),
        facts: z.array(z.string().max(10)).max(20).default([]),
      })
    )
    .max(10),
  topics: z.array(z.object({ topic: s(80), why: s(300) })).max(12).default([]),
  questions_to_ask: z.array(z.string().max(300)).max(10).default([]),
});

export async function draftInterviewPrep(
  job: Pick<JobRow, "title" | "company" | "description_text">,
  vault: VaultSnapshot,
  requirements: string[]
): Promise<CheckedPrep & { provider: string; model: string }> {
  const settings = await assertLlmReady();
  if (settings.provider === "offline") {
    throw new Error("Interview prep needs an AI backend. Pick one in Settings → AI backend.");
  }
  const run = async (feedback: string[]) =>
    checkPrep((await callStructured(RawSchema, buildPrepPrompt(job, vault, requirements, feedback), "smart")) as RawPrep, vault);
  let prep = await run([]);
  const problems = prepFeedback(prep);
  if (problems.length) {
    const second = await run(problems);
    if (prepFeedback(second).length <= problems.length) prep = second;
  }
  return { ...prep, provider: settings.provider, model: settings.model_smart };
}
