import type { Metadata } from "next";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { ApplicationRow } from "@/lib/types";
import { followUpsDue } from "@/lib/applications/followups";
import { ApplicationsClient, type VersionOption } from "./applications-client";
import { FollowUpsCard } from "./followups";
import { ReplyCard } from "./reply-card";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: apps, error }, { data: versions }, { data: profile }] = await Promise.all([
    supabase
      .from("applications")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("resume_versions")
      .select("id, name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);

  const applications = (apps || []) as ApplicationRow[];
  // "Today" on this computer, not UTC, so a follow-up isn't due a day early in the evening.
  const today = new Date().toLocaleDateString("en-CA");
  const { due, upcoming } = followUpsDue(applications, today, (profile?.full_name as string | null) ?? "");

  return (
    <div className="space-y-5">
      <FollowUpsCard due={due} upcoming={upcoming} />
      <ReplyCard
        options={applications
          .filter((a) => ["applied", "oa", "interview"].includes(a.status))
          .map((a) => ({ id: a.id, label: `${a.company} · ${a.role}` }))}
      />
      <ApplicationsClient applications={applications} versions={(versions || []) as VersionOption[]} />
    </div>
  );
}
