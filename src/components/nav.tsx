"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Compass,
  Bookmark,
  FileText,
  Database,
  Settings,
  Layers,
  LogOut,
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

export function AppNav({ email, signOutAction }: { email: string; signOutAction: () => Promise<void> }) {
  const pathname = usePathname();

  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-surface-raised/95 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-7xl items-center gap-1 px-3">
        <Link href="/discover" className="mr-3 flex items-center gap-2" aria-label="ApplyStack home">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-accent text-accent-ink">
            <Layers className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="hidden text-sm font-semibold tracking-tight text-ink sm:block">
            ApplyStack
          </span>
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto" aria-label="Main">
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-ink-muted hover:bg-surface-sunken hover:text-ink"
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <span className="hidden max-w-[160px] truncate text-xs text-ink-faint md:block" title={email}>
            {email}
          </span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
