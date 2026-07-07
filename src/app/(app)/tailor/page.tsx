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
      .select("*")
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

  const rows = (versions || []) as ResumeVersionRow[];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold text-ink">Resume Tailor</h1>
          <p className="text-xs text-ink-muted">
            Every tailored resume is a reviewable version with full change provenance.
            {master ? ` Master: ${master.title}.` : " No master resume yet — add one in Career Vault."}
          </p>
        </div>
        <Link href="/discover" className="text-xs font-medium text-accent hover:underline">
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map((v) => (
            <VersionCard key={v.id} version={v} />
          ))}
        </div>
      )}
    </div>
  );
}
