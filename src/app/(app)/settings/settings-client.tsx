"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { JobSourceRow } from "@/lib/types";
import type { CompanySource } from "@/lib/jobs/registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { addJobSource, deleteJobSource, saveProfile, toggleJobSource } from "./actions";

export function ProfileForm({
  profile,
  email,
}: {
  profile: Record<"full_name" | "phone" | "location" | "website" | "github" | "linkedin", string>;
  email: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <form
      action={async (fd) => {
        setBusy(true);
        try {
          const res = await saveProfile(fd);
          toast(res.message, res.ok ? "success" : "error");
          if (res.ok) router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-2"
    >
      <div>
        <Label htmlFor="pf-email">Email</Label>
        <Input id="pf-email" value={email} disabled />
      </div>
      <div>
        <Label htmlFor="pf-name">Full name</Label>
        <Input id="pf-name" name="full_name" defaultValue={profile.full_name} />
      </div>
      <div>
        <Label htmlFor="pf-phone">Phone</Label>
        <Input id="pf-phone" name="phone" defaultValue={profile.phone} />
      </div>
      <div>
        <Label htmlFor="pf-location">Location</Label>
        <Input id="pf-location" name="location" defaultValue={profile.location} />
      </div>
      <div>
        <Label htmlFor="pf-website">Website</Label>
        <Input id="pf-website" name="website" defaultValue={profile.website} />
      </div>
      <div>
        <Label htmlFor="pf-github">GitHub</Label>
        <Input id="pf-github" name="github" defaultValue={profile.github} />
      </div>
      <div>
        <Label htmlFor="pf-linkedin">LinkedIn</Label>
        <Input id="pf-linkedin" name="linkedin" defaultValue={profile.linkedin} />
      </div>
      <div className="flex items-end">
        <Button type="submit" variant="primary" size="sm" loading={busy}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

export function SourcesManager({
  sources,
  envSources,
}: {
  sources: JobSourceRow[];
  envSources: CompanySource[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3 px-4 py-3">
      <form
        action={async (fd) => {
          setBusy(true);
          try {
            const res = await addJobSource(fd);
            toast(res.message, res.ok ? "success" : "error");
            if (res.ok) router.refresh();
          } finally {
            setBusy(false);
          }
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div>
          <Label htmlFor="src-kind">Type</Label>
          <Select id="src-kind" name="kind" className="w-36">
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="src-token">Board token / site name</Label>
          <Input id="src-token" name="token" placeholder="e.g. stripe" className="w-44" required />
        </div>
        <div>
          <Label htmlFor="src-label">Display name (optional)</Label>
          <Input id="src-label" name="label" placeholder="Stripe" className="w-40" />
        </div>
        <Button type="submit" variant="primary" size="sm" loading={busy}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add source
        </Button>
      </form>

      {envSources.length ? (
        <div className="text-2xs text-ink-faint">
          From environment ({envSources.length}):{" "}
          {envSources.map((s) => `${s.kind}:${s.token}`).join(", ")} — manage these in .env.
        </div>
      ) : null}

      {sources.length === 0 ? (
        <p className="text-xs text-ink-muted">
          No sources registered yet. The seeded internships keep the Discover board usable without
          any live source.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {sources.map((s) => (
            <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-xs">
              <Badge tone="accent" className="uppercase">
                {s.kind}
              </Badge>
              <span className="font-mono text-ink">{s.token}</span>
              {s.label ? <span className="text-ink-faint">({s.label})</span> : null}
              <span className="ml-auto" />
              <label className="flex items-center gap-1.5 text-2xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={async (e) => {
                    const res = await toggleJobSource(s.id, e.target.checked);
                    toast(res.message, res.ok ? "success" : "error");
                    router.refresh();
                  }}
                  className="accent-[rgb(var(--accent))]"
                />
                enabled
              </label>
              <Confirm
                title={`Remove ${s.kind} source "${s.token}"?`}
                description="Already-ingested jobs stay on the board."
                onConfirm={async () => {
                  const res = await deleteJobSource(s.id);
                  toast(res.message, res.ok ? "success" : "error");
                  router.refresh();
                }}
              >
                <button className="rounded p-1 text-ink-faint hover:text-bad" aria-label="Remove source">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </Confirm>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
