import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Optional HTTP trigger for the background jobs, for hosts where pg_cron is not
 * used. Requires `Authorization: Bearer $CRON_SECRET`. Running it more often
 * than needed, or alongside pg_cron, is harmless: the jobs are idempotent.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    given.length !== expected.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { data, error } = await createAdminClient().rpc("run_scheduled_jobs", { p_triggered_by: "http" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    runs: (data ?? []).map((r) => ({ job: r.job_name, status: r.status, created: r.created_count, error: r.error })),
  });
}

export const GET = handle;
export const POST = handle;
