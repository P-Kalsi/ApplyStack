// Draft a cover letter with the configured AI backend (smart tier).
// See src/lib/letters/letters.ts for the prompt and the checks. A draft that
// breaks a rule gets one automatic retry with the problems listed; whatever
// is still wrong after that is shown to you, never silently passed.

import { z } from "zod";
import { callStructured } from "./structured";
import { assertLlmReady } from "./llm";
import {
  buildLetterPrompt,
  checkLetter,
  letterFeedback,
  pickSamples,
  type CheckedLetter,
  type LetterFocus,
  type LetterTone,
  type RawLetter,
  type WritingSample,
} from "../letters/letters";
import type { JobRow, VaultSnapshot } from "../types";

const RawSchema = z.object({
  paragraphs: z
    .array(z.object({ text: z.string().max(3000), facts: z.array(z.string().max(10)).max(30).default([]) }))
    .max(8),
  gaps: z.array(z.string().max(200)).max(10).default([]),
});

export async function draftCoverLetter(
  job: Pick<JobRow, "title" | "company" | "location" | "description_text" | "skills">,
  vault: VaultSnapshot,
  samples: WritingSample[],
  focus: LetterFocus,
  tone: LetterTone
): Promise<CheckedLetter & { provider: string; model: string }> {
  const settings = await assertLlmReady();
  if (settings.provider === "offline") {
    throw new Error("Writing cover letters needs an AI backend. Pick one in Settings → AI backend.");
  }
  const picked = pickSamples(samples, job);
  const run = async (feedback: string[]) =>
    checkLetter(
      (await callStructured(RawSchema, buildLetterPrompt(job, vault, picked, focus, tone, feedback), "smart")) as RawLetter,
      vault
    );

  let checked = await run([]);
  const problems = letterFeedback(checked);
  if (problems.length) {
    const second = await run(problems);
    if (letterFeedback(second).length <= problems.length) checked = second;
  }
  return { ...checked, provider: settings.provider, model: settings.model_smart };
}
