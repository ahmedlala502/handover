import { NextResponse, type NextRequest } from "next/server";

import { basicAuthChallenge, evaluateBasicAuth } from "./src/auth/basic-auth";

const REALM = "TryGC Handover";

export function proxy(request: NextRequest) {
  const auth = evaluateBasicAuth(
    request.headers.get("authorization"),
    process.env.HANDOVER_AUTH_USER,
    process.env.HANDOVER_AUTH_PASSWORD,
  );

  if (!auth.configured) {
    return new NextResponse("Handover authentication is not configured.", {
      status: 500,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  if (!auth.authorized) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": basicAuthChallenge(REALM),
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
