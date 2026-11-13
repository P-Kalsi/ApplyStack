"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bookmark, BookmarkCheck, ChevronRight, FileSearch, MapPin, Sparkles } from "lucide-react";
import type { JobRow } from "@/lib/types";
import { Badge, ScoreBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { displaySkill, timeAgo } from "@/lib/utils";
import { sourceBadge } from "@/lib/jobs/sources/badges";
import { toggleSaveJob } from "@/app/(app)/discover/actions";
import { startTailoring } from "@/app/(app)/tailor/actions";

export interface JobCardMatch {
  overall: number;
  matchedSkills: string[];
  missingSkills: string[];
}

const workModeLabel: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: "Work mode n/a",
};

const typeLabel: Record<string, string> = {
  internship: "Internship",
  newgrad: "New grad",
  fulltime: "Full-time",
  other: "Role",
};

export function JobCard({
  job,
  match,
  saved,
}: {
  job: JobRow;
  match: JobCardMatch;
  saved: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [isSaved, setIsSaved] = useState(saved);

  return (
    <article className="group flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4 transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-[0_2px_8px_rgb(0_0_0/0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink-muted">{job.company}</p>
          <Link
            href={`/jobs/${job.id}`}
            className="mt-0.5 line-clamp-2 rounded-sm text-[15px] font-semibold leading-snug tracking-tight text-ink hover:text-accent"
          >
            {job.title}
          </Link>
        </div>
        <div className="shrink-0">
          {job.description_text ? (
            <ScoreBadge score={match.overall} />
          ) : (
            <Badge tone="outline" title="No description yet: open the job to fetch or paste it, then you'll get a match score">
              No description
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-faint">
        <span className="inline-flex min-w-0 items-center gap-1">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{job.location || "Location n/a"}</span>
        </span>
        <span aria-hidden>·</span>
        <span>{workModeLabel[job.work_mode]}</span>
        <span aria-hidden>·</span>
        <span>{typeLabel[job.employment_type]}</span>
        {job.posted_at ? (
          <>
            <span aria-hidden>·</span>
            <span title={job.posted_at}>{timeAgo(job.posted_at)}</span>
          </>
        ) : null}
        <Badge tone="neutral" className="ml-0.5" title={`Found via ${sourceBadge(job.source)}`}>
          {sourceBadge(job.source)}
        </Badge>
      </div>

      {!job.description_text && job.snippet ? (
        <p className="line-clamp-2 text-xs leading-5 text-ink-muted">{job.snippet}</p>
      ) : null}

      {match.matchedSkills.length || match.missingSkills.length ? (
        <div className="flex flex-wrap gap-1">
          {match.matchedSkills.slice(0, 5).map((s) => (
            <Badge key={s} tone="good" title="You can truthfully claim this skill">
              <span className="sr-only">Matched skill: </span>
              {displaySkill(s)}
            </Badge>
          ))}
          {match.missingSkills.slice(0, 3).map((s) => (
            <Badge key={s} tone="outline" className="border-dashed" title="Not in your Career Vault">
              <span className="sr-only">Missing skill: </span>
              {displaySkill(s)}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex items-center gap-2 border-t border-line pt-3">
        <Button
          size="sm"
          variant={isSaved ? "outline" : "secondary"}
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              const res = await toggleSaveJob(job.id);
              if (res.ok) setIsSaved(!isSaved);
              toast(res.message, res.ok ? "success" : "error");
            } finally {
              setSaving(false);
            }
          }}
          aria-pressed={isSaved}
        >
          {isSaved ? (
            <BookmarkCheck className="h-3.5 w-3.5 text-accent" aria-hidden />
          ) : (
            <Bookmark className="h-3.5 w-3.5" aria-hidden />
          )}
          {isSaved ? "Saved" : "Save"}
        </Button>
        {!job.description_text ? (
          <Link
            href={`/jobs/${job.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface-raised px-3 text-xs font-medium text-ink transition-colors hover:border-ink-faint/60 hover:bg-surface-sunken [@media(pointer:coarse)]:min-h-[44px]"
            title="Open the job to fetch or paste its description"
          >
            <FileSearch className="h-3.5 w-3.5" aria-hidden />
            Add description
          </Link>
        ) : (
        <Button
          size="sm"
          variant="primary"
          loading={tailoring}
          onClick={async () => {
            setTailoring(true);
            try {
              const res = await startTailoring(job.id);
              if (res.ok && res.versionId) {
                toast("Tailored draft ready for review.", "success");
                router.push(`/tailor/review/${res.versionId}`);
              } else {
                toast(res.message, "error");
                setTailoring(false);
              }
            } catch {
              toast("Tailoring failed.", "error");
              setTailoring(false);
            }
          }}
        >
          {tailoring ? null : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
          Tailor Resume
        </Button>
        )}
        <Link
          href={`/jobs/${job.id}`}
          className="ml-auto inline-flex h-8 items-center gap-0.5 rounded-md pl-2 pr-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink [@media(pointer:coarse)]:min-h-[44px]"
        >
          View Job
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
