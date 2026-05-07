import {
  getVisibleState,
  mergeRuntimeVisibleState,
} from "../../../../src/server/handover-store";
import { errorResponse, jsonResponse, requireSession } from "../../../../src/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireSession(request);

  if (!session) {
    return errorResponse("Authentication required.", 401);
  }

  const url = new URL(request.url);
  const previewUserId = url.searchParams.get("previewUserId") || undefined;

  try {
    return jsonResponse(getVisibleState(session.db, session.user.id, previewUserId));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to load state.", 400);
  }
}

export async function PUT(request: Request) {
  const session = await requireSession(request);

  if (!session) {
    return errorResponse("Authentication required.", 401);
  }

  const url = new URL(request.url);
  const previewUserId = url.searchParams.get("previewUserId") || undefined;
  const body = await request.json().catch(() => null);

  if (!body) {
    return errorResponse("Invalid state payload.", 400);
  }

  try {
    const next = await mergeRuntimeVisibleState(session.user.id, body, previewUserId);
    return jsonResponse(next);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to save state.", 400);
  }
}
