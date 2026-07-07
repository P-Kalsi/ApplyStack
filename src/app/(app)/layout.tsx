import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { AppNav } from "@/components/nav";
import { signOut } from "@/app/(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-surface">
      <AppNav email={user.email || "account"} signOutAction={signOut} />
      <main className="mx-auto max-w-7xl px-3 py-4">{children}</main>
    </div>
  );
}
