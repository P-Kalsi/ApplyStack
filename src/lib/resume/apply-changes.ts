// Apply a reviewed set of tailoring changes to the master resume.
// Only accepted/edited changes are applied; proposed and rejected changes
// leave the original text in place. Works for LaTeX and Word masters.
// Pure and unit-tested.

import type { ResumeChangeStatus, ResumeChangeType } from "../types";
import type { BlockOverride } from "./latex";
import { parseResumeDocument, serializeResumeDocument, type ResumeFormat } from "./document";

export interface ChangeInput {
  block_id: string;
  change_type: ResumeChangeType;
  status: ResumeChangeStatus;
  /** Text to use when the change is applied (tailored or user-edited). */
  current_text: string;
}

export function isApplied(status: ResumeChangeStatus): boolean {
  return status === "accepted" || status === "edited";
}

export function applyChangesToDocument(
  master: string,
  changes: ChangeInput[],
  format: ResumeFormat
): string {
  const parsed = parseResumeDocument(master, format);
  const overrides = new Map<string, BlockOverride>();
  for (const change of changes) {
    if (!isApplied(change.status)) continue;
    if (change.change_type === "remove") {
      overrides.set(change.block_id, { remove: true });
    } else {
      overrides.set(change.block_id, { text: change.current_text });
    }
  }
  return serializeResumeDocument(parsed, format, overrides);
}

/** LaTeX convenience wrapper (kept for existing callers and tests). */
export function applyChangesToLatex(masterLatex: string, changes: ChangeInput[]): string {
  return applyChangesToDocument(masterLatex, changes, "latex");
}

/** Count how many changes would actually modify the document. */
export function countApplied(changes: Pick<ChangeInput, "status">[]): number {
  return changes.filter((c) => isApplied(c.status)).length;
}
