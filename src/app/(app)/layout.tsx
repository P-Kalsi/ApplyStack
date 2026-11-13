import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { AppNav } from "@/components/nav";
import { signOut } from "@/app/(auth)/actions";
import { demoEnabled } from "@/lib/demo/client";
import { checkLlmBackend } from "@/lib/ai/llm";
import Link from "next/link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const llm = await checkLlmBackend(); // cached; refreshed on startup and on settings changes

  return (
    <div className="min-h-screen bg-surface print:min-h-0 print:bg-white">
      <a
        href="#main"
        className="no-print sr-only z-50 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Skip to content
      </a>
      {demoEnabled() ? (
        <div className="no-print border-b border-warn/25 bg-warn/10 px-4 py-1.5 text-center text-xs text-ink-muted">
          <span className="font-medium text-ink">Demo mode:</span> local data in{" "}
          <code className="text-ink">.demo-data.json</code>, no login. Remove APPLYSTACK_DEMO from .env to use Supabase.
        </div>
      ) : null}
      {!llm.ok ? (
        <div role="status" className="no-print border-b border-bad/25 bg-bad/10 px-4 py-2 text-center text-xs text-ink">
          <span className="font-semibold text-bad">AI backend not ready:</span> {llm.message}{" "}
          <Link href="/settings" className="font-medium text-accent underline-offset-2 hover:underline">
            Settings → AI backend
          </Link>
        </div>
      ) : null}
      <AppNav email={user.email || "account"} signOutAction={signOut} />
      <main id="main" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 focus:outline-none sm:px-6 print:max-w-none print:p-0">
        {children}
      </main>
    </div>
  );
}
