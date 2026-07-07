"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { FactRow } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { displaySkill } from "@/lib/utils";
import { deleteFact, upsertFact } from "../actions";

/**
 * Inline fact bank attached to one experience or project.
 * Facts are atomic truthful claims; tailoring cites them by id.
 */
export function FactBank({
  facts,
  experienceId,
  projectId,
}: {
  facts: FactRow[];
  experienceId?: string;
  projectId?: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("fact_text", text.trim());
      if (experienceId) fd.set("experience_id", experienceId);
      if (projectId) fd.set("project_id", projectId);
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
    <div className="space-y-1.5 border-t border-line bg-surface-sunken/50 px-4 py-3">
      <p className="text-2xs font-medium uppercase tracking-wide text-ink-faint">
        Fact bank ({facts.length})
      </p>
      <ul className="space-y-1">
        {facts.map((f) => (
          <li key={f.id} className="group flex items-start gap-2 text-xs text-ink">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-faint" aria-hidden />
            <span className="flex-1">
              {f.fact_text}
              {f.status !== "approved" ? (
                <Badge tone={f.status === "pending" ? "warn" : "bad"} className="ml-1.5">
                  {f.status}
                </Badge>
              ) : null}
              {f.keywords.length ? (
                <span className="ml-1.5 text-2xs text-ink-faint">
                  [{f.keywords.map(displaySkill).join(", ")}]
                </span>
              ) : null}
            </span>
            <Confirm
              title="Delete this fact?"
              description="Tailored resumes that cited it keep their history, but new tailoring can no longer use it."
              onConfirm={async () => {
                const res = await deleteFact(f.id);
                toast(res.message, res.ok ? "success" : "error");
                router.refresh();
              }}
            >
              <button
                className="text-ink-faint opacity-0 transition-opacity hover:text-bad group-hover:opacity-100"
                aria-label="Delete fact"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </Confirm>
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5 pt-1">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder="Add an atomic, truthful claim…"
          className="h-7 text-xs"
          aria-label="New fact"
        />
        <Button size="sm" variant="secondary" onClick={add} loading={busy}>
          <Plus className="h-3 w-3" aria-hidden /> Add
        </Button>
      </div>
    </div>
  );
}
