"use client";

import { motion, type Transition } from "motion/react";
import { cn } from "@/lib/utils";

// Based on ibelick's Animated Tabs (Motion Primitives, MIT: bounce 0.2, 0.3s),
// slowed so the pill visibly travels between tabs.
export const pillSpring: Transition = { type: "spring", bounce: 0.2, duration: 0.45 };

/**
 * A background that springs from item to item. Render it inside the active
 * (or hovered) item only; every pill sharing a `layoutId` animates between
 * positions, even across page navigations while the parent stays mounted.
 *
 * Layering (as in ibelick's original): items are `relative` (no stacking
 * context of their own), each item's label sits in a `PillLabel`, and the
 * group is `isolate`. Every label then paints above every pill, so a pill
 * passing over a neighbouring tab mid-spring never hides its text.
 */
export function SpringPill({
  layoutId,
  className,
  radius = 7,
}: {
  layoutId: string;
  className?: string;
  /** Set here (not in CSS) so Motion keeps the corners round while it scales. */
  radius?: number | string;
}) {
  return (
    <motion.span
      layoutId={layoutId}
      aria-hidden
      transition={pillSpring}
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{ borderRadius: radius }}
    />
  );
}

/** An item's label, lifted above all pills in the group (see SpringPill). */
export function PillLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("relative z-10 inline-flex items-center", className)}>{children}</span>;
}
