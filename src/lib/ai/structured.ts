// Structured (JSON) calls on top of askLlm: validate every response with Zod
// and, if the model returns malformed JSON, ask once more with the validation
// error. (Network/timeout retries happen inside askLlm.)

import { askLlm, type Tier } from "./llm";
import { extractJson } from "./json";
import type { BuiltPrompt } from "./prompts";

interface SchemaLike<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: { message: string } };
}

export async function callStructured<T>(schema: SchemaLike<T>, prompt: BuiltPrompt, tier: Tier): Promise<T> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const user =
      attempt === 0
        ? prompt.user
        : `${prompt.user}\n\nYour previous response was invalid: ${lastError}\nReturn ONLY a corrected JSON object.`;
    const text = await askLlm(user, tier, prompt.system);
    let candidate: unknown;
    try {
      candidate = extractJson(text);
    } catch (e) {
      lastError = e instanceof Error ? e.message : "No JSON found.";
      continue;
    }
    const parsed = schema.safeParse(candidate);
    if (parsed.success) return parsed.data;
    lastError = parsed.error.message;
  }
  throw new Error(`AI response failed validation after retry: ${lastError}`);
}
