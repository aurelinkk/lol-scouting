import { NextResponse } from "next/server";
import { checkAccess, createJob, listJobs } from "@/lib/deep/jobs";
import { hasPersistentStore } from "@/lib/deep/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json({
    jobs,
    persistent: hasPersistentStore(),
    riotKey: !!process.env.RIOT_API_KEY,
    needsCode: !!process.env.DEEP_ACCESS_CODE,
  });
}

export async function POST(req: Request) {
  if (!checkAccess(req)) return NextResponse.json({ error: "Code d'accès incorrect" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { riotId?: string; maxMatches?: number };
  try {
    const job = await createJob(String(body.riotId ?? ""), Number(body.maxMatches ?? 1000));
    return NextResponse.json({ job });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
