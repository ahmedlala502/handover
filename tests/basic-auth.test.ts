import { describe, expect, it } from "vitest";

import {
  basicAuthChallenge,
  evaluateBasicAuth,
  parseBasicAuthHeader,
} from "../src/auth/basic-auth";

function headerFor(user: string, password: string) {
  return `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
}

describe("basic auth helpers", () => {
  it("parses a valid Basic authorization header", () => {
    expect(parseBasicAuthHeader(headerFor("ops", "handover"))).toEqual({
      username: "ops",
      password: "handover",
    });
  });

  it("keeps colons inside the password", () => {
    expect(parseBasicAuthHeader(headerFor("ops", "pass:with:colons"))).toEqual({
      username: "ops",
      password: "pass:with:colons",
    });
  });

  it("rejects missing, malformed, and non-Basic headers", () => {
    expect(parseBasicAuthHeader(null)).toBeNull();
    expect(parseBasicAuthHeader("Bearer token")).toBeNull();
    expect(parseBasicAuthHeader("Basic not-base64")).toBeNull();
    expect(parseBasicAuthHeader(headerFor("", "handover"))).toBeNull();
  });

  it("authorizes only exact configured credentials", () => {
    expect(evaluateBasicAuth(headerFor("ops", "handover"), "ops", "handover")).toEqual({
      configured: true,
      authorized: true,
    });

    expect(evaluateBasicAuth(headerFor("ops", "wrong"), "ops", "handover")).toEqual({
      configured: true,
      authorized: false,
    });
  });

  it("fails closed when credentials are not configured", () => {
    expect(evaluateBasicAuth(headerFor("ops", "handover"), "", "handover")).toEqual({
      configured: false,
      authorized: false,
    });
  });

  it("returns a standards-compatible challenge header", () => {
    expect(basicAuthChallenge("TryGC Handover")).toBe(
      'Basic realm="TryGC Handover", charset="UTF-8"',
    );
  });
});
