import { LogoMark } from "@/components/logo";

// A tailored bullet, with the parts a posting asked for highlighted. Each
// stroke is drawn in turn on load; the text is the same with or without motion.
const bullet: { text: string; hl?: boolean }[] = [
  { text: "Built a " },
  { text: "REST API in FastAPI", hl: true },
  { text: " that serves course data to 3 campus apps, with " },
  { text: "Postgres", hl: true },
  { text: " and " },
  { text: "Docker", hl: true },
  { text: " for local setup." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  let stroke = 0;
  return (
    <div className="grid min-h-[100dvh] bg-surface lg:grid-cols-[1fr_minmax(0,32rem)]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface-raised px-12 py-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="text-lg font-bold tracking-tight text-ink">ApplyStack</span>
        </div>

        <div className="max-w-xl">
          <h2 className="text-4xl font-bold leading-[1.1] tracking-[-0.03em] text-ink">
            Every resume line backed by something you actually did.
          </h2>
          <p className="mt-4 max-w-md text-base leading-7 text-ink-muted">
            Find internships, keep your experience in one Career Vault, and get a resume for each
            posting that only uses what&rsquo;s in it.
          </p>

          <figure className="mt-10 rounded-lg border border-line bg-surface p-5">
            <p className="text-xs font-medium text-ink-faint">Tailored for Backend Intern, Summer 2027</p>
            <blockquote className="mt-2 text-[15px] leading-8 text-ink">
              {bullet.map((part, i) =>
                part.hl ? (
                  <mark
                    key={i}
                    className="auth-stroke bg-transparent px-0.5 text-ink"
                    style={{ animationDelay: `${500 + stroke++ * 260}ms` }}
                  >
                    {part.text}
                  </mark>
                ) : (
                  <span key={i}>{part.text}</span>
                )
              )}
            </blockquote>
            <figcaption className="mt-3 border-t border-line pt-3 text-xs leading-5 text-ink-muted">
              Highlighted terms match the posting and come from approved facts in your vault.
            </figcaption>
          </figure>
        </div>

        <p className="text-xs text-ink-faint">Runs on your computer. Your data stays in your own Supabase project.</p>
      </section>

      <div className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <LogoMark className="h-8 w-8" />
          <span className="text-xl font-bold tracking-tight text-ink">ApplyStack</span>
        </div>
        <main className="w-full max-w-sm animate-page-in rounded-lg border border-line bg-surface-raised p-6 shadow-overlay sm:p-8">
          {children}
        </main>
        <p className="mt-8 max-w-sm text-pretty text-center text-xs leading-5 text-ink-faint lg:hidden">
          Internship discovery, one truthful Career Vault, and resumes for each posting that never
          invent anything.
        </p>
      </div>
    </div>
  );
}
