"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Copy, Download, PenLine, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { LETTER_FOCUS, LETTER_TONE } from "@/lib/letters/letters";
import { generateCoverLetter, saveCoverLetter } from "../../letters/actions";

export interface CoverLetterRow {
  focus: string;
  tone: string;
  recipient: string[];
  greeting: string;
  paragraphs: string[];
  issues: string[];
  gaps: string[];
  fact_count: number;
  model: string | null;
  updated_at: string;
}

export function CoverLetterCard({
  jobId,
  letter,
  samples,
  hasTemplate,
  hasDescription,
}: {
  jobId: string;
  letter: CoverLetterRow | null;
  samples: number;
  hasTemplate: boolean;
  hasDescription: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [focus, setFocus] = useState(letter?.focus ?? "fit");
  const [tone, setTone] = useState(letter?.tone ?? "mine");
  const [busy, setBusy] = useState<"draft" | "save" | null>(null);
  const [recipient, setRecipient] = useState((letter?.recipient ?? []).join("\n"));
  const [greeting, setGreeting] = useState(letter?.greeting ?? "Dear Hiring Manager,");
  const [body, setBody] = useState((letter?.paragraphs ?? []).join("\n\n"));

  // A new draft from the server replaces what's in the editor.
  useEffect(() => {
    setRecipient((letter?.recipient ?? []).join("\n"));
    setGreeting(letter?.greeting ?? "Dear Hiring Manager,");
    setBody((letter?.paragraphs ?? []).join("\n\n"));
  }, [letter?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty =
    letter !== null &&
    (recipient !== letter.recipient.join("\n") || greeting !== letter.greeting || body !== letter.paragraphs.join("\n\n"));
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  const draft = async () => {
    if (dirty && !window.confirm("Write a new draft? Your unsaved edits will be replaced.")) return;
    setBusy("draft");
    try {
      const res = await generateCoverLetter({ jobId, focus, tone });
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("save");
    try {
      const res = await saveCoverLetter({
        jobId,
        recipient: recipient.split("\n"),
        greeting,
        paragraphs,
      });
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText([greeting, "", paragraphs.join("\n\n")].join("\n"));
      toast("Letter copied (greeting and body).", "success");
    } catch {
      toast("Couldn't copy; select the text and copy it instead.", "error");
    }
  };

  return (
    <Card>
      <CardHeader
        title="Cover letter"
        description={
          samples
            ? `Written in your voice from your ${samples} past letter${samples === 1 ? "" : "s"}; every claim from your Career Vault.`
            : "Add your past letters in Career Vault → Cover Letters so drafts sound like you."
        }
      />
      <div className="space-y-3 px-4 py-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="cl-focus">Focus</Label>
            <Select id="cl-focus" value={focus} onChange={(e) => setFocus(e.target.value)} className="w-52">
              {LETTER_FOCUS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="cl-tone">Tone</Label>
            <Select id="cl-tone" value={tone} onChange={(e) => setTone(e.target.value)} className="w-56">
              {LETTER_TONE.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <Button
            size="sm"
            variant={letter ? "secondary" : "primary"}
            loading={busy === "draft"}
            disabled={!hasDescription || busy !== null}
            title={hasDescription ? undefined : "Add the job description first"}
            onClick={draft}
          >
            {busy === "draft" ? null : <PenLine className="h-3.5 w-3.5" aria-hidden />}
            {letter ? "Write a new draft" : "Write cover letter"}
          </Button>
          {!samples ? (
            <Link href="/vault?tab=letters" className="text-xs font-medium text-accent hover:underline">
              Add past letters
            </Link>
          ) : null}
        </div>

        {letter ? (
          <>
            {letter.issues.length ? (
              <div className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-xs">
                <p className="mb-1 font-medium text-warn">Check before sending</p>
                <ul className="list-disc space-y-0.5 pl-4 text-ink-muted">
                  {letter.issues.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {letter.gaps.length ? (
              <p className="text-xs text-ink-muted">
                Acknowledged as gaps: <span className="text-ink">{letter.gaps.join(", ")}</span>
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
              <div className="space-y-2">
                <div>
                  <Label htmlFor="cl-recipient">Recipient (one line each)</Label>
                  <Textarea id="cl-recipient" rows={4} value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="cl-greeting">Greeting</Label>
                  <Input id="cl-greeting" value={greeting} onChange={(e) => setGreeting(e.target.value)} />
                </div>
                <p className="text-2xs text-ink-faint">
                  Add a name if you know who reads it, e.g. &quot;Dear Jordan,&quot;. Availability, work authorization and
                  location are left for you to add.
                </p>
              </div>
              <div>
                <Label htmlFor="cl-body">Letter (blank line between paragraphs)</Label>
                <Textarea
                  id="cl-body"
                  rows={16}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="font-[inherit] leading-6"
                />
                <p className="mt-1 text-2xs tabular-nums text-ink-faint">
                  {paragraphs.length} paragraphs · {body.split(/\s+/).filter(Boolean).length} words · cites{" "}
                  {letter.fact_count} vault fact{letter.fact_count === 1 ? "" : "s"}
                  {letter.model ? ` · ${letter.model}` : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" loading={busy === "save"} disabled={!dirty || busy !== null} onClick={save}>
                {busy === "save" ? null : <Save className="h-3.5 w-3.5" aria-hidden />}
                Save edits
              </Button>
              <Button size="sm" variant="secondary" onClick={copy}>
                <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
              </Button>
              <a
                href={dirty ? undefined : `/api/letters/${jobId}/download`}
                aria-disabled={dirty}
                title={dirty ? "Save your edits first" : hasTemplate ? "Built in your template letter" : "No Word template yet: downloads as text"}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface-raised px-3 text-xs font-medium text-ink hover:border-line-strong aria-disabled:pointer-events-none aria-disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden /> {hasTemplate ? "Download .docx" : "Download .txt"}
              </a>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
