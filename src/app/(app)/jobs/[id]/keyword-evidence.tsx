"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { displaySkill } from "@/lib/utils";
import { confirmKeyword } from "../actions";

export interface EvidenceRow {
  keyword: string;
  status: "verified" | "related" | "missing";
  evidence: string;
  /** Looks like a single technology (offer "add to my skills"). */
  isSkill: boolean;
  /** Suggested skills group for it. */
  skillGroup: string;
}

const GROUP_LABELS: Record<string, string> = {
  languages: "Languages",
  frameworks: "Frameworks",
  libraries: "Libraries",
  databases: "Databases",
  cloud: "Cloud",
  infrastructure: "Infrastructure",
  developer_tools: "Developer tools",
  operating_systems: "Operating systems",
  other: "Other",
};

/**
 * Keyword evidence with an "I've done this" action on missing / related
 * keywords: you describe what you did in your own words and it becomes an
 * approved Career Vault fact that tailoring can use.
 */
export function KeywordEvidence({
  jobId,
  rows,
  experiences,
  projects,
}: {
  jobId: string;
  rows: EvidenceRow[];
  experiences: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="space-y-1.5">
      {rows.map((e) => (
        <li key={e.keyword}>
          <div className="flex items-start gap-1.5">
            <Badge
              tone={e.status === "verified" ? "good" : e.status === "related" ? "warn" : "bad"}
              className="mt-px shrink-0"
            >
              {e.status}
            </Badge>
            <span className="min-w-0 flex-1 text-ink">
              <span className="font-medium">{displaySkill(e.keyword)}</span>
              <span className="text-ink-muted"> — {e.evidence}</span>
            </span>
            {e.status !== "verified" && open !== e.keyword ? (
              <button
                type="button"
                onClick={() => setOpen(e.keyword)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-0.5 text-2xs font-medium text-ink-muted hover:border-line-strong hover:text-ink"
                title="Add your experience with this to your Fact Bank"
              >
                <Plus className="h-3 w-3" aria-hidden /> I&apos;ve done this
              </button>
            ) : null}
          </div>
          {open === e.keyword ? (
            <ConfirmForm
              jobId={jobId}
              row={e}
              experiences={experiences}
              projects={projects}
              onClose={() => setOpen(null)}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ConfirmForm({
  jobId,
  row,
  experiences,
  projects,
  onClose,
}: {
  jobId: string;
  row: EvidenceRow;
  experiences: { id: string; label: string }[];
  projects: { id: string; label: string }[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [text, setText] = useState("");
  const [where, setWhere] = useState("");
  const [addSkill, setAddSkill] = useState(row.isSkill);
  const [group, setGroup] = useState(row.skillGroup);
  const [saving, setSaving] = useState(false);
  const name = displaySkill(row.keyword);

  return (
    <form
      className="ml-1 mt-1.5 space-y-2 rounded-md border border-line bg-surface p-2.5"
      onSubmit={async (ev) => {
        ev.preventDefault();
        setSaving(true);
        try {
          const [kind, id] = where.split(":");
          const res = await confirmKeyword({
            jobId,
            keyword: row.keyword,
            factText: text,
            experienceId: kind === "exp" ? id : null,
            projectId: kind === "proj" ? id : null,
            skillGroup: row.isSkill && addSkill ? (group as never) : null,
          });
          toast(res.message, res.ok ? "success" : "error");
          if (res.ok) {
            onClose();
            router.refresh();
          }
        } finally {
          setSaving(false);
        }
      }}
    >
      <Label htmlFor={`fact-${row.keyword}`}>What did you do with {name}?</Label>
      <Textarea
        id={`fact-${row.keyword}`}
        value={text}
        onChange={(ev) => setText(ev.target.value)}
        rows={3}
        autoFocus
        placeholder={`In your own words: where, what you did, and real numbers only if you know them. E.g. "Built the company website's pages in WordPress and added custom HTML blocks."`}
        className="w-full"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select value={where} onChange={(ev) => setWhere(ev.target.value)} className="w-64" aria-label="Where you did this">
          <option value="">Where? (optional)</option>
          {experiences.length ? (
            <optgroup label="Experience">
              {experiences.map((x) => (
                <option key={x.id} value={`exp:${x.id}`}>
                  {x.label}
                </option>
              ))}
            </optgroup>
          ) : null}
          {projects.length ? (
            <optgroup label="Projects">
              {projects.map((x) => (
                <option key={x.id} value={`proj:${x.id}`}>
                  {x.label}
                </option>
              ))}
            </optgroup>
          ) : null}
        </Select>
        {row.isSkill ? (
          <label className="flex items-center gap-1.5 text-xs text-ink">
            <input type="checkbox" checked={addSkill} onChange={(ev) => setAddSkill(ev.target.checked)} />
            Also add {name} to my skills under
            <Select
              value={group}
              onChange={(ev) => setGroup(ev.target.value)}
              disabled={!addSkill}
              className="h-7 w-40 py-0 text-xs"
              aria-label="Skills group"
            >
              {Object.entries(GROUP_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
      </div>
      <p className="text-2xs text-ink-muted">
        Only add what you actually did: this goes into your Fact Bank exactly as written, and tailoring can put it on
        your resume. You can edit or remove it in Career Vault → Fact Bank.
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" loading={saving} disabled={text.trim().length < 15}>
          {saving ? null : <Check className="h-3.5 w-3.5" aria-hidden />}
          Add to Fact Bank
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
