"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { parseAlertEmail, type AlertJob } from "@/lib/jobs/alert-import";
import { importAlertJobs } from "../actions";

/** Paste a LinkedIn or Indeed job-alert email; review the jobs it lists; save the ones you want. */
export function AlertImportCard() {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<(AlertJob & { pick: boolean })[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const parsed = useMemo(() => parseAlertEmail(text), [text]);
  const read = () => {
    setRows(parsed.map((j) => ({ ...j, pick: true })));
    setDone(false);
    if (!parsed.length) toast("No jobs found. Paste the whole email, links included if you can.", "error");
  };
  const set = (i: number, patch: Partial<AlertJob & { pick: boolean }>) =>
    setRows((r) => r.map((row, k) => (k === i ? { ...row, ...patch } : row)));
  const picked = rows.filter((r) => r.pick && r.title.trim() && r.company.trim());

  const save = async () => {
    setBusy(true);
    try {
      const res = await importAlertJobs(picked.map(({ pick: _pick, ...j }) => j));
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok) {
        setDone(true);
        setText("");
        setRows([]);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 px-4 py-3">
      <div>
        <Label htmlFor="alert-text">Job-alert email</Label>
        <Textarea
          id="alert-text"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Open the alert email, select all (Ctrl+A), copy and paste it here. A plain-text copy keeps the job links."
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={!text.trim()} onClick={read}>
          <Inbox className="h-3.5 w-3.5" aria-hidden /> Find jobs{parsed.length ? ` (${parsed.length})` : ""}
        </Button>
        {done ? (
          <Link href="/saved" className="text-xs font-medium text-accent hover:underline">
            Open Saved Jobs →
          </Link>
        ) : null}
      </div>

      {rows.length ? (
        <div className="space-y-2">
          <ul className="space-y-1.5">
            {rows.map((r, i) => (
              <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-md border border-line p-2">
                <input
                  type="checkbox"
                  checked={r.pick}
                  onChange={(e) => set(i, { pick: e.target.checked })}
                  aria-label={`Import ${r.title}`}
                  className="mt-2 accent-[rgb(var(--accent))]"
                />
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                  <Input value={r.title} onChange={(e) => set(i, { title: e.target.value })} aria-label="Title" />
                  <Input value={r.company} onChange={(e) => set(i, { company: e.target.value })} aria-label="Company" />
                  <Input value={r.location} onChange={(e) => set(i, { location: e.target.value })} aria-label="Location" placeholder="Location" />
                  {r.url ? <p className="truncate text-2xs text-ink-faint sm:col-span-3">{r.url}</p> : null}
                </div>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="primary" loading={busy} disabled={!picked.length} onClick={save}>
            Save {picked.length} job{picked.length === 1 ? "" : "s"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
