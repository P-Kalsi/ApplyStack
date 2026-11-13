"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";
import type { EducationRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Confirm } from "@/components/ui/confirm";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { deleteEducation, upsertEducation } from "../actions";

export function EducationEditor({ education }: { education: EducationRow[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<EducationRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (fd: FormData) => {
    setBusy(true);
    try {
      const res = await upsertEducation(fd);
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

  const form = (row?: EducationRow) => (
    <form action={submit} className="grid grid-cols-1 gap-3 border-t border-line p-4 md:grid-cols-2">
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <div className="md:col-span-2">
        <Label htmlFor="school">School *</Label>
        <Input id="school" name="school" defaultValue={row?.school} required />
      </div>
      <div>
        <Label htmlFor="degree">Degree</Label>
        <Input id="degree" name="degree" defaultValue={row?.degree ?? ""} placeholder="BSc" />
      </div>
      <div>
        <Label htmlFor="major">Major</Label>
        <Input id="major" name="major" defaultValue={row?.major ?? ""} placeholder="Computer Science" />
      </div>
      <div>
        <Label htmlFor="location">Location</Label>
        <Input id="location" name="location" defaultValue={row?.location ?? ""} />
      </div>
      <div>
        <Label htmlFor="gpa">GPA (optional)</Label>
        <Input id="gpa" name="gpa" defaultValue={row?.gpa ?? ""} />
      </div>
      <div>
        <Label htmlFor="start_date">Start</Label>
        <Input id="start_date" name="start_date" defaultValue={row?.start_date ?? ""} placeholder="Sep 2023" />
      </div>
      <div>
        <Label htmlFor="expected_graduation">Expected graduation</Label>
        <Input
          id="expected_graduation"
          name="expected_graduation"
          defaultValue={row?.expected_graduation ?? ""}
          placeholder="May 2027"
        />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="coursework">Relevant coursework (comma-separated)</Label>
        <Textarea
          id="coursework"
          name="coursework"
          defaultValue={row?.coursework?.join(", ") ?? ""}
          placeholder="Software Construction, Databases, Computer Systems"
        />
      </div>
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" variant="primary" size="sm" loading={busy}>
          {row ? "Save changes" : "Add education"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setEditing(null);
            setAdding(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="primary" onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add education
        </Button>
      </div>
      {adding ? <Card>{form()}</Card> : null}
      {education.length === 0 && !adding ? (
        <EmptyState
          icon={<GraduationCap className="h-6 w-6" />}
          title="No education yet"
          description="Add your degree so tailoring can reference truthful education details."
        />
      ) : (
        education.map((row) => (
          <Card key={row.id}>
            <div className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-ink">{row.school}</h3>
                <p className="text-xs text-ink-muted">
                  {[row.degree, row.major].filter(Boolean).join(" ")}
                  {row.expected_graduation ? ` · expected ${row.expected_graduation}` : ""}
                  {row.location ? ` · ${row.location}` : ""}
                </p>
                {row.coursework.length ? (
                  <p className="mt-1 text-xs text-ink-faint">
                    Coursework: {row.coursework.join(", ")}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(row)} aria-label="Edit">
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <Confirm
                  title="Delete this education entry?"
                  description="This cannot be undone."
                  onConfirm={async () => {
                    const res = await deleteEducation(row.id);
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
          </Card>
        ))
      )}
    </div>
  );
}
