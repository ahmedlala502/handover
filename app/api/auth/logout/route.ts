import { expiredSessionCookieHeader } from "../../../../src/server/auth";
import { jsonResponse } from "../../../../src/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return jsonResponse(
    { ok: true },
    {
      headers: {
        "Set-Cookie": expiredSessionCookieHeader(),
      },
    },
  );
}
