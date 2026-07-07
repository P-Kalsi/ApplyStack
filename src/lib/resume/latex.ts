// LaTeX resume parsing and structure-preserving serialization.
//
// Design: a resume is split into an ordered list of blocks. Everything the
// tailor is NOT allowed to touch (preamble, section commands, headings,
// spacing, contact info) stays inside opaque `text` blocks and is emitted
// byte-for-byte. Only bullet bodies (`\resumeItem{...}` and `\item ...`)
// become addressable `bullet` blocks. Serializing with no overrides
// reproduces the original document exactly (round-trip tested).
//
// Dependency-free and unit-tested.

export interface TextBlock {
  kind: "text";
  id: string;
  raw: string;
}

export interface BulletBlock {
  kind: "bullet";
  id: string;
  /** The command opener, emitted verbatim, e.g. "\\resumeItem{" or "\\item ". */
  pre: string;
  /** The editable bullet body. */
  text: string;
  /** The closer, e.g. "}" for \resumeItem, "" for \item. */
  post: string;
  /** Section heading this bullet lives under, if known. */
  section: string | null;
}

export type ResumeBlock = TextBlock | BulletBlock;

export interface ParsedResume {
  blocks: ResumeBlock[];
}

/** Find the index of the brace that closes the one at `openIndex`. -1 if unbalanced. */
export function findClosingBrace(s: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\") {
      i++; // skip escaped character (\{, \}, \\, etc.)
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Strip LaTeX markup from a snippet for display / plain-text use. */
export function latexToPlain(s: string): string {
  let out = s;
  let prev = "";
  // Unwrap formatting commands repeatedly (handles nesting).
  while (prev !== out) {
    prev = out;
    out = out.replace(
      /\\(?:textbf|textit|emph|underline|textsc|texttt|mbox|small|scriptsize)\s*\{([^{}]*)\}/g,
      "$1"
    );
    out = out.replace(/\\href\s*\{[^{}]*\}\s*\{([^{}]*)\}/g, "$1");
  }
  out = out.replace(/\\%/g, "%").replace(/\\&/g, "&").replace(/\\\$/g, "$").replace(/\\#/g, "#").replace(/\\_/g, "_");
  out = out.replace(/\$([^$]*)\$/g, "$1");
  out = out.replace(/~/g, " ");
  out = out.replace(/\\[a-zA-Z]+\s*(\{[^{}]*\})?/g, " ");
  out = out.replace(/[{}]/g, "");
  return out.replace(/\s+/g, " ").trim();
}

interface Marker {
  index: number;
  kind: "section" | "resumeItem" | "item";
  length: number; // command token length
}

function nextMarker(s: string, from: number): Marker | null {
  const re = /\\(section\*?|resumeItem|item)(?![a-zA-Z])/g;
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    // Skip escaped backslash sequences like \\item (linebreak then command is
    // fine; a literal "\\" before means the backslash belongs to a \\ pair).
    const cmd = m[1];
    if (cmd.startsWith("section")) return { index: m.index, kind: "section", length: m[0].length };
    if (cmd === "resumeItem") return { index: m.index, kind: "resumeItem", length: m[0].length };
    return { index: m.index, kind: "item", length: m[0].length };
  }
  return null;
}

export function parseResume(latex: string): ParsedResume {
  const blocks: ResumeBlock[] = [];
  let cursor = 0;
  let textStart = 0;
  let currentSection: string | null = null;
  let bulletSeq = 0;
  let textSeq = 0;

  const flushText = (end: number) => {
    if (end > textStart) {
      blocks.push({ kind: "text", id: `t${textSeq++}`, raw: latex.slice(textStart, end) });
    }
  };

  while (cursor < latex.length) {
    const marker = nextMarker(latex, cursor);
    if (!marker) break;

    if (marker.kind === "section") {
      const braceOpen = latex.indexOf("{", marker.index + marker.length);
      if (braceOpen === -1) {
        cursor = marker.index + marker.length;
        continue;
      }
      const braceClose = findClosingBrace(latex, braceOpen);
      if (braceClose === -1) {
        cursor = marker.index + marker.length;
        continue;
      }
      const label = latexToPlain(latex.slice(braceOpen + 1, braceClose));
      // Ignore references like \titleformat{\section}{...} whose "name"
      // is empty once markup is stripped — those are preamble config.
      if (label.length > 0) currentSection = label;
      cursor = braceClose + 1;
      continue; // section commands stay inside text blocks untouched
    }

    if (marker.kind === "resumeItem") {
      const braceOpen = latex.indexOf("{", marker.index + marker.length);
      // Only treat as a bullet when the brace directly follows the command.
      if (braceOpen === -1 || /\S/.test(latex.slice(marker.index + marker.length, braceOpen))) {
        cursor = marker.index + marker.length;
        continue;
      }
      const braceClose = findClosingBrace(latex, braceOpen);
      if (braceClose === -1) {
        cursor = marker.index + marker.length;
        continue;
      }
      flushText(marker.index);
      blocks.push({
        kind: "bullet",
        id: `b${bulletSeq++}`,
        pre: latex.slice(marker.index, braceOpen + 1),
        text: latex.slice(braceOpen + 1, braceClose),
        post: "}",
        section: currentSection,
      });
      cursor = braceClose + 1;
      textStart = cursor;
      continue;
    }

    // Plain \item: the bullet body runs to the end of the line.
    // Items are only bullets once we are inside a \section — this keeps
    // \item occurrences inside preamble \newcommand definitions untouched.
    if (currentSection === null) {
      cursor = marker.index + marker.length;
      continue;
    }
    const afterCmd = marker.index + marker.length;
    const lineEnd = ((): number => {
      const nl = latex.indexOf("\n", afterCmd);
      return nl === -1 ? latex.length : nl;
    })();
    const bodyWithLeading = latex.slice(afterCmd, lineEnd);
    const leadingWs = bodyWithLeading.match(/^\s*/)?.[0] ?? "";
    const body = bodyWithLeading.slice(leadingWs.length);
    if (body.length === 0) {
      cursor = lineEnd;
      continue; // e.g. \item{ ... } style or empty item: leave untouched
    }
    flushText(marker.index);
    blocks.push({
      kind: "bullet",
      id: `b${bulletSeq++}`,
      pre: latex.slice(marker.index, afterCmd) + leadingWs,
      text: body,
      post: "",
      section: currentSection,
    });
    cursor = lineEnd;
    textStart = cursor;
  }

  // Trailing text
  if (textStart < latex.length) {
    blocks.push({ kind: "text", id: `t${textSeq++}`, raw: latex.slice(textStart) });
  }
  return { blocks };
}

export interface BlockOverride {
  text?: string;
  remove?: boolean;
}

/**
 * Re-emit the resume. With no overrides the output equals the input exactly.
 * Overridden bullets keep their original command wrapper (`pre` + `post`);
 * removed bullets disappear along with their immediately preceding
 * indentation so the document stays clean.
 */
export function serializeResume(
  parsed: ParsedResume,
  overrides?: Map<string, BlockOverride>
): string {
  let out = "";
  for (const block of parsed.blocks) {
    if (block.kind === "text") {
      out += block.raw;
      continue;
    }
    const ov = overrides?.get(block.id);
    if (ov?.remove) {
      // Trim the trailing "\n<indent>" the removed bullet sat on.
      out = out.replace(/\n[ \t]*$/, "");
      continue;
    }
    const text = ov?.text !== undefined ? ov.text : block.text;
    out += block.pre + text + block.post;
  }
  return out;
}

export function getBullets(parsed: ParsedResume): BulletBlock[] {
  return parsed.blocks.filter((b): b is BulletBlock => b.kind === "bullet");
}
