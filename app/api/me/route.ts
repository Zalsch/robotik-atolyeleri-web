import { requireActor } from "@/lib/server/auth";
import { handleError } from "@/lib/server/http";

export async function GET() {
  try {
    const { actor } = await requireActor();
    return Response.json({ user: { id: actor.id, role: actor.role, username: actor.username, displayName: actor.display_name } });
  } catch (error) { return handleError(error); }
}
