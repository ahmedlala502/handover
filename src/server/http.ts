import {
  cookieValue,
  getSessionCookieName,
  getSessionSecret,
  parseSessionCookie,
} from "./auth";
import { loadRuntimeDatabase, publicUser } from "./handover-store";

export function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers || {}),
    },
  });
}

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, { status });
}

export async function requireSession(request: Request) {
  const token = cookieValue(request.headers.get("cookie"), getSessionCookieName());
  const session = parseSessionCookie(token, getSessionSecret());

  if (!session) {
    return null;
  }

  const db = await loadRuntimeDatabase();
  const user = db.users.find((candidate) => candidate.id === session.userId);

  return user ? { db, user, publicUser: publicUser(user) } : null;
}
