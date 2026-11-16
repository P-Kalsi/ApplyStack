import type { CheckedStory } from "@/lib/interview/prep";

/** One STAR story; the reflection is a question for you to answer, never written for you. */
export function StoryCard({ story, footer }: { story: CheckedStory; footer?: React.ReactNode }) {
  return (
    <details className="group rounded-md border border-line bg-surface-raised">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 px-3 py-2">
        <span className="text-sm font-medium text-ink">{story.title}</span>
        <span className="text-2xs text-ink-faint">for: {story.requirement}</span>
        {story.issues.length ? <span className="text-2xs font-medium text-warn">check</span> : null}
      </summary>
      <div className="space-y-1.5 border-t border-line px-3 py-2 text-xs leading-5">
        {(
          [
            ["Situation", story.situation],
            ["Task", story.task],
            ["Action", story.action],
            ["Result", story.result],
          ] as const
        ).map(([label, text]) => (
          <p key={label}>
            <span className="font-medium text-ink-muted">{label}: </span>
            <span className="text-ink">{text}</span>
          </p>
        ))}
        <p>
          <span className="font-medium text-ink-muted">Reflection (yours to answer): </span>
          <span className="italic text-ink">{story.reflection_prompt}</span>
        </p>
        {story.issues.length ? (
          <ul className="list-disc pl-4 text-warn">
            {story.issues.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        ) : null}
        {story.factTexts.length ? (
          <p className="text-2xs text-ink-faint">From your facts: {story.factTexts.map((f) => `“${f}”`).join(" · ")}</p>
        ) : null}
        {footer}
      </div>
    </details>
  );
}
