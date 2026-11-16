import type { Metadata } from "next";
import { createClient, requireUser } from "@/lib/supabase/server";
import { loadVaultSnapshot, vaultIsEmpty } from "@/lib/db/vault";
import type { MasterResumeRow } from "@/lib/types";
import { EducationEditor } from "./sections/education";
import { ExperiencesEditor } from "./sections/experiences";
import { ProjectsEditor } from "./sections/projects";
import { SkillsEditor } from "./sections/skills";
import { FactsEditor } from "./sections/facts";
import { ResumeEditor } from "./sections/resume";
import { VaultOverview } from "./sections/overview";
import { VaultTabs } from "./tabs";

export const metadata: Metadata = { title: "Career Vault" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "education", label: "Education" },
  { key: "experience", label: "Experience" },
  { key: "projects", label: "Projects" },
  { key: "skills", label: "Technical Skills" },
  { key: "facts", label: "Fact Bank" },
  { key: "resume", label: "Master Resume" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function VaultPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === rawTab)?.key ?? "overview") as TabKey;

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

      <VaultTabs tabs={TABS} active={tab} pendingFacts={pendingFacts} />

      {/* Keyed by tab so each section settles in when you switch to it. */}
      <div key={tab} className="animate-page-in">
      {tab === "overview" ? (
        <VaultOverview vault={vault} hasMaster={Boolean(master)} isEmpty={vaultIsEmpty(vault)} />
      ) : null}
      {tab === "education" ? <EducationEditor education={vault.education} /> : null}
      {tab === "experience" ? (
        <ExperiencesEditor experiences={vault.experiences} facts={vault.facts} />
      ) : null}
      {tab === "projects" ? <ProjectsEditor projects={vault.projects} facts={vault.facts} /> : null}
      {tab === "skills" ? <SkillsEditor skills={vault.skills} /> : null}
      {tab === "facts" ? (
        <FactsEditor facts={vault.facts} experiences={vault.experiences} projects={vault.projects} />
      ) : null}
      {tab === "resume" ? <ResumeEditor master={master} pendingFacts={pendingFacts} /> : null}
      </div>
    </div>
  );
}
