import { NextResponse } from "next/server";
import { getStore } from "@/lib/deep/store";

// Test du salon Discord : /api/alerts/test?code=<DEEP_ACCESS_CODE> envoie un message
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return NextResponse.json({ ok: false, error: "DISCORD_WEBHOOK_URL n'est pas configurée sur Vercel" }, { status: 400 });
  const code = process.env.DEEP_ACCESS_CODE;
  if (code && new URL(req.url).searchParams.get("code") !== code)
    return NextResponse.json({ ok: false, error: "code d'accès manquant ou faux (?code=...)" }, { status: 403 });
  if (!(await getStore().lock("alerts:test", 30)))
    return NextResponse.json({ ok: false, error: "un test vient d'être envoyé, réessaie dans 30 secondes" }, { status: 429 });
  const r = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content:
        "✅ **LoL Scouting** est connecté à ce salon.\nTu recevras ici : les news mercato des joueurs suivis (⭐), et les mouvements du modèle de montée (± 5 points, entrée dans le top 3 du poste).",
    }),
  }).catch(() => null);
  return NextResponse.json({ ok: !!r?.ok, status: r?.status ?? null });
}
