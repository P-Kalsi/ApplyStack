"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BellRing, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { checkAlertsNow, saveFeedAndAlerts, sendDiscordTest } from "./actions";

interface Props {
  regions: readonly string[];
  categories: readonly string[];
  termOptions: string[];
  notListed: string;
  settings: {
    simplify: { enabled: boolean; regions: string[]; terms: string[]; categories: string[] };
    alerts: { enabled: boolean; interval_minutes: number };
    last_ingest_at: string | null;
  };
  webhook: "missing" | "invalid" | "ok";
  alertState: { initialized_at: string | null; last_run_at: string | null; last_result: string | null };
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs",
        on ? "border-accent bg-accent/10 text-ink" : "border-line text-ink-muted hover:border-line-strong"
      )}
    >
      {children}
    </button>
  );
}

function toggle(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function FeedAlertsCard({ regions, categories, termOptions, notListed, settings, webhook, alertState }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.simplify.enabled);
  const [selRegions, setRegions] = useState(settings.simplify.regions);
  const [terms, setTerms] = useState(settings.simplify.terms);
  const [cats, setCats] = useState(settings.simplify.categories);
  const [alertsOn, setAlertsOn] = useState(settings.alerts.enabled);
  const [interval, setIntervalMinutes] = useState(settings.alerts.interval_minutes);
  const [busy, setBusy] = useState<"save" | "test" | "check" | null>(null);

  // Saved terms that aren't in the generated list (e.g. a past term) stay selectable.
  const allTerms = Array.from(new Set([...termOptions, ...terms.filter((t) => t !== notListed)]));

  const run = async (kind: "save" | "test" | "check", fn: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(kind);
    try {
      const res = await fn();
      toast(res.message, res.ok ? "success" : "error");
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 px-4 py-3 text-sm">
      <section className="space-y-2">
        <label className="flex items-center gap-2 font-medium text-ink">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Pull internships from Simplify&apos;s public internship list
        </label>
        <p className="text-2xs text-ink-muted">
          The community-kept list behind github.com/SimplifyJobs. Covers most companies (Workday ones included).
          Discover pulls it when you open it (at most every 30 minutes) or when you click Refresh sources.
          {settings.last_ingest_at ? ` Last pulled ${new Date(settings.last_ingest_at).toLocaleString()}.` : ""}
        </p>

        <div className="space-y-1">
          <Label>Where</Label>
          <div className="flex flex-wrap gap-1.5">
            {regions.map((r) => (
              <Chip key={r} on={selRegions.includes(r)} onClick={() => setRegions(toggle(selRegions, r))}>
                {r}
              </Chip>
            ))}
          </div>
          {selRegions.length === 0 ? <p className="text-2xs text-warn">No location picked: every location is included.</p> : null}
        </div>

        <div className="space-y-1">
          <Label>Terms</Label>
          <div className="flex flex-wrap gap-1.5">
            {allTerms.map((t) => (
              <Chip key={t} on={terms.includes(t)} onClick={() => setTerms(toggle(terms, t))}>
                {t}
              </Chip>
            ))}
            <Chip on={terms.includes(notListed)} onClick={() => setTerms(toggle(terms, notListed))}>
              Term not listed
            </Chip>
          </div>
          <p className="text-2xs text-ink-muted">
            {terms.length === 0 ? "None picked: any term is included." : "Only listings for the picked terms."}
          </p>
        </div>

        <div className="space-y-1">
          <Label>Kinds of role</Label>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <Chip key={c} on={cats.includes(c)} onClick={() => setCats(toggle(cats, c))}>
                {c}
              </Chip>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-2 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <BellRing className="h-4 w-4 text-ink-muted" aria-hidden />
          <span className="font-medium text-ink">Discord alerts</span>
          {webhook === "ok" ? (
            <Badge tone="good">Webhook set</Badge>
          ) : webhook === "invalid" ? (
            <Badge tone="bad">Webhook link looks wrong</Badge>
          ) : (
            <Badge tone="warn">No webhook yet</Badge>
          )}
        </div>
        {webhook !== "ok" ? (
          <p className="rounded-md border border-line bg-surface px-3 py-2 text-2xs text-ink-muted">
            In your Discord server: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL. Put it in
            .env.local as <code>DISCORD_WEBHOOK_URL=…</code> and restart ApplyStack. Treat that link like a password:
            anyone with it can post in your channel.
          </p>
        ) : null}
        <label className="flex items-center gap-2 text-ink">
          <input type="checkbox" checked={alertsOn} onChange={(e) => setAlertsOn(e.target.checked)} />
          Post new matching internships to Discord
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="alert-interval">Check every</Label>
          <Select
            id="alert-interval"
            value={String(interval)}
            onChange={(e) => setIntervalMinutes(Number(e.target.value))}
            className="w-40"
          >
            {[15, 30, 60, 120, 240].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-2xs text-ink-muted">
          Uses the filters above. Checks run only while ApplyStack is running on this computer; turn alerts on for one
          computer only, or you&apos;ll get each alert twice. The first check just records what&apos;s already open.
          {alertState.last_run_at
            ? ` Last check ${new Date(alertState.last_run_at).toLocaleString()}: ${alertState.last_result ?? ""}`
            : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={webhook !== "ok"}
            loading={busy === "test"}
            onClick={() => run("test", sendDiscordTest)}
          >
            {busy === "test" ? null : <Send className="h-3.5 w-3.5" aria-hidden />}
            Send test alert
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={webhook !== "ok"}
            loading={busy === "check"}
            onClick={() => run("check", checkAlertsNow)}
          >
            Check now
          </Button>
        </div>
      </section>

      <Button
        type="button"
        variant="primary"
        size="sm"
        loading={busy === "save"}
        onClick={() =>
          run("save", () =>
            saveFeedAndAlerts({
              enabled,
              regions: selRegions as never,
              terms,
              categories: cats as never,
              alerts_enabled: alertsOn,
              interval_minutes: interval,
            })
          )
        }
      >
        Save feed &amp; alerts
      </Button>
    </div>
  );
}
