"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { checkJobOpen } from "../actions";

/** Ask the company's job board whether the posting is still open. */
export function OpenCheckButton({ jobId }: { jobId: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      size="sm"
      variant="ghost"
      loading={busy}
      title="Ask the company's job board whether this posting is still open"
      onClick={async () => {
        setBusy(true);
        try {
          const res = await checkJobOpen(jobId);
          toast(res.message, res.status === "open" ? "success" : res.status === "closed" ? "error" : "info");
          if (res.ok) router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? null : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
      Still open?
    </Button>
  );
}
