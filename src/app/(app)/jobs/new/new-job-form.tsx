"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, Info, Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { parseImportFragment } from "@/lib/jobs/bookmarklet";
import { sourceBadge } from "@/lib/jobs/sources/badges";
import { createManualJob, importJobFromPage, previewPosting } from "../actions";

type Filled = {
  company: string;
  title: string;
  location: string;
  description: string;
  url: string;
  site: string | null;
  method: "ai" | "basic";
  notes: string[];
};

export function NewJobForm() {
  const { toast } = useToast();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [pasted, setPasted] = useState("");
  const [filling, setFilling] = useState(false);
  const [reading, setReading] = useState<"paste" | "bookmark" | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Filled | null>(null);
  const handledHash = useRef(false);

  const applyResult = (job: Filled) => {
    setResult(job);
    if (job.url) setUrl(job.url);
    setCompany(job.company);
    setTitle(job.title);
    setLocation(job.location);
    setDescription(job.description);
    setDescriptionHtml("");
  };

  const runImport = async (capture: { url: string; title: string; text: string }, how: "paste" | "bookmark") => {
    setReading(how);
    try {
      const res = await importJobFromPage(capture);
      if (!res.ok) {
        toast(res.message, "error");
        return;
      }
      applyResult(res.job);
      toast(
        res.job.method === "ai" ? "Found the job. Check the fields, then Add job." : "Filled in what I could. Check every field.",
        "success"
      );
    } finally {
      setReading(null);
    }
  };

  // Arriving from the "Send to ApplyStack" bookmark: the page text is in #import=...
  // (also handled if this tab is already open and only the # part changes).
  useEffect(() => {
    const take = () => {
      const data = parseImportFragment(window.location.hash);
      if (!data) return;
      // Drop the page text from the address bar and history.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setUrl(data.u);
      void runImport({ url: data.u, title: data.t, text: data.x }, "bookmark");
    };
    if (!handledHash.current) {
      handledHash.current = true;
      take();
    }
    window.addEventListener("hashchange", take);
    return () => window.removeEventListener("hashchange", take);
    // runImport only uses state setters and toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="divide-y divide-line">
      <section className="space-y-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <ClipboardPaste className="h-4 w-4 text-ink-muted" aria-hidden />
          <h3 className="text-sm font-medium text-ink">Paste the whole job page</h3>
        </div>
        <p className="text-2xs text-ink-muted">
          Works for LinkedIn, Indeed and any other site: on the job page press Ctrl+A, then Ctrl+C, and paste here. Your
          AI backend finds the company, title, location and description; the description is cut from the page text
          word for word, never rewritten.
        </p>
        <Textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={5}
          placeholder="Paste the copied page here…"
          className="w-full"
          aria-label="Copied job page"
        />
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={reading === "paste"}
          disabled={pasted.trim().length < 80 || reading !== null}
          onClick={() => runImport({ url: url.trim(), title: "", text: pasted }, "paste")}
        >
          Find the job in this text
        </Button>
      </section>

      {reading === "bookmark" ? (
        <p className="px-4 py-3 text-sm text-ink-muted">Reading the job you sent from your browser…</p>
      ) : null}

      {result ? (
        <div className="space-y-1 bg-surface px-4 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5 text-ink">
            <Info className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
            {result.method === "ai" ? "Filled in by your AI backend from the page text." : "Filled in without AI."}
            {result.site ? <Badge tone="accent">{sourceBadge(result.site)}</Badge> : null}
          </div>
          {result.notes.map((n, i) => (
            <p key={i} className="text-warn">
              {n}
            </p>
          ))}
        </div>
      ) : null}

      <form
        className="space-y-3 px-4 py-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            const res = await createManualJob({
              company,
              title,
              location,
              url,
              description,
              description_html: descriptionHtml,
            });
            toast(res.message, res.ok ? "success" : "error");
            if (res.ok) router.push(`/jobs/${res.jobId}`);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="job-url">Posting link</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="job-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="min-w-0 flex-1"
              inputMode="url"
            />
            <Button
              type="button"
              variant="secondary"
              loading={filling}
              disabled={!url.trim()}
              title="Greenhouse, Lever, Ashby and Workday links"
              onClick={async () => {
                setFilling(true);
                try {
                  const res = await previewPosting(url);
                  if (!res.ok) {
                    toast(res.message, "error");
                    return;
                  }
                  const p = res.posting;
                  setTitle(p.title || title);
                  if (p.company) setCompany(p.company);
                  if (p.location) setLocation(p.location);
                  setDescription(p.description_text);
                  setDescriptionHtml(p.description_html || "");
                  setResult(null);
                  toast(p.company ? "Filled from the posting." : "Filled from the posting. Add the company name.", "success");
                } finally {
                  setFilling(false);
                }
              }}
            >
              {filling ? null : <Link2 className="h-3.5 w-3.5" aria-hidden />}
              Fill from link
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="job-company">Company</Label>
            <Input id="job-company" value={company} onChange={(e) => setCompany(e.target.value)} required className="w-full" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="job-title">Job title</Label>
            <Input id="job-title" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="job-location">Location</Label>
            <Input
              id="job-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Vancouver, BC"
              className="w-full"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="job-desc">Job description</Label>
          <Textarea
            id="job-desc"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setDescriptionHtml(""); // edited by hand: the plain text is the source of truth
            }}
            rows={14}
            required
            placeholder="The description goes here (filled in by the import or Fill from link, or paste it yourself)…"
            className="w-full"
          />
        </div>
        <Button type="submit" variant="primary" loading={saving}>
          {saving ? null : <Plus className="h-4 w-4" aria-hidden />}
          Add job
        </Button>
      </form>
    </div>
  );
}
