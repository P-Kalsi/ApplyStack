"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: "border border-transparent bg-accent text-accent-ink hover:bg-accent-hover",
  secondary:
    "border border-line-strong bg-surface-raised text-ink hover:border-ink-faint/60 hover:bg-surface-sunken",
  outline: "border border-line-strong bg-transparent text-ink hover:bg-surface-sunken",
  ghost: "border border-transparent bg-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink",
  danger: "border border-bad/30 bg-bad/10 text-bad hover:border-bad/50 hover:bg-bad/15",
};

const sizeClasses: Record<Size, string> = {
  // Touch screens get 44px targets; mouse users keep the dense sizes.
  sm: "h-8 px-3 text-xs gap-1.5 [@media(pointer:coarse)]:min-h-[44px]",
  md: "h-9 px-4 text-sm gap-2 [@media(pointer:coarse)]:min-h-[44px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", loading, disabled, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-md font-medium",
        "transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
