"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Briefcase,
  Compass,
  Bookmark,
  FileText,
  Database,
  Settings,
  Layers,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

const items = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/saved", label: "Saved Jobs", icon: Bookmark },
  { href: "/applications", label: "Applications", icon: Briefcase },
  { href: "/tailor", label: "Resume Tailor", icon: FileText },
  { href: "/vault", label: "Career Vault", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings },
];

const iconButton =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";

export function AppNav({ email, signOutAction }: { email: string; signOutAction: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = items.find((i) => isActive(i.href));

  // Close the mobile menu on navigation and on Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-surface-raised/90 backdrop-blur-md supports-[backdrop-filter]:bg-surface-raised/75">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6">
        <Link
          href="/discover"
          className="mr-2 flex shrink-0 items-center gap-2 rounded-md"
          aria-label="ApplyStack home"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-surface-raised">
            <Layers className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">ApplyStack</span>
        </Link>

        {/* Desktop: inline links */}
        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 lg:flex" aria-label="Main">
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
                  active ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-surface-sunken hover:text-ink"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile: the current page name stands in for the hidden links */}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-muted lg:hidden">
          {current ? <span className="hidden border-l border-line pl-3 sm:inline">{current.label}</span> : null}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <span className="hidden max-w-[180px] truncate px-1 text-xs text-ink-faint xl:block" title={email}>
            {email}
          </span>
          <form action={signOutAction}>
            <button type="submit" className={iconButton} aria-label="Sign out" title="Sign out">
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </form>
          <button
            type="button"
            className={cn(iconButton, "lg:hidden")}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain border-t border-line bg-surface-raised px-4 pb-4 pt-2 shadow-overlay sm:px-6 lg:hidden"
        >
          <ul className="grid gap-1 sm:grid-cols-2">
            {items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                      active ? "bg-accent-soft text-accent" : "text-ink hover:bg-surface-sunken"
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 truncate border-t border-line px-3 pt-3 text-xs text-ink-faint" title={email}>
            Signed in as {email}
          </p>
        </nav>
      ) : null}
    </header>
  );
}
