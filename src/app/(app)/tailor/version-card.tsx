"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, Download, Pencil, Printer, Trash2 } from "lucide-react";
import type { ResumeVersionRow } from "@/lib/types";
import { Badge, ScoreBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { deleteVersion, duplicateVersion, renameVersion } from "./actions";

export function VersionCard({
  version,
}: {
  version: Omit<ResumeVersionRow, "master_latex" | "latex_content">;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(version.name);
  const [busy, setBusy] = useState(false);

  const saveName = async () => {
    setBusy(true);
    try {
      const res = await renameVersion(version.id, name);
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok) {
        setRenaming(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4 transition-colors hover:border-line-strong">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <div className="flex gap-1.5">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveName();
                  if (e.key === "Escape") setRenaming(false);
                }}
                aria-label="Version name"
              />
              <Button size="sm" variant="primary" onClick={saveName} loading={busy}>
                Save
              </Button>
            </div>
          ) : (
            <Link
              href={`/tailor/review/${version.id}`}
              className="line-clamp-2 rounded-sm text-[15px] font-semibold leading-snug tracking-tight text-ink hover:text-accent"
            >
              {version.name}
            </Link>
          )}
          <p className="mt-1 text-xs text-ink-faint">
            {version.company || "No company"} · generated {formatDate(version.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone="outline" className="uppercase">
            {version.format === "docx" ? "docx" : "tex"}
          </Badge>
          <Badge tone={version.status === "final" ? "good" : "neutral"}>{version.status}</Badge>
          <ScoreBadge score={version.match_score_after} label="Match score after tailoring" />
        </div>
      </div>

      {version.skills_emphasized.length ? (
        <p className="text-xs text-ink-muted">
          <span className="font-medium text-ink">Emphasized:</span> {version.skills_emphasized.slice(0, 6).join(", ")}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-line pt-3">
        <Link
          href={`/tailor/review/${version.id}`}
          className="mr-1 inline-flex h-8 w-full items-center justify-center rounded-md bg-accent px-3 sm:w-auto text-xs font-medium text-accent-ink transition-colors hover:bg-accent-hover [@media(pointer:coarse)]:min-h-[44px]"
        >
          Review changes
        </Link>
        <Button size="sm" variant="ghost" className="w-8 px-0 [@media(pointer:coarse)]:w-11" onClick={() => setRenaming(true)} aria-label="Rename" title="Rename">
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="w-8 px-0 [@media(pointer:coarse)]:w-11"
          aria-label="Duplicate"
          title="Duplicate this version"
          onClick={async () => {
            const res = await duplicateVersion(version.id);
            toast(res.message, res.ok ? "success" : "error");
            router.refresh();
          }}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <a
          href={`/api/versions/${version.id}/download`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          aria-label={version.format === "docx" ? "Download .docx" : "Download .tex"}
          title={version.format === "docx" ? "Download Word resume" : "Download LaTeX source"}
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
        </a>
        <Link
          href={`/tailor/print/${version.id}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          aria-label="Print view"
          title="Print / save as PDF"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden />
        </Link>
        <Confirm
          title={`Delete "${version.name}"?`}
          description="The version and its change history are removed permanently."
          onConfirm={async () => {
            const res = await deleteVersion(version.id);
            toast(res.message, res.ok ? "success" : "error");
            router.refresh();
          }}
        >
          <Button size="sm" variant="ghost" className="ml-auto w-8 px-0 hover:bg-bad/10 [@media(pointer:coarse)]:w-11" aria-label="Delete" title="Delete">
            <Trash2 className="h-3.5 w-3.5 text-bad" aria-hidden />
          </Button>
        </Confirm>
      </div>
    </article>
  );
}
