import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const HASH_PREFIX = "scrypt";
const KEY_LENGTH = 64;
const SESSION_COOKIE = "handover_session";
const DEFAULT_SESSION_HOURS = 12;

export type ParsedSession = {
  userId: string;
};

type SessionPayload = ParsedSession & {
  exp: number;
};

export async function createPasswordHash(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;

  return `${HASH_PREFIX}:${salt}:${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [prefix, salt, hash] = storedHash.split(":");

  if (prefix !== HASH_PREFIX || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "base64url");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSessionCookie(
  userId: string,
  secret = getSessionSecret(),
  expiresAt = sessionExpiry(),
) {
  const payload: SessionPayload = {
    userId,
    exp: expiresAt.getTime(),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(body, secret);

  return `${body}.${signature}`;
}

export function parseSessionCookie(
  cookieValue: string | null | undefined,
  secret = getSessionSecret(),
  now = new Date(),
): ParsedSession | null {
  if (!cookieValue) {
    return null;
  }

  const [body, signature] = cookieValue.split(".");
  if (!body || !signature || !stableEquals(signature, sign(body, secret))) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed.userId || typeof parsed.exp !== "number" || parsed.exp <= now.getTime()) {
      return null;
    }

    return { userId: parsed.userId };
  } catch {
    return null;
  }
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export function getSessionSecret() {
  return process.env.HANDOVER_SESSION_SECRET || "local-dev-session-secret-change-me";
}

export function sessionExpiry(now = new Date()) {
  return new Date(now.getTime() + DEFAULT_SESSION_HOURS * 60 * 60 * 1000);
}

export function sessionCookieHeader(token: string, expiresAt = sessionExpiry()) {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function expiredSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function cookieValue(cookieHeader: string | null, name: string) {
  const cookies = cookieHeader?.split(";").map((part) => part.trim()) || [];
  const prefix = `${name}=`;
  const cookie = cookies.find((part) => part.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function stableEquals(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return (
    valueBuffer.length === expectedBuffer.length &&
    timingSafeEqual(valueBuffer, expectedBuffer)
  );
}
