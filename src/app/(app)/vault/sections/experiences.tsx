"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Briefcase, Pencil, Plus, Trash2 } from "lucide-react";
import type { ExperienceRow, FactRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Confirm } from "@/components/ui/confirm";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { deleteExperience, upsertExperience } from "../actions";
import { FactBank } from "./fact-bank";

export function ExperiencesEditor({
  experiences,
  facts,
}: {
  experiences: ExperienceRow[];
  facts: FactRow[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<ExperienceRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (fd: FormData) => {
    setBusy(true);
    try {
      const res = await upsertExperience(fd);
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok) {
        setEditing(null);
        setAdding(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const form = (row?: ExperienceRow) => (
    <form action={submit} className="grid grid-cols-1 gap-3 border-t border-line p-4 md:grid-cols-2">
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <div>
        <Label htmlFor="company">Company *</Label>
        <Input id="company" name="company" defaultValue={row?.company} required />
      </div>
      <div>
        <Label htmlFor="role">Role *</Label>
        <Input id="role" name="role" defaultValue={row?.role} required />
      </div>
      <div>
        <Label htmlFor="location">Location</Label>
        <Input id="location" name="location" defaultValue={row?.location ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="start_date">Start</Label>
          <Input id="start_date" name="start_date" defaultValue={row?.start_date ?? ""} placeholder="May 2025" />
        </div>
        <div>
          <Label htmlFor="end_date">End</Label>
          <Input id="end_date" name="end_date" defaultValue={row?.end_date ?? ""} placeholder="Aug 2025" />
        </div>
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="summary">Summary</Label>
        <Textarea id="summary" name="summary" defaultValue={row?.summary ?? ""} />
      </div>
      <label className="flex items-center gap-2 text-xs text-ink md:col-span-2">
        <input type="checkbox" name="is_current" defaultChecked={row?.is_current} className="accent-[rgb(var(--accent))]" />
        I currently work here
      </label>
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" variant="primary" size="sm" loading={busy}>
          {row ? "Save changes" : "Add experience"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(null); setAdding(false); }}>
          Cancel
        </Button>
      </div>
    </form>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="primary" onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add experience
        </Button>
      </div>
      {adding ? <Card>{form()}</Card> : null}
      {experiences.length === 0 && !adding ? (
        <EmptyState
          icon={<Briefcase className="h-6 w-6" />}
          title="No experience yet"
          description="Add roles with detailed accomplishment facts — the fact bank is what tailoring draws from."
        />
      ) : (
        experiences.map((row) => (
          <Card key={row.id}>
            <div className="flex items-start justify-between gap-3 p-4 pb-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-ink">
                  {row.role} <span className="font-normal text-ink-muted">· {row.company}</span>
                </h3>
                <p className="text-xs text-ink-faint">
                  {[row.start_date, row.is_current ? "Present" : row.end_date].filter(Boolean).join(" – ")}
                  {row.location ? ` · ${row.location}` : ""}
                </p>
                {row.summary ? <p className="mt-1 text-xs text-ink-muted">{row.summary}</p> : null}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(row)} aria-label="Edit">
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <Confirm
                  title={`Delete "${row.role}" at ${row.company}?`}
                  description="Its fact bank is deleted with it."
                  onConfirm={async () => {
                    const res = await deleteExperience(row.id);
                    toast(res.message, res.ok ? "success" : "error");
                    router.refresh();
                  }}
                >
                  <Button size="sm" variant="ghost" aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5 text-bad" aria-hidden />
                  </Button>
                </Confirm>
              </div>
            </div>
            {editing?.id === row.id ? form(row) : null}
            <FactBank facts={facts.filter((f) => f.experience_id === row.id)} experienceId={row.id} />
          </Card>
        ))
      )}
    </div>
  );
}
