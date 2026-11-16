import type { Metadata } from "next";
import { createClient, requireUser } from "@/lib/supabase/server";
import { API_KEY_ENV, PROVIDERS, PROVIDER_DEFAULTS, checkLlmBackend, loadLlmSettings } from "@/lib/ai/llm";
import { sourcesFromEnv } from "@/lib/jobs/registry";
import type { JobSourceRow } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/card";
import { ProfileForm, SourcesManager } from "./settings-client";
import { LlmBackendCard } from "./llm-backend";
import { FeedAlertsCard } from "./feed-alerts";
import { FEED_CATEGORIES, FEED_REGIONS, TERM_NOT_LISTED, upcomingTerms } from "@/lib/jobs/adapters/simplify";
import { discordWebhookUrl, isValidDiscordWebhook, loadFeedSettings } from "@/lib/jobs/feed-settings";
import { loadAlertState } from "@/lib/alerts/discord";

export const metadata: Metadata = { title: "Settings" };
// Reads the local config and alert state on every visit.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: profile }, { data: sources }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("job_sources").select("*").eq("user_id", user.id).order("created_at"),
  ]);

  const llmSettings = loadLlmSettings();
  const feed = loadFeedSettings();
  const hook = discordWebhookUrl();
  const alertState = loadAlertState();
  const llmStatus = await checkLlmBackend();

  const envSources = sourcesFromEnv({
    GREENHOUSE_BOARDS: process.env.GREENHOUSE_BOARDS,
    LEVER_SITES: process.env.LEVER_SITES,
    ASHBY_BOARDS: process.env.ASHBY_BOARDS,
  });

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-title text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">Profile, internship feed and alerts, company boards, and AI backend.</p>
      </div>

      <Card>
        <CardHeader title="Profile" description="Used for context only — tailoring never edits your resume's contact block." />
        <ProfileForm
          profile={{
            full_name: profile?.full_name ?? "",
            phone: profile?.phone ?? "",
            location: profile?.location ?? "",
            website: profile?.website ?? "",
            github: profile?.github ?? "",
            linkedin: profile?.linkedin ?? "",
          }}
          email={user.email || ""}
        />
      </Card>

      <Card>
        <CardHeader
          title="Internship feed & alerts"
          description="Where Discover's internships come from, and Discord alerts for new ones. Saved on this computer."
        />
        <FeedAlertsCard
          regions={FEED_REGIONS}
          categories={FEED_CATEGORIES}
          termOptions={upcomingTerms()}
          notListed={TERM_NOT_LISTED}
          settings={feed}
          webhook={!hook ? "missing" : isValidDiscordWebhook(hook) ? "ok" : "invalid"}
          alertState={{
            initialized_at: alertState.initialized_at,
            last_run_at: alertState.last_run_at,
            last_result: alertState.last_result,
          }}
        />
      </Card>

      <Card>
        <CardHeader
          title="Company boards (optional)"
          description="Public Greenhouse, Lever and Ashby job board APIs. Start from a ready-made list, or add a board token from boards.greenhouse.io/<token>, jobs.lever.co/<site> or jobs.ashbyhq.com/<board>."
        />
        <SourcesManager sources={(sources || []) as JobSourceRow[]} envSources={envSources} />
      </Card>

      <Card>
        <CardHeader
          title="AI backend"
          description="Which model does the AI steps. Fast model: job analysis and matching. Smart model: resume tailoring. Every backend goes through the same truthfulness guard."
        />
        <LlmBackendCard
          providers={PROVIDERS}
          defaults={PROVIDER_DEFAULTS}
          keyEnv={API_KEY_ENV}
          settings={llmSettings}
          status={llmStatus}
        />
      </Card>
    </div>
  );
}
