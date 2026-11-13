"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { timeAgo } from "@/lib/utils";
import { deleteAnswer, type SavedAnswer } from "./actions";

export function AnswerBank({ answers, jobLabels }: { answers: SavedAnswer[]; jobLabels: Record<string, string> }) {
  const { toast } = useToast();
  const router = useRouter();
  const [q, setQ] = useState("");
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = answers.filter((a) => {
    const hay = `${a.question}\n${a.answer}\n${a.job_id ? jobLabels[a.job_id] ?? "" : ""}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });

  if (!answers.length) {
    return (
      <p className="px-4 py-4 text-sm text-ink-muted">
        Nothing saved yet. Click <span className="font-medium text-ink">Use this</span> on a draft and it lands here,
        ready for the next similar question.
      </p>
    );
  }
  return (
    <div className="space-y-3 px-4 py-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions and answers" className="w-full pl-8" aria-label="Search answers" />
      </div>
      <ul className="divide-y divide-line">
        {shown.map((a) => (
          <li key={a.id} className="space-y-1.5 py-3 first:pt-0">
            <p className="text-xs text-ink-muted">{a.question}</p>
            <p className="whitespace-pre-line text-sm text-ink">{a.answer}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              {a.kind === "choice" ? <Badge>choice</Badge> : <span className="tabular-nums">{a.answer.length}{a.char_limit ? ` / ${a.char_limit}` : ""} chars</span>}
              {a.job_id && jobLabels[a.job_id] ? <Badge tone="accent">{jobLabels[a.job_id]}</Badge> : null}
              <span>{timeAgo(a.updated_at)}</span>
              <span className="ml-auto flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(a.answer);
                      toast("Copied.", "success");
                    } catch {
                      toast("Couldn't copy; select the text and copy it.", "error");
                    }
                  }}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  aria-label="Delete answer"
                  onClick={async () => {
                    const res = await deleteAnswer(a.id);
                    toast(res.message, res.ok ? "success" : "error");
                    if (res.ok) router.refresh();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </span>
            </div>
          </li>
        ))}
        {!shown.length ? <li className="py-3 text-sm text-ink-muted">No saved answers match.</li> : null}
      </ul>
    </div>
  );
}
