import { NextResponse } from "next/server";
import { checkAccess, tick } from "@/lib/deep/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!checkAccess(req)) return NextResponse.json({ error: "Code d'accès incorrect" }, { status: 401 });
  return NextResponse.json(await tick());
}
