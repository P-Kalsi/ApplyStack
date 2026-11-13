"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ListChecks, Plus, Trash2, X } from "lucide-react";
import type { ExperienceRow, FactRow, ProjectRow } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Confirm } from "@/components/ui/confirm";
import { Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn, displaySkill } from "@/lib/utils";
import { deleteFact, setFactStatus, upsertFact } from "../actions";

type StatusFilter = "all" | "approved" | "pending" | "rejected";

export function FactsEditor({
  facts,
  experiences,
  projects,
}: {
  facts: FactRow[];
  experiences: ExperienceRow[];
  projects: ProjectRow[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [text, setText] = useState("");
  const [attach, setAttach] = useState("");
  const [busy, setBusy] = useState(false);

  const experienceName = new Map(experiences.map((e) => [e.id, `${e.role} @ ${e.company}`]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const visible = facts.filter((f) => filter === "all" || f.status === filter);
  const counts = {
    all: facts.length,
    approved: facts.filter((f) => f.status === "approved").length,
    pending: facts.filter((f) => f.status === "pending").length,
    rejected: facts.filter((f) => f.status === "rejected").length,
  };

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("fact_text", text.trim());
      if (attach.startsWith("exp:")) fd.set("experience_id", attach.slice(4));
      if (attach.startsWith("proj:")) fd.set("project_id", attach.slice(5));
      const res = await upsertFact(fd);
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok) {
        setText("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title="Add a fact"
          description="Atomic, truthful claims. Extracted resume facts arrive as pending and must be approved before use."
        />
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
            placeholder='e.g. "Built a responsive multi-page company website."'
            className="min-w-[260px] flex-1"
            aria-label="New fact text"
          />
          <Select value={attach} onChange={(e) => setAttach(e.target.value)} className="w-56" aria-label="Attach fact to">
            <option value="">Not attached (general)</option>
            {experiences.map((e) => (
              <option key={e.id} value={`exp:${e.id}`}>
                Experience: {e.role} @ {e.company}
              </option>
            ))}
            {projects.map((p) => (
              <option key={p.id} value={`proj:${p.id}`}>
                Project: {p.name}
              </option>
            ))}
          </Select>
          <Button variant="primary" size="sm" onClick={add} loading={busy}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add fact
          </Button>
        </div>
      </Card>

      <div className="flex flex-wrap gap-1.5">
        {(["all", "approved", "pending", "rejected"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            aria-pressed={filter === s}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium capitalize",
              filter === s
                ? "border-accent/40 bg-accent-soft text-accent"
                : "border-line bg-surface-raised text-ink-muted hover:text-ink"
            )}
          >
            {s} ({counts[s]})
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-6 w-6" />}
          title="No facts here"
          description="Add facts manually, load your profile, or extract facts from your master resume."
        />
      ) : (
        <Card className="divide-y divide-line">
          {visible.map((f) => (
            <div key={f.id} className="flex items-start gap-3 px-4 py-2.5">
              <Badge
                tone={f.status === "approved" ? "good" : f.status === "pending" ? "warn" : "bad"}
                className="mt-0.5 w-16 shrink-0 justify-center"
              >
                {f.status}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink">{f.fact_text}</p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {f.experience_id ? experienceName.get(f.experience_id) : null}
                  {f.project_id ? projectName.get(f.project_id) : null}
                  {!f.experience_id && !f.project_id ? "General" : null}
                  {" · "}
                  {f.category} · {f.source}
                  {f.keywords.length ? ` · ${f.keywords.map(displaySkill).join(", ")}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {f.status !== "approved" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Approve fact"
                    title="Approve — tailoring may cite this fact"
                    onClick={async () => {
                      const res = await setFactStatus(f.id, "approved");
                      toast(res.message, res.ok ? "success" : "error");
                      router.refresh();
                    }}
                  >
                    <Check className="h-3.5 w-3.5 text-good" aria-hidden />
                  </Button>
                ) : null}
                {f.status !== "rejected" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Reject fact"
                    title="Reject — never use this fact"
                    onClick={async () => {
                      const res = await setFactStatus(f.id, "rejected");
                      toast(res.message, res.ok ? "success" : "error");
                      router.refresh();
                    }}
                  >
                    <X className="h-3.5 w-3.5 text-warn" aria-hidden />
                  </Button>
                ) : null}
                <Confirm
                  title="Delete this fact?"
                  onConfirm={async () => {
                    const res = await deleteFact(f.id);
                    toast(res.message, res.ok ? "success" : "error");
                    router.refresh();
                  }}
                >
                  <Button size="sm" variant="ghost" aria-label="Delete fact">
                    <Trash2 className="h-3.5 w-3.5 text-bad" aria-hidden />
                  </Button>
                </Confirm>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
