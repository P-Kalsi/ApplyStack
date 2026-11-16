// Outreach drafts with the configured AI backend (fast tier for LinkedIn
// notes, smart for emails), checked by src/lib/outreach/outreach.ts with one
// automatic retry.

import { z } from "zod";
import { callStructured } from "./structured";
import { assertLlmReady } from "./llm";
import { pickSamples, type WritingSample } from "../letters/letters";
import { buildOutreachPrompt, checkOutreach, outreachKind, type CheckedOutreach, type OutreachKind, type RawOutreach } from "../outreach/outreach";
import type { JobRow, VaultSnapshot } from "../types";

const RawSchema = z.object({
  subject: z.string().max(200).default(""),
  body: z.string().max(4000),
  facts: z.array(z.string().max(10)).max(20).default([]),
});

export async function draftOutreach(
  job: Pick<JobRow, "title" | "company" | "description_text" | "skills">,
  vault: VaultSnapshot,
  samples: WritingSample[],
  kind: OutreachKind,
  recipient: string
): Promise<CheckedOutreach> {
  const settings = await assertLlmReady();
  if (settings.provider === "offline") {
    throw new Error("Outreach drafts need an AI backend. Pick one in Settings → AI backend.");
  }
  const tier = (outreachKind(kind)?.limit ?? 0) <= 300 ? "fast" : "smart";
  const picked = pickSamples(samples, job, 2);
  const run = async (feedback: string[]) =>
    checkOutreach(
      (await callStructured(RawSchema, buildOutreachPrompt(job, vault, picked, kind, recipient, feedback), tier)) as RawOutreach,
      kind,
      vault
    );
  let draft = await run([]);
  if (draft.issues.length) {
    const second = await run(draft.issues);
    if (second.issues.length <= draft.issues.length) draft = second;
  }
  return draft;
}
