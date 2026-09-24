import { requireActor } from "@/lib/server/auth";
import { ensureSameOrigin, handleError, throwDbError } from "@/lib/server/http";
import { processAttendanceOutbox, sheetsConfigured } from "@/lib/server/sheets";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { db } = await requireActor(["admin"]);
    const { count: pending, error: pendingError } = await db.from("attendance_sync_outbox")
      .select("lesson_id", { count: "exact", head: true }).is("synced_at", null);
    throwDbError(pendingError);
    const { count: failed, error: failedError } = await db.from("attendance_sync_outbox")
      .select("lesson_id", { count: "exact", head: true }).is("synced_at", null).gt("attempts", 0);
    throwDbError(failedError);
    return Response.json({ configured: sheetsConfigured(), pending: pending ?? 0, failed: failed ?? 0 });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    await requireActor(["admin"]);
    return Response.json(await processAttendanceOutbox());
  } catch (error) { return handleError(error); }
}
