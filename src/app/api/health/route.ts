import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { logServerError } from "@/lib/logging";

// Liveness + database reachability probe. Unauthenticated by design
// (see /api/health in PUBLIC_PATHS in src/middleware.ts).
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ status: "ok", db: "ok" }, { status: 200 });
  } catch (error) {
    // Do not echo the DB error to the unauthenticated caller; log it.
    logServerError("Health check DB probe failed", error);
    return NextResponse.json(
      { status: "degraded", db: "error" },
      { status: 503 }
    );
  }
}
