"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FolderGit2, Pencil, Plus, Trash2 } from "lucide-react";
import type { FactRow, ProjectRow } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Confirm } from "@/components/ui/confirm";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { deleteProject, upsertProject } from "../actions";
import { FactBank } from "./fact-bank";

export function ProjectsEditor({ projects, facts }: { projects: ProjectRow[]; facts: FactRow[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (fd: FormData) => {
    setBusy(true);
    try {
      const res = await upsertProject(fd);
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

  const form = (row?: ProjectRow) => (
    <form action={submit} className="grid grid-cols-1 gap-3 border-t border-line p-4 md:grid-cols-2">
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <div>
        <Label htmlFor="name">Project name *</Label>
        <Input id="name" name="name" defaultValue={row?.name} required />
      </div>
      <div>
        <Label htmlFor="technologies">Technologies (comma-separated)</Label>
        <Input
          id="technologies"
          name="technologies"
          defaultValue={row?.technologies?.join(", ") ?? ""}
          placeholder="React, TypeScript, FastAPI"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="start_date">Start</Label>
          <Input id="start_date" name="start_date" defaultValue={row?.start_date ?? ""} />
        </div>
        <div>
          <Label htmlFor="end_date">End</Label>
          <Input id="end_date" name="end_date" defaultValue={row?.end_date ?? ""} />
        </div>
      </div>
      <div>
        <Label htmlFor="links">Links (comma-separated)</Label>
        <Input id="links" name="links" defaultValue={row?.links?.join(", ") ?? ""} placeholder="https://github.com/…" />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" defaultValue={row?.description ?? ""} />
      </div>
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" variant="primary" size="sm" loading={busy}>
          {row ? "Save changes" : "Add project"}
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
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add project
        </Button>
      </div>
      {adding ? <Card>{form()}</Card> : null}
      {projects.length === 0 && !adding ? (
        <EmptyState
          icon={<FolderGit2 className="h-6 w-6" />}
          title="No projects yet"
          description="Projects with rich fact banks (metrics, stack, outcomes) give tailoring the most to work with."
        />
      ) : (
        projects.map((row) => (
          <Card key={row.id}>
            <div className="flex items-start justify-between gap-3 p-4 pb-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-ink">{row.name}</h3>
                {row.technologies.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.technologies.map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </div>
                ) : null}
                {row.description ? <p className="mt-1 text-xs text-ink-muted">{row.description}</p> : null}
                {row.links.length ? (
                  <p className="mt-1 truncate text-2xs text-accent">{row.links.join(" · ")}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(row)} aria-label="Edit">
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <Confirm
                  title={`Delete "${row.name}"?`}
                  description="Its fact bank is deleted with it."
                  onConfirm={async () => {
                    const res = await deleteProject(row.id);
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
            <FactBank facts={facts.filter((f) => f.project_id === row.id)} projectId={row.id} />
          </Card>
        ))
      )}
    </div>
  );
}
