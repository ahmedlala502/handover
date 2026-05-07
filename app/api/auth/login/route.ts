import {
  createSessionCookie,
  getSessionSecret,
  sessionCookieHeader,
  sessionExpiry,
} from "../../../../src/server/auth";
import { authenticateRuntimeUser } from "../../../../src/server/handover-store";
import { errorResponse, jsonResponse } from "../../../../src/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";
    const user = await authenticateRuntimeUser(username, password);

    if (!user) {
      return errorResponse("Invalid username or password.", 401);
    }

    const expiresAt = sessionExpiry();
    const token = createSessionCookie(user.id, getSessionSecret(), expiresAt);

    return jsonResponse(
      { user },
      {
        headers: {
          "Set-Cookie": sessionCookieHeader(token, expiresAt),
        },
      },
    );
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Login failed.", 500);
  }
}
