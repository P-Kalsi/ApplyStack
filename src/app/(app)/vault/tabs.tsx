"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { PillLabel, SpringPill } from "@/components/ui/spring-pill";

/**
 * Vault section tabs as a segmented bar. The raised pill springs to the tab
 * you pick and a soft background follows the mouse. Plain clicks switch in
 * place via onSelect; modified clicks (new tab, etc.) still follow the link.
 */
export function VaultTabs({
  tabs,
  active,
  pendingFacts,
  onSelect,
}: {
  tabs: readonly { key: string; label: string }[];
  active: string;
  pendingFacts: number;
  onSelect: (key: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

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
          const on = active === t.key;
          return (
            <Link
              key={t.key}
              href={`/vault?tab=${t.key}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                onSelect(t.key);
              }}
              onMouseEnter={() => setHovered(t.key)}
              aria-current={on ? "page" : undefined}
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
