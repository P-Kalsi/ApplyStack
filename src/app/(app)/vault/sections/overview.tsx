"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Database, FileText, FolderGit2, GraduationCap, ListChecks, Wrench } from "lucide-react";
import type { VaultSnapshot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { seedVault } from "../actions";

export function VaultOverview({
  vault,
  hasMaster,
  isEmpty,
}: {
  vault: VaultSnapshot;
  hasMaster: boolean;
  isEmpty: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const approved = vault.facts.filter((f) => f.status === "approved").length;
  const pending = vault.facts.filter((f) => f.status === "pending").length;

  const stats = [
    { label: "Education", count: vault.education.length, href: "/vault?tab=education", icon: GraduationCap },
    { label: "Experiences", count: vault.experiences.length, href: "/vault?tab=experience", icon: Wrench },
    { label: "Projects", count: vault.projects.length, href: "/vault?tab=projects", icon: FolderGit2 },
    {
      label: "Skill groups",
      count: vault.skills.length,
      href: "/vault?tab=skills",
      icon: Database,
    },
    { label: "Approved facts", count: approved, href: "/vault?tab=facts", icon: ListChecks },
    { label: "Master resume", count: hasMaster ? 1 : 0, href: "/vault?tab=resume", icon: FileText },
  ];

  return (
    <div className="space-y-3">
      {isEmpty ? (
        <Card className="flex flex-wrap items-center gap-3 border-accent/30 bg-accent-soft p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Start with the sample profile</p>
            <p className="text-xs text-ink-muted">
              Loads editable starter records (UBC CS, SaveMyGrade, ProtectPibble, SiteSee,
              InsightUBC, home lab, startup experience) plus a sample LaTeX master resume.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await seedVault();
                toast(res.message, res.ok ? "success" : "error");
                if (res.ok) router.refresh();
              } finally {
                setBusy(false);
              }
            }}
          >
            Load starter profile
          </Button>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map(({ label, count, href, icon: Icon }) => (
          <Link key={label} href={href}>
            <Card className="p-3 transition-colors hover:border-line-strong">
              <Icon className="h-4 w-4 text-ink-faint" aria-hidden />
              <p className="mt-2 text-lg font-semibold tabular-nums text-ink">{count}</p>
              <p className="text-2xs text-ink-muted">{label}</p>
            </Card>
          </Link>
        ))}
      </div>

      {pending > 0 ? (
        <Card className="flex items-center justify-between gap-3 border-warn/40 p-3">
          <p className="text-xs text-ink">
            <span className="font-medium">{pending} extracted fact(s) awaiting review.</span>{" "}
            <span className="text-ink-muted">
              Pending facts are never used for matching or tailoring until you approve them.
            </span>
          </p>
          <Link href="/vault?tab=facts" className="text-xs font-medium text-accent hover:underline">
            Review →
          </Link>
        </Card>
      ) : null}

      <Card className="p-4 text-xs leading-5 text-ink-muted">
        <p className="mb-1 font-medium text-ink">How the vault is used</p>
        <p>
          Tailoring runs a deterministic relevance filter over these records, sends only the most
          relevant approved facts to the model, and then verifies every proposed bullet against
          the vault: rewrites that introduce technologies or numbers with no supporting fact are
          rejected automatically. Keep facts atomic and truthful — one claim per fact.
        </p>
      </Card>
    </div>
  );
}
