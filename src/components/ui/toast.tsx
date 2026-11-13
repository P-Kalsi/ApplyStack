"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>.");
  return ctx;
}

const icons: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-good" aria-hidden />,
  error: <AlertTriangle className="h-4 w-4 text-bad" aria-hidden />,
  info: <Info className="h-4 w-4 text-accent" aria-hidden />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = ++seq.current;
      setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 flex w-[calc(100vw-2rem)] flex-col gap-2 sm:w-80"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-surface-raised py-3 pl-3 pr-2 shadow-overlay",
              t.kind === "error" ? "border-bad/40" : t.kind === "success" ? "border-good/40" : "border-line"
            )}
          >
            <span className="mt-0.5 shrink-0">{icons[t.kind]}</span>
            <p className="min-w-0 flex-1 break-words text-sm leading-5 text-ink">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="-my-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint hover:bg-surface-sunken hover:text-ink"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
