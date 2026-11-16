"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { RankedJob, TriageRow, TriageStep } from "@/lib/pipeline/triage";
import { analyzeJob, fetchJobDescription } from "../jobs/actions";

const STEP_LABEL: Record<TriageStep, string> = {
  analyze: "Ready to analyze",
  fetch_then_analyze: "Description will be fetched",
  low_match: "Low match, skipped",
  needs_description: "Paste the description",
  closed: "Closed",
  done: "Analyzed",
};

const DECISION_TONE = { apply: "good", consider: "warn", check: "bad", skip: "neutral" } as const;

type RunState = "queued" | "running" | "ok" | "failed";

/** Analyze your saved jobs in one go, cheapest checks first, and rank them by verdict. */
export function PipelineCard({ rows, ranked, threshold }: { rows: TriageRow[]; ranked: RankedJob[]; threshold: number }) {
  const { toast } = useToast();
  const router = useRouter();
  const [includeLow, setIncludeLow] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Record<string, { state: RunState; message?: string }>>({});
  const stop = useRef(false);

  const count = (s: TriageStep) => rows.filter((r) => r.step === s).length;
  const queue = rows.filter(
    (r) => r.step === "analyze" || r.step === "fetch_then_analyze" || (includeLow && r.step === "low_match")
  );

  const run = async () => {
    stop.current = false;
    setRunning(true);
    setProgress(Object.fromEntries(queue.map((r) => [r.jobId, { state: "queued" as RunState }])));
    let ok = 0;
    let failed = 0;
    const work = [...queue];
    const worker = async () => {
      while (work.length && !stop.current) {
        const row = work.shift()!;
        setProgress((p) => ({ ...p, [row.jobId]: { state: "running" } }));
        let res = row.step === "fetch_then_analyze" ? await fetchJobDescription(row.jobId) : { ok: true, message: "" };
        if (res.ok) res = await analyzeJob(row.jobId);
        if (res.ok) ok++;
        else failed++;
        setProgress((p) => ({ ...p, [row.jobId]: { state: res.ok ? "ok" : "failed", message: res.ok ? undefined : res.message } }));
      }
    };
    try {
      await Promise.all([worker(), worker()]); // two at a time keeps the AI backend responsive
    } finally {
      setRunning(false);
      toast(
        `${stop.current ? "Stopped. " : ""}Analyzed ${ok} job${ok === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.`,
        failed ? "error" : "success"
      );
      router.refresh();
    }
  };

  const titleOf = new Map(rows.map((r) => [r.jobId, `${r.title} — ${r.company}`]));

  return (
    <Card>
      <CardHeader
        title="Pipeline"
        description={`Analyze every saved job in one go. The free match score skips obvious mismatches (under ${threshold}) before any AI call.`}
        actions={
          running ? (
            <Button size="sm" variant="secondary" onClick={() => (stop.current = true)}>
              <Square className="h-3.5 w-3.5" aria-hidden /> Stop after current
            </Button>
          ) : (
            <Button size="sm" variant="primary" disabled={queue.length === 0} onClick={run}>
              <Play className="h-3.5 w-3.5" aria-hidden /> Analyze {queue.length} job{queue.length === 1 ? "" : "s"}
            </Button>
          )
        }
      />
      <div className="space-y-3 px-4 py-3 text-xs">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(STEP_LABEL) as TriageStep[])
            .filter((s) => count(s) > 0)
            .map((s) => (
              <Badge key={s} tone={s === "analyze" || s === "fetch_then_analyze" ? "accent" : "neutral"}>
                {STEP_LABEL[s]}: {count(s)}
              </Badge>
            ))}
        </div>
        {count("low_match") > 0 ? (
          <label className="flex items-center gap-1.5 text-ink-muted">
            <input
              type="checkbox"
              checked={includeLow}
              disabled={running}
              onChange={(e) => setIncludeLow(e.target.checked)}
              className="accent-[rgb(var(--accent))]"
            />
            Analyze the {count("low_match")} low match{count("low_match") === 1 ? "" : "es"} too
          </label>
        ) : null}

        {Object.keys(progress).length ? (
          <ul className="space-y-1">
            {Object.entries(progress).map(([id, p]) => (
              <li key={id} className="flex items-start gap-2">
                <Badge tone={p.state === "ok" ? "good" : p.state === "failed" ? "bad" : p.state === "running" ? "accent" : "neutral"}>
                  {p.state === "ok" ? "done" : p.state}
                </Badge>
                <span className="min-w-0 text-ink">
                  {titleOf.get(id)}
                  {p.message ? <span className="block text-ink-faint">{p.message}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {ranked.length ? (
          <div>
            <h3 className="mb-1.5 font-medium text-ink-muted">Ranked by verdict</h3>
            <ul className="divide-y divide-line rounded-md border border-line">
              {ranked.map((r) => (
                <li key={r.jobId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <Badge tone={DECISION_TONE[r.verdict.decision]}>{r.verdict.headline}</Badge>
                  <Link href={`/jobs/${r.jobId}`} className="min-w-0 flex-1 truncate font-medium text-ink hover:underline">
                    {r.title} <span className="font-normal text-ink-muted">— {r.company}</span>
                  </Link>
                  <span className="tabular-nums text-ink-faint" title={r.verdict.confidenceNote}>
                    {r.verdict.score} · {r.verdict.confidence} confidence
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
