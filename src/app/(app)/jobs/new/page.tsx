import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { Card, CardHeader } from "@/components/ui/card";
import { NewJobForm } from "./new-job-form";
import { BookmarkletCard } from "./bookmarklet-card";

export const metadata: Metadata = { title: "Add job" };

export default async function NewJobPage() {
  await requireUser();
  return (
    <div className="max-w-3xl space-y-3">
      <Link href="/discover" className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to Discover
      </Link>
      <Card>
        <CardHeader
          title="Add a job"
          description="From any site, including LinkedIn and Indeed: paste the whole page below, or use the Send to ApplyStack bookmark. Greenhouse, Lever, Ashby and Workday links can also fill in from the link alone."
        />
        <NewJobForm />
      </Card>
      <Card>
        <CardHeader title="Send to ApplyStack bookmark" description="One click from a LinkedIn or Indeed job to this page." />
        <BookmarkletCard />
      </Card>
    </div>
  );
}
