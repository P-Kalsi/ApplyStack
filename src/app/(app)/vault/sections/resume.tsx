"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp, ScanText, Save } from "lucide-react";
import type { MasterResumeRow } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { extractResumeFacts, saveMasterResume } from "../actions";

export function ResumeEditor({
  master,
  pendingFacts,
}: {
  master: MasterResumeRow | null;
  pendingFacts: number;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [content, setContent] = useState(master?.content ?? "");
  const [title, setTitle] = useState(master?.title ?? "Master resume");
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = content !== (master?.content ?? "") || title !== (master?.title ?? "Master resume");

  const save = async () => {
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
  };

  const onFile = async (file: File) => {
    if (!/\.(tex|txt)$/i.test(file.name)) {
      toast("Upload a .tex (or plain .txt) file. PDF/DOCX import is not supported — paste the LaTeX source instead.", "error");
      return;
    }
    const text = await file.text();
    setContent(text);
    toast(`Loaded ${file.name} into the editor. Review, then save.`, "success");
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title="Master resume (LaTeX)"
          description="The original structure and styling are preserved. Tailoring only edits bullet content — never your layout, contact info, or section formatting."
          actions={
            <div className="flex items-center gap-2">
              {master ? (
                <Badge tone="accent" className="uppercase">
                  {master.format}
                </Badge>
              ) : null}
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                <FileUp className="h-3.5 w-3.5" aria-hidden /> Upload .tex
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".tex,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                  e.target.value = "";
                }}
              />
              <Button size="sm" variant="primary" onClick={save} loading={saving} disabled={!dirty}>
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
              className="min-h-[420px] font-mono text-xs leading-5"
              spellCheck={false}
            />
          </div>
          <p className="text-2xs text-ink-faint">
            {content.length.toLocaleString()} characters
            {content.includes("\\resumeItem") || content.includes("\\item")
              ? " · bullets detected — tailoring can edit them"
              : content.trim()
                ? " · no \\resumeItem/\\item bullets detected yet"
                : ""}
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Extracted resume facts"
          description="Deterministically restates your resume bullets as candidate facts (nothing is invented). New facts arrive as pending for your approval."
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
            <p>No pending facts. Extract after updating your resume to keep the fact bank in sync.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
