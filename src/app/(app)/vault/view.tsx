"use client";

import { useSearchParams } from "next/navigation";
import type { MasterResumeRow, VaultSnapshot } from "@/lib/types";
import { TabPanel } from "@/components/ui/tab-panel";
import { EducationEditor } from "./sections/education";
import { ExperiencesEditor } from "./sections/experiences";
import { ProjectsEditor } from "./sections/projects";
import { SkillsEditor } from "./sections/skills";
import { FactsEditor } from "./sections/facts";
import { ResumeEditor } from "./sections/resume";
import { LettersEditor, type SampleSummary } from "./sections/letters";
import { StoriesBank } from "./sections/stories";
import type { BankStory } from "@/lib/interview/prep";
import { VaultOverview } from "./sections/overview";
import { VaultTabs } from "./tabs";

export const VAULT_TABS = [
  { key: "overview", label: "Overview" },
  { key: "education", label: "Education" },
  { key: "experience", label: "Experience" },
  { key: "projects", label: "Projects" },
  { key: "skills", label: "Technical Skills" },
  { key: "facts", label: "Fact Bank" },
  { key: "resume", label: "Master Resume" },
  { key: "letters", label: "Cover Letters" },
  { key: "stories", label: "Interview Stories" },
] as const;

type TabKey = (typeof VAULT_TABS)[number]["key"];

/**
 * The page already loads the whole vault, so switching sections happens here
 * in the browser: the tab is read from ?tab= and changed with pushState, with
 * no server round trip. Back/forward still work, and a refresh (after any
 * save) re-renders with the same tab.
 */
export function VaultView({
  vault,
  master,
  pendingFacts,
  isEmpty,
  samples,
  stories,
}: {
  vault: VaultSnapshot;
  master: MasterResumeRow | null;
  pendingFacts: number;
  isEmpty: boolean;
  samples: SampleSummary[];
  stories: BankStory[];
}) {
  const params = useSearchParams();
  const tab: TabKey = VAULT_TABS.find((t) => t.key === params.get("tab"))?.key ?? "overview";

  const select = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", key);
    window.history.pushState(null, "", `?${next.toString()}`);
  };

  return (
    <>
      <VaultTabs tabs={VAULT_TABS} active={tab} pendingFacts={pendingFacts} onSelect={select} />

      {/* Links inside sections that point at another tab (overview cards,
          "review pending facts") switch in place too. */}
      <div
        onClickCapture={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          const href = (e.target as HTMLElement).closest("a")?.getAttribute("href") ?? "";
          const key = /^\/vault\?tab=([a-z]+)$/.exec(href)?.[1];
          if (key && VAULT_TABS.some((t) => t.key === key)) {
            e.preventDefault();
            select(key);
          }
        }}
      >
      <TabPanel index={VAULT_TABS.findIndex((t) => t.key === tab)}>
        {tab === "overview" ? <VaultOverview vault={vault} hasMaster={Boolean(master)} isEmpty={isEmpty} /> : null}
        {tab === "education" ? <EducationEditor education={vault.education} /> : null}
        {tab === "experience" ? <ExperiencesEditor experiences={vault.experiences} facts={vault.facts} /> : null}
        {tab === "projects" ? <ProjectsEditor projects={vault.projects} facts={vault.facts} /> : null}
        {tab === "skills" ? <SkillsEditor skills={vault.skills} /> : null}
        {tab === "facts" ? (
          <FactsEditor facts={vault.facts} experiences={vault.experiences} projects={vault.projects} />
        ) : null}
        {tab === "resume" ? <ResumeEditor master={master} pendingFacts={pendingFacts} /> : null}
        {tab === "letters" ? <LettersEditor samples={samples} /> : null}
        {tab === "stories" ? <StoriesBank stories={stories} /> : null}
      </TabPanel>
      </div>
    </>
  );
}
