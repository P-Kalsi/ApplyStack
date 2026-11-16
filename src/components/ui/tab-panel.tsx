"use client";

import { useEffect, useRef } from "react";

/**
 * Tab content that slides in from the side of the tab you came from, with a
 * soft blur clearing as it lands (transitions.dev "page side-by-side").
 * Remounts on every index change, so each switch plays once.
 */
export function TabPanel({ index, children }: { index: number; children: React.ReactNode }) {
  // The last index that actually rendered; updated after commit so a
  // double render (React strict mode) still sees the previous tab.
  const shown = useRef(index);
  useEffect(() => {
    shown.current = index;
  }, [index]);
  const dir = Math.sign(index - shown.current);
  return (
    <div key={index} className="tab-panel" style={{ "--tab-dir": dir } as React.CSSProperties}>
      {children}
    </div>
  );
}
