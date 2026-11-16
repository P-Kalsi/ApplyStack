// Where a job is, and where you're searching, as places rather than text:
// city, province or state, country, and whether it's remote. Small built-in
// gazetteer (Canadian provinces and cities, US states and big US cities,
// other countries and regions); no geocoding service. Pure and unit-tested.

export type Country = "CA" | "US" | "OTHER";

export interface Place {
  cities: Set<string>;
  /** Canadian province / US state codes, e.g. "BC", "ON", "WA". */
  regions: Set<string>;
  countries: Set<Country>;
  remote: boolean;
  /** "North America", "Americas", "Anywhere", "Worldwide", "Global". */
  broad: boolean;
}

const PROVINCES: Record<string, { names: string[]; cities: string[] }> = {
  BC: {
    names: ["british columbia"],
    cities: ["vancouver", "burnaby", "richmond", "surrey", "coquitlam", "north vancouver", "west vancouver", "new westminster", "delta", "langley", "port coquitlam", "port moody", "maple ridge", "white rock", "victoria", "saanich", "langford", "kelowna", "kamloops", "nanaimo", "abbotsford", "chilliwack", "prince george"],
  },
  AB: { names: ["alberta"], cities: ["calgary", "edmonton", "airdrie", "st. albert", "sherwood park", "red deer", "lethbridge"] },
  SK: { names: ["saskatchewan"], cities: ["regina", "saskatoon"] },
  MB: { names: ["manitoba"], cities: ["winnipeg"] },
  ON: {
    names: ["ontario"],
    cities: ["toronto", "mississauga", "markham", "brampton", "vaughan", "richmond hill", "oakville", "scarborough", "north york", "etobicoke", "pickering", "ajax", "thornhill", "concord", "ottawa", "kanata", "nepean", "waterloo", "kitchener", "cambridge", "guelph", "hamilton", "london", "burlington", "kingston", "windsor", "barrie", "oshawa", "whitby", "sudbury"],
  },
  QC: { names: ["quebec", "québec"], cities: ["montreal", "montréal", "laval", "longueuil", "saint-laurent", "dorval", "gatineau", "quebec city", "sherbrooke"] },
  NS: { names: ["nova scotia"], cities: ["halifax", "dartmouth"] },
  NB: { names: ["new brunswick"], cities: ["fredericton", "moncton", "saint john"] },
  NL: { names: ["newfoundland", "newfoundland and labrador"], cities: ["st. john's"] },
  PE: { names: ["prince edward island", "pei"], cities: ["charlottetown"] },
  YT: { names: ["yukon"], cities: ["whitehorse"] },
  NT: { names: ["northwest territories"], cities: ["yellowknife"] },
  NU: { names: ["nunavut"], cities: ["iqaluit"] },
};

/** Canadian city names that are also big places elsewhere: only Canadian with a Canadian hint. */
const AMBIGUOUS = new Set(["london", "richmond", "cambridge", "victoria", "delta", "windsor", "kingston", "hamilton", "burlington", "concord", "waterloo", "saint john", "regina"]);

const US_STATES: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado", CT: "connecticut", DE: "delaware",
  FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa", KS: "kansas", KY: "kentucky",
  LA: "louisiana", ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi", MO: "missouri",
  MT: "montana", NE: "nebraska", NV: "nevada", NH: "new hampshire", NJ: "new jersey", NM: "new mexico", NY: "new york",
  NC: "north carolina", ND: "north dakota", OH: "ohio", OK: "oklahoma", OR: "oregon", PA: "pennsylvania", RI: "rhode island",
  SC: "south carolina", SD: "south dakota", TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington",
  WV: "west virginia", WI: "wisconsin", WY: "wyoming", DC: "district of columbia",
};

const US_CITIES = [
  "san francisco", "south san francisco", "new york", "new york city", "nyc", "seattle", "austin", "boston", "chicago", "los angeles", "denver", "atlanta",
  "washington", "palo alto", "mountain view", "sunnyvale", "san jose", "menlo park", "redwood city", "santa clara", "oakland", "san mateo",
  "bellevue", "redmond", "kirkland", "bothell", "brooklyn", "jersey city", "miami", "dallas", "houston", "phoenix", "portland",
  "salt lake city", "philadelphia", "pittsburgh", "detroit", "minneapolis", "nashville", "raleigh", "san diego", "irvine", "sacramento",
  "san antonio", "columbus", "charlotte", "st. louis", "baltimore", "cupertino", "foster city", "emeryville", "santa monica", "durham",
];

const OTHER = [
  "united kingdom", "uk", "england", "scotland", "wales", "ireland", "dublin", "germany", "berlin", "munich", "frankfurt", "hamburg",
  "france", "paris", "netherlands", "amsterdam", "spain", "madrid", "barcelona", "poland", "warsaw", "krakow", "india", "bangalore",
  "bengaluru", "hyderabad", "pune", "mumbai", "delhi", "gurgaon", "chennai", "singapore", "japan", "tokyo", "korea", "seoul",
  "australia", "sydney", "melbourne", "brazil", "são paulo", "sao paulo", "mexico", "mexico city", "israel", "tel aviv", "emea",
  "europe", "apac", "asia", "latam", "middle east", "dubai", "uae", "united arab emirates", "saudi arabia", "riyadh", "china", "beijing",
  "shanghai", "hong kong", "taiwan", "taipei", "philippines", "manila", "ukraine", "kyiv", "portugal", "lisbon", "switzerland", "zurich",
  "sweden", "stockholm", "denmark", "copenhagen", "italy", "milan", "rome", "argentina", "buenos aires", "colombia", "bogota", "chile",
  "santiago", "new zealand", "auckland", "nigeria", "lagos", "kenya", "nairobi", "south africa", "egypt", "cairo", "turkey", "istanbul",
  "romania", "bucharest", "czech republic", "prague", "estonia", "tallinn", "finland", "helsinki", "norway", "oslo", "belgium",
  "brussels", "austria", "vienna", "greece", "athens", "vietnam", "indonesia", "jakarta", "malaysia", "kuala lumpur", "thailand",
  "bangkok", "pakistan", "edinburgh", "manchester", "cork", "luxembourg", "serbia", "belgrade", "costa rica", "uruguay", "peru",
];

const CITY_TO_PROVINCE = new Map<string, string>();
for (const [code, p] of Object.entries(PROVINCES)) for (const c of p.cities) CITY_TO_PROVINCE.set(c, code);
const PROVINCE_NAME_TO_CODE = new Map<string, string>();
for (const [code, p] of Object.entries(PROVINCES)) for (const n of p.names) PROVINCE_NAME_TO_CODE.set(n, code);
const STATE_NAME_TO_CODE = new Map(Object.entries(US_STATES).map(([code, name]) => [name, code]));

/** Cities that count as "nearby" a searched city (one metro area). */
const METROS: string[][] = [
  ["vancouver", "burnaby", "richmond", "surrey", "coquitlam", "north vancouver", "west vancouver", "new westminster", "delta", "langley", "port coquitlam", "port moody", "maple ridge", "white rock"],
  ["toronto", "mississauga", "markham", "brampton", "vaughan", "richmond hill", "oakville", "scarborough", "north york", "etobicoke", "pickering", "ajax", "thornhill", "concord"],
  ["montreal", "montréal", "laval", "longueuil", "saint-laurent", "dorval"],
  ["ottawa", "kanata", "gatineau", "nepean"],
  ["waterloo", "kitchener", "cambridge", "guelph"],
  ["calgary", "airdrie"],
  ["edmonton", "st. albert", "sherwood park"],
  ["victoria", "saanich", "langford"],
  ["seattle", "bellevue", "redmond", "kirkland", "bothell"],
  ["san francisco", "south san francisco", "oakland", "san mateo", "palo alto", "mountain view", "sunnyvale", "san jose", "menlo park", "redwood city", "santa clara", "cupertino", "foster city", "emeryville"],
  ["new york", "new york city", "nyc", "brooklyn", "jersey city"],
];

export function metroOf(city: string): string[] {
  const c = city.toLowerCase();
  return METROS.find((m) => m.includes(c)) ?? [c];
}

const wordRes = new Map<string, RegExp>();
/** Whole-word (letters on neither side) match; regexes are compiled once. */
function has(text: string, phrase: string): boolean {
  let re = wordRes.get(phrase);
  if (!re) {
    re = new RegExp(`(^|[^\\p{L}])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "iu");
    wordRes.set(phrase, re);
  }
  return re.test(text);
}

const empty = (): Place => ({ cities: new Set(), regions: new Set(), countries: new Set(), remote: false, broad: false });

/** The same location strings repeat across thousands of jobs: parse each once. */
const placeCache = new Map<string, Place>();

/** Read a location string ("Vancouver, BC", "US / Canada", "Toronto, Ontario - Canada", "Remote (EMEA)"). */
export function parsePlace(raw: string | null | undefined): Place {
  const text = (raw || "").replace(/\s+/g, " ").trim();
  const hit = placeCache.get(text);
  if (hit) return hit;
  const place = readPlace(text);
  if (placeCache.size > 20_000) placeCache.clear();
  placeCache.set(text, place);
  return place;
}

function readPlace(text: string): Place {
  const place = empty();
  if (!text) return place;
  const lower = text.toLowerCase();

  if (/\b(remote|anywhere|work from home|wfh|distributed)\b/i.test(text)) place.remote = true;
  if (/\b(north america|americas|anywhere|worldwide|global|international)\b/i.test(text)) place.broad = true;

  // Countries named outright.
  if (/\b(canada|canadian)\b/i.test(text) || /\bCAN\b/.test(text)) place.countries.add("CA");
  if (/\b(united states|usa)\b|\bu\.s\.(?:a\.)?/i.test(text) || /\bUS\b/.test(text)) place.countries.add("US");
  if (OTHER.some((o) => has(lower, o))) place.countries.add("OTHER");

  // Canadian provinces by name and by code ("BC", "Vancouver, B.C.").
  for (const [name, code] of PROVINCE_NAME_TO_CODE) if (has(lower, name)) place.regions.add(code);
  // Province codes only as their own part of the location ("…, BC", "(BC)", "BC - Canada", just "BC"),
  // since some are words or other countries' codes elsewhere (ON, NL, PE).
  for (const code of Object.keys(PROVINCES)) {
    const re = new RegExp(`(^|[,(/;|•-])\\s*${code[0]}\\.?${code[1]}\\.?\\s*($|[,)/;|•-])`);
    if (re.test(text)) place.regions.add(code);
  }
  // "Amsterdam, NL": another country's code, not Newfoundland.
  if (place.countries.has("OTHER") && !place.countries.has("CA")) for (const code of Object.keys(PROVINCES)) place.regions.delete(code);
  // "Vancouver BC" (no comma) for the common ones.
  if (/\b(?:vancouver|burnaby|surrey|victoria|kelowna|richmond)\s+BC\b/i.test(text)) place.regions.add("BC");
  if (/\b(?:toronto|ottawa|waterloo|mississauga|markham)\s+ON\b/.test(text)) place.regions.add("ON");

  // US states by name and by ", XX" code. ", CA" is California unless a Canadian city comes right before it.
  for (const [name, code] of STATE_NAME_TO_CODE) {
    if (name === "washington" || name === "georgia") continue; // too ambiguous by name alone (Washington, DC; Georgia the country)
    if (has(lower, name)) {
      place.regions.add(code);
      place.countries.add("US");
    }
  }
  for (const m of text.matchAll(/(?:,|\s-)\s*([A-Z]{2})\b/g)) {
    const code = m[1];
    if (!US_STATES[code]) continue;
    const before = lower.slice(0, m.index).split(/[,/;|•]/).pop()!.trim();
    if (code === "CA" && CITY_TO_PROVINCE.has(before) && !AMBIGUOUS.has(before)) {
      place.countries.add("CA"); // "Toronto, CA" means Canada
      continue;
    }
    place.regions.add(code);
    place.countries.add("US");
  }
  if (/\bwashington,?\s*d\.?c\.?\b/i.test(text)) {
    place.regions.add("DC");
    place.countries.add("US");
  }

  // Cities.
  const canadianHint = place.countries.has("CA") || [...place.regions].some((r) => r in PROVINCES);
  const usHint = place.countries.has("US");
  for (const [city, prov] of CITY_TO_PROVINCE) {
    if (!has(lower, city)) continue;
    if (AMBIGUOUS.has(city) && !canadianHint) continue;
    if (city === "richmond" && /richmond hill/.test(lower) && !/richmond(?! hill)/.test(lower.replace(/richmond hill/g, ""))) continue;
    if (usHint && !canadianHint && AMBIGUOUS.has(city)) continue;
    place.cities.add(city);
    place.regions.add(prov);
    place.countries.add("CA");
  }
  for (const city of US_CITIES) {
    if (has(lower, city) && !(city === "washington" && !/washington,?\s*d\.?c|washington state|,\s*wa\b/i.test(text) && place.countries.has("CA"))) {
      if (city === "portland" && /portland,?\s*(me|maine)/i.test(text)) continue;
      place.cities.add(city);
      if (!place.countries.has("CA") || usHint) place.countries.add("US");
    }
  }
  // Ambiguous Canadian names with a US hint are US cities (Richmond, VA; Cambridge, MA).
  if (usHint) for (const c of AMBIGUOUS) if (has(lower, c) && !place.cities.has(c)) place.cities.add(c);
  return place;
}

export interface SearchPlace {
  /** What the search names most precisely. */
  level: "none" | "city" | "region" | "country";
  city: string | null;
  region: string | null;
  country: Country | null;
  /** The text didn't match anything known: fall back to matching it as words. */
  unknown: string | null;
  /** "Remote" typed into the location box. */
  remote: boolean;
}

/** Read what you typed into the location box. */
export function parseSearchPlace(raw: string): SearchPlace {
  const text = raw.replace(/\s+/g, " ").trim();
  const out: SearchPlace = { level: "none", city: null, region: null, country: null, unknown: null, remote: false };
  if (!text) return out;
  if (/^(remote|anywhere|work from home)$/i.test(text)) return { ...out, remote: true };
  const p = parsePlace(text);
  const firstPart = text.split(",")[0].trim().toLowerCase();
  const city = [...p.cities].find((c) => c === firstPart) ?? [...p.cities][0] ?? null;
  // A city with no province given: take the province it's in.
  const region = [...p.regions][0] ?? (city ? CITY_TO_PROVINCE.get(city) ?? null : null);
  const country: Country | null = p.countries.has("CA") ? "CA" : p.countries.has("US") ? "US" : p.countries.has("OTHER") ? "OTHER" : region && region in PROVINCES ? "CA" : region ? "US" : null;
  if (city) return { ...out, level: "city", city, region, country: country ?? "CA" };
  if (region) return { ...out, level: "region", region, country: country ?? (region in PROVINCES ? "CA" : "US") };
  if (country) return { ...out, level: "country", country };
  return { ...out, level: "city", city: firstPart, unknown: firstPart };
}

export const PROVINCE_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(PROVINCES).map(([code, p]) => [code, p.names[0].replace(/\b\w/g, (c) => c.toUpperCase())])
);
export const STATE_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATES).map(([code, n]) => [code, n.replace(/\b\w/g, (c) => c.toUpperCase())])
);
