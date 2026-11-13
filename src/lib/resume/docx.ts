// Word (.docx) resume parsing and format-preserving serialization.
//
// Mirrors latex.ts: the document body (word/document.xml) is split into
// blocks. Every paragraph the tailor must not touch (name, contact line,
// section headings, job/project heading lines with their right-aligned dates)
// stays an opaque text block and is emitted byte-for-byte. Only two kinds of
// paragraphs become editable:
//   - list paragraphs (Word bullets, <w:numPr>) inside a section
//   - "Label: a, b, c" lines in a skills/additional section (the label run
//     is kept; only the value after the colon is editable)
//
// With no overrides, serialization reproduces the original XML exactly.
// A rewritten paragraph keeps its paragraph properties (bullet, indent, tab
// stops, spacing) and the run formatting (font, size, colour) of its first
// text run, so the result looks identical in Word.
//
// Dependency-free; unit-tested.

import type { BlockOverride, BulletBlock, ParsedResume, ResumeBlock } from "./latex";

const TAG_RE = /<(\/?)(w:[A-Za-z]+)\b[^>]*?(\/?)>/g;

export function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

export function encodeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Visible text of a paragraph (or any XML fragment): w:t text, tabs as \t. */
export function paragraphText(xml: string): string {
  let out = "";
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[0].startsWith("<w:tab")) out += "\t";
    else if (m[0].startsWith("<w:br")) out += "\n";
    else out += decodeXml(m[1]);
  }
  return out;
}

interface BodyElement {
  start: number;
  end: number; // exclusive
  tag: string;
}

/** Top-level children of <w:body>, located by a depth-tracking scan. */
function bodyElements(xml: string, bodyStart: number, bodyEnd: number): BodyElement[] {
  const out: BodyElement[] = [];
  TAG_RE.lastIndex = bodyStart;
  let depth = 0;
  let open: { start: number; tag: string } | null = null;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(xml)) !== null && m.index < bodyEnd) {
    const [full, closing, tag, selfClosing] = m;
    if (closing) {
      depth--;
      if (depth === 0 && open) {
        out.push({ start: open.start, end: m.index + full.length, tag: open.tag });
        open = null;
      }
    } else if (selfClosing) {
      if (depth === 0) out.push({ start: m.index, end: m.index + full.length, tag });
    } else {
      if (depth === 0) open = { start: m.index, tag };
      depth++;
    }
  }
  return out;
}

const SECTION_NAMES =
  /^(education|experience|work experience|professional experience|projects?|technical projects|skills|technical skills|additional|additional information|volunteer(ing)?( experience)?|leadership|awards|certifications?|publications|research( experience)?|interests|summary|profile|coursework|relevant coursework|activities|extracurriculars?)$/i;

function isSectionHeading(text: string): boolean {
  const t = text.replace(/\t/g, " ").replace(/\s+/g, " ").trim();
  if (t.length < 3 || t.length > 40) return false;
  if (SECTION_NAMES.test(t)) return true;
  // Fallback: short ALL-CAPS line with no entry markers.
  return /^[A-Z &/]+$/.test(t) && t.split(" ").length <= 3 && !/\t/.test(text.trim());
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function isListParagraph(p: string): boolean {
  const pPr = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
  return /<w:numPr>/.test(pPr) || /<w:pStyle w:val="List(Bullet|Paragraph)[^"]*"/.test(pPr);
}

const SKILLS_SECTION = /skill|additional|technical/i;
const SKILLS_LINE = /^([^:\t\n]{2,40}):(\s*)(\S[\s\S]*)$/;

export function parseDocxResume(xml: string): ParsedResume {
  const bodyOpen = xml.match(/<w:body\b[^>]*>/);
  const bodyClose = xml.lastIndexOf("</w:body>");
  if (!bodyOpen || bodyClose === -1) throw new Error("word/document.xml has no <w:body>.");
  const bodyStart = (bodyOpen.index ?? 0) + bodyOpen[0].length;

  const blocks: ResumeBlock[] = [];
  let cursor = 0;
  let textSeq = 0;
  let bulletSeq = 0;
  let section: string | null = null;
  let entry: string | null = null;
  // The first plain line after a heading or a bullet starts a new entry
  // (e.g. "BUZZBOX VENDING\tHybrid"); the next line (role/dates) does not.
  let expectingEntry = false;

  const pushText = (end: number, display?: string) => {
    if (end > cursor) {
      blocks.push({ kind: "text", id: `t${textSeq++}`, raw: xml.slice(cursor, end), display });
      cursor = end;
    }
  };

  for (const el of bodyElements(xml, bodyStart, bodyClose)) {
    if (el.tag !== "w:p") continue; // tables, sectPr, bookmarks: untouched text
    const p = xml.slice(el.start, el.end);
    const text = paragraphText(p);
    const visible = text.replace(/\s+/g, " ").trim();
    if (!visible) continue;

    const list = isListParagraph(p);
    if (!list && isSectionHeading(text)) {
      pushText(el.start);
      pushText(el.end, visible);
      section = titleCase(visible);
      entry = null;
      expectingEntry = true;
      continue;
    }

    if (section && list) {
      pushText(el.start);
      blocks.push({
        kind: "bullet",
        id: `b${bulletSeq++}`,
        pre: "",
        text: visible,
        post: "",
        section,
        entry,
        plain: true,
        role: "bullet",
        raw: p,
      } satisfies BulletBlock);
      cursor = el.end;
      expectingEntry = true;
      continue;
    }

    const skills = !list && section && SKILLS_SECTION.test(section) ? text.match(SKILLS_LINE) : null;
    if (skills) {
      pushText(el.start);
      blocks.push({
        kind: "bullet",
        id: `b${bulletSeq++}`,
        pre: "",
        text: skills[3].replace(/\s+/g, " ").trim(),
        post: "",
        section: "Skills",
        entry: skills[1].trim(),
        plain: true,
        role: "skills",
        raw: p,
      } satisfies BulletBlock);
      cursor = el.end;
      continue;
    }

    // Any other paragraph (name, contact line, job/project heading).
    pushText(el.start);
    pushText(el.end, visible);
    if (section && expectingEntry) {
      entry = text.split(/\t| \| /)[0].replace(/\s+/g, " ").trim();
      expectingEntry = false;
    }
  }

  if (cursor < xml.length) {
    blocks.push({ kind: "text", id: `t${textSeq++}`, raw: xml.slice(cursor) });
  }
  return { blocks };
}

// ---------------------------------------------------------------------------
// Rebuilding edited paragraphs
// ---------------------------------------------------------------------------

const RUN_RE = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;

function runRPr(run: string): string {
  return run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
}

function textRun(rPr: string, text: string): string {
  return `<w:r>${rPr}<w:t xml:space="preserve">${encodeXml(text)}</w:t></w:r>`;
}

function paragraphShell(p: string): { open: string; pPr: string } {
  const open = p.match(/^<w:p\b[^>]*>/)?.[0] ?? "<w:p>";
  const pPr = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
  return { open, pPr };
}

/** Replace a bullet paragraph's text, keeping its paragraph and run formatting. */
export function rebuildBulletParagraph(p: string, text: string): string {
  const { open, pPr } = paragraphShell(p);
  const runs = p.match(RUN_RE) ?? [];
  const firstTextRun = runs.find((r) => /<w:t[\s>]/.test(r)) ?? "";
  return `${open}${pPr}${textRun(runRPr(firstTextRun), text)}</w:p>`;
}

/** Replace the value of a "Label: a, b, c" line, keeping the label runs intact. */
export function rebuildSkillsParagraph(p: string, value: string): string {
  const { open, pPr } = paragraphShell(p);
  const runs = p.match(RUN_RE) ?? [];
  const out: string[] = [];
  let valueRPr: string | null = null;
  let labelDone = false;
  let lead = " ";

  for (const run of runs) {
    if (labelDone) {
      if (valueRPr === null && /<w:t[\s>]/.test(run)) valueRPr = runRPr(run);
      continue;
    }
    const t = paragraphText(run);
    const colon = t.indexOf(":");
    if (colon === -1) {
      out.push(run);
      continue;
    }
    labelDone = true;
    const after = t.slice(colon + 1);
    lead = after.match(/^\s*/)?.[0] || " ";
    if (after.trim().length === 0) {
      out.push(run); // label run ends at the colon
    } else {
      // Label and value share a run: split it at the colon.
      out.push(textRun(runRPr(run), t.slice(0, colon + 1)));
      valueRPr = runRPr(run).replace(/<w:b\/>|<w:bCs\/>|<w:b w:val="(true|1)"\/>/g, "");
    }
  }
  if (!labelDone) return rebuildBulletParagraph(p, value);
  return `${open}${pPr}${out.join("")}${textRun(valueRPr ?? "", lead + value)}</w:p>`;
}

export function serializeDocxResume(
  parsed: ParsedResume,
  overrides?: Map<string, BlockOverride>
): string {
  let out = "";
  for (const block of parsed.blocks) {
    if (block.kind === "text") {
      out += block.raw;
      continue;
    }
    const raw = block.raw ?? "";
    const ov = overrides?.get(block.id);
    if (ov?.remove) continue;
    if (ov?.text === undefined || ov.text === block.text) {
      out += raw;
      continue;
    }
    out +=
      block.role === "skills"
        ? rebuildSkillsParagraph(raw, ov.text)
        : rebuildBulletParagraph(raw, ov.text);
  }
  return out;
}

/** Plain text of the whole document body, one paragraph per line. */
export function docxPlainText(xml: string): string {
  const paras = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) ?? [];
  return paras
    .map((p) => paragraphText(p).replace(/\t+/g, "  ").trim())
    .filter(Boolean)
    .join("\n");
}
