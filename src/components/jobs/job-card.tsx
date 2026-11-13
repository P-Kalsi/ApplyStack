"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bookmark, BookmarkCheck, ExternalLink, MapPin, Sparkles } from "lucide-react";
import type { JobRow } from "@/lib/types";
import { Badge, ScoreBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { displaySkill, timeAgo } from "@/lib/utils";
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
    <article className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink-muted">{job.company}</p>
          <Link
            href={`/jobs/${job.id}`}
            className="line-clamp-2 text-sm font-semibold text-ink hover:text-accent"
          >
            {job.title}
          </Link>
        </div>
        {job.description_text ? (
          <ScoreBadge score={match.overall} />
        ) : (
          <Badge tone="warn" title="No description yet: open the job to fetch or paste it, then you'll get a match score">
            No description
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-2xs text-ink-faint">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" aria-hidden />
          {job.location || "Location n/a"}
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
        <span aria-hidden>·</span>
        <Badge tone="outline" className="uppercase">
          {job.source}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1">
        {match.matchedSkills.slice(0, 5).map((s) => (
          <Badge key={s} tone="good" title="You can truthfully claim this skill">
            {displaySkill(s)}
          </Badge>
        ))}
        {match.missingSkills.slice(0, 3).map((s) => (
          <Badge key={s} tone="bad" title="Not in your Career Vault">
            {displaySkill(s)}
          </Badge>
        ))}
      </div>

      <div className="mt-auto flex items-center gap-1.5 pt-1">
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
            className="inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2.5 text-xs font-medium text-white hover:opacity-90"
            title="Open the job to fetch or paste its description"
          >
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
          className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-muted hover:bg-surface-sunken hover:text-ink"
        >
          View Job
          <ExternalLink className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
