"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Confirm } from "@/components/ui/confirm";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { addWritingSamples, deleteWritingSample, setLetterTemplate } from "../../letters/actions";

export interface SampleSummary {
  id: string;
  title: string;
  words: number;
  canTemplate: boolean;
  isTemplate: boolean;
  created_at: string;
}

/** Your past cover letters: the voice new letters are written in, and the Word layout they're built in. */
export function LettersEditor({ samples }: { samples: SampleSummary[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (fd: FormData) => {
    setBusy(true);
    try {
      const res = await addWritingSamples(fd);
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok) {
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title="Your past cover letters"
          description="New letters copy the voice and structure of the ones closest to each job, never their claims: every claim must come from your Fact Bank. Only the letter body is sent to the AI; your address, phone and email are removed first."
        />
        <form action={submit} className="space-y-3 px-4 py-3">
          <div>
            <Label htmlFor="letter-files">Upload Word letters (.docx, several at once)</Label>
            <input
              ref={fileRef}
              id="letter-files"
              name="files"
              type="file"
              multiple
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="block w-full text-xs text-ink-muted file:mr-3 file:h-8 file:rounded-md file:border file:border-line file:bg-surface-raised file:px-3 file:text-xs file:font-medium file:text-ink"
            />
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-ink-muted hover:text-ink">Or paste a letter (PDF or anything else)</summary>
            <div className="mt-2 space-y-2">
              <Input name="title" placeholder="Where it was for, e.g. Acme software co-op" />
              <Textarea name="text" rows={8} placeholder={"Dear Hiring Manager,\n\nI am writing to apply for...\n\nSincerely,"} />
            </div>
          </details>
          <Button type="submit" variant="primary" size="sm" loading={busy}>
            <FileUp className="h-3.5 w-3.5" aria-hidden /> Add letters
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader
          title={`Saved letters (${samples.length})`}
          description="The Word template is the uploaded letter new letters are built in: same header, fonts and spacing; only the date, recipient, greeting and body change."
        />
        {samples.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-muted">
            None yet. Add two or three of your best letters; cover letters work without them, but won&apos;t sound like you.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {samples.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink">{s.title}</span>
                <span className="text-2xs tabular-nums text-ink-faint">{s.words} words</span>
                {s.isTemplate ? (
                  <Badge tone="good">Word template</Badge>
                ) : s.canTemplate ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const res = await setLetterTemplate(s.id);
                      toast(res.message, res.ok ? "success" : "error");
                      if (res.ok) router.refresh();
                    }}
                  >
                    Use as template
                  </Button>
                ) : null}
                <Confirm
                  title={`Remove "${s.title}"?`}
                  description="New letters stop using it. Letters you already made stay as they are."
                  onConfirm={async () => {
                    const res = await deleteWritingSample(s.id);
                    toast(res.message, res.ok ? "success" : "error");
                    if (res.ok) router.refresh();
                  }}
                >
                  <button className="rounded p-1 text-ink-faint hover:text-bad" aria-label={`Remove ${s.title}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </Confirm>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
