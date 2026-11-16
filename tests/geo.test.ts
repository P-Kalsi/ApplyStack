import { test } from "node:test";
import assert from "node:assert/strict";
import { metroOf, parsePlace, parseSearchPlace } from "../src/lib/jobs/geo";

const where = (s: string) => {
  const p = parsePlace(s);
  return { cities: [...p.cities].sort(), regions: [...p.regions].sort(), countries: [...p.countries].sort(), remote: p.remote, broad: p.broad };
};

test("Canadian locations, in the shapes job boards use", () => {
  assert.deepEqual(where("Vancouver, BC"), { cities: ["vancouver"], regions: ["BC"], countries: ["CA"], remote: false, broad: false });
  assert.deepEqual(where("Toronto, Canada").countries, ["CA"]);
  assert.deepEqual(where("Toronto, Canada").regions, ["ON"]);
  assert.deepEqual(where("Oakville, Ontario - Canada").regions, ["ON"]);
  assert.deepEqual(where("CAN - Vancouver").cities, ["vancouver"]);
  assert.deepEqual(where("Montreal, QC, Canada").regions, ["QC"]);
  assert.deepEqual(where("Kanata, Ottawa, ON, Canada").cities, ["kanata", "ottawa"]);
  assert.deepEqual(where("Burnaby, British Columbia - Canada").regions, ["BC"]);
  assert.deepEqual(where("Vancouver BC").regions, ["BC"]);
  assert.deepEqual(where("Toronto, CA").countries, ["CA"], "Toronto, CA means Canada");
  assert.deepEqual(where("Canada").countries, ["CA"]);
});

test("US and other countries", () => {
  assert.deepEqual(where("San Francisco, CA").countries, ["US"]);
  assert.deepEqual(where("San Francisco, CA").regions, ["CA"]);
  assert.deepEqual(where("Washington, DC (Remote)"), { cities: ["washington"], regions: ["DC"], countries: ["US"], remote: true, broad: false });
  assert.deepEqual(where("U.S. Anywhere").countries, ["US"]);
  assert.equal(where("U.S. Anywhere").remote, true);
  assert.deepEqual(where("Richmond, VA").countries, ["US"], "Richmond, VA is not Richmond, BC");
  assert.deepEqual(where("Cambridge, MA").countries, ["US"]);
  assert.deepEqual(where("London, United Kingdom").countries, ["OTHER"]);
  assert.deepEqual(where("London, ON").countries, ["CA"]);
  assert.deepEqual(where("Amsterdam, NL").countries, ["OTHER"], "NL here is the Netherlands, not Newfoundland");
  assert.deepEqual(where("Middle East / Dubai / United Arab Emirates (Remote)").countries, ["OTHER"]);
  assert.deepEqual(where("Korea (Remote)").countries, ["OTHER"]);
});

test("mixed and broad locations", () => {
  assert.deepEqual(where("US / Canada").countries, ["CA", "US"]);
  assert.deepEqual(where("Remote - North America"), { cities: [], regions: [], countries: [], remote: true, broad: true });
  assert.deepEqual(where("Canada / San Francisco / Europe / London / United States / Toronto (Remote)").countries, ["CA", "OTHER", "US"]);
  assert.equal(where("Remote").remote, true);
  assert.deepEqual(where(""), { cities: [], regions: [], countries: [], remote: false, broad: false });
});

test("what you type into the location box", () => {
  assert.deepEqual(parseSearchPlace("Vancouver, BC"), { level: "city", city: "vancouver", region: "BC", country: "CA", unknown: null, remote: false });
  assert.deepEqual(parseSearchPlace("Surrey").region, "BC");
  assert.deepEqual(parseSearchPlace("BC"), { level: "region", city: null, region: "BC", country: "CA", unknown: null, remote: false });
  assert.deepEqual(parseSearchPlace("British Columbia").region, "BC");
  assert.deepEqual(parseSearchPlace("Canada"), { level: "country", city: null, region: null, country: "CA", unknown: null, remote: false });
  assert.equal(parseSearchPlace("Remote").remote, true);
  assert.equal(parseSearchPlace("").level, "none");
  assert.deepEqual(parseSearchPlace("Seattle, WA").country, "US");
  assert.equal(parseSearchPlace("Smallville").unknown, "smallville");
});

test("metro areas", () => {
  assert.ok(metroOf("Vancouver").includes("burnaby"));
  assert.ok(metroOf("surrey").includes("vancouver"));
  assert.deepEqual(metroOf("kelowna"), ["kelowna"]);
});
