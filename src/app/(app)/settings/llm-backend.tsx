"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { recheckLlmBackend, saveLlmBackend } from "./actions";

type Provider = "claude_cli" | "anthropic" | "openai" | "gemini" | "offline";

interface Props {
  providers: { value: Provider; label: string }[];
  defaults: Record<Exclude<Provider, "offline">, { fast: string; smart: string }>;
  keyEnv: Record<"anthropic" | "openai" | "gemini", string>;
  settings: { provider: Provider; model_fast: string; model_smart: string; timeout_seconds: number | null; source: string };
  status: { ok: boolean; message: string; warning?: string };
}

const SETUP: Record<Provider, string> = {
  claude_cli:
    "Install once with `npm install -g @anthropic-ai/claude-code`, then run `claude` in a terminal and sign in with your own Claude account. Runs on your Claude plan; no API bill. Only works when ApplyStack runs on the same computer.",
  anthropic: "Set ANTHROPIC_API_KEY in .env.local (from platform.claude.com) and restart ApplyStack. Billed per use.",
  openai: "Set OPENAI_API_KEY in .env.local (from platform.openai.com) and restart ApplyStack. Billed per use.",
  gemini: "Set GEMINI_API_KEY in .env.local (from aistudio.google.com) and restart ApplyStack. Billed per use (free tier available).",
  offline: "No model. Analysis and tailoring use the built-in deterministic engine: skills reordering and suggested trims, no rewritten bullets.",
};

export function LlmBackendCard({ providers, defaults, keyEnv, settings, status: initialStatus }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>(settings.provider);
  const [fast, setFast] = useState(settings.model_fast);
  const [smart, setSmart] = useState(settings.model_smart);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState<"save" | "check" | null>(null);

  const isModel = provider !== "offline";
  const dflt = isModel ? defaults[provider] : null;

  const onProvider = (p: Provider) => {
    setProvider(p);
    // Model names don't carry across providers: start from that provider's defaults.
    const d = p === "offline" ? null : defaults[p];
    setFast(p === settings.provider ? settings.model_fast : d?.fast ?? "");
    setSmart(p === settings.provider ? settings.model_smart : d?.smart ?? "");
  };

  return (
    <form
      className="space-y-3 px-4 py-3"
      action={async (fd) => {
        setBusy("save");
        try {
          // Store blanks for defaults so future default updates apply automatically.
          if (dflt && fd.get("model_fast") === dflt.fast) fd.set("model_fast", "");
          if (dflt && fd.get("model_smart") === dflt.smart) fd.set("model_smart", "");
          const res = await saveLlmBackend(fd);
          if (res.status) setStatus(res.status);
          toast(res.message, res.ok ? "success" : "error");
          router.refresh();
        } finally {
          setBusy(null);
        }
      }}
    >
      {settings.source === "env" ? (
        <p className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-2xs text-ink">
          APPLYSTACK_LLM_PROVIDER is set in your environment and overrides the choice below until you remove it.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <Label htmlFor="llm-provider">Backend</Label>
          <Select id="llm-provider" name="provider" value={provider} onChange={(e) => onProvider(e.target.value as Provider)}>
            {providers.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="llm-fast">Fast model (parsing, extraction)</Label>
          <Input
            id="llm-fast"
            name="model_fast"
            value={fast}
            onChange={(e) => setFast(e.target.value)}
            disabled={!isModel}
            placeholder={dflt?.fast ?? "—"}
          />
        </div>
        <div>
          <Label htmlFor="llm-smart">Smart model (resume writing)</Label>
          <Input
            id="llm-smart"
            name="model_smart"
            value={smart}
            onChange={(e) => setSmart(e.target.value)}
            disabled={!isModel}
            placeholder={dflt?.smart ?? "—"}
          />
        </div>
      </div>

      <p className="text-2xs text-ink-muted">
        {SETUP[provider]}
        {provider !== "claude_cli" && provider !== "offline"
          ? ` Keys are read from ${keyEnv[provider]} only and are never saved by ApplyStack.`
          : ""}
      </p>

      {provider === settings.provider ? (
        <div
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
            status.ok ? "border-good/30 bg-good/5" : "border-bad/30 bg-bad/5"
          }`}
          role="status"
        >
          {status.ok ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-good" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bad" aria-hidden />
          )}
          <div className="space-y-1">
            <p className="text-ink">{status.message}</p>
            {status.warning ? <p className="text-warn">{status.warning}</p> : null}
          </div>
        </div>
      ) : (
        <p className="text-2xs text-ink-faint">Save to switch backends and run the readiness check.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" size="sm" loading={busy === "save"}>
          Save backend
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={busy === "check"}
          onClick={async () => {
            setBusy("check");
            try {
              const res = await recheckLlmBackend();
              if (res.status) setStatus(res.status);
              toast(res.message, res.ok ? "success" : "error");
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === "check" ? null : <RefreshCw className="h-3.5 w-3.5" aria-hidden />} Check again
        </Button>
        {dflt && (fast !== dflt.fast || smart !== dflt.smart) ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setFast(dflt.fast);
              setSmart(dflt.smart);
            }}
          >
            Reset models to defaults
          </Button>
        ) : null}
        <Badge tone="outline" className="ml-auto">
          saved in applystack.config.json
        </Badge>
      </div>
    </form>
  );
}
