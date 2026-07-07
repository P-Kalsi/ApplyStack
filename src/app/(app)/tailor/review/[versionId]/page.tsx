import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { FactRow, ResumeChangeRow, ResumeVersionRow } from "@/lib/types";
import { ReviewClient } from "./review-client";

export const metadata: Metadata = { title: "Review tailored resume" };

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ versionId: string }>;
}) {
  const { versionId } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: version }, { data: changes, error: cErr }] = await Promise.all([
    supabase
      .from("resume_versions")
      .select("*")
      .eq("id", versionId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("resume_changes")
      .select("*")
      .eq("resume_version_id", versionId)
      .eq("user_id", user.id)
      .order("created_at"),
  ]);
  if (!version) notFound();
  if (cErr) throw new Error(cErr.message);

  const changeRows = (changes || []) as ResumeChangeRow[];

  // Load the cited facts so provenance is visible in the UI.
  const factIds = Array.from(new Set(changeRows.flatMap((c) => c.fact_ids)));
  let facts: Pick<FactRow, "id" | "fact_text">[] = [];
  if (factIds.length) {
    const { data } = await supabase
      .from("career_facts")
      .select("id, fact_text")
      .in("id", factIds)
      .eq("user_id", user.id);
    facts = (data || []) as Pick<FactRow, "id" | "fact_text">[];
  }

  return (
    <div className="space-y-3">
      <Link
        href="/tailor"
        className="no-print inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All resume versions
      </Link>
      <ReviewClient
        version={version as ResumeVersionRow}
        changes={changeRows}
        facts={facts}
      />
    </div>
  );
}
