"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, RefreshCw, Search } from "lucide-react";
import { JOB_CATEGORIES } from "@/lib/types";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { refreshJobs, refreshJobsIfStale } from "./actions";

export function DiscoverFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState(params.get("q") || "");
  const [location, setLocation] = useState(params.get("location") || "");
  const debounceRef = useRef<number | null>(null);
  const autoRan = useRef(false);

  // Opening Discover pulls the internship feed if it's more than 30 minutes old.
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    setRefreshing(true);
    refreshJobsIfStale()
      .then((res) => {
        if (!res.refreshed) return;
        if (!res.ok) toast(res.message, "error");
        else if (res.added) toast(`${res.added} new internship${res.added === 1 ? "" : "s"} from the feed.`, "success");
        router.refresh();
      })
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, [router, toast]);

  const setParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  // Debounced text filters.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const currentQ = params.get("q") || "";
      const currentLoc = params.get("location") || "";
      if (search === currentQ && location === currentLoc) return;
      setParams((p) => {
        if (search) p.set("q", search);
        else p.delete("q");
        if (location) p.set("location", location);
        else p.delete("location");
      });
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [search, location, params, setParams]);

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

  const boolParam = (key: string) => params.get(key) === "1";
  const toggleBool = (key: string) =>
    setParams((p) => {
      if (p.get(key) === "1") p.delete(key);
      else p.set(key, "1");
    });

  return (
    <div className="no-print space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, company, description…"
            className="pl-8"
            aria-label="Search jobs"
          />
        </div>
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location"
          className="w-40"
          aria-label="Filter by location"
        />
        <Select
          value={params.get("days") || ""}
          onChange={(e) =>
            setParams((p) => {
              if (e.target.value) p.set("days", e.target.value);
              else p.delete("days");
            })
          }
          className="w-48"
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
              const res = await refreshJobs();
              toast(res.message, res.ok ? "success" : "error");
              router.refresh();
            } finally {
              setRefreshing(false);
            }
          }}
          loading={refreshing}
          title="Pull new postings from the internship feed and your company boards"
        >
          {refreshing ? null : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
          Refresh sources
        </Button>
        <Link
          href="/jobs/new"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface-raised px-3 text-sm font-medium text-ink hover:border-line-strong"
          title="Add a posting from any site by pasting its link or description"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add job
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip active={boolParam("internship")} onClick={() => toggleBool("internship")}>
          Internship
        </FilterChip>
        <FilterChip active={boolParam("remote")} onClick={() => toggleBool("remote")}>
          Remote
        </FilterChip>
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        {JOB_CATEGORIES.map((c) => (
          <FilterChip
            key={c.value}
            active={activeCategories.has(c.value)}
            onClick={() => toggleCategory(c.value)}
          >
            {c.label}
          </FilterChip>
        ))}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-accent/40 bg-accent-soft text-accent"
          : "border-line bg-surface-raised text-ink-muted hover:border-line-strong hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
