"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { PillLabel, SpringPill } from "@/components/ui/spring-pill";

/**
 * Vault section tabs as a segmented bar. The raised pill springs to the tab
 * you click straight away, before the server has sent the new section, and a
 * soft background follows the mouse.
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
  const [hovered, setHovered] = useState<string | null>(null);
  useEffect(() => setCurrent(active), [active]);

  return (
    <nav
      className="no-print -mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
      aria-label="Vault sections"
    >
      <div
        className="isolate inline-flex gap-0.5 rounded-lg bg-surface-sunken p-1 sm:flex-wrap"
        onMouseLeave={() => setHovered(null)}
      >
        {tabs.map((t) => {
          const on = current === t.key;
          return (
            <Link
              key={t.key}
              href={`/vault?tab=${t.key}`}
              onClick={() => setCurrent(t.key)}
              onMouseEnter={() => setHovered(t.key)}
              aria-current={active === t.key ? "page" : undefined}
              className={cn(
                "relative inline-flex h-8 shrink-0 items-center whitespace-nowrap px-3 text-sm font-medium transition-colors [@media(pointer:coarse)]:h-10",
                on ? "text-ink" : "text-ink-muted hover:text-ink"
              )}
            >
              {on ? (
                <SpringPill layoutId="vault-tab" className="bg-surface-raised shadow-[0_1px_2px_rgb(var(--ink)/0.08),0_0_0_1px_rgb(var(--line))]" />
              ) : hovered === t.key ? (
                <SpringPill layoutId="vault-tab-hover" className="bg-surface-raised/50" />
              ) : null}
              <PillLabel>
                {t.label}
                {t.key === "facts" && pendingFacts > 0 ? (
                  <span className="ml-1.5 rounded-full bg-warn/15 px-1.5 text-2xs font-semibold tabular-nums text-warn">
                    {pendingFacts}
                  </span>
                ) : null}
              </PillLabel>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
