import { timingSafeEqual } from "node:crypto";
import { processAttendanceOutbox } from "@/lib/server/sheets";
import { processPushOutbox } from "@/lib/server/push";
import { handleError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!secret || !supplied || supplied.length !== secret.length
    || !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const attendance = await processAttendanceOutbox();
    const push = await processPushOutbox();
    return Response.json({ attendance, push });
  } catch (error) { return handleError(error); }
}
