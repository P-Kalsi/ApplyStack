"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/input";
import { PER_PAGE_OPTIONS } from "@/lib/jobs/sources/params";

export function PerPageSelect({ value }: { value: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-1.5 text-xs text-ink-muted">
      Show
      <Select
        value={String(value)}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set("per", e.target.value);
          next.delete("page"); // back to the first page
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="w-20"
        aria-label="Jobs per page"
      >
        {PER_PAGE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </Select>
      per page
    </label>
  );
}
