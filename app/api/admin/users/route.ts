import {
  createRuntimeUser,
  deleteRuntimeUser,
  updateRuntimeUser,
} from "../../../../src/server/handover-store";
import { errorResponse, jsonResponse, requireSession } from "../../../../src/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireSession(request);

  if (!session) {
    return errorResponse("Authentication required.", 401);
  }

  try {
    const user = await createRuntimeUser(session.user.id, await request.json());
    return jsonResponse({ user });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to create user.", 400);
  }
}

export async function PUT(request: Request) {
  const session = await requireSession(request);

  if (!session) {
    return errorResponse("Authentication required.", 401);
  }

  try {
    const body = await request.json();
    const userId = typeof body.id === "string" ? body.id : "";
    const user = await updateRuntimeUser(session.user.id, userId, body);
    return jsonResponse({ user });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to update user.", 400);
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession(request);

  if (!session) {
    return errorResponse("Authentication required.", 401);
  }

  try {
    const body = await request.json();
    const userId = typeof body.id === "string" ? body.id : "";
    await deleteRuntimeUser(session.user.id, userId);
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to delete user.", 400);
  }
}
