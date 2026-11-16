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
  LogOut,
  Menu,
  MessageSquareText,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { LogoMark } from "./logo";
import { PillLabel, SpringPill } from "./ui/spring-pill";

const items = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/saved", label: "Saved Jobs", icon: Bookmark },
  { href: "/applications", label: "Applications", icon: Briefcase },
  { href: "/tailor", label: "Resume Tailor", icon: FileText },
  { href: "/answers", label: "Answers", icon: MessageSquareText },
  { href: "/vault", label: "Career Vault", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings },
];

const iconButton =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";

export function AppNav({ email, signOutAction }: { email: string; signOutAction: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  // The page you just clicked, until its route has actually loaded.
  const [target, setTarget] = useState<string | null>(null);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = items.find((i) => isActive(i.href));

  // Close the mobile menu on navigation and on Escape.
  useEffect(() => {
    setOpen(false);
    setTarget(null);
  }, [pathname]);
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
          <LogoMark />
          <span className="text-base font-bold tracking-tight text-ink">ApplyStack</span>
        </Link>

        {/* Desktop: inline links. The yellow highlighter springs to the page you
            click (before it has loaded); a soft background follows the mouse. */}
        <nav
          className="isolate hidden min-w-0 flex-1 items-center gap-0.5 lg:flex"
          aria-label="Main"
          onMouseLeave={() => setHovered(null)}
        >
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            const marked = target ? target === href : active;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => setTarget(href)}
                onMouseEnter={() => setHovered(href)}
                onFocus={() => setHovered(href)}
                className={cn(
                  "relative inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[13px] font-medium transition-colors",
                  marked ? "font-semibold text-mark-ink" : "text-ink-muted hover:text-ink"
                )}
              >
                {marked ? (
                  <SpringPill layoutId="nav-mark" className="nav-pill bg-mark" radius="3px 7px 4px 8px / 7px 3px 8px 4px" />
                ) : hovered === href ? (
                  <SpringPill layoutId="nav-hover" className="bg-surface-sunken" />
                ) : null}
                <PillLabel className="gap-1.5">
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </PillLabel>
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
          className="max-h-[calc(100dvh-3.5rem)] animate-menu-in overflow-y-auto overscroll-contain border-t border-line bg-surface-raised px-4 pb-4 pt-2 shadow-overlay sm:px-6 lg:hidden"
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
                      active ? "hl font-semibold" : "text-ink hover:bg-surface-sunken"
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
