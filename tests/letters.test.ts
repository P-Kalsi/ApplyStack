import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLetterPrompt,
  checkLetter,
  defaultRecipient,
  letterDate,
  letterFeedback,
  letterText,
  pickSamples,
  redactContact,
  splitLetter,
} from "../src/lib/letters/letters";
import { buildLetterXml, isLetterTemplate, letterShape } from "../src/lib/letters/docx";
import { paragraphText } from "../src/lib/resume/docx";
import { makeJob, makeVault } from "./helpers";

// A fictional past letter (no real person's details).
const SAMPLE = [
  "Alex Example",
  "123 Sample Street, Testville",
  "alex@example.com",
  "March 3, 2026",
  "Hiring Manager",
  "Acme Robotics",
  "Dear Hiring Manager,",
  "I am writing to apply for the Robotics Software Intern role at Acme. I am a Computer Science student, and this role is exactly the kind of hands-on work I enjoy most.",
  "On a project called TrackBot, I wrote the control loop in Python and tested it on real hardware, which taught me how much careful testing matters.",
  "I want to be upfront that I have not used ROS yet, but I learn new tools quickly.",
  "Sincerely,",
  "Alex Example",
].join("\n");

test("splitLetter separates header, date, recipient, greeting, body and closing", () => {
  const parts = splitLetter(SAMPLE);
  assert.deepEqual(parts.header, ["Alex Example", "123 Sample Street, Testville", "alex@example.com"]);
  assert.equal(parts.date, "March 3, 2026");
  assert.deepEqual(parts.recipient, ["Hiring Manager", "Acme Robotics"]);
  assert.equal(parts.greeting, "Dear Hiring Manager,");
  assert.equal(parts.body.length, 3);
  assert.deepEqual(parts.closing, ["Sincerely,", "Alex Example"]);
});

test("pickSamples sends body paragraphs only, never the contact block", () => {
  const picked = pickSamples([{ id: "s1", title: "Acme", content: SAMPLE }], makeJob());
  assert.equal(picked.length, 1);
  const sent = picked[0].body.join("\n");
  assert.ok(!sent.includes("alex@example.com"));
  assert.ok(!sent.includes("Sample Street"));
  assert.ok(!sent.includes("Sincerely"));
});

test("redactContact strips emails, phone numbers, street addresses and postal codes", () => {
  const out = redactContact(
    "Please contact me at 555-123-4567 or (555) 987 6543, email alex.e+jobs@example.co.uk, or visit 42 Maple Leaf Street, Testville A1B 2C3."
  );
  assert.ok(!/555|example|Maple|A1B/.test(out), out);
  assert.match(out, /\[phone\].*\[phone\].*\[email\].*\[address\].*\[postal code\]/);
  // Ordinary numbers in a sentence are kept.
  assert.equal(redactContact("I cleaned 1,000 records in 2026."), "I cleaned 1,000 records in 2026.");
});

test("pickSamples prefers samples that share the job's skills", () => {
  const web = SAMPLE.replace("in Python and tested it on real hardware", "in React and TypeScript");
  const picked = pickSamples(
    [
      { id: "robotics", title: "a", content: SAMPLE },
      { id: "web", title: "b", content: web },
    ],
    makeJob({ skills: ["typescript", "react"] }),
    1
  );
  assert.equal(picked[0].id, "web");
});

test("the prompt carries samples as voice only and lists facts as F-labels", () => {
  const vault = makeVault();
  const p = buildLetterPrompt(makeJob(), vault, pickSamples([{ id: "s", title: "t", content: SAMPLE }], makeJob()), "fit", "mine");
  assert.match(p.system, /voice and structure, not their content/);
  assert.match(p.system, /work authorization/);
  assert.match(p.user, /<sample 1>/);
  assert.match(p.user, /\[F1\]/);
  assert.ok(!p.user.includes("alex@example.com"));
  const retry = buildLetterPrompt(makeJob(), vault, [], "problems", "formal", ["Paragraph 2: Mentions kubernetes"]);
  assert.match(retry.user, /previous draft broke these rules/);
});

test("checkLetter flags invented skills and numbers, allows honest gaps, resolves facts", () => {
  const vault = makeVault();
  const checked = checkLetter(
    {
      paragraphs: [
        { text: "I built REST services in TypeScript and shipped them with Docker.", facts: ["F1"] },
        { text: "I also ran Kubernetes clusters serving 9,999 users.", facts: [] },
        { text: "I want to be upfront that I have not used Kubernetes yet, but I learn quickly.", facts: [] },
      ],
      gaps: ["Kubernetes"],
    },
    vault
  );
  assert.equal(checked.paragraphs[0].issues.length, 0);
  assert.equal(checked.paragraphs[0].factIds.length, 1);
  assert.match(checked.paragraphs[1].issues.join(" "), /kubernetes/i);
  assert.match(checked.paragraphs[1].issues.join(" "), /9999/);
  assert.deepEqual(checked.paragraphs[2].issues, []); // a gap sentence may name a missing skill
  assert.ok(letterFeedback(checked).some((f) => f.startsWith("Paragraph 2")));
});

test("checkLetter: empty, uncited and overlong drafts get letter-level issues", () => {
  const vault = makeVault();
  assert.match(checkLetter({ paragraphs: [], gaps: [] }, vault).issues.join(), /empty/);
  const long = "word ".repeat(500);
  const c = checkLetter({ paragraphs: [{ text: long, facts: [] }], gaps: [] }, vault);
  assert.match(c.issues.join(" "), /words/);
  assert.match(c.issues.join(" "), /cites/);
});

test("date, recipient and plain-text assembly", () => {
  assert.equal(letterDate(new Date(2026, 10, 16)), "November 16, 2026");
  assert.deepEqual(defaultRecipient({ company: "Acme", location: "Vancouver, BC" }), ["Hiring Manager", "Acme", "Vancouver, BC"]);
  const text = letterText({ header: ["Alex"], date: "D", recipient: ["R"], greeting: "Dear R,", paragraphs: ["P1", "P2"], signOff: "Sincerely,", name: "Alex" });
  assert.match(text, /Dear R,\n\nP1\n\nP2\n\nSincerely,\nAlex$/);
});

// ---- .docx template ----

const p = (text: string, style = "") => `<w:p><w:pPr>${style}</w:pPr><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const empty = `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>`;
const TEMPLATE = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${[
  p("Alex Example", "<w:jc w:val=\"center\"/>"),
  p("alex@example.com"),
  empty,
  p("March 3, 2026"),
  empty,
  p("Hiring Manager"),
  p("Acme Robotics"),
  empty,
  p("Dear Hiring Manager,"),
  empty,
  p("Old paragraph one."),
  empty,
  p("Old paragraph two."),
  empty,
  p("Sincerely,"),
  p("Alex Example"),
].join("")}<w:sectPr/></w:body></w:document>`;

const texts = (xml: string) => (xml.match(/<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) ?? []).map((x) => paragraphText(x));

test("letterShape finds date, greeting and sign-off", () => {
  const shape = letterShape(texts(TEMPLATE).map((text) => ({ text })));
  assert.deepEqual(shape, { dateIdx: 3, greetingIdx: 8, closingIdx: 14 });
  assert.ok(isLetterTemplate(TEMPLATE));
  assert.ok(!isLetterTemplate(`<w:document><w:body>${p("Just a resume")}</w:body></w:document>`));
});

test("buildLetterXml replaces only date, recipient, greeting and body", () => {
  const xml = buildLetterXml(TEMPLATE, {
    date: "November 16, 2026",
    recipient: ["Jordan Lee", "Beta Corp", "Toronto, ON"],
    greeting: "Dear Jordan,",
    paragraphs: ["New one.", "New two.", "New three."],
  });
  assert.deepEqual(texts(xml), [
    "Alex Example",
    "alex@example.com",
    "",
    "November 16, 2026",
    "",
    "Jordan Lee",
    "Beta Corp",
    "Toronto, ON",
    "",
    "Dear Jordan,",
    "",
    "New one.",
    "",
    "New two.",
    "",
    "New three.",
    "",
    "Sincerely,",
    "Alex Example",
  ]);
  // Header and sign-off are untouched byte-for-byte; formatting is carried over.
  assert.ok(xml.includes(p("Alex Example", "<w:jc w:val=\"center\"/>")));
  assert.ok(xml.includes('<w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">New two.</w:t>'));
  assert.ok(xml.endsWith("<w:sectPr/></w:body></w:document>"));
});

test("buildLetterXml escapes text and refuses non-letters", () => {
  const xml = buildLetterXml(TEMPLATE, { date: "D", recipient: [], greeting: "Dear A & B,", paragraphs: ["1 < 2"] });
  assert.ok(xml.includes("Dear A &amp; B,"));
  assert.ok(xml.includes("1 &lt; 2"));
  assert.throws(() => buildLetterXml(`<w:document><w:body>${p("no greeting")}</w:body></w:document>`, { date: "", recipient: [], greeting: "", paragraphs: [] }));
});
