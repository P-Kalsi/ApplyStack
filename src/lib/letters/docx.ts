// Build a cover letter .docx from one of your own past letters, so the new
// letter looks exactly like the ones you already send: same header, fonts,
// spacing and sign-off. Only the date, recipient lines, greeting and body
// paragraphs are replaced; each new paragraph copies the formatting of the
// paragraph it replaces. Everything before the date (your name and contact
// block) and from the sign-off on stays byte-for-byte. Dependency-free and
// unit-tested.

import { paragraphText, rebuildBulletParagraph } from "../resume/docx";

const PARA_RE = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_RE = new RegExp(`^(?:${MONTH}\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\s+${MONTH}\\.?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})$`, "i");
const GREETING_RE = /^(dear|hello|hi|to whom it may concern|greetings)\b/i;
const CLOSING_RE = /^(sincerely|best regards|kind regards|warm regards|regards|best|respectfully|yours (?:truly|sincerely)|thank you)[,.!]?$/i;

interface Para {
  xml: string;
  text: string;
}

export interface LetterTemplateShape {
  dateIdx: number;
  greetingIdx: number;
  closingIdx: number;
}

/** Find the date, greeting and sign-off paragraphs; null if the letter doesn't have them. */
export function letterShape(paragraphs: { text: string }[]): LetterTemplateShape | null {
  const t = paragraphs.map((p) => p.text.replace(/\s+/g, " ").trim());
  const greetingIdx = t.findIndex((x) => GREETING_RE.test(x) && x.length < 80);
  if (greetingIdx === -1) return null;
  const closingIdx = t.findIndex((x, i) => i > greetingIdx && CLOSING_RE.test(x));
  if (closingIdx === -1) return null;
  let dateIdx = -1;
  for (let i = greetingIdx - 1; i >= 0; i--) {
    if (DATE_RE.test(t[i])) {
      dateIdx = i;
      break;
    }
  }
  return { dateIdx, greetingIdx, closingIdx };
}

/** Can this .docx (its word/document.xml) be used as a letter template? */
export function isLetterTemplate(documentXml: string): boolean {
  const body = documentXml.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] ?? "";
  const paras = (body.match(PARA_RE) ?? []).map((xml) => ({ text: paragraphText(xml) }));
  return letterShape(paras) !== null;
}

export interface LetterContent {
  date: string;
  recipient: string[];
  greeting: string;
  paragraphs: string[];
}

/** Rebuild word/document.xml with new letter content in the template's formatting. */
export function buildLetterXml(templateXml: string, letter: LetterContent): string {
  const bodyMatch = templateXml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!bodyMatch || bodyMatch.index === undefined) throw new Error("The template has no document body.");
  const bodyStart = bodyMatch.index + "<w:body>".length;
  const body = bodyMatch[1];

  // Paragraphs with their positions inside the body.
  const paras: (Para & { start: number; end: number })[] = [];
  for (const m of body.matchAll(PARA_RE)) {
    paras.push({ xml: m[0], text: paragraphText(m[0]), start: m.index!, end: m.index! + m[0].length });
  }
  const shape = letterShape(paras);
  if (!shape) {
    throw new Error("Couldn't find a greeting (\"Dear ...\") and a sign-off (\"Sincerely,\") in the template letter.");
  }
  const { dateIdx, greetingIdx, closingIdx } = shape;
  const isEmpty = (p: Para) => p.text.trim() === "";

  const out: string[] = [];
  // 1. Date (or, without one, the recipient block starts right after the header).
  const recipientFrom = dateIdx === -1 ? greetingIdx : dateIdx + 1;
  if (dateIdx !== -1) out.push(rebuildBulletParagraph(paras[dateIdx].xml, letter.date));

  // 2. Recipient lines: formatted like the template's first recipient line.
  const oldRecipient = paras.slice(recipientFrom, greetingIdx);
  const recipientModel = oldRecipient.find((p) => !isEmpty(p)) ?? paras[dateIdx === -1 ? greetingIdx : dateIdx];
  const gapBeforeGreeting = oldRecipient.length && isEmpty(oldRecipient[oldRecipient.length - 1]) ? oldRecipient[oldRecipient.length - 1].xml : "";
  const gapAfterDate = oldRecipient.length && isEmpty(oldRecipient[0]) ? oldRecipient[0].xml : "";
  if (dateIdx !== -1 && letter.recipient.length) out.push(gapAfterDate);
  for (const line of letter.recipient) out.push(rebuildBulletParagraph(recipientModel.xml, line));
  out.push(gapBeforeGreeting);

  // 3. Greeting.
  out.push(rebuildBulletParagraph(paras[greetingIdx].xml, letter.greeting));

  // 4. Body: formatted like the template's first body paragraph, with the
  //    template's spacer paragraph between them if it used one.
  const oldBody = paras.slice(greetingIdx + 1, closingIdx);
  const bodyModel = oldBody.find((p) => !isEmpty(p)) ?? paras[greetingIdx];
  const spacer = oldBody.find(isEmpty)?.xml ?? "";
  const leading = oldBody.length && isEmpty(oldBody[0]) ? oldBody[0].xml : "";
  const trailing = oldBody.length > 1 && isEmpty(oldBody[oldBody.length - 1]) ? oldBody[oldBody.length - 1].xml : "";
  out.push(leading);
  letter.paragraphs.forEach((text, i) => {
    if (i > 0) out.push(spacer);
    out.push(rebuildBulletParagraph(bodyModel.xml, text));
  });
  out.push(trailing);

  // Splice: keep everything before the date (or recipient block) and from the sign-off on.
  const firstReplaced = dateIdx !== -1 ? dateIdx : recipientFrom;
  const cutStart = paras[Math.min(firstReplaced, greetingIdx)].start;
  const cutEnd = paras[closingIdx].start;
  const newBody = body.slice(0, cutStart) + out.join("") + body.slice(cutEnd);
  return templateXml.slice(0, bodyStart) + newBody + templateXml.slice(bodyStart + body.length);
}
