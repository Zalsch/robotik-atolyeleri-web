import { ensureSameOrigin, handleError } from "@/lib/server/http";
import { getSession } from "@/lib/server/session";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    const session = await getSession();
    session.destroy();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return handleError(error); }
}
