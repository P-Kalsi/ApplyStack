"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { FileText, FileUp, Save, ScanText } from "lucide-react";
import type { MasterResumeRow } from "@/lib/types";
import { documentBullets } from "@/lib/resume/document";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { PillLabel, SpringPill } from "@/components/ui/spring-pill";
import { TabPanel } from "@/components/ui/tab-panel";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { extractResumeFacts, saveMasterResume, uploadMasterDocx } from "../actions";

type Mode = "docx" | "latex";

export function ResumeEditor({
  master,
  pendingFacts,
}: {
  master: MasterResumeRow | null;
  pendingFacts: number;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(master?.format === "docx" || !master ? "docx" : "latex");
  const [extracting, setExtracting] = useState(false);

  return (
    <div className="space-y-3">
      {master ? <CurrentMaster master={master} /> : null}

      <div className="isolate flex w-fit gap-1 rounded-md border border-line bg-surface-raised p-0.5" role="tablist">
        {(
          [
            ["docx", "Word (.docx)"],
            ["latex", "LaTeX"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "relative h-8 rounded-[5px] px-3 text-xs font-medium transition-colors",
              mode === value ? "text-accent" : "text-ink-muted hover:text-ink"
            )}
          >
            {mode === value ? <SpringPill layoutId="resume-mode" className="bg-accent-soft" radius={5} /> : null}
            <PillLabel>{label}</PillLabel>
          </button>
        ))}
      </div>

      <TabPanel index={mode === "docx" ? 0 : 1}>
        {mode === "docx" ? <DocxUpload /> : <LatexEditor master={master?.format !== "docx" ? master : null} />}
      </TabPanel>

      <Card>
        <CardHeader
          title="Extracted resume facts"
          description="Restates your master resume's bullets as candidate facts (nothing is invented). New facts arrive as pending for your approval."
          actions={
            <Button
              size="sm"
              variant="secondary"
              loading={extracting}
              disabled={!master}
              onClick={async () => {
                setExtracting(true);
                try {
                  const res = await extractResumeFacts();
                  toast(res.message, res.ok ? "success" : "error");
                  if (res.ok) router.refresh();
                } finally {
                  setExtracting(false);
                }
              }}
            >
              <ScanText className="h-3.5 w-3.5" aria-hidden /> Extract facts
            </Button>
          }
        />
        <div className="px-4 py-3 text-xs text-ink-muted">
          {pendingFacts > 0 ? (
            <p>
              <span className="font-medium text-warn">{pendingFacts} pending fact(s)</span> awaiting
              review —{" "}
              <Link href="/vault?tab=facts" className="font-medium text-accent hover:underline">
                approve or reject them
              </Link>
              . Pending facts are never used for matching or tailoring.
            </p>
          ) : (
            <p>No pending facts. Extract after changing your master resume to keep the fact bank in sync.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function CurrentMaster({ master }: { master: MasterResumeRow }) {
  const format = master.format === "docx" ? "docx" : "latex";
  const bullets = useMemo(() => {
    try {
      return documentBullets(master.content, format);
    } catch {
      return [];
    }
  }, [master.content, format]);
  const groups = useMemo(() => {
    const map = new Map<string, typeof bullets>();
    for (const b of bullets) {
      const key = b.role === "skills" ? "Skills" : [b.section, b.entry].filter(Boolean).join(" · ") || "Content";
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    return Array.from(map.entries());
  }, [bullets]);

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <FileText className="h-4 w-4 text-ink-faint" aria-hidden />
            {master.title}
          </span>
        }
        description={
          format === "docx"
            ? `Active master · ${master.file_name ?? "Word document"} · only the ${bullets.length} lines below can change when tailoring; fonts, layout, headings, dates and contact info are copied exactly.`
            : `Active master · LaTeX · ${bullets.length} editable bullets; preamble, commands and section formatting are preserved.`
        }
        actions={
          <Badge tone="accent" className="uppercase">
            {format}
          </Badge>
        }
      />
      <div className="max-h-[360px] space-y-3 overflow-auto px-4 py-3">
        {groups.map(([group, items]) => (
          <div key={group}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">{group}</p>
            <ul className="space-y-0.5">
              {items.map((b) => (
                <li key={b.id} className="flex gap-2 text-xs text-ink">
                  <span className="w-7 shrink-0 font-mono text-xs text-ink-faint">{b.id}</span>
                  <span>
                    {b.role === "skills" ? <span className="font-medium">{b.entry}: </span> : null}
                    {b.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {bullets.length === 0 ? <p className="text-xs text-ink-muted">No tailorable lines detected.</p> : null}
      </div>
    </Card>
  );
}

function DocxUpload() {
  const { toast } = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <CardHeader
        title="Upload your Word resume"
        description="Pick the resume you'd send by default — ideally one with all your strongest projects. Tailoring rewrites, reorders, or trims its bullets and skills lines and gives you back the same .docx."
      />
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
          <FileUp className="h-3.5 w-3.5" aria-hidden /> Choose .docx
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <span className="text-xs text-ink-muted">{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : "No file chosen"}</span>
        <Button
          size="sm"
          variant="primary"
          disabled={!file}
          loading={busy}
          onClick={async () => {
            if (!file) return;
            setBusy(true);
            try {
              const fd = new FormData();
              fd.set("file", file);
              const res = await uploadMasterDocx(fd);
              toast(res.message, res.ok ? "success" : "error");
              if (res.ok) {
                setFile(null);
                router.refresh();
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          Set as master
        </Button>
      </div>
    </Card>
  );
}

function LatexEditor({ master }: { master: MasterResumeRow | null }) {
  const { toast } = useToast();
  const router = useRouter();
  const [content, setContent] = useState(master?.content ?? "");
  const [title, setTitle] = useState(master?.title ?? "Master resume");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = content !== (master?.content ?? "") || title !== (master?.title ?? "Master resume");

  return (
    <Card>
      <CardHeader
        title="LaTeX master resume"
        description="Paste or upload .tex source. Tailoring only edits bullet content — never your preamble, contact info, or section formatting."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              <FileUp className="h-3.5 w-3.5" aria-hidden /> Upload .tex
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".tex,.txt"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setContent(await f.text());
                toast(`Loaded ${f.name}. Review, then save.`, "success");
              }}
            />
            <Button
              size="sm"
              variant="primary"
              loading={saving}
              disabled={!dirty}
              onClick={async () => {
                setSaving(true);
                try {
                  const fd = new FormData();
                  if (master) fd.set("id", master.id);
                  fd.set("title", title);
                  fd.set("content", content);
                  const res = await saveMasterResume(fd);
                  toast(res.message, res.ok ? "success" : "error");
                  if (res.ok) router.refresh();
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Save className="h-3.5 w-3.5" aria-hidden /> Save
            </Button>
          </div>
        }
      />
      <div className="space-y-3 p-4">
        <div className="max-w-sm">
          <Label htmlFor="resume-title">Name</Label>
          <Input id="resume-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="resume-content">LaTeX source</Label>
          <Textarea
            id="resume-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={"Paste your LaTeX resume here (\\documentclass … \\end{document})"}
            className="min-h-[360px] font-mono text-xs leading-5"
            spellCheck={false}
          />
        </div>
      </div>
    </Card>
  );
}
