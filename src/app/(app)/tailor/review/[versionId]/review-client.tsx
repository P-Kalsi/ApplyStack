"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  Download,
  Pencil,
  Printer,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import type { FactRow, ResumeChangeRow, ResumeVersionRow } from "@/lib/types";
import { parseResumeDocument, normalizeFormat } from "@/lib/resume/document";
import { Badge, ScoreBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn, displaySkill } from "@/lib/utils";
import { acceptAllSafe, resetReview, setChangeStatus, setVersionStatus } from "../../actions";

export function ReviewClient({
  version,
  changes,
  facts,
}: {
  version: ResumeVersionRow;
  changes: ResumeChangeRow[];
  facts: Pick<FactRow, "id" | "fact_text">[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busyAll, setBusyAll] = useState(false);

  const factText = useMemo(() => new Map(facts.map((f) => [f.id, f.fact_text])), [facts]);
  const changeByBlock = useMemo(() => new Map(changes.map((c) => [c.block_id, c])), [changes]);

  const format = normalizeFormat(version.format);
  const parsed = useMemo(() => parseResumeDocument(version.master_latex, format), [version.master_latex, format]);

  const safeProposed = changes.filter((c) => c.status === "proposed" && c.is_safe).length;
  const accepted = changes.filter((c) => c.status === "accepted" || c.status === "edited").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-title text-ink">{version.name}</h1>
          <p className="mt-1 text-sm tabular-nums text-ink-muted">
            {changes.length} proposed change(s) · {accepted} applied ·{" "}
            {version.status === "final" ? "finalized" : "draft"}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            loading={busyAll}
            disabled={safeProposed === 0}
            title="Accept every proposed change backed by verified vault facts"
            onClick={async () => {
              setBusyAll(true);
              try {
                const res = await acceptAllSafe(version.id);
                toast(res.message, res.ok ? "success" : "error");
                router.refresh();
              } finally {
                setBusyAll(false);
              }
            }}
          >
            <CheckCheck className="h-3.5 w-3.5" aria-hidden />
            Accept All Safe Changes {safeProposed ? `(${safeProposed})` : ""}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="Reset every change back to proposed"
            onClick={async () => {
              const res = await resetReview(version.id);
              toast(res.message, res.ok ? "success" : "error");
              router.refresh();
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restore
          </Button>
          <a
            href={`/api/versions/${version.id}/download`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface-raised px-3 text-xs font-medium text-ink transition-colors hover:border-ink-faint/60 hover:bg-surface-sunken [@media(pointer:coarse)]:min-h-[44px]"
          >
            <Download className="h-3.5 w-3.5" aria-hidden /> {format === "docx" ? ".docx" : ".tex"}
          </a>
          <Link
            href={`/tailor/print/${version.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface-raised px-3 text-xs font-medium text-ink transition-colors hover:border-ink-faint/60 hover:bg-surface-sunken [@media(pointer:coarse)]:min-h-[44px]"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden /> Print / PDF
          </Link>
          <Button
            size="sm"
            variant={version.status === "final" ? "outline" : "secondary"}
            onClick={async () => {
              const res = await setVersionStatus(
                version.id,
                version.status === "final" ? "draft" : "final"
              );
              toast(res.message, res.ok ? "success" : "error");
              router.refresh();
            }}
          >
            {version.status === "final" ? "Back to draft" : "Mark final"}
          </Button>
        </div>
      </div>

      {/* Scores & keyword summary */}
      <Card>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-ink">
            <span className="text-ink-muted">Match score</span>
            <ScoreBadge score={version.match_score_before} label="Before tailoring" />
            <ArrowRight className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
            <ScoreBadge score={version.match_score_after} label="After (with accepted changes)" />
          </div>
          <SummaryChips label="Keywords added" items={version.keywords_added} tone="accent" />
          <SummaryChips label="Skills emphasized" items={version.skills_emphasized} tone="good" />
          <SummaryChips
            label="Still missing (no vault support — honestly not claimed)"
            items={version.still_missing}
            tone="bad"
          />
        </div>
      </Card>

      {/* Side-by-side documents */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Original resume" description="Your master, untouched" />
          <ResumePane parsedBlocks={parsed.blocks} changeByBlock={changeByBlock} side="original" format={format} />
        </Card>
        <Card>
          <CardHeader
            title="Tailored resume"
            description="Accepted and edited changes applied — structure preserved"
          />
          <ResumePane parsedBlocks={parsed.blocks} changeByBlock={changeByBlock} side="tailored" format={format} />
        </Card>
      </div>

      {/* Change review list */}
      <Card>
        <CardHeader
          title={`Proposed changes (${changes.length})`}
          description="Every change cites the Career Vault facts that support it. Unsafe changes lack fact support and are excluded from bulk-accept."
        />
        {changes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            The engine proposed no changes — the master resume already fits this job well.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {changes.map((c) => (
              <ChangeCard key={c.id} change={c} factText={factText} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryChips({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "accent" | "good" | "bad";
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-ink-muted">{label}:</span>
      <span className="flex flex-wrap gap-1">
        {items.slice(0, 8).map((k) => (
          <Badge key={k} tone={tone}>
            {displaySkill(k)}
          </Badge>
        ))}
      </span>
    </div>
  );
}

function ResumePane({
  parsedBlocks,
  changeByBlock,
  side,
  format,
}: {
  parsedBlocks: ReturnType<typeof parseResumeDocument>["blocks"];
  changeByBlock: Map<string, ResumeChangeRow>;
  side: "original" | "tailored";
  format: "latex" | "docx";
}) {
  const docx = format === "docx";
  return (
    <pre
      className={cn(
        "max-h-[480px] overflow-auto whitespace-pre-wrap break-words bg-surface-sunken/40 px-4 py-3 text-xs leading-5 text-ink-muted",
        docx ? "font-sans text-xs leading-5" : "font-mono"
      )}
    >
      {parsedBlocks.map((block) => {
        if (block.kind === "text") {
          if (!docx) return <span key={block.id}>{block.raw}</span>;
          if (!block.display) return null;
          const heading = /^[A-Z][A-Z &/]+$/.test(block.display);
          return (
            <span key={block.id} className={cn("block", heading ? "mt-2 font-semibold text-ink" : "text-ink-muted")}>
              {block.display}
            </span>
          );
        }
        const change = changeByBlock.get(block.id);
        const applied = change && (change.status === "accepted" || change.status === "edited");
        const removed = change?.change_type === "remove";
        const render = (text: string) =>
          docx
            ? block.role === "skills"
              ? `${block.entry}: ${text}`
              : `• ${text}`
            : block.pre + text + block.post;

        if (side === "original") {
          return (
            <span
              key={block.id}
              className={cn(
                "text-ink",
                docx && "block pl-3",
                change && applied && "diff-del rounded-sm px-0.5",
                change && !applied && change.status === "proposed" && "rounded-sm bg-warn/10 px-0.5"
              )}
              title={change ? `Change ${change.status}` : undefined}
            >
              {render(block.text)}
            </span>
          );
        }

        // Tailored side
        if (applied && removed) return null;
        const text = applied ? change!.current_text : block.text;
        return (
          <span
            key={block.id}
            className={cn(
              "text-ink",
              docx && "block pl-3",
              applied && "diff-add rounded-sm px-0.5",
              change && !applied && change.status === "proposed" && "rounded-sm bg-warn/10 px-0.5"
            )}
            title={change ? `Change ${change.status}` : undefined}
          >
            {render(text)}
          </span>
        );
      })}
    </pre>
  );
}

const statusTone: Record<string, "neutral" | "good" | "bad" | "warn"> = {
  proposed: "warn",
  accepted: "good",
  edited: "good",
  rejected: "neutral",
};

function ChangeCard({
  change,
  factText,
}: {
  change: ResumeChangeRow;
  factText: Map<string, string>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(change.current_text);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (status: "accepted" | "rejected" | "edited" | "proposed", text?: string) => {
    setBusy(status);
    try {
      const res = await setChangeStatus(change.id, status, text);
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={statusTone[change.status]} className="capitalize">{change.status}</Badge>
        <Badge tone="outline" className="capitalize">
          {change.change_type.replace("_", " ")}
        </Badge>
        {change.section ? <Badge tone="neutral">{change.section}</Badge> : null}
        {change.is_safe ? (
          <Badge tone="good" title="Backed by verified Career Vault facts">
            <ShieldCheck className="h-3 w-3" aria-hidden /> safe
          </Badge>
        ) : change.change_type === "remove" ? (
          <Badge tone="warn" title="Removing content is always your call; never bulk-accepted">
            <ShieldAlert className="h-3 w-3" aria-hidden /> your call
          </Badge>
        ) : (
          <Badge tone="warn" title="No supporting vault fact cited, or much longer than the original — review carefully">
            <ShieldAlert className="h-3 w-3" aria-hidden /> needs review
          </Badge>
        )}
        {change.keywords.map((k) => (
          <Badge key={k} tone="accent">
            {displaySkill(k)}
          </Badge>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-md border border-line bg-surface-sunken/60 p-3">
          <p className="mb-1 text-xs font-medium text-ink-faint">Original</p>
          <p className="font-mono text-xs leading-5 text-ink">{change.original_text}</p>
        </div>
        <div className="rounded-md border border-good/30 bg-good/5 p-3">
          <p className="mb-1 text-xs font-medium text-ink-faint">
            {change.change_type === "remove" ? "Tailored (removed)" : "Tailored"}
          </p>
          {editing ? (
            <div className="space-y-1.5">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="font-mono text-xs"
                aria-label="Edit tailored text"
              />
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="primary"
                  loading={busy === "edited"}
                  onClick={() => act("edited", draft)}
                >
                  Save edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : change.change_type === "remove" ? (
            <p className="font-mono text-xs italic leading-5 text-ink-faint">
              (bullet removed from this version)
            </p>
          ) : (
            <p className="font-mono text-xs leading-5 text-ink">{change.current_text}</p>
          )}
        </div>
      </div>

      <p className="text-xs text-ink-muted">
        <span className="font-medium text-ink">Why:</span> {change.reason}
      </p>

      {change.fact_ids.length ? (
        <div className="text-xs leading-6 text-ink-faint">
          <span className="font-medium text-ink-muted">Supporting facts:</span>{" "}
          {change.fact_ids
            .map((id) => factText.get(id))
            .filter(Boolean)
            .map((t, i) => (
              <span key={i} className="mr-1.5 inline-block rounded-md border border-line bg-surface-sunken px-2 py-0.5 leading-5 text-ink-muted">
                {t}
              </span>
            ))}
        </div>
      ) : null}

      <div className="no-print flex flex-wrap gap-2">
        {change.status !== "accepted" && change.status !== "edited" ? (
          <Button size="sm" variant="secondary" loading={busy === "accepted"} onClick={() => act("accepted")}>
            <Check className="h-3.5 w-3.5 text-good" aria-hidden /> Accept
          </Button>
        ) : null}
        {change.status !== "rejected" ? (
          <Button
            size="sm"
            variant="ghost"
            loading={busy === "rejected"}
            title="Keep the original bullet"
            onClick={() => act("rejected")}
          >
            <X className="h-3.5 w-3.5 text-bad" aria-hidden /> Reject / restore original
          </Button>
        ) : null}
        {change.change_type !== "remove" ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(change.current_text);
              setEditing(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
          </Button>
        ) : null}
        {change.status !== "proposed" ? (
          <Button
            size="sm"
            variant="ghost"
            loading={busy === "proposed"}
            title="Reset to the engine's suggestion"
            onClick={() => act("proposed")}
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden /> Reset
          </Button>
        ) : null}
      </div>
    </div>
  );
}
