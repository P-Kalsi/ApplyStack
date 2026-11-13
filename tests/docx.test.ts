import { test } from "node:test";
import assert from "node:assert/strict";
import {
  crc32,
  entryData,
  makeEntry,
  readDocumentXml,
  readZip,
  replaceDocumentXml,
  writeZip,
  type ZipEntry,
} from "../src/lib/docx/zip";
import { paragraphText, parseDocxResume, serializeDocxResume } from "../src/lib/resume/docx";
import { getBullets } from "../src/lib/resume/latex";
import { applyChangesToDocument } from "../src/lib/resume/apply-changes";
import { documentPlainText, documentOutline } from "../src/lib/resume/document";
import { extractFactsFromDocument } from "../src/lib/resume/extract-facts";
import { reorderList } from "../src/lib/resume/reorder-list";

// A miniature document.xml shaped like a typical one-page Word resume:
// name, contact line, section headings, entry lines with right-aligned dates
// (tabs), list-paragraph bullets, and "Label: values" skills lines.
const RPR = '<w:rPr><w:rFonts w:ascii="Garamond" w:hAnsi="Garamond"/><w:sz w:val="21"/></w:rPr>';
const BOLD = '<w:rPr><w:rFonts w:ascii="Garamond" w:hAnsi="Garamond"/><w:b/><w:bCs/><w:sz w:val="21"/></w:rPr>';
const NUM = '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:ind w:left="284" w:hanging="270"/></w:pPr>';

const p = (pPr: string, runs: string) => `<w:p w14:paraId="X">${pPr}${runs}</w:p>`;
const r = (rPr: string, t: string) => `<w:r>${rPr}<w:t xml:space="preserve">${t}</w:t></w:r>`;
const tab = (rPr: string) => `<w:r>${rPr}<w:tab/></w:r>`;

const DOC = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
  p("", r(BOLD, "Jordan Example")),
  p("", r(RPR, "LinkedIn | GitHub | P: +1 555-000-0000")),
  p("", r(BOLD, "EXPERIENCE")),
  p("", r(BOLD, "ACME VENDING") + tab(RPR) + r(RPR, "Hybrid")),
  p("", r(RPR, "Software Developer Intern") + tab(RPR) + r(RPR, "Jan 2026 – Present")),
  p(NUM, r(RPR, "Boosted engagement by 60% by building the company website end-to-end")),
  p(NUM, r(RPR, "Configured DNS and deployed the site with Cloudflare Pages")),
  p("", r(BOLD, "PROJECTS")),
  p("", r(BOLD, "SAVEMYGRADE | React, Flask, Python, Docker") + tab(RPR) + r(RPR, "Feb 2026")),
  p(NUM, r(RPR, "Built a full-stack platform with a React front-end and a Flask API &amp; Docker")),
  p(NUM, r(RPR, "Engineered pipelines over 3,300+ review files")),
  p("", r(BOLD, "ADDITIONAL")),
  p("", r(BOLD, "Technical Skills:") + r(RPR, " REST APIs (Flask, FastAPI), PostgreSQL, Docker, Git, AWS")),
  p("", r(BOLD, "Programming Skills: Python, Java, TypeScript, SQL")),
  '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>',
].join("");

function fakeTemplate(name: string): ZipEntry {
  return {
    name,
    method: 8,
    crc32: 0,
    compressedSize: 0,
    uncompressedSize: 0,
    dosTime: 0,
    dosDate: 0x5821,
    flags: 0,
    compressed: Buffer.alloc(0),
  };
}

function buildDocx(xml: string): Buffer {
  const parts: [string, string][] = [
    ["[Content_Types].xml", '<?xml version="1.0"?><Types/>'],
    ["word/document.xml", xml],
    ["word/styles.xml", "<w:styles/>"],
    ["word/fonts/Garamond-regular.ttf", "FAKE-FONT-BYTES".repeat(50)],
  ];
  return writeZip(parts.map(([n, d]) => makeEntry(fakeTemplate(n), Buffer.from(d))));
}

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
});

test("zip round-trips entries and keeps untouched parts byte-identical", () => {
  const docx = buildDocx(DOC);
  const entries = readZip(docx);
  assert.deepEqual(
    entries.map((e) => e.name),
    ["[Content_Types].xml", "word/document.xml", "word/styles.xml", "word/fonts/Garamond-regular.ttf"]
  );
  assert.equal(readDocumentXml(docx), DOC);

  const rebuilt = replaceDocumentXml(docx, DOC.replace("Hybrid", "Remote"));
  assert.ok(readDocumentXml(rebuilt).includes("Remote"));
  const before = readZip(docx).find((e) => e.name.endsWith(".ttf"))!;
  const after = readZip(rebuilt).find((e) => e.name.endsWith(".ttf"))!;
  assert.ok(before.compressed.equals(after.compressed), "font bytes must pass through untouched");
  assert.equal(entryData(after).toString(), "FAKE-FONT-BYTES".repeat(50));
});

test("paragraphText decodes entities and tabs", () => {
  assert.equal(paragraphText(r(RPR, "A &amp; B") + tab(RPR) + r(RPR, "C")), "A & B\tC");
});

test("parser finds bullets and skills lines with sections and entries", () => {
  const bullets = getBullets(parseDocxResume(DOC));
  assert.equal(bullets.length, 6);
  const [b0, , b2] = bullets;
  assert.equal(b0.section, "Experience");
  assert.equal(b0.entry, "ACME VENDING");
  assert.equal(b0.role, "bullet");
  assert.equal(b2.section, "Projects");
  assert.equal(b2.entry, "SAVEMYGRADE");
  assert.equal(b2.text, "Built a full-stack platform with a React front-end and a Flask API & Docker");

  const skills = bullets.filter((b) => b.role === "skills");
  assert.equal(skills.length, 2);
  assert.equal(skills[0].entry, "Technical Skills");
  assert.equal(skills[0].text, "REST APIs (Flask, FastAPI), PostgreSQL, Docker, Git, AWS");
  assert.equal(skills[1].text, "Python, Java, TypeScript, SQL");
  // Headings, contact lines and entry lines are never editable.
  assert.ok(!bullets.some((b) => /Jordan|LinkedIn|Hybrid|Jan 2026/.test(b.text)));
});

test("serialize with no overrides reproduces the XML exactly", () => {
  assert.equal(serializeDocxResume(parseDocxResume(DOC)), DOC);
});

test("rewriting a bullet keeps bullet numbering, indent, and run formatting", () => {
  const bullets = getBullets(parseDocxResume(DOC));
  const out = applyChangesToDocument(
    DOC,
    [{ block_id: bullets[1].id, change_type: "rewrite", status: "accepted", current_text: "Configured DNS & a CI/CD deploy <fast>" }],
    "docx"
  );
  assert.ok(out.includes("Configured DNS &amp; a CI/CD deploy &lt;fast&gt;"));
  const para = out.match(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*Configured DNS(?:(?!<\/w:p>)[\s\S])*<\/w:p>/)![0];
  assert.ok(para.includes("<w:numPr>"), "bullet numbering kept");
  assert.ok(para.includes('w:hanging="270"'), "indent kept");
  assert.ok(para.includes('w:ascii="Garamond"'), "font kept");
  // Everything else is unchanged.
  assert.ok(out.includes("Boosted engagement by 60%"));
  assert.ok(out.endsWith("</w:body></w:document>"));
  assert.ok(out.includes('<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>'));
});

test("skills rewrite keeps the bold label and only replaces the values", () => {
  const skills = getBullets(parseDocxResume(DOC)).filter((b) => b.role === "skills");
  const out = applyChangesToDocument(
    DOC,
    [
      { block_id: skills[0].id, change_type: "skills_reorder", status: "accepted", current_text: "Docker, AWS, REST APIs (Flask, FastAPI), PostgreSQL, Git" },
      { block_id: skills[1].id, change_type: "skills_reorder", status: "accepted", current_text: "TypeScript, SQL, Python, Java" },
    ],
    "docx"
  );
  assert.ok(out.includes(r(BOLD, "Technical Skills:")), "separate label run untouched");
  assert.ok(out.includes("> Docker, AWS, REST APIs (Flask, FastAPI), PostgreSQL, Git<"));
  // Label + value shared one bold run: label stays bold, value loses bold.
  assert.ok(out.includes(`<w:t xml:space="preserve">Programming Skills:</w:t>`));
  const valueRun = out.match(/<w:r>(<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*<\/w:rPr>)<w:t xml:space="preserve"> TypeScript, SQL, Python, Java<\/w:t><\/w:r>/);
  assert.ok(valueRun, "value run present");
  assert.ok(!valueRun![1].includes("<w:b/>"), "value is not bold");
  const reparsed = getBullets(parseDocxResume(out)).filter((b) => b.role === "skills");
  assert.equal(reparsed[1].text, "TypeScript, SQL, Python, Java");
});

test("removing a bullet drops only that paragraph", () => {
  const bullets = getBullets(parseDocxResume(DOC));
  const out = applyChangesToDocument(
    DOC,
    [{ block_id: bullets[3].id, change_type: "remove", status: "accepted", current_text: "" }],
    "docx"
  );
  assert.ok(!out.includes("3,300+ review files"));
  assert.equal(getBullets(parseDocxResume(out)).length, 5);
  assert.ok(out.includes("SAVEMYGRADE"));
});

test("plain text, outline, and fact extraction work on Word resumes", () => {
  const plain = documentPlainText(DOC, "docx");
  assert.ok(plain.includes("Configured DNS and deployed the site"));
  assert.ok(!plain.includes("<w:"));
  const outline = documentOutline(DOC, "docx");
  assert.ok(outline.some((l) => l.kind === "heading" && l.text === "PROJECTS"));
  assert.equal(outline.filter((l) => l.kind === "bullet").length, 4);
  const facts = extractFactsFromDocument(DOC, "docx");
  assert.equal(facts.length, 4, "skills lines are not extracted as facts");
  assert.ok(facts.some((f) => f.fact_text.includes("3,300+") && f.category === "metric"));
});

test("reorderList respects parentheses and adds nothing", () => {
  const out = reorderList("REST APIs (Flask, FastAPI), PostgreSQL, Docker, Git, AWS", new Set(["docker", "aws"]));
  assert.equal(out, "Docker, AWS, REST APIs (Flask, FastAPI), PostgreSQL, Git");
  assert.equal(reorderList("Python, Java", new Set(["java"])), null);
});
