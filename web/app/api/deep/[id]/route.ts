import { NextResponse } from "next/server";
import { checkAccess, deleteJob, getJob } from "@/lib/deep/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { job, report } = await getJob((await params).id);
  if (!job) return NextResponse.json({ error: "Analyse introuvable" }, { status: 404 });
  return NextResponse.json({ job, report });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAccess(req)) return NextResponse.json({ error: "Code d'accès incorrect" }, { status: 401 });
  await deleteJob((await params).id);
  return NextResponse.json({ ok: true });
}
