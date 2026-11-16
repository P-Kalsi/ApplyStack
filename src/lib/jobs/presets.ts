// Ready-made company board lists for Settings → Company boards, so you can
// start scanning without looking up board tokens. The idea (and the AI-tools
// group) comes from career-ops' pre-configured portals
// (https://github.com/career-ops-hq/career-ops, MIT); the intern and Canada
// groups are ApplyStack's own. Every token was checked against the board's
// public API when it was added (November 2026). Boards do move; one that
// stops answering shows as a failed source on Discover and can be removed.

import type { CompanySource } from "./registry";

export interface BoardPreset {
  id: string;
  label: string;
  description: string;
  boards: Required<CompanySource>[];
}

const gh = (token: string, label: string) => ({ kind: "greenhouse" as const, token, label });
const lv = (token: string, label: string) => ({ kind: "lever" as const, token, label });
const ab = (token: string, label: string) => ({ kind: "ashby" as const, token, label });

export const BOARD_PRESETS: BoardPreset[] = [
  {
    id: "interns",
    label: "Big intern programs",
    description: "Companies that post many internship and new-grad roles on their own boards.",
    boards: [
      gh("stripe", "Stripe"),
      gh("databricks", "Databricks"),
      gh("coinbase", "Coinbase"),
      lv("palantir", "Palantir"),
      gh("lyft", "Lyft"),
      gh("pinterest", "Pinterest"),
      gh("samsara", "Samsara"),
      gh("cloudflare", "Cloudflare"),
      gh("figma", "Figma"),
      gh("scaleai", "Scale AI"),
      gh("airbnb", "Airbnb"),
      ab("snowflake", "Snowflake"),
      ab("notion", "Notion"),
      ab("ramp", "Ramp"),
      gh("duolingo", "Duolingo"),
      gh("datadog", "Datadog"),
      gh("togetherai", "Together AI"),
      gh("robinhood", "Robinhood"),
      gh("roblox", "Roblox"),
      gh("mongodb", "MongoDB"),
      gh("brex", "Brex"),
    ],
  },
  {
    id: "canada",
    label: "Canadian tech",
    description: "Companies hiring in Vancouver, Toronto, Calgary, Montreal and remote Canada.",
    boards: [
      ab("1password", "1Password"),
      ab("wealthsimple", "Wealthsimple"),
      gh("faire", "Faire"),
      ab("neofinancial", "Neo Financial"),
      ab("trulioo", "Trulioo"),
      lv("waabi", "Waabi"),
      ab("cohere", "Cohere"),
      ab("lightspeedhq", "Lightspeed"),
      ab("jane", "Jane App"),
      ab("koho", "KOHO"),
      ab("benevity", "Benevity"),
      ab("klue", "Klue"),
      ab("visier", "Visier"),
      ab("procurify", "Procurify"),
      ab("thinkific", "Thinkific"),
      gh("hootsuite", "Hootsuite"),
      gh("geotab", "Geotab"),
      gh("ada18", "Ada"),
      lv("wattpad", "Wattpad"),
      lv("waveapps", "Wave"),
      lv("achievers", "Achievers"),
      gh("instacart", "Instacart"),
      gh("asana", "Asana"),
    ],
  },
  {
    id: "ai",
    label: "AI labs and AI tools",
    description: "Model labs, voice AI and AI developer tools (from career-ops' portal list).",
    boards: [
      gh("anthropic", "Anthropic"),
      ab("openai", "OpenAI"),
      ab("perplexity", "Perplexity"),
      ab("langchain", "LangChain"),
      ab("pinecone", "Pinecone"),
      ab("elevenlabs", "ElevenLabs"),
      ab("deepgram", "Deepgram"),
      ab("vapi", "Vapi"),
      ab("hume-ai", "Hume AI"),
      gh("polyai", "PolyAI"),
      ab("decagon", "Decagon"),
      ab("sierra", "Sierra"),
      gh("gleanwork", "Glean"),
      gh("arizeai", "Arize AI"),
      ab("modal", "Modal"),
      ab("replit", "Replit"),
    ],
  },
  {
    id: "devtools",
    label: "Developer platforms and automation",
    description: "Dev tools, infrastructure and automation companies (from career-ops' portal list).",
    boards: [
      gh("vercel", "Vercel"),
      ab("supabase", "Supabase"),
      ab("linear", "Linear"),
      ab("posthog", "PostHog"),
      ab("temporal", "Temporal"),
      gh("airtable", "Airtable"),
      ab("n8n", "n8n"),
      ab("zapier", "Zapier"),
      gh("twilio", "Twilio"),
      gh("gongio", "Gong"),
      gh("dialpad", "Dialpad"),
      ab("attio", "Attio"),
      gh("speechmatics", "Speechmatics"),
    ],
  },
];

export function findPreset(id: string): BoardPreset | undefined {
  return BOARD_PRESETS.find((p) => p.id === id);
}
