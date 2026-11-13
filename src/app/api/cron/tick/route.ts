import { NextResponse } from "next/server";
import { runTick } from "@/lib/jobs/runner";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const secretHeader = request.headers.get("x-cron-secret") ?? "";
  if (env.CRON_SECRET) return bearer === env.CRON_SECRET || secretHeader === env.CRON_SECRET;
  // Without a configured secret, refuse in production and allow local dev.
  return process.env.NODE_ENV !== "production";
}

async function handle(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const summary = await runTick("cron");
  return NextResponse.json(summary, { status: summary.errors.length ? 207 : 200 });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
