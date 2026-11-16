"use client";

import { useState } from "react";
import { Copy, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { OUTREACH_KINDS } from "@/lib/outreach/outreach";
import { draftOutreachMessage, type OutreachResult } from "../../letters/actions";

/** Emails and LinkedIn notes for a job, drafted from your facts. Nothing is stored or sent for you. */
export function OutreachCard({ jobId, hasDescription }: { jobId: string; hasDescription: boolean }) {
  const { toast } = useToast();
  const [kind, setKind] = useState<string>(OUTREACH_KINDS[0].value);
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<NonNullable<OutreachResult["draft"]> | null>(null);
  const [body, setBody] = useState("");

  const run = async () => {
    setBusy(true);
    try {
      const res = await draftOutreachMessage(jobId, kind, recipient);
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok && res.draft) {
        setDraft(res.draft);
        setBody(res.draft.body);
      }
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft?.subject ? `Subject: ${draft.subject}\n\n${body}` : body);
      toast("Copied. Fill in any [brackets] before sending.", "success");
    } catch {
      toast("Couldn't copy; select the text instead.", "error");
    }
  };

  return (
    <Card>
      <CardHeader
        title="Outreach"
        description="An application email, a referral request, or a short LinkedIn note, in your voice and from your facts. Nothing is sent for you."
      />
      <div className="space-y-3 px-4 py-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="or-kind">Message</Label>
            <Select id="or-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="w-60">
              {OUTREACH_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="or-to">To (optional)</Label>
            <Input id="or-to" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="First name" className="w-40" />
          </div>
          <Button size="sm" variant="secondary" loading={busy} disabled={!hasDescription} onClick={run}>
            {busy ? null : <Send className="h-3.5 w-3.5" aria-hidden />} Draft it
          </Button>
        </div>

        {draft ? (
          <div className="space-y-2 text-xs">
            {draft.issues.length ? (
              <ul className="list-disc rounded-md border border-warn/30 bg-warn/5 py-2 pl-7 pr-3 text-ink-muted">
                {draft.issues.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            ) : null}
            {draft.subject ? <p className="text-ink-muted">Subject: <span className="text-ink">{draft.subject}</span></p> : null}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={draft.limit <= 300 ? 4 : 10}
              aria-label="Draft"
              className="w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-sm leading-6 text-ink"
            />
            <p className={body.length > draft.limit ? "tabular-nums text-bad" : "tabular-nums text-ink-faint"}>
              {body.length} / {draft.limit} characters
              {draft.attachments.length ? ` · attach: ${draft.attachments.join(", ")}` : ""}
            </p>
            <Button size="sm" variant="primary" onClick={copy}>
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
