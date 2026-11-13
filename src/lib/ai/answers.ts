// Draft answers to application questions with the configured AI backend.
// See src/lib/answers/answers.ts for the prompt and the checks.

import { z } from "zod";
import { callStructured } from "./structured";
import { assertLlmReady } from "./llm";
import {
  answerTier,
  buildAnswerPrompt,
  checkAnswer,
  type AnswerRequest,
  type CheckedAnswer,
  type RawAnswer,
} from "../answers/answers";
import type { JobRow, VaultSnapshot } from "../types";

const RawSchema = z.object({
  drafts: z
    .array(z.object({ text: z.string().max(4000), facts: z.array(z.string().max(10)).max(30).default([]) }))
    .max(4)
    .default([]),
  choice: z
    .object({ option: z.string().max(300), reason: z.string().max(600), facts: z.array(z.string().max(10)).max(30).default([]) })
    .nullable()
    .default(null),
  unsupported: z.string().max(800).default(""),
});

export async function draftAnswers(
  req: AnswerRequest,
  vault: VaultSnapshot,
  job: Pick<JobRow, "title" | "company" | "description_text"> | null
): Promise<CheckedAnswer & { model: string }> {
  const settings = await assertLlmReady();
  if (settings.provider === "offline") {
    throw new Error("Drafting answers needs an AI backend. Pick one in Settings → AI backend.");
  }
  const tier = answerTier(req);
  const prompt = buildAnswerPrompt(req, vault, job);
  let checked = checkAnswer((await callStructured(RawSchema, prompt, tier)) as RawAnswer, req, vault);

  // Every draft over the limit: ask once more, firmly.
  if (req.charLimit && checked.drafts.length && checked.drafts.every((d) => d.length > req.charLimit!)) {
    const retry = {
      ...prompt,
      user: `${prompt.user}\n\nYour previous drafts were too long. Each draft MUST be at most ${req.charLimit} characters including spaces. Cut words, not facts.`,
    };
    checked = checkAnswer((await callStructured(RawSchema, retry, tier)) as RawAnswer, req, vault);
  }
  return { ...checked, model: tier === "smart" ? settings.model_smart : settings.model_fast };
}
