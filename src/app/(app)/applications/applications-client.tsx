"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Kanban,
  Pencil,
  Plus,
  Table2,
  Trash2,
} from "lucide-react";
import { APPLICATION_STATUSES, type ApplicationRow, type ApplicationStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Confirm } from "@/components/ui/confirm";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate } from "@/lib/utils";
import { deleteApplication, moveApplication, upsertApplication } from "./actions";

export interface VersionOption {
  id: string;
  name: string;
}

const statusTone: Record<ApplicationStatus, "neutral" | "accent" | "good" | "warn" | "bad"> = {
  saved: "neutral",
  tailoring: "accent",
  ready: "accent",
  applied: "warn",
  oa: "warn",
  interview: "warn",
  offer: "good",
  rejected: "bad",
  withdrawn: "neutral",
};

export function ApplicationsClient({
  applications,
  versions,
}: {
  applications: ApplicationRow[];
  versions: VersionOption[];
}) {
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [editing, setEditing] = useState<ApplicationRow | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold text-ink">Applications</h1>
          <p className="text-xs text-ink-muted">{applications.length} in your pipeline</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-md border border-line bg-surface-raised p-0.5" role="tablist">
            <button
              role="tab"
              aria-selected={view === "kanban"}
              onClick={() => setView("kanban")}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium",
                view === "kanban" ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-ink"
              )}
            >
              <Kanban className="h-3.5 w-3.5" aria-hidden /> Kanban
            </button>
            <button
              role="tab"
              aria-selected={view === "table"}
              onClick={() => setView("table")}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium",
                view === "table" ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-ink"
              )}
            >
              <Table2 className="h-3.5 w-3.5" aria-hidden /> Table
            </button>
          </div>
          <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add manually
          </Button>
        </div>
      </div>

      {adding || editing ? (
        <ApplicationForm
          app={editing}
          versions={versions}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      ) : null}

      {applications.length === 0 && !adding ? (
        <EmptyState
          icon={<Briefcase className="h-6 w-6" />}
          title="No applications yet"
          description="Save a job on the Discover board (it lands here automatically) or add one manually."
        />
      ) : view === "kanban" ? (
        <KanbanBoard applications={applications} onEdit={setEditing} />
      ) : (
        <ApplicationsTable applications={applications} versions={versions} onEdit={setEditing} />
      )}
    </div>
  );
}

function KanbanBoard({
  applications,
  onEdit,
}: {
  applications: ApplicationRow[];
  onEdit: (a: ApplicationRow) => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const order = APPLICATION_STATUSES.map((s) => s.value);

  const move = async (app: ApplicationRow, dir: -1 | 1) => {
    const idx = order.indexOf(app.status);
    const next = order[idx + dir];
    if (!next) return;
    const res = await moveApplication(app.id, next);
    toast(res.message, res.ok ? "success" : "error");
    router.refresh();
  };

  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {APPLICATION_STATUSES.map((status) => {
        const items = applications.filter((a) => a.status === status.value);
        return (
          <div key={status.value} className="w-56 shrink-0">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-ink">{status.label}</span>
              <span className="text-2xs tabular-nums text-ink-faint">{items.length}</span>
            </div>
            <div className="space-y-1.5 rounded-lg bg-surface-sunken/60 p-1.5 min-h-[80px]">
              {items.map((app) => (
                <div key={app.id} className="rounded-md border border-line bg-surface-raised p-2">
                  <p className="line-clamp-1 text-xs font-semibold text-ink">{app.company}</p>
                  <p className="line-clamp-2 text-2xs text-ink-muted">{app.role}</p>
                  {app.next_action ? (
                    <p className="mt-1 text-2xs text-warn">
                      → {app.next_action}
                      {app.next_action_date ? ` (${formatDate(app.next_action_date)})` : ""}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex items-center gap-0.5">
                    <button
                      className="rounded p-1 text-ink-faint hover:bg-surface-sunken hover:text-ink disabled:opacity-30"
                      onClick={() => move(app, -1)}
                      disabled={order.indexOf(app.status) === 0}
                      aria-label="Move to previous stage"
                      title="Previous stage"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="rounded p-1 text-ink-faint hover:bg-surface-sunken hover:text-ink disabled:opacity-30"
                      onClick={() => move(app, 1)}
                      disabled={order.indexOf(app.status) === order.length - 1}
                      aria-label="Move to next stage"
                      title="Next stage"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="ml-auto rounded p-1 text-ink-faint hover:bg-surface-sunken hover:text-ink"
                      onClick={() => onEdit(app)}
                      aria-label="Edit application"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {app.job_url ? (
                      <a
                        href={app.job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1 text-ink-faint hover:bg-surface-sunken hover:text-ink"
                        aria-label="Open job posting"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ApplicationsTable({
  applications,
  versions,
  onEdit,
}: {
  applications: ApplicationRow[];
  versions: VersionOption[];
  onEdit: (a: ApplicationRow) => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const versionName = new Map(versions.map((v) => [v.id, v.name]));

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-xs">
        <thead>
          <tr className="border-b border-line text-2xs uppercase tracking-wide text-ink-faint">
            <th className="px-3 py-2 font-medium">Company</th>
            <th className="px-3 py-2 font-medium">Role</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Applied</th>
            <th className="px-3 py-2 font-medium">Resume version</th>
            <th className="px-3 py-2 font-medium">Next action</th>
            <th className="px-3 py-2 font-medium" aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {applications.map((app) => (
            <tr key={app.id} className="hover:bg-surface-sunken/50">
              <td className="px-3 py-2 font-medium text-ink">{app.company}</td>
              <td className="max-w-[220px] truncate px-3 py-2 text-ink-muted">{app.role}</td>
              <td className="px-3 py-2">
                <Select
                  value={app.status}
                  onChange={async (e) => {
                    const res = await moveApplication(app.id, e.target.value as ApplicationStatus);
                    toast(res.message, res.ok ? "success" : "error");
                    router.refresh();
                  }}
                  className="h-7 w-40 text-xs"
                  aria-label={`Status for ${app.company}`}
                >
                  {APPLICATION_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </td>
              <td className="px-3 py-2 tabular-nums text-ink-muted">{formatDate(app.date_applied)}</td>
              <td className="max-w-[180px] truncate px-3 py-2">
                {app.resume_version_id ? (
                  <Link
                    href={`/tailor/review/${app.resume_version_id}`}
                    className="text-accent hover:underline"
                  >
                    {versionName.get(app.resume_version_id) || "View version"}
                  </Link>
                ) : (
                  <span className="text-ink-faint">—</span>
                )}
              </td>
              <td className="max-w-[200px] px-3 py-2">
                {app.next_action ? (
                  <span>
                    {app.next_action}
                    {app.next_action_date ? (
                      <span className="text-ink-faint"> · {formatDate(app.next_action_date)}</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-ink-faint">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-0.5">
                  <Badge tone={statusTone[app.status]} className="mr-1 md:hidden">
                    {app.status}
                  </Badge>
                  {app.job_url ? (
                    <a
                      href={app.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1 text-ink-faint hover:text-ink"
                      aria-label="Open job posting"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                  <button
                    className="rounded p-1 text-ink-faint hover:text-ink"
                    onClick={() => onEdit(app)}
                    aria-label="Edit application"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <Confirm
                    title={`Delete application at ${app.company}?`}
                    onConfirm={async () => {
                      const res = await deleteApplication(app.id);
                      toast(res.message, res.ok ? "success" : "error");
                      router.refresh();
                    }}
                  >
                    <button className="rounded p-1 text-ink-faint hover:text-bad" aria-label="Delete application">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Confirm>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ApplicationForm({
  app,
  versions,
  onClose,
}: {
  app: ApplicationRow | null;
  versions: VersionOption[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const submit = async (fd: FormData) => {
    setBusy(true);
    try {
      const res = await upsertApplication(fd);
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok) {
        onClose();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <form action={submit} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        {app ? <input type="hidden" name="id" value={app.id} /> : null}
        <div>
          <Label htmlFor="app-company">Company *</Label>
          <Input id="app-company" name="company" defaultValue={app?.company} required />
        </div>
        <div>
          <Label htmlFor="app-role">Role *</Label>
          <Input id="app-role" name="role" defaultValue={app?.role} required />
        </div>
        <div>
          <Label htmlFor="app-status">Status</Label>
          <Select id="app-status" name="status" defaultValue={app?.status ?? "saved"}>
            {APPLICATION_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="app-date">Date applied</Label>
          <Input id="app-date" name="date_applied" type="date" defaultValue={app?.date_applied ?? ""} />
        </div>
        <div>
          <Label htmlFor="app-version">Resume version used</Label>
          <Select id="app-version" name="resume_version_id" defaultValue={app?.resume_version_id ?? ""}>
            <option value="">None</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="app-url">Job URL</Label>
          <Input id="app-url" name="job_url" type="url" defaultValue={app?.job_url ?? ""} />
        </div>
        <div>
          <Label htmlFor="app-next">Next action</Label>
          <Input
            id="app-next"
            name="next_action"
            defaultValue={app?.next_action ?? ""}
            placeholder="Follow up with recruiter"
          />
        </div>
        <div>
          <Label htmlFor="app-next-date">Next action date</Label>
          <Input
            id="app-next-date"
            name="next_action_date"
            type="date"
            defaultValue={app?.next_action_date ?? ""}
          />
        </div>
        <div className="md:col-span-3">
          <Label htmlFor="app-notes">Notes</Label>
          <Textarea id="app-notes" name="notes" defaultValue={app?.notes ?? ""} />
        </div>
        <div className="flex gap-2 md:col-span-3">
          <Button type="submit" variant="primary" size="sm" loading={busy}>
            {app ? "Save application" : "Add application"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
