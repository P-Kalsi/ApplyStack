"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { CheckedStory } from "@/lib/interview/prep";
import { StoryCard } from "@/components/interview/story-card";
import { generateInterviewPrep } from "../../interview/actions";

export interface PrepView {
  stories: CheckedStory[];
  topics: { topic: string; why: string }[];
  questions: string[];
}

export function InterviewPrepCard({ jobId, prep, hasDescription }: { jobId: string; prep: PrepView | null; hasDescription: boolean }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <CardHeader
        title="Interview prep"
        description="STAR stories from your Career Vault mapped to this posting, topics to review, and questions to ask."
        actions={
          <Button
            size="sm"
            variant={prep ? "secondary" : "primary"}
            loading={busy}
            disabled={!hasDescription}
            title={hasDescription ? undefined : "Add the job description first"}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await generateInterviewPrep(jobId);
                toast(res.message, res.ok ? "success" : "error");
                if (res.ok) router.refresh();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? null : <MessagesSquare className="h-3.5 w-3.5" aria-hidden />}
            {prep ? "Redo prep" : "Prepare for interviews"}
          </Button>
        }
      />
      {prep ? (
        <div className="grid grid-cols-1 gap-4 px-4 py-3 lg:grid-cols-3">
          <div className="space-y-2 lg:col-span-2">
            <h3 className="text-xs font-medium text-ink-muted">Your stories ({prep.stories.length})</h3>
            {prep.stories.map((s, i) => (
              <StoryCard key={i} story={s} />
            ))}
          </div>
          <div className="space-y-3 text-xs">
            <div>
              <h3 className="mb-1 font-medium text-ink-muted">Topics to review</h3>
              <ul className="space-y-1">
                {prep.topics.map((t) => (
                  <li key={t.topic}>
                    <span className="font-medium text-ink">{t.topic}</span>
                    <span className="block text-ink-faint">{t.why}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-1 font-medium text-ink-muted">Questions to ask them</h3>
              <ul className="list-disc space-y-1 pl-4 text-ink">
                {prep.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <p className="px-4 py-4 text-sm text-ink-muted">
          Not prepared yet. Every story uses only your approved facts; the reflection is a question for you to answer.
        </p>
      )}
    </Card>
  );
}
