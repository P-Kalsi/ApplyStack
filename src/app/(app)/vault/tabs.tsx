"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TabIndicator } from "@/components/ui/tab-indicator";

/**
 * Vault section tabs. The underline moves the moment you click, before the
 * server has sent the new section.
 */
export function VaultTabs({
  tabs,
  active,
  pendingFacts,
}: {
  tabs: readonly { key: string; label: string }[];
  active: string;
  pendingFacts: number;
}) {
  const [current, setCurrent] = useState(active);
  useEffect(() => setCurrent(active), [active]);

  return (
    <nav
      className="no-print relative isolate -mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
      aria-label="Vault sections"
    >
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`/vault?tab=${t.key}`}
          data-tab
          onClick={() => setCurrent(t.key)}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "inline-flex h-10 shrink-0 items-center whitespace-nowrap px-3 text-sm font-medium transition-colors [@media(pointer:coarse)]:h-11",
            current === t.key ? "text-ink" : "text-ink-muted hover:text-ink"
          )}
        >
          {t.label}
          {t.key === "facts" && pendingFacts > 0 ? (
            <span className="ml-1.5 rounded-full bg-warn/15 px-1.5 text-2xs font-semibold tabular-nums text-warn">
              {pendingFacts}
            </span>
          ) : null}
        </Link>
      ))}
      <TabIndicator activeIndex={Math.max(0, tabs.findIndex((t) => t.key === current))} variant="underline" />
    </nav>
  );
}
