import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { replaceDocumentXml } from "@/lib/docx/zip";

export const runtime = "nodejs";

/** "Samsara — Software Engineering Intern" -> "Samsara_Software_Engineering_Intern_Resume" */
function fileStem(name: string): string {
  const stem = name
    .replace(/[—–-]+/g, " ")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join("_");
  return `${stem || "Tailored"}_Resume`;
}

/**
 * Download a tailored resume version in its native format:
 *  - Word masters: the original .docx with only word/document.xml replaced
 *  - LaTeX masters: the .tex source
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: version, error } = await supabase
    .from("resume_versions")
    .select("id, name, format, latex_content, master_resume_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!version) return NextResponse.json({ error: "Version not found." }, { status: 404 });

  const stem = fileStem(version.name as string);

  if (version.format !== "docx") {
    return new NextResponse(version.latex_content as string, {
      headers: {
        "content-type": "application/x-tex; charset=utf-8",
        "content-disposition": `attachment; filename="${stem}.tex"`,
      },
    });
  }

  if (!version.master_resume_id) {
    return NextResponse.json(
      { error: "The original Word template for this version was deleted, so the .docx can't be rebuilt." },
      { status: 410 }
    );
  }
  const { data: master, error: mErr } = await supabase
    .from("master_resumes")
    .select("template_base64")
    .eq("id", version.master_resume_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!master?.template_base64) {
    return NextResponse.json({ error: "Word template not found for this version." }, { status: 410 });
  }

  try {
    const template = Buffer.from(master.template_base64 as string, "base64");
    const docx = replaceDocumentXml(template, version.latex_content as string);
    return new NextResponse(new Uint8Array(docx), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename="${stem}.docx"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build the .docx." },
      { status: 500 }
    );
  }
}
