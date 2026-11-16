import type { Metadata } from "next";
import { createClient, requireUser } from "@/lib/supabase/server";
import { loadVaultSnapshot, vaultIsEmpty } from "@/lib/db/vault";
import type { MasterResumeRow } from "@/lib/types";
import { VaultView } from "./view";

export const metadata: Metadata = { title: "Career Vault" };

export default async function VaultPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [vault, masterRes] = await Promise.all([
    loadVaultSnapshot(supabase, user.id),
    supabase
      .from("master_resumes")
      .select("id, user_id, title, format, content, file_name, is_active, created_at, updated_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const master = (masterRes.data as MasterResumeRow | null) ?? null;
  const pendingFacts = vault.facts.filter((f) => f.status === "pending").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-title text-ink">Career Vault</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The source of truth for tailoring. The AI can only use what lives here — nothing else.
        </p>
      </div>

      {/* Tabs switch in the browser (the whole vault is already loaded). */}
      <VaultView vault={vault} master={master} pendingFacts={pendingFacts} isEmpty={vaultIsEmpty(vault)} />
    </div>
  );
}
