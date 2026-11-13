"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClipboardPaste, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { fetchJobDescription, saveJobDescription } from "../actions";

/**
 * Shown on a job that has no description yet (typical for the internship
 * feed): fetch it from the posting link where possible, or paste it.
 */
export function DescriptionPanel({
  jobId,
  canFetch,
  url,
  startOpen = false,
}: {
  jobId: string;
  canFetch: boolean;
  url: string | null;
  startOpen?: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pasting, setPasting] = useState(startOpen || !canFetch);
  const [text, setText] = useState("");

  return (
    <div className="space-y-3 px-4 py-3 text-sm">
      <p className="text-ink-muted">
        {canFetch
          ? "This listing came without its description. ApplyStack can read it from the posting link, or you can paste it."
          : "ApplyStack can't read descriptions from this job site automatically. Open the posting, copy the description, and paste it here."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {canFetch ? (
          <Button
            size="sm"
            variant="primary"
            loading={fetching}
            onClick={async () => {
              setFetching(true);
              try {
                const res = await fetchJobDescription(jobId);
                toast(res.message, res.ok ? "success" : "error");
                if (res.ok) router.refresh();
                else setPasting(true);
              } finally {
                setFetching(false);
              }
            }}
          >
            {fetching ? null : <Download className="h-3.5 w-3.5" aria-hidden />}
            Get description
          </Button>
        ) : null}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-accent hover:underline"
          >
            Open posting ↗
          </a>
        ) : null}
        {!pasting ? (
          <button type="button" className="text-xs text-ink-muted hover:text-ink" onClick={() => setPasting(true)}>
            Paste it instead
          </button>
        ) : null}
      </div>
      {pasting ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              const res = await saveJobDescription(jobId, text);
              toast(res.message, res.ok ? "success" : "error");
              if (res.ok) router.refresh();
            } finally {
              setSaving(false);
            }
          }}
        >
          <Label htmlFor="paste-desc">Job description</Label>
          <Textarea
            id="paste-desc"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder="Paste everything from the posting: about the role, responsibilities, requirements…"
            className="w-full"
          />
          <Button type="submit" size="sm" variant={canFetch ? "secondary" : "primary"} loading={saving}>
            {saving ? null : <ClipboardPaste className="h-3.5 w-3.5" aria-hidden />}
            Save description
          </Button>
        </form>
      ) : null}
    </div>
  );
}
