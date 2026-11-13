import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { AppNav } from "@/components/nav";
import { signOut } from "@/app/(auth)/actions";
import { demoEnabled } from "@/lib/demo/client";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-surface">
      {demoEnabled() ? (
        <div className="no-print border-b border-warn/30 bg-warn/10 px-3 py-1 text-center text-2xs text-ink">
          Demo mode: local data in <code>.demo-data.json</code>, no login. Remove APPLYSTACK_DEMO from .env to use Supabase.
        </div>
      ) : null}
      <AppNav email={user.email || "account"} signOutAction={signOut} />
      <main className="mx-auto max-w-7xl px-3 py-4">{children}</main>
    </div>
  );
}
