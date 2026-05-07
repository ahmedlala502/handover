import { errorResponse, jsonResponse, requireSession } from "../../../../src/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireSession(request);

  if (!session) {
    return errorResponse("Authentication required.", 401);
  }

  return jsonResponse({ user: session.publicUser });
}
