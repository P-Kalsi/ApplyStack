import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAlertEmail } from "../src/lib/jobs/alert-import";

// Fictional alert emails in the shapes LinkedIn and Indeed send.
const LINKEDIN_PLAIN = `Your job alert for software intern in Vancouver
New jobs match your preferences.

Software Engineering Intern
Acme Robotics
Vancouver, BC (Hybrid)
View job: https://www.linkedin.com/comm/jobs/view/4012345678/?trackingId=abc%3D%3D&refId=xyz

---------------------------------------------------------

Data Analyst Co-op
Beta Analytics
Burnaby, BC
Actively recruiting
View job: https://www.linkedin.com/comm/jobs/view/4087654321/?trackingId=def

See all jobs: https://www.linkedin.com/comm/jobs/search?keywords=software
Unsubscribe: https://www.linkedin.com/comm/psettings/email-unsubscribe`;

const LINKEDIN_RENDERED = `Your job alert for software intern
Frontend Developer Intern
Gamma Labs · Toronto, ON (Remote)
Easy Apply
3 connections work here
Machine Learning Intern
Delta AI · Montreal, QC
Promoted
See all jobs`;

const INDEED = `Junior QA Tester - Co-op
Epsilon Software - Calgary, AB
Easily apply
https://ca.indeed.com/rc/clk?jk=0a1b2c3d4e5f6a7b&from=ja&tk=xyz
IT Support Intern
Zeta Health - Victoria, BC
https://ca.indeed.com/pagead/clk?mo=r&ad=-6NYlbfk&vjk=1234abcd5678ef90`;

test("LinkedIn plain-text alert: anchored to links, canonical URLs, noise skipped", () => {
  const jobs = parseAlertEmail(LINKEDIN_PLAIN);
  assert.deepEqual(jobs, [
    { title: "Software Engineering Intern", company: "Acme Robotics", location: "Vancouver, BC (Hybrid)", url: "https://www.linkedin.com/jobs/view/4012345678/" },
    { title: "Data Analyst Co-op", company: "Beta Analytics", location: "Burnaby, BC", url: "https://www.linkedin.com/jobs/view/4087654321/" },
  ]);
});

test("LinkedIn rendered copy (no links): read as title / company · location blocks", () => {
  const jobs = parseAlertEmail(LINKEDIN_RENDERED);
  assert.deepEqual(jobs, [
    { title: "Frontend Developer Intern", company: "Gamma Labs", location: "Toronto, ON (Remote)", url: null },
    { title: "Machine Learning Intern", company: "Delta AI", location: "Montreal, QC", url: null },
  ]);
});

test("Indeed alert: company - location and jk / vjk links", () => {
  const jobs = parseAlertEmail(INDEED);
  assert.deepEqual(jobs, [
    { title: "Junior QA Tester - Co-op", company: "Epsilon Software", location: "Calgary, AB", url: "https://ca.indeed.com/viewjob?jk=0a1b2c3d4e5f6a7b" },
    { title: "IT Support Intern", company: "Zeta Health", location: "Victoria, BC", url: "https://ca.indeed.com/viewjob?jk=1234abcd5678ef90" },
  ]);
});

test("duplicates and empty input", () => {
  assert.equal(parseAlertEmail(`${LINKEDIN_PLAIN}\n${LINKEDIN_PLAIN}`).length, 2);
  assert.deepEqual(parseAlertEmail(""), []);
  assert.deepEqual(parseAlertEmail("Unsubscribe\nPrivacy"), []);
});
