import type { Metadata } from "next";
import { createClient, requireUser } from "@/lib/supabase/server";
import { loadVaultSnapshot } from "@/lib/db/vault";
import { Card, CardHeader } from "@/components/ui/card";
import { AnswerStudio } from "./answer-studio";
import { AnswerBank } from "./answer-bank";
import type { SavedAnswer } from "./actions";

export const metadata: Metadata = { title: "Answers" };

export default async function AnswersPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const { job: jobParam } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();

  const [vault, savedRes, savedJobs, apps] = await Promise.all([
    loadVaultSnapshot(supabase, user.id),
    supabase
      .from("application_answers")
      .select("id, question, answer, char_limit, kind, job_id, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(300),
    supabase.from("saved_jobs").select("job_id").eq("user_id", user.id),
    supabase.from("applications").select("job_id").eq("user_id", user.id),
  ]);

  const ids = Array.from(
    new Set(
      [
        ...((savedJobs.data || []) as { job_id: string | null }[]).map((r) => r.job_id),
        ...((apps.data || []) as { job_id: string | null }[]).map((r) => r.job_id),
        jobParam && /^[0-9a-f-]{36}$/i.test(jobParam) ? jobParam : null,
      ].filter(Boolean) as string[]
    )
  ).slice(0, 200);
  const { data: jobRows } = ids.length
    ? await supabase.from("jobs").select("id, title, company").in("id", ids)
    : { data: [] as { id: string; title: string; company: string }[] };
  const jobs = ((jobRows || []) as { id: string; title: string; company: string }[])
    .map((j) => ({ id: j.id, label: `${j.company} — ${j.title}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const tableMissing = Boolean(savedRes.error && /application_answers/.test(savedRes.error.message));
  const saved = (savedRes.data || []) as SavedAnswer[];
  const jobLabel = Object.fromEntries(jobs.map((j) => [j.id, j.label]));

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-title text-ink">Answers</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Screening questions, answered only from your Career Vault. Paste a question, get drafts that fit the limit,
          and keep the ones you use.
        </p>
      </div>
      {tableMissing ? (
        <p className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-ink">
          To save answers, run <code>supabase/migrations/0008_application_answers.sql</code> in the Supabase SQL Editor.
          Drafting works without it.
        </p>
      ) : null}
      <Card>
        <CardHeader
          title="Answer a question"
          description="Uses your AI backend. Every draft cites the facts it used and is checked for anything that isn't in your vault."
        />
        <AnswerStudio
          jobs={jobs}
          initialJobId={jobParam && jobLabel[jobParam] ? jobParam : ""}
          experiences={vault.experiences.map((x) => ({ id: x.id, label: `${x.role} — ${x.company}` }))}
          projects={vault.projects.map((p) => ({ id: p.id, label: p.name }))}
        />
      </Card>
      <Card>
        <CardHeader title="Answer bank" description={`${saved.length} saved answer${saved.length === 1 ? "" : "s"}. Reuse them for similar questions.`} />
        <AnswerBank answers={saved} jobLabels={jobLabel} />
      </Card>
    </div>
  );
}
