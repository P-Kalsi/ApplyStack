// Structured Anthropic calls with Zod validation and a single retry on
// malformed output. The model name always comes from ANTHROPIC_MODEL.

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "./json";
import type { BuiltPrompt } from "./prompts";

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function configuredModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
}

interface SchemaLike<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: { message: string } };
}

async function completeText(client: Anthropic, prompt: BuiltPrompt, extraUser?: string): Promise<string> {
  const res = await client.messages.create({
    model: configuredModel(),
    max_tokens: prompt.maxTokens,
    system: prompt.system,
    messages: [
      {
        role: "user",
        content: extraUser ? `${prompt.user}\n\n${extraUser}` : prompt.user,
      },
    ],
  });
  return res.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/**
 * Call the model and validate the response against a Zod schema.
 * On a malformed response, retry exactly once with the validation error
 * included so the model can correct itself.
 */
export async function callStructured<T>(schema: SchemaLike<T>, prompt: BuiltPrompt): Promise<T> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await completeText(
      client,
      prompt,
      attempt === 0
        ? undefined
        : `Your previous response was invalid: ${lastError}\nReturn ONLY a corrected JSON object.`
    );
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
