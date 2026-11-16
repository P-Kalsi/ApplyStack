"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Clock, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { FollowUp } from "@/lib/applications/followups";
import { markFollowedUp, snoozeFollowUp } from "./actions";

function when(f: FollowUp): string {
  if (f.daysOverdue > 1) return `${f.daysOverdue} days overdue`;
  if (f.daysOverdue === 1) return "1 day overdue";
  if (f.daysOverdue === 0) return "due today";
  return `in ${-f.daysOverdue} day${f.daysOverdue === -1 ? "" : "s"}`;
}

/** Applications due a nudge, each with a draft to copy. Nothing is ever sent for you. */
export function FollowUpsCard({ due, upcoming }: { due: FollowUp[]; upcoming: FollowUp[] }) {
  const [open, setOpen] = useState<string | null>(due[0]?.applicationId ?? null);
  if (!due.length && !upcoming.length) return null;

  return (
    <Card>
      <CardHeader
        title={due.length ? `Follow-ups due (${due.length})` : "Follow-ups coming up"}
        description="A week after you apply, again a week later, and a check-in after an assessment or interview. Copy the draft, send it yourself, then mark it sent."
      />
      <ul className="divide-y divide-line">
        {[...due, ...upcoming].map((f) => (
          <FollowUpItem
            key={f.applicationId}
            f={f}
            open={open === f.applicationId}
            onToggle={() => setOpen(open === f.applicationId ? null : f.applicationId)}
          />
        ))}
      </ul>
    </Card>
  );
}

function FollowUpItem({ f, open, onToggle }: { f: FollowUp; open: boolean; onToggle: () => void }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<"sent" | "snooze" | null>(null);
  const isDraft = Boolean(f.subject);

  const act = async (kind: "sent" | "snooze") => {
    setBusy(kind);
    try {
      const res = kind === "sent" ? await markFollowedUp(f.applicationId) : await snoozeFollowUp(f.applicationId, 3);
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(isDraft ? `Subject: ${f.subject}\n\n${f.body}` : f.body);
      toast("Draft copied. Fill in the [brackets] before sending.", "success");
    } catch {
      toast("Couldn't copy; select the text instead.", "error");
    }
  };

  return (
    <li className="px-4 py-2.5 text-sm">
      <button onClick={onToggle} className="flex w-full flex-wrap items-center gap-2 text-left" aria-expanded={open}>
        <Badge tone={f.daysOverdue >= 0 ? (f.kind === "close_out" ? "neutral" : "warn") : "outline"}>{f.label}</Badge>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-ink">{f.company}</span> <span className="text-ink-muted">· {f.role}</span>
        </span>
        <span className="text-2xs tabular-nums text-ink-faint">{when(f)}</span>
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          {isDraft ? <p className="text-xs text-ink-muted">Subject: {f.subject}</p> : null}
          <pre className="whitespace-pre-wrap rounded-md border border-line bg-surface-sunken px-3 py-2 font-[inherit] text-xs leading-5 text-ink">
            {f.body}
          </pre>
          <div className="flex flex-wrap gap-2">
            {isDraft ? (
              <Button size="sm" variant="secondary" onClick={copy}>
                <Copy className="h-3.5 w-3.5" aria-hidden /> Copy draft
              </Button>
            ) : null}
            {f.kind !== "close_out" ? (
              <Button size="sm" variant="primary" loading={busy === "sent"} onClick={() => act("sent")}>
                {busy === "sent" ? null : <Check className="h-3.5 w-3.5" aria-hidden />} {f.kind === "reminder" ? "Done" : "Mark as sent"}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" loading={busy === "snooze"} onClick={() => act("snooze")}>
              {busy === "snooze" ? null : <Clock className="h-3.5 w-3.5" aria-hidden />} Snooze 3 days
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
