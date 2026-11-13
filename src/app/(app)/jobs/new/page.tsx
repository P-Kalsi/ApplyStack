import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { Card, CardHeader } from "@/components/ui/card";
import { NewJobForm } from "./new-job-form";

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
          description="For postings from any site. Greenhouse, Lever, Ashby and Workday links fill in automatically with Fill from link. Indeed, LinkedIn and other sites don't offer a public way for apps to read their postings, so paste the link, type the company and title, and copy the description from the posting."
        />
        <NewJobForm />
      </Card>
    </div>
  );
}
