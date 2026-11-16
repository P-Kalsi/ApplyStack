import type { Metadata } from "next";
import { createClient, requireUser } from "@/lib/supabase/server";
import { loadVaultSnapshot, vaultIsEmpty } from "@/lib/db/vault";
import type { MasterResumeRow } from "@/lib/types";
import { VaultView } from "./view";
import type { SampleSummary } from "./sections/letters";

export const metadata: Metadata = { title: "Career Vault" };

export default async function VaultPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [vault, masterRes, samplesRes] = await Promise.all([
    loadVaultSnapshot(supabase, user.id),
    supabase
      .from("master_resumes")
      .select("id, user_id, title, format, content, file_name, is_active, created_at, updated_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("writing_samples")
      .select("id, title, content, template_base64, is_template, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);
  const master = (masterRes.data as MasterResumeRow | null) ?? null;
  const pendingFacts = vault.facts.filter((f) => f.status === "pending").length;
  // Before migration 0011 the table doesn't exist; the tab then just shows no letters.
  const samples: SampleSummary[] = (samplesRes.error ? [] : samplesRes.data || []).map((s) => ({
    id: s.id as string,
    title: s.title as string,
    words: String(s.content || "").split(/\s+/).filter(Boolean).length,
    canTemplate: Boolean(s.template_base64),
    isTemplate: Boolean(s.is_template),
    created_at: s.created_at as string,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-title text-ink">Career Vault</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The source of truth for tailoring. The AI can only use what lives here — nothing else.
        </p>
      </div>

      {/* Tabs switch in the browser (the whole vault is already loaded). */}
      <VaultView
        vault={vault}
        master={master}
        pendingFacts={pendingFacts}
        isEmpty={vaultIsEmpty(vault)}
        samples={samples}
      />
    </div>
  );
}
