"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SkillGroupRow } from "@/lib/types";
import { SKILL_CATEGORIES } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { upsertSkillGroup } from "../actions";

export function SkillsEditor({ skills }: { skills: SkillGroupRow[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const byCategory = new Map(skills.map((s) => [s.category, s]));
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const cat of SKILL_CATEGORIES) {
      d[cat.value] = byCategory.get(cat.value)?.items.join(", ") ?? "";
    }
    return d;
  });
  const [savingCat, setSavingCat] = useState<string | null>(null);

  const save = async (category: string) => {
    setSavingCat(category);
    try {
      const fd = new FormData();
      fd.set("category", category);
      fd.set("items", drafts[category] || "");
      const res = await upsertSkillGroup(fd);
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok) router.refresh();
    } finally {
      setSavingCat(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Technical skills"
        description="Comma-separated per category. Matching canonicalizes names (Postgres = PostgreSQL). Only list what you can defend in an interview."
      />
      <div className="divide-y divide-line">
        {SKILL_CATEGORIES.map((cat) => {
          const items = byCategory.get(cat.value)?.items ?? [];
          const existing = items.join(", ");
          const dirty = (drafts[cat.value] || "") !== existing;
          return (
            <div key={cat.value} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <span className="w-40 shrink-0 text-xs font-medium text-ink">{cat.label}</span>
              <Input
                value={drafts[cat.value] || ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [cat.value]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void save(cat.value);
                  }
                }}
                placeholder="e.g. TypeScript, Python, SQL"
                className="min-w-[240px] flex-1"
                aria-label={`${cat.label} skills`}
              />
              <Button
                size="sm"
                variant={dirty ? "primary" : "ghost"}
                onClick={() => save(cat.value)}
                loading={savingCat === cat.value}
                disabled={!dirty && savingCat !== cat.value}
              >
                Save
              </Button>
              {items.length ? (
                <ul className="flex w-full flex-wrap gap-1 sm:pl-[10.5rem]" aria-label={`Your ${cat.label} skills`}>
                  {items.map((item, i) => (
                    <li key={`${item}-${i}`}>
                      <Badge tone="have">{item}</Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
