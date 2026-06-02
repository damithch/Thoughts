import "server-only";

import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { cookies } from "next/headers";

import { getUserById } from "@/lib/db";

const SESSION_COOKIE_NAME = "thoughts_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const authSecret = process.env.AUTH_SECRET;

if (!authSecret) {
  throw new Error("AUTH_SECRET is not configured.");
}

type SessionPayload = {
  userId: number;
  expiresAt: number;
};

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
  return createHmac("sha256", authSecret).update(value).digest("base64url");
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

export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const sessionValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionValue) {
      return null;
    }

    const payload = decodeSession(sessionValue);

    if (!payload) {
      return null;
    }

    return getUserById(payload.userId);
  } catch (error) {
    console.error("Failed to resolve the current session.", error);
    return null;
  }
}
