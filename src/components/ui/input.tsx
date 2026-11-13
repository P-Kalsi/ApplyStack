"use client";

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const fieldClasses =
  "rounded-md border border-line-strong bg-surface-raised px-3 text-sm text-ink placeholder:text-ink-faint " +
  "transition-[border-color,box-shadow] duration-150 hover:border-ink-faint/60 " +
  "focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/25 " +
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-60 " +
  // Touch: 44px targets and 16px text so iOS doesn't zoom on focus.
  "[@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:text-base";

/** Full width unless the caller sets its own width (w-40, min-w-..., etc.). */
function widthFor(className?: string): string {
  return /(^|\s)(w-|min-w-|flex-1)/.test(className ?? "") ? "" : "w-full";
}

/** Default height unless the caller sets one (h-7 for compact table cells). */
function heightFor(className?: string): string {
  return /(^|\s)h-/.test(className ?? "") ? "" : "h-9";
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldClasses, widthFor(className), heightFor(className), className)} {...props} />;
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldClasses, widthFor(className), "py-2 min-h-[80px]", className)} {...props} />;
  }
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(fieldClasses, widthFor(className), heightFor(className), "pr-8", className)} {...props}>
        {children}
      </select>
    );
  }
);

export function Label({
  children,
  htmlFor,
  className,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 block text-xs font-medium text-ink", className)}>
      {children}
    </label>
  );
}
