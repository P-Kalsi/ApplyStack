// Format dispatch for master resumes: LaTeX source or Word document.xml.
// Everything downstream (tailoring, change application, fact extraction,
// review/print views) goes through these functions.

import { docxPlainText, parseDocxResume, serializeDocxResume } from "./docx";
import {
  bulletPlain,
  getBullets,
  latexToPlain,
  parseResume,
  serializeResume,
  type BlockOverride,
  type BulletBlock,
  type ParsedResume,
} from "./latex";

export type ResumeFormat = "latex" | "docx";

export function normalizeFormat(format: string | null | undefined): ResumeFormat {
  return format === "docx" ? "docx" : "latex";
}

export function parseResumeDocument(content: string, format: ResumeFormat): ParsedResume {
  return format === "docx" ? parseDocxResume(content) : parseResume(content);
}

export function serializeResumeDocument(
  parsed: ParsedResume,
  format: ResumeFormat,
  overrides?: Map<string, BlockOverride>
): string {
  return format === "docx" ? serializeDocxResume(parsed, overrides) : serializeResume(parsed, overrides);
}

export function documentBullets(content: string, format: ResumeFormat): BulletBlock[] {
  return getBullets(parseResumeDocument(content, format));
}

/** Plain text of the whole resume (for keyword coverage and previews). */
export function documentPlainText(content: string, format: ResumeFormat): string {
  if (format === "docx") return docxPlainText(content);
  const parsed = parseResume(content);
  return parsed.blocks
    .map((b) => (b.kind === "bullet" ? bulletPlain(b) : latexToPlain(b.raw)))
    .join("\n");
}

export interface OutlineLine {
  kind: "heading" | "line" | "bullet";
  text: string;
  blockId?: string;
}

/** Simple structural outline used by the print view. */
export function documentOutline(content: string, format: ResumeFormat): OutlineLine[] {
  const parsed = parseResumeDocument(content, format);
  const lines: OutlineLine[] = [];
  let lastSection: string | null = null;
  for (const block of parsed.blocks) {
    if (block.kind === "text") {
      if (format === "docx" && block.display) {
        const isHeading = /^[A-Z][A-Z &/]+$/.test(block.display) && block.display.length <= 40;
        lines.push({ kind: isHeading ? "heading" : "line", text: block.display });
      }
      continue;
    }
    if (format === "latex" && block.section !== lastSection) {
      lines.push({ kind: "heading", text: block.section || "Content" });
      lastSection = block.section;
    }
    lines.push({
      kind: block.role === "skills" ? "line" : "bullet",
      text: block.role === "skills" && block.entry ? `${block.entry}: ${block.text}` : bulletPlain(block),
      blockId: block.id,
    });
  }
  return lines;
}
