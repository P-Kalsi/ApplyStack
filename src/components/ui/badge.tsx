import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "good" | "warn" | "bad" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-ink-muted border-line",
  accent: "bg-accent-soft text-accent border-accent/20",
  good: "bg-good/10 text-good border-good/25",
  warn: "bg-warn/10 text-warn border-warn/25",
  bad: "bg-bad/10 text-bad border-bad/25",
  outline: "bg-transparent text-ink-faint border-line",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  title,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs font-medium leading-4",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Compact 0-100 match score chip with tone thresholds. */
export function ScoreBadge({ score, label }: { score: number | null; label?: string }) {
  if (score === null || score === undefined) {
    return <Badge tone="outline">no score</Badge>;
  }
  const tone: Tone = score >= 70 ? "good" : score >= 40 ? "warn" : "bad";
  return (
    <Badge tone={tone} title={label || "Match score"} className="tabular-nums">
      {score}% match
    </Badge>
  );
}
