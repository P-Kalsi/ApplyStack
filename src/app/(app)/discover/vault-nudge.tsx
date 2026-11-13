"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { seedVault } from "@/app/(app)/vault/actions";

/** Shown when the Career Vault is empty: match scores are meaningless until it has content. */
export function VaultNudge() {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3">
      <Database className="h-4 w-4 text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink">Your Career Vault is empty</p>
        <p className="text-2xs text-ink-muted">
          Match scores and tailoring use only verified vault facts. Load your profile
          (editable) or build it in the Career Vault.
        </p>
      </div>
      <Button
        size="sm"
        variant="primary"
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
        Load my profile
      </Button>
      <Button size="sm" variant="ghost" onClick={() => router.push("/vault")}>
        Open Career Vault
      </Button>
    </div>
  );
}
