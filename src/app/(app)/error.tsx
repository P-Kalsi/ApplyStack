"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-bad/30 bg-bad/5 px-6 py-16 text-center">
      <AlertTriangle className="h-6 w-6 text-bad" aria-hidden />
      <h2 className="text-sm font-semibold text-ink">Something went wrong</h2>
      <p className="max-w-md text-xs text-ink-muted">
        {error.message || "An unexpected error occurred while rendering this page."}
      </p>
      <Button variant="secondary" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
