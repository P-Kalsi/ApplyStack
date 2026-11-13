"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { describePage } from "./actions";

// Jobs whose descriptions were already tried in this browser session, so a
// closed posting doesn't trigger a fetch on every re-render.
const attempted = new Set<string>();

/**
 * After a page renders, fetch full descriptions for that page's jobs only
 * (Greenhouse/Lever/Ashby links), then refresh the cards.
 */
export function DescribeOnView({ ids }: { ids: string[] }) {
  const router = useRouter();
  const key = ids.join(",");
  useEffect(() => {
    const todo = key.split(",").filter((id) => id && !attempted.has(id));
    if (!todo.length) return;
    todo.forEach((id) => attempted.add(id));
    // No cancel on unmount: the descriptions are saved either way, and React's
    // dev double-run would otherwise drop the refresh.
    describePage(todo)
      .then((res) => {
        if (res.described > 0) router.refresh();
      })
      .catch(() => undefined);
  }, [key, router]);
  return null;
}
