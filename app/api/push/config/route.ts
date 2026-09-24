import { requireActor } from "@/lib/server/auth";
import { handleError } from "@/lib/server/http";
import { pushPublicKey } from "@/lib/server/push";

export async function GET() {
  try {
    await requireActor(["student"]);
    return Response.json({ publicKey: pushPublicKey() });
  } catch (error) { return handleError(error); }
}
