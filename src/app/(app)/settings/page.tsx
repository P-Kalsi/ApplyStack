import type { Metadata } from "next";
import { createClient, requireUser } from "@/lib/supabase/server";
import { API_KEY_ENV, PROVIDERS, PROVIDER_DEFAULTS, checkLlmBackend, loadLlmSettings } from "@/lib/ai/llm";
import { sourcesFromEnv } from "@/lib/jobs/registry";
import type { JobSourceRow } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/card";
import { ProfileForm, SourcesManager } from "./settings-client";
import { LlmBackendCard } from "./llm-backend";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: profile }, { data: sources }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("job_sources").select("*").eq("user_id", user.id).order("created_at"),
  ]);

  const llmSettings = loadLlmSettings();
  const llmStatus = await checkLlmBackend();

  const envSources = sourcesFromEnv({
    GREENHOUSE_BOARDS: process.env.GREENHOUSE_BOARDS,
    LEVER_SITES: process.env.LEVER_SITES,
  });

  return (
    <div className="max-w-3xl space-y-3">
      <div>
        <h1 className="text-base font-semibold text-ink">Settings</h1>
        <p className="text-xs text-ink-muted">Profile, job sources, and AI backend.</p>
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
          title="Job sources"
          description="Public Greenhouse Job Board and Lever Postings APIs. Add the board token from boards.greenhouse.io/<token> or the site name from jobs.lever.co/<site>."
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
