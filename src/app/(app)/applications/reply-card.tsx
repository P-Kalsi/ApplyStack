"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MailCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { readReply } from "@/lib/applications/replies";
import { applyReply } from "./actions";

const TONE = { rejected: "neutral", offer: "good", interview: "good", oa: "accent", received: "outline" } as const;

/** Paste an employer's reply; see what it means; update the application in one click. */
export function ReplyCard({ options }: { options: { id: string; label: string }[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [id, setId] = useState(options[0]?.id ?? "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const reading = useMemo(() => (text.trim().length > 20 ? readReply(text) : null), [text]);
  if (!options.length) return null;

  return (
    <Card>
      <CardHeader title="Got a reply?" description="Paste the employer's email. ApplyStack reads it and updates the application; it shows the sentence it went by." />
      <div className="space-y-2 px-4 py-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[16rem_minmax(0,1fr)]">
          <div>
            <Label htmlFor="reply-app">Application</Label>
            <Select id="reply-app" value={id} onChange={(e) => setId(e.target.value)} className="w-full">
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="reply-text">Their email</Label>
            <Textarea id="reply-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the reply here" />
          </div>
        </div>
        {reading ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone={reading.kind ? TONE[reading.kind] : "outline"}>{reading.label}</Badge>
            {reading.evidence ? <span className="min-w-0 flex-1 italic text-ink-muted">“{reading.evidence}”</span> : null}
            <Button
              size="sm"
              variant="primary"
              loading={busy}
              disabled={!reading.kind || !id}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await applyReply(id, text);
                  toast(res.message, res.ok ? "success" : "error");
                  if (res.ok) {
                    setText("");
                    router.refresh();
                  }
                } finally {
                  setBusy(false);
                }
              }}
            >
              <MailCheck className="h-3.5 w-3.5" aria-hidden /> {reading.status ? "Update application" : "Add to notes"}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
