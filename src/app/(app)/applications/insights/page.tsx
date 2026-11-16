import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { ApplicationRow } from "@/lib/types";
import type { KeywordEvidence, MatchReport } from "@/lib/ai/schemas";
import { computePatterns, MIN_SAMPLE, type Rate } from "@/lib/applications/patterns";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: apps, error } = await supabase.from("applications").select("*").eq("user_id", user.id);
  if (error) throw new Error(error.message);
  const applications = (apps || []) as ApplicationRow[];
  const jobIds = [...new Set(applications.map((a) => a.job_id).filter((x): x is string => Boolean(x)))];

  const [{ data: jobs }, { data: analyses }] = jobIds.length
    ? await Promise.all([
        supabase.from("jobs").select("id, source, url").in("id", jobIds),
        supabase.from("job_analyses").select("job_id, match_report").eq("user_id", user.id).in("job_id", jobIds),
      ])
    : [{ data: [] }, { data: [] }];

  const p = computePatterns(
    applications,
    new Map((jobs || []).map((j) => [j.id as string, { source: j.source as string, url: (j.url as string | null) ?? null }])),
    new Map(
      (analyses || [])
        .filter((a) => a.match_report)
        .map((a) => [a.job_id as string, ((a.match_report as MatchReport).keyword_evidence ?? []) as KeywordEvidence[]])
    )
  );
  const top = Math.max(1, ...p.funnel.map((f) => f.count));

  return (
    <div className="space-y-5">
      <Link
        href="/applications"
        className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to Applications
      </Link>
      <div>
        <h1 className="text-title text-ink">Insights</h1>
        <p className="mt-1 text-sm text-ink-muted">
          What your applications say so far. Statuses record where each one is now, so &quot;reached&quot; means that stage or later.
        </p>
      </div>

      {p.total.applied === 0 ? (
        <Card>
          <p className="px-4 py-6 text-center text-sm text-ink-muted">
            No applications marked Applied yet. Move them along in Applications and patterns show up here.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Funnel" description="Applications that reached each stage" />
              <ol className="space-y-2 px-4 py-3">
                {p.funnel.map((f) => (
                  <li key={f.label} className="grid grid-cols-[9.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-xs">
                    <span className="text-ink-muted">{f.label}</span>
                    <span className="h-3 rounded-r bg-surface-sunken" aria-hidden>
                      <span
                        className="block h-3 rounded-r bg-accent transition-opacity hover:opacity-80"
                        style={{ width: `${Math.max(f.count ? 2 : 0, (f.count / top) * 100)}%` }}
                        title={`${f.label}: ${f.count}`}
                      />
                    </span>
                    <span className="text-right font-medium tabular-nums text-ink">{f.count}</span>
                  </li>
                ))}
              </ol>
            </Card>
            <Card>
              <CardHeader title="Overall" />
              <dl className="grid grid-cols-2 gap-3 px-4 py-3">
                <Stat label="Response rate" value={`${p.total.responseRate}%`} note="any reply, including rejections" />
                <Stat label="Advance rate" value={`${p.total.advanceRate}%`} note="reached an assessment or later" />
                <Stat label="Applied" value={String(p.total.applied)} />
                <Stat label="Gone quiet" value={String(p.quiet.length)} note="30+ days, no reply" />
              </dl>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RateTable title="By channel" description="Where you found or applied to the job" rows={p.byChannel} />
            <RateTable title="By kind of role" description="Grouped from the job title" rows={p.byRole} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Requirements you keep missing"
                description="Missing in the analyses of two or more jobs you applied to. Worth learning, or worth filtering out."
              />
              {p.missing.length ? (
                <div className="flex flex-wrap gap-1.5 px-4 py-3">
                  {p.missing.map((m) => (
                    <Badge key={m.keyword} tone="outline">
                      {m.keyword} <span className="tabular-nums text-ink-faint">×{m.count}</span>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-3 text-xs text-ink-muted">Nothing repeats yet. Analyze the jobs you apply to and this fills in.</p>
              )}
            </Card>
            <Card>
              <CardHeader title="Gone quiet" description="Applied 30+ days ago with no reply. Follow up once more or close them out." />
              {p.quiet.length ? (
                <ul className="divide-y divide-line">
                  {p.quiet.slice(0, 12).map((q) => (
                    <li key={q.id} className="flex items-center gap-2 px-4 py-2 text-xs">
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-ink">{q.company}</span> <span className="text-ink-muted">· {q.role}</span>
                      </span>
                      <span className="tabular-nums text-ink-faint">{q.days} days</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-3 text-xs text-ink-muted">None. Everything you applied to is under 30 days old or has a reply.</p>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-2xs text-ink-faint">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-ink">{value}</dd>
      {note ? <dd className="text-2xs text-ink-faint">{note}</dd> : null}
    </div>
  );
}

function RateTable({ title, description, rows }: { title: string; description: string; rows: Rate[] }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="overflow-x-auto px-4 py-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-ink-faint">
              <th className="pb-1.5 font-medium">Group</th>
              <th className="pb-1.5 text-right font-medium">Applied</th>
              <th className="pb-1.5 text-right font-medium">Replied</th>
              <th className="pb-1.5 text-right font-medium">Advanced</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.label} className={r.small ? "text-ink-muted" : "text-ink"}>
                <td className="py-1.5">
                  {r.label}
                  {r.small ? (
                    <span className="ml-1 text-2xs text-ink-faint" title={`Fewer than ${MIN_SAMPLE} applications: too few to read much into`}>
                      (small sample)
                    </span>
                  ) : null}
                </td>
                <td className="py-1.5 text-right tabular-nums">{r.applied}</td>
                <td className="py-1.5 text-right tabular-nums">{r.responseRate}%</td>
                <td className="py-1.5 text-right font-medium tabular-nums">{r.advanceRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
