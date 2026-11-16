"use client";

import Link from "next/link";
import { useState } from "react";
import { launchDeep } from "@/lib/deep/client";

/** Lance une analyse soloQ approfondie pour un Riot ID. */
export default function DeepButton({ riotId, compact = false }: { riotId: string; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  const go = async () => {
    setState("busy");
    try {
      await launchDeep(riotId);
      setState("ok");
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };
  if (state === "ok")
    return (
      <Link href="/analyses" className="text-xs text-accent hover:underline">
        {compact ? "✓" : "Analyse lancée ✓"}
      </Link>
    );
  return (
    <button
      onClick={go}
      disabled={state === "busy"}
      title={state === "error" ? msg : `Analyse approfondie de ${riotId} (toutes ses parties de l'année)`}
      className={`rounded border border-border px-1.5 py-0.5 text-xs hover:bg-surface-2 disabled:opacity-50 ${
        state === "error" ? "text-critical" : "text-ink-2"
      }`}
    >
      {compact ? "🔍" : "🔍 Analyse soloQ approfondie"}
    </button>
  );
}
