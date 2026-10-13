import "server-only";

import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";

import { getUserById } from "@/lib/db";

const SESSION_COOKIE_NAME = "thoughts_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const MOBILE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

const authSecret = process.env.AUTH_SECRET;

if (!authSecret) {
  throw new Error("AUTH_SECRET is not configured.");
}

const authSecretValue: string = authSecret;

type SessionPayload = {
  userId: number;
  expiresAt: number;
  issuedAt?: number;
  kind?: "mobile";
};

function isDynamicServerUsageError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    error.digest === "DYNAMIC_SERVER_USAGE"
  );
}

function hashText(value: string, salt: string) {
  return scryptSync(value, salt, 64).toString("hex");
}

function base64UrlEncode(input: string) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signValue(value: string) {
  return createHmac("sha256", authSecretValue).update(value).digest("base64url");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = hashText(password, salt);

  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedPassword: string) {
  const [salt, originalHash] = storedPassword.split(":");

  if (!salt || !originalHash) {
    return false;
  }

  const computedHash = hashText(password, salt);
  const originalBuffer = Buffer.from(originalHash, "hex");
  const computedBuffer = Buffer.from(computedHash, "hex");

  if (originalBuffer.length !== computedBuffer.length) {
    return false;
  }

  return timingSafeEqual(originalBuffer, computedBuffer);
}

function encodeSession(payload: SessionPayload) {
  const json = JSON.stringify(payload);
  const encoded = base64UrlEncode(json);
  const signature = signValue(encoded);

  return `${encoded}.${signature}`;
}

function decodeSession(value: string): SessionPayload | null {
  const [encoded, providedSignature] = value.split(".");

  if (!encoded || !providedSignature) {
    return null;
  }

  const expectedSignature = signValue(encoded);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  const parsed = JSON.parse(base64UrlDecode(encoded)) as SessionPayload;

  if (parsed.expiresAt < Date.now()) {
    return null;
  }

  return parsed;
}

export async function createSession(userId: number) {
  const cookieStore = await cookies();
  const payload = {
    userId,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
    issuedAt: Date.now(),
  };

  cookieStore.set(SESSION_COOKIE_NAME, encodeSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();

  cookieStore.delete(SESSION_COOKIE_NAME);
}

// Loads the session's user, rejecting sessions issued before the user's last password change.
async function resolveSessionUser(payload: SessionPayload, ttlSeconds: number) {
  const user = await getUserById(payload.userId);

  if (!user) {
    return null;
  }

  const issuedAt =
    typeof payload.issuedAt === "number"
      ? payload.issuedAt
      : payload.expiresAt - ttlSeconds * 1000;

  if (new Date(issuedAt).getTime() < user.password_updated_at.getTime()) {
    return null;
  }

  return user;
}

// The browser's session cookie, or else the mobile app's bearer token. Accepting the bearer token
// here lets the app use the existing JSON routes as they are; a header can't be sent cross-site by
// a browser, so this doesn't open the routes to CSRF.
export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const sessionValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionValue) {
      return await getUserFromBearerHeader((await headers()).get("authorization"));
    }

    const payload = decodeSession(sessionValue);

    // A mobile token is only valid as a bearer token, never as the browser cookie.
    if (!payload || payload.kind === "mobile") {
      return null;
    }

    return await resolveSessionUser(payload, SESSION_TTL_SECONDS);
  } catch (error) {
    if (!isDynamicServerUsageError(error)) {
      console.error("Failed to resolve the current session.", error);
    }
    return null;
  }
}

// Signed token for the mobile app, sent as `Authorization: Bearer <token>`. Same signing as the
// session cookie, but marked `kind: "mobile"` so the two can't be swapped for each other.
export function createMobileToken(userId: number) {
  const now = Date.now();

  return {
    token: encodeSession({
      userId,
      kind: "mobile",
      issuedAt: now,
      expiresAt: now + MOBILE_TOKEN_TTL_SECONDS * 1000,
    }),
    expiresAt: new Date(now + MOBILE_TOKEN_TTL_SECONDS * 1000),
  };
}

export async function getMobileUser(request: Request) {
  return getUserFromBearerHeader(request.headers.get("authorization"));
}

async function getUserFromBearerHeader(header: string | null) {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");

  if (!match) {
    return null;
  }

  try {
    const payload = decodeSession(match[1]);

    if (!payload || payload.kind !== "mobile") {
      return null;
    }

    return await resolveSessionUser(payload, MOBILE_TOKEN_TTL_SECONDS);
  } catch (error) {
    console.error("Failed to resolve the mobile token.", error);
    return null;
  }
}
