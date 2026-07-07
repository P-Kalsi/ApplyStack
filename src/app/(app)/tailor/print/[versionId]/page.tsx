import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient, requireUser } from "@/lib/supabase/server";
import { getBullets, latexToPlain, parseResume } from "@/lib/resume/latex";
import type { ResumeVersionRow } from "@/lib/types";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Print resume" };

/**
 * Clean print / save-as-PDF view. LaTeX is not compiled server-side (by
 * design for the MVP); instead the resume CONTENT is rendered in a tight
 * print stylesheet. For pixel-perfect output, download the .tex and compile
 * with your usual toolchain (Overleaf, latexmk).
 */
export default async function PrintPage({
  params,
}: {
  params: Promise<{ versionId: string }>;
}) {
  const { versionId } = await params;
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("resume_versions")
    .select("*")
    .eq("id", versionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) notFound();
  const version = data as ResumeVersionRow;

  const parsed = parseResume(version.latex_content);
  const bullets = getBullets(parsed);
  const sections = new Map<string, string[]>();
  for (const b of bullets) {
    const key = b.section || "Content";
    const list = sections.get(key) ?? [];
    list.push(latexToPlain(b.text));
    sections.set(key, list);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link
          href={`/tailor/review/${version.id}`}
          className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to review
        </Link>
        <PrintButton />
      </div>
      <div className="no-print rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-2xs text-ink">
        This is a content preview for quick printing. For the exact LaTeX layout, download the
        .tex file and compile it (e.g. Overleaf).
      </div>

      <article className="rounded-lg border border-line bg-white p-8 text-black shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="border-b border-neutral-300 pb-2 text-center">
          <h1 className="text-xl font-bold tracking-tight">{version.name}</h1>
          <p className="mt-0.5 text-xs text-neutral-600">
            {version.company ? `Tailored for ${version.company}` : "Tailored resume"}
            {version.role ? ` · ${version.role}` : ""}
          </p>
        </header>
        {Array.from(sections.entries()).map(([section, items]) => (
          <section key={section} className="mt-4">
            <h2 className="border-b border-neutral-300 pb-0.5 text-sm font-semibold uppercase tracking-wide">
              {section}
            </h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] leading-5">
              {items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </article>
    </div>
  );
}
