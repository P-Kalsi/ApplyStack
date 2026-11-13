"use client";

import { useEffect, useRef, useState } from "react";
import { BookmarkPlus, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { bookmarkletHref } from "@/lib/jobs/bookmarklet";

/**
 * Drag-to-install "Send to ApplyStack" bookmark. The href is set after mount:
 * React refuses javascript: URLs in JSX, and the link must point at whatever
 * address ApplyStack is running on.
 */
export function BookmarkletCard() {
  const { toast } = useToast();
  const link = useRef<HTMLAnchorElement>(null);
  const [href, setHref] = useState("");

  useEffect(() => {
    const h = bookmarkletHref(window.location.origin);
    setHref(h);
    link.current?.setAttribute("href", h);
  }, []);

  return (
    <div className="space-y-2 px-4 py-3 text-sm">
      <p className="text-ink">
        Drag this button onto your bookmarks bar (Ctrl+Shift+B shows the bar). Then, on a LinkedIn or Indeed job, click
        it: the job opens here, ready to review and add.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <a
          ref={link}
          draggable
          onClick={(e) => {
            e.preventDefault();
            toast("Drag the button to your bookmarks bar; clicking it here does nothing.", "info");
          }}
          className="inline-flex h-9 cursor-grab items-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-medium text-white shadow-sm active:cursor-grabbing"
          title="Drag me to your bookmarks bar"
        >
          <BookmarkPlus className="h-4 w-4" aria-hidden /> Send to ApplyStack
        </a>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!href}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(href);
              toast("Copied. Create a bookmark and paste this as its URL.", "success");
            } catch {
              toast("Couldn't copy; drag the button instead.", "error");
            }
          }}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden /> Copy bookmark link
        </Button>
      </div>
      <p className="text-2xs text-ink-muted">
        It only reads the job page already on your screen, and only when you click it; it never loads anything from
        LinkedIn or Indeed by itself. The text goes straight to ApplyStack on this computer. Tip: if a page is
        cluttered, select the job&apos;s text first, then click the bookmark. LinkedIn&apos;s rules discourage tools that
        copy its content, so use it for jobs you&apos;re actually reading, one at a time.
      </p>
    </div>
  );
}
