import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { StoryCard } from "@/components/interview/story-card";
import type { BankStory } from "@/lib/interview/prep";

/** Every STAR story from your interview preps, the same story merged across jobs. */
export function StoriesBank({ stories }: { stories: BankStory[] }) {
  return (
    <Card>
      <CardHeader
        title={`Story bank (${stories.length})`}
        description="Stories from your interview preps, most reused first. Five to ten good ones cover most behavioral questions; practise those out loud."
      />
      {stories.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ink-muted">
          Empty for now. Open a job and use Prepare for interviews; its stories collect here.
        </p>
      ) : (
        <div className="space-y-2 px-4 py-3">
          {stories.map((s, i) => (
            <StoryCard
              key={i}
              story={s}
              footer={
                <p className="text-2xs text-ink-faint">
                  Used for:{" "}
                  {s.jobs.map((j, k) => (
                    <span key={j.id}>
                      {k ? ", " : ""}
                      <Link href={`/jobs/${j.id}`} className="text-accent hover:underline">
                        {j.label}
                      </Link>
                    </span>
                  ))}
                </p>
              }
            />
          ))}
        </div>
      )}
    </Card>
  );
}
