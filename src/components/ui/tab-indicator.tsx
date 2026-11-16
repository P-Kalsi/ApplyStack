"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Slides between the tabs of its parent. Put it inside a `relative isolate`
 * container whose tabs carry `data-tab` (pill tabs also need `relative z-10`
 * to sit above it); it measures the active one and glides there, even when
 * the tabs wrap onto two rows. The first placement doesn't animate, so it
 * never flies in from the corner.
 */
export function TabIndicator({
  activeIndex,
  variant,
}: {
  activeIndex: number;
  variant: "underline" | "pill";
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const measure = () => {
      const tab = parent.querySelectorAll<HTMLElement>("[data-tab]")[activeIndex];
      if (tab) setBox({ x: tab.offsetLeft, y: tab.offsetTop, w: tab.offsetWidth, h: tab.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [activeIndex]);

  useLayoutEffect(() => {
    if (!box || ready) return;
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [box, ready]);

  const underline = variant === "underline";
  return (
    <span
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none absolute left-0 top-0",
        underline ? "h-0.5 rounded-full bg-accent" : "rounded-[5px] bg-accent-soft",
        ready && "tab-glide",
        !box && "opacity-0"
      )}
      style={
        box
          ? {
              width: box.w,
              height: underline ? undefined : box.h,
              transform: `translate(${box.x}px, ${underline ? box.y + box.h - 2 : box.y}px)`,
            }
          : undefined
      }
    />
  );
}
