import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { ResumeVersionRow } from "@/lib/types";
import { EmptyState } from "@/components/ui/card";
import { VersionCard } from "./version-card";

export const metadata: Metadata = { title: "Resume Tailor" };

export default async function TailorPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: versions, error }, { data: master }] = await Promise.all([
    supabase
      .from("resume_versions")
      .select(
        "id, user_id, master_resume_id, job_id, name, company, role, format, match_score_before, match_score_after, keywords_added, skills_emphasized, still_missing, status, created_at, updated_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("master_resumes")
      .select("id, title")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
  ]);
  if (error) throw new Error(error.message);

  const rows = (versions || []) as Omit<ResumeVersionRow, "master_latex" | "latex_content">[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title text-ink">Resume Tailor</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Every tailored resume is a reviewable version with full change provenance.
            {master ? ` Master: ${master.title}.` : " No master resume yet — add one in Career Vault."}
          </p>
        </div>
        <Link href="/discover" className="text-sm font-medium text-accent underline-offset-2 hover:underline">
          Find a job to tailor for →
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No tailored resumes yet"
          description='Open a job on the Discover board and hit "Tailor Resume". You get a side-by-side review of every proposed change — nothing is ever invented.'
          action={
            <Link href="/discover" className="text-xs font-medium text-accent hover:underline">
              Browse internships →
            </Link>
          }
        />
      ) : (
        <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((v) => (
            <VersionCard key={v.id} version={v} />
          ))}
        </div>
      )}
    </div>
  );
}
