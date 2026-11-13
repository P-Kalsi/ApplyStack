"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createManualJob, previewPosting } from "../actions";

export function NewJobForm() {
  const { toast } = useToast();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [filling, setFilling] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
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
          placeholder="Paste the whole description: about the role, responsibilities, requirements…"
          className="w-full"
        />
      </div>
      <Button type="submit" variant="primary" loading={saving}>
        {saving ? null : <Plus className="h-4 w-4" aria-hidden />}
        Add job
      </Button>
    </form>
  );
}
