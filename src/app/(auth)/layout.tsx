import { Layers } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-surface px-4 py-10">
      <div className="mb-8 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-surface-raised">
          <Layers className="h-5 w-5" aria-hidden />
        </span>
        <span className="text-xl font-semibold tracking-tight text-ink">ApplyStack</span>
      </div>
      <main className="w-full max-w-sm rounded-xl border border-line bg-surface-raised p-6 shadow-overlay sm:p-8">
        {children}
      </main>
      <p className="mt-8 max-w-sm text-pretty text-center text-xs leading-5 text-ink-faint">
        Internship discovery, one truthful career vault, and job-specific resumes that never
        invent anything.
      </p>
    </div>
  );
}
