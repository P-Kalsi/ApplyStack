import { test } from "node:test";
import assert from "node:assert/strict";
import { readReply, replyNote } from "../src/lib/applications/replies";

test("rejections win even when they mention interviews or assessments", () => {
  const r = readReply(
    "Hi Alex,\n\nThank you for your interest. After careful review, we have decided to move forward with other candidates whose experience more closely matches, so we won't be inviting you to an interview."
  );
  assert.equal(r.kind, "rejected");
  assert.equal(r.status, "rejected");
  assert.match(r.evidence ?? "", /move forward with other candidates/);
  assert.equal(readReply("Unfortunately, the position has been filled.").kind, "rejected");
});

test("offers, interviews and assessments", () => {
  assert.equal(readReply("We're delighted to extend an offer for the Summer internship!").status, "offer");
  assert.equal(readReply("We'd like to schedule a 30-minute call with the team. Please share your availability.").status, "interview");
  assert.equal(readReply("Please pick a time on my Calendly link.").status, "interview");
  assert.equal(readReply("Next, please complete the HackerRank challenge within 7 days.").status, "oa");
  assert.equal(readReply("Your online assessment link is below.").status, "oa");
});

test("acknowledgements change nothing; unknown text says so", () => {
  const ack = readReply("Thank you for applying to Acme! We have received your application.");
  assert.deepEqual([ack.kind, ack.status], ["received", null]);
  const none = readReply("See you at the career fair.");
  assert.deepEqual([none.kind, none.status, none.evidence], [null, null, null]);
});

test("replyNote records the date, the reading and the sentence", () => {
  assert.equal(
    replyNote("2026-11-16", readReply("We'd like to schedule an interview next week.")),
    'Reply 2026-11-16: Interview invitation ("We\'d like to schedule an interview next week.")'
  );
});
