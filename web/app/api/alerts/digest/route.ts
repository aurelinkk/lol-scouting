import { NextResponse } from "next/server";
import { digestMessages } from "@/lib/alerts/digest";
import { getStore } from "@/lib/deep/store";
import { type Region, REGIONS } from "@/lib/region";

// Récap quotidien sur Discord (GitHub Action chaque matin) : une fois par jour et par région
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return NextResponse.json({ ok: false, error: "DISCORD_WEBHOOK_URL absente" }, { status: 400 });
  const url = new URL(req.url);
  const regions = (url.searchParams.get("regions") ?? "eu").split(",").filter((r): r is Region => (REGIONS as string[]).includes(r));
  const force = url.searchParams.get("force") === "1" && url.searchParams.get("code") === process.env.DEEP_ACCESS_CODE;
  const day = new Date().toISOString().slice(0, 10);
  const site = `${url.protocol}//${url.host}`;
  const sent: Region[] = [];
  for (const region of regions) {
    if (!force && !(await getStore().lock(`digest:${region}:${day}`, 60 * 60 * 20))) continue;
    for (const content of digestMessages(region, site)) {
      await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) }).catch(() => {});
    }
    sent.push(region);
  }
  return NextResponse.json({ ok: true, sent });
}
