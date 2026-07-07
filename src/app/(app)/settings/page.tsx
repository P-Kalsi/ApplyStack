import type { Metadata } from "next";
import { createClient, requireUser } from "@/lib/supabase/server";
import { aiEnabled, configuredModel } from "@/lib/ai/run";
import { sourcesFromEnv } from "@/lib/jobs/registry";
import type { JobSourceRow } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ProfileForm, SourcesManager } from "./settings-client";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: profile }, { data: sources }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("job_sources").select("*").eq("user_id", user.id).order("created_at"),
  ]);

  const envSources = sourcesFromEnv({
    GREENHOUSE_BOARDS: process.env.GREENHOUSE_BOARDS,
    LEVER_SITES: process.env.LEVER_SITES,
  });

  return (
    <div className="max-w-3xl space-y-3">
      <div>
        <h1 className="text-base font-semibold text-ink">Settings</h1>
        <p className="text-xs text-ink-muted">Profile, job sources, and AI configuration.</p>
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
        <CardHeader title="AI engine" description="Configured via environment variables — no keys are stored in the database." />
        <div className="space-y-2 px-4 py-3 text-xs text-ink">
          <div className="flex items-center gap-2">
            <span className="text-ink-muted">Status:</span>
            {aiEnabled() ? (
              <Badge tone="good">ANTHROPIC_API_KEY configured</Badge>
            ) : (
              <Badge tone="warn">mock mode — no API key</Badge>
            )}
            <span className="text-ink-muted">Model (ANTHROPIC_MODEL):</span>
            <Badge tone="accent">{configuredModel()}</Badge>
          </div>
          <p className="text-ink-muted">
            Without a key, analysis/matching/tailoring run on the built-in deterministic engine:
            useful, truthful, and free — but the model writes better bullets. Either way, every
            proposed change passes the same truthfulness guard against your Career Vault.
          </p>
        </div>
      </Card>
    </div>
  );
}
