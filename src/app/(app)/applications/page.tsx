import type { Metadata } from "next";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { ApplicationRow } from "@/lib/types";
import { ApplicationsClient, type VersionOption } from "./applications-client";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: apps, error }, { data: versions }] = await Promise.all([
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
  ]);
  if (error) throw new Error(error.message);

  return (
    <ApplicationsClient
      applications={(apps || []) as ApplicationRow[]}
      versions={(versions || []) as VersionOption[]}
    />
  );
}
