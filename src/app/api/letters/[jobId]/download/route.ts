import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readDocumentXml, replaceDocumentXml } from "@/lib/docx/zip";
import { buildLetterXml } from "@/lib/letters/docx";
import { letterDate, letterText } from "@/lib/letters/letters";

export const runtime = "nodejs";

function fileStem(company: string, title: string): string {
  const stem = `${company} ${title}`
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join("_");
  return `${stem || "Cover"}_Cover_Letter`;
}

/**
 * Download the cover letter for a job.
 *  - .docx (default): built inside your template letter, so it looks like the
 *    letters you already send; only date, recipient, greeting and body change
 *  - .txt (?format=txt, or when you have no .docx template): plain text with a
 *    header from your Settings profile
 */
export async function GET(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const format = new URL(req.url).searchParams.get("format") === "txt" ? "txt" : "docx";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [{ data: letter, error }, { data: job }] = await Promise.all([
    supabase
      .from("cover_letters")
      .select("recipient, greeting, paragraphs")
      .eq("user_id", user.id)
      .eq("job_id", jobId)
      .maybeSingle(),
    supabase.from("jobs").select("company, title").eq("id", jobId).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!letter) return NextResponse.json({ error: "No cover letter for this job yet." }, { status: 404 });
  const stem = fileStem((job?.company as string) || "", (job?.title as string) || "");
  const content = {
    date: letterDate(),
    recipient: letter.recipient as string[],
    greeting: letter.greeting as string,
    paragraphs: letter.paragraphs as string[],
  };

  const { data: template } =
    format === "docx"
      ? await supabase
          .from("writing_samples")
          .select("template_base64")
          .eq("user_id", user.id)
          .eq("is_template", true)
          .limit(1)
          .maybeSingle()
      : { data: null };

  if (template?.template_base64) {
    try {
      const buf = Buffer.from(template.template_base64 as string, "base64");
      const docx = replaceDocumentXml(buf, buildLetterXml(readDocumentXml(buf), content));
      return new NextResponse(new Uint8Array(docx), {
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "content-disposition": `attachment; filename="${stem}.docx"`,
          "cache-control": "no-store",
        },
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to build the .docx." }, { status: 500 });
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, phone, location")
    .eq("id", user.id)
    .maybeSingle();
  const name = (profile?.full_name as string) || "";
  const header = [name, profile?.location, profile?.phone, profile?.email].filter(Boolean) as string[];
  const text = letterText({ ...content, header, signOff: "Sincerely,", name });
  return new NextResponse(text, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${stem}.txt"`,
      "cache-control": "no-store",
    },
  });
}
