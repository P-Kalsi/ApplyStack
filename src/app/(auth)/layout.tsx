import { Layers } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4">
      <div className="mb-6 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-ink">
          <Layers className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-lg font-semibold tracking-tight text-ink">ApplyStack</span>
      </div>
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface-raised p-6 shadow-sm">
        {children}
      </div>
      <p className="mt-6 max-w-sm text-center text-xs text-ink-faint">
        Internship discovery, one truthful career vault, and job-specific resumes that never
        invent anything.
      </p>
    </div>
  );
}
