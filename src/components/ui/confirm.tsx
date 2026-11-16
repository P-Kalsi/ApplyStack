"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";

/**
 * Confirmation wrapper for destructive actions. Renders its trigger; when
 * clicked, shows a small modal dialog and only fires onConfirm on approval.
 */
export function Confirm({
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  children,
}: {
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">
        {children}
      </span>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex animate-overlay-in items-center justify-center overscroll-contain bg-black/50 p-4 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            className="w-full max-w-sm animate-dialog-in rounded-lg border border-line bg-surface-raised p-5 shadow-overlay"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold tracking-tight text-ink">{title}</h3>
            {description ? <p className="mt-1.5 text-sm leading-5 text-ink-muted">{description}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button ref={cancelRef} variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onConfirm();
                    setOpen(false);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
