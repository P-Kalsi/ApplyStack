"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { startTailoring } from "@/app/(app)/tailor/actions";

export function TailorButton({ jobId, size = "md" }: { jobId: string; size?: "sm" | "md" }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      size={size}
      variant="primary"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await startTailoring(jobId);
          if (res.ok && res.versionId) {
            toast("Tailored draft ready for review.", "success");
            router.push(`/tailor/review/${res.versionId}`);
          } else {
            toast(res.message, "error");
            setBusy(false);
          }
        } catch {
          toast("Tailoring failed.", "error");
          setBusy(false);
        }
      }}
    >
      {busy ? null : <Sparkles className="h-4 w-4" aria-hidden />}
      Tailor My Resume
    </Button>
  );
}
