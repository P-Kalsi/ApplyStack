import { cn } from "@/lib/utils";

/** Three stacked sheets, the top one with a highlighter stroke. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} aria-hidden>
      <rect x="9" y="3" width="18" height="22" rx="2.5" className="fill-surface-sunken stroke-line-strong" strokeWidth="1.5" />
      <rect x="7" y="5.5" width="18" height="22" rx="2.5" className="fill-surface-raised stroke-line-strong" strokeWidth="1.5" />
      <rect x="5" y="8" width="18" height="22" rx="2.5" className="fill-ink" />
      <rect x="8" y="13" width="12" height="4" rx="1.5" className="fill-mark" />
      <rect x="8" y="20" width="9" height="1.75" rx="0.875" className="fill-surface-raised" opacity="0.7" />
      <rect x="8" y="24" width="11" height="1.75" rx="0.875" className="fill-surface-raised" opacity="0.7" />
    </svg>
  );
}
