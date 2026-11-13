import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient, requireUser } from "@/lib/supabase/server";
import { documentOutline, normalizeFormat } from "@/lib/resume/document";
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

  const format = normalizeFormat(version.format);
  const outline = documentOutline(version.latex_content, format);

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
        {format === "docx"
          ? "Content preview only. For the exact layout, download the .docx and use Word's Save as PDF."
          : "Content preview only. For the exact LaTeX layout, download the .tex file and compile it (e.g. Overleaf)."}
      </div>

      <article className="rounded-lg border border-line bg-white p-8 text-black shadow-sm print:border-0 print:p-0 print:shadow-none">
        {format === "latex" ? (
          <header className="border-b border-neutral-300 pb-2 text-center">
            <h1 className="text-xl font-bold tracking-tight">{version.name}</h1>
            <p className="mt-0.5 text-xs text-neutral-600">
              {version.company ? `Tailored for ${version.company}` : "Tailored resume"}
              {version.role ? ` · ${version.role}` : ""}
            </p>
          </header>
        ) : null}
        <div className="mt-2 space-y-1 text-[13px] leading-5">
          {outline.map((line, i) =>
            line.kind === "heading" ? (
              <h2
                key={i}
                className="mt-4 border-b border-neutral-300 pb-0.5 text-sm font-semibold uppercase tracking-wide"
              >
                {line.text}
              </h2>
            ) : line.kind === "bullet" ? (
              <p key={i} className="flex gap-2 pl-2">
                <span aria-hidden>•</span>
                <span>{line.text}</span>
              </p>
            ) : (
              <p key={i} className="font-medium">
                {line.text}
              </p>
            )
          )}
        </div>
      </article>
    </div>
  );
}
