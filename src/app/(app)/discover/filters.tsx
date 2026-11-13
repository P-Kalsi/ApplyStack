"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MapPin, Plus, RefreshCw, Search } from "lucide-react";
import { JOB_CATEGORIES } from "@/lib/types";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { DEFAULT_LOCATION, DEFAULT_RADIUS_KM, RADIUS_OPTIONS } from "@/lib/jobs/sources/params";
import { refreshSources } from "./actions";

interface SourceOption {
  id: string;
  label: string;
  ready: boolean;
  message?: string;
}

export function DiscoverFilters({ sources }: { sources: SourceOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState(params.get("q") || "");
  const [location, setLocation] = useState(params.get("location") ?? DEFAULT_LOCATION);

  /** Change filters; any change goes back to page 1. */
  const setParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      next.delete("page");
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  // Text boxes apply on Enter or when you leave the box (not on every
  // keystroke), so a half-typed city doesn't spend Adzuna requests.
  const commitText = () => {
    const currentQ = params.get("q") || "";
    const currentLoc = params.get("location") ?? DEFAULT_LOCATION;
    if (search.trim() === currentQ && location.trim() === currentLoc) return;
    setParams((p) => {
      if (search.trim()) p.set("q", search.trim());
      else p.delete("q");
      if (location.trim() === DEFAULT_LOCATION) p.delete("location");
      else p.set("location", location.trim()); // "" = anywhere
    });
  };
  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commitText();
  };

  // Keep the boxes in sync when the URL changes (back/forward).
  useEffect(() => {
    setSearch(params.get("q") || "");
    setLocation(params.get("location") ?? DEFAULT_LOCATION);
  }, [params]);

  const select = (key: string, fallback: string) => params.get(key) || fallback;
  const setSelect = (key: string, fallback: string) => (value: string) =>
    setParams((p) => {
      if (value === fallback) p.delete(key);
      else p.set(key, value);
    });

  const activeCategories = new Set((params.get("cats") || "").split(",").filter(Boolean));
  const toggleCategory = (value: string) => {
    const next = new Set(activeCategories);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setParams((p) => {
      if (next.size) p.set("cats", Array.from(next).join(","));
      else p.delete("cats");
    });
  };
  const internship = params.get("internship") === "1";
  const work = select("work", "both");
  const source = select("source", "all");
  const sourceInfo = sources.find((s) => s.id === source);

  return (
    <div className="no-print space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onEnter}
            onBlur={commitText}
            placeholder="Search title, company, keywords… (Enter)"
            className="pl-8"
            aria-label="Search jobs"
          />
        </div>
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={onEnter}
            onBlur={commitText}
            placeholder="Anywhere"
            className="w-44 pl-8"
            aria-label="Location"
          />
        </div>
        <Select
          value={select("radius", String(DEFAULT_RADIUS_KM))}
          onChange={(e) => setSelect("radius", String(DEFAULT_RADIUS_KM))(e.target.value)}
          className="w-40"
          aria-label="Radius"
          title="Adzuna searches this radius. Other sources match the city and its metro area."
        >
          {RADIUS_OPTIONS.map((r) => (
            <option key={r} value={r}>
              Within {r} km
            </option>
          ))}
        </Select>
        <Select value={work} onChange={(e) => setSelect("work", "both")(e.target.value)} className="w-40" aria-label="Remote or local">
          <option value="both">Local + remote</option>
          <option value="local">Local only</option>
          <option value="remote">Remote only</option>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={source} onChange={(e) => setSelect("source", "all")(e.target.value)} className="w-52" aria-label="Source">
          <option value="all">All sources</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id} disabled={!s.ready && s.id !== source}>
              {s.label}
              {s.ready ? "" : " (off)"}
            </option>
          ))}
        </Select>
        <Select
          value={select("sort", "newest")}
          onChange={(e) => setSelect("sort", "newest")(e.target.value)}
          className="w-44"
          aria-label="Sort by"
          title="Most relevant ranks by your search words (Adzuna uses its own relevance)."
        >
          <option value="newest">Sort: newest</option>
          <option value="relevance">Sort: most relevant</option>
        </Select>
        <Select
          value={params.get("days") || ""}
          onChange={(e) =>
            setParams((p) => {
              if (e.target.value) p.set("days", e.target.value);
              else p.delete("days");
            })
          }
          className="w-44"
          aria-label="Date posted"
        >
          <option value="">Any date posted</option>
          <option value="1">Past 24 hours</option>
          <option value="7">Past week</option>
          <option value="14">Past 2 weeks</option>
          <option value="30">Past month</option>
        </Select>
        <Button
          variant="secondary"
          onClick={async () => {
            setRefreshing(true);
            try {
              const res = await refreshSources();
              if (!res.ok) toast(res.message, "error");
              router.refresh();
            } finally {
              setRefreshing(false);
            }
          }}
          loading={refreshing}
          title="Results are cached for 15–30 minutes; this fetches the current page fresh"
        >
          {refreshing ? null : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
          Refresh
        </Button>
        <Link
          href="/jobs/new"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface-raised px-3 text-sm font-medium text-ink hover:border-line-strong"
          title="Add a posting from any site, including Indeed and LinkedIn"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add job
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip active={internship} onClick={() => setParams((p) => (internship ? p.delete("internship") : p.set("internship", "1")))}>
          Internships / co-ops
        </FilterChip>
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        {JOB_CATEGORIES.map((c) => (
          <FilterChip key={c.value} active={activeCategories.has(c.value)} onClick={() => toggleCategory(c.value)}>
            {c.label}
          </FilterChip>
        ))}
      </div>
      {sourceInfo && !sourceInfo.ready ? (
        <p className="text-xs text-warn">
          {sourceInfo.label} is off: {sourceInfo.message}
        </p>
      ) : null}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
        active ? "border-accent bg-accent/10 text-ink" : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
