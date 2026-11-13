"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Check, Copy, Plus, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { CheckedAnswer } from "@/lib/answers/answers";
import { addAnswerFact, draftAnswer, saveAnswer, type SavedAnswer } from "./actions";

type Opt = { id: string; label: string };

/** "Options" box -> list (one per line). Same rule as parseOptions in lib/answers. */
const parseOptions = (text: string) =>
  text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);

async function copy(text: string, toast: (m: string, k?: "success" | "error" | "info") => void) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied.", "success");
  } catch {
    toast("Couldn't copy; select the text and copy it.", "error");
  }
}

export function AnswerStudio({
  jobs,
  initialJobId,
  experiences,
  projects,
}: {
  jobs: Opt[];
  initialJobId: string;
  experiences: Opt[];
  projects: Opt[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [limit, setLimit] = useState("");
  const [isChoice, setIsChoice] = useState(false);
  const [optionsText, setOptionsText] = useState("");
  const [jobId, setJobId] = useState(initialJobId);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(CheckedAnswer & { model: string }) | null>(null);
  const [similar, setSimilar] = useState<SavedAnswer[]>([]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [savedIdx, setSavedIdx] = useState<Set<number | "choice">>(new Set());

  const charLimit = /^\d+$/.test(limit.trim()) ? Number(limit.trim()) : null;
  const options = isChoice ? parseOptions(optionsText) : [];

  const run = async () => {
    setBusy(true);
    setResult(null);
    setEdits({});
    setSavedIdx(new Set());
    try {
      const res = await draftAnswer({ question, charLimit, options, jobId: jobId || null });
      setSimilar(res.similar ?? []);
      if (!res.ok) {
        toast(res.message, "error");
        return;
      }
      setResult(res.result);
    } finally {
      setBusy(false);
    }
  };

  const save = async (idx: number | "choice", answer: string, factIds: string[]) => {
    const res = await saveAnswer({
      question,
      answer,
      charLimit,
      kind: idx === "choice" ? "choice" : "text",
      jobId: jobId || null,
      factIds,
    });
    toast(res.message, res.ok ? "success" : "error");
    if (res.ok) {
      setSavedIdx((s) => new Set(s).add(idx));
      router.refresh();
    }
  };

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="space-y-1">
        <Label htmlFor="q">Question</Label>
        <Textarea
          id="q"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder='e.g. "Strong Python and TypeScript programming skills; proficiency in SQL (Explain how you developed this skill.)"'
          className="w-full"
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="limit">Character limit</Label>
          <Input
            id="limit"
            value={limit}
            onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="e.g. 140"
            inputMode="numeric"
            className="w-28"
          />
        </div>
        <div className="min-w-[14rem] flex-1 space-y-1">
          <Label htmlFor="job">For which job? (optional)</Label>
          <Select id="job" value={jobId} onChange={(e) => setJobId(e.target.value)} className="w-full">
            <option value="">No specific job</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.label}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={isChoice} onChange={(e) => setIsChoice(e.target.checked)} />
          It&apos;s a dropdown / multiple choice
        </label>
      </div>
      {isChoice ? (
        <div className="space-y-1">
          <Label htmlFor="opts">Options, one per line</Label>
          <Textarea
            id="opts"
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            rows={4}
            placeholder={"None\nBasic\nGood\nVery Good\nExcellent"}
            className="w-full"
          />
        </div>
      ) : null}
      <Button
        type="button"
        variant="primary"
        loading={busy}
        disabled={question.trim().length < 5 || (isChoice && options.length < 2)}
        onClick={run}
      >
        {busy ? null : <Sparkles className="h-4 w-4" aria-hidden />}
        {isChoice ? "Suggest an option" : "Draft answers"}
      </Button>

      {similar.length ? (
        <div className="space-y-2 rounded-md border border-line bg-surface px-3 py-2.5">
          <p className="text-xs font-medium text-ink">You answered similar questions before</p>
          {similar.map((s) => (
            <div key={s.id} className="space-y-1 text-sm">
              <p className="text-xs text-ink-muted">{s.question}</p>
              <div className="flex items-start gap-2">
                <p className="flex-1 text-ink">{s.answer}</p>
                <Button type="button" size="sm" variant="secondary" onClick={() => copy(s.answer, toast)}>
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-3">
          {result.unsupported ? (
            <div className="space-y-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2.5 text-sm text-ink">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  <span className="font-medium">Not in your Career Vault:</span> {result.unsupported}
                </span>
              </p>
              <AddFact experiences={experiences} projects={projects} onAdded={run} />
            </div>
          ) : null}

          {result.choice ? (
            <div className="space-y-2 rounded-md border border-line px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-ink-muted">Suggested option</span>
                <Badge tone="accent">{result.choice.option}</Badge>
              </div>
              <p className="text-sm text-ink">{result.choice.reason}</p>
              <Issues issues={result.choice.issues} />
              <FactsUsed texts={result.choice.factTexts} />
              <Button
                type="button"
                size="sm"
                variant={savedIdx.has("choice") ? "secondary" : "primary"}
                disabled={savedIdx.has("choice")}
                onClick={() => save("choice", result.choice!.option, result.choice!.factIds)}
              >
                <Check className="h-3.5 w-3.5" aria-hidden /> {savedIdx.has("choice") ? "Saved" : "Use this"}
              </Button>
            </div>
          ) : null}

          {result.drafts.map((d, i) => {
            const text = edits[i] ?? d.text;
            const over = charLimit !== null && text.length > charLimit;
            return (
              <div key={i} className="space-y-2 rounded-md border border-line px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-ink-muted">Draft {i + 1}</span>
                  <span className={cn("text-xs tabular-nums", over ? "font-medium text-bad" : "text-ink-muted")}>
                    {text.length}
                    {charLimit ? ` / ${charLimit}` : " characters"}
                  </span>
                </div>
                <Textarea
                  value={text}
                  onChange={(e) => setEdits((m) => ({ ...m, [i]: e.target.value }))}
                  rows={Math.min(8, Math.max(2, Math.ceil(text.length / 90)))}
                  className="w-full"
                  aria-label={`Draft ${i + 1}`}
                />
                <Issues issues={edits[i] !== undefined ? d.issues.filter((x) => !/over the/.test(x)) : d.issues} />
                <FactsUsed texts={d.factTexts} />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => copy(text, toast)}>
                    <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={savedIdx.has(i) ? "secondary" : "primary"}
                    disabled={over || savedIdx.has(i)}
                    onClick={() => save(i, text, d.factIds)}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden /> {savedIdx.has(i) ? "Saved" : "Use this"}
                  </Button>
                </div>
              </div>
            );
          })}
          {!result.drafts.length && !result.choice ? (
            <p className="text-sm text-ink-muted">No draft: your vault doesn&apos;t support an answer to this one.</p>
          ) : null}
          <p className="text-2xs text-ink-muted">Drafted by {result.model}. Read every draft before you use it.</p>
        </div>
      ) : null}
    </div>
  );
}

function Issues({ issues }: { issues: string[] }) {
  if (!issues.length) return null;
  return (
    <ul className="space-y-0.5 text-xs text-bad">
      {issues.map((x, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {x}
        </li>
      ))}
    </ul>
  );
}

function FactsUsed({ texts }: { texts: string[] }) {
  if (!texts.length) return <p className="text-xs text-warn">Cited no facts: check it carefully.</p>;
  return (
    <details className="text-xs text-ink-muted">
      <summary className="cursor-pointer select-none">Based on {texts.length} fact{texts.length === 1 ? "" : "s"}</summary>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {texts.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </details>
  );
}

function AddFact({ experiences, projects, onAdded }: { experiences: Opt[]; projects: Opt[]; onAdded: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [where, setWhere] = useState("");
  const [saving, setSaving] = useState(false);
  if (!open) {
    return (
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" aria-hidden /> I have done this: add a fact
      </Button>
    );
  }
  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="In your own words: where, what you did, and real numbers only if you know them."
        className="w-full bg-surface-raised"
        aria-label="New fact"
      />
      <div className="flex flex-wrap gap-2">
        <Select value={where} onChange={(e) => setWhere(e.target.value)} className="w-64" aria-label="Where you did this">
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
        <Button
          type="button"
          size="sm"
          variant="primary"
          loading={saving}
          disabled={text.trim().length < 15}
          onClick={async () => {
            setSaving(true);
            try {
              const [kind, id] = where.split(":");
              const res = await addAnswerFact({
                text,
                experienceId: kind === "exp" ? id : null,
                projectId: kind === "proj" ? id : null,
              });
              toast(res.message, res.ok ? "success" : "error");
              if (res.ok) {
                setOpen(false);
                setText("");
                onAdded();
              }
            } finally {
              setSaving(false);
            }
          }}
        >
          Add and draft again
        </Button>
      </div>
      <p className="text-2xs text-ink-muted">Only add what you actually did; it goes into your Fact Bank exactly as written.</p>
    </div>
  );
}
