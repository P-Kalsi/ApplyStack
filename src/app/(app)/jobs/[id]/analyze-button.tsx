"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { analyzeJob } from "../actions";

export function AnalyzeButton({ jobId, hasAnalysis }: { jobId: string; hasAnalysis: boolean }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      size="sm"
      variant={hasAnalysis ? "secondary" : "primary"}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await analyzeJob(jobId);
          toast(res.message, res.ok ? "success" : "error");
          if (res.ok) router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? null : <ScanSearch className="h-3.5 w-3.5" aria-hidden />}
      {hasAnalysis ? "Re-analyze" : "Analyze this job"}
    </Button>
  );
}
