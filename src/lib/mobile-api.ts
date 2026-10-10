import "server-only";

import { NextResponse } from "next/server";

import { getMobileUser } from "@/lib/auth";

type User = NonNullable<Awaited<ReturnType<typeof getMobileUser>>>;

// Shared plumbing for the /api/v1 routes used by the mobile app. Every route authenticates with
// a bearer token (never the browser cookie), so these endpoints aren't reachable through CSRF.

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

type AuthedHandler<Context> = (
  request: Request,
  user: User,
  context: Context,
) => Promise<Response>;

// Wraps a route handler so it only runs for a valid mobile token and never leaks a stack trace.
export function withMobileUser<Context = unknown>(handler: AuthedHandler<Context>) {
  return async (request: Request, context: Context) => {
    const user = await getMobileUser(request);

    if (!user) {
      return apiError("Sign in again to continue.", 401);
    }

    try {
      return await handler(request, user, context);
    } catch (error) {
      console.error(`Mobile API ${request.method} ${new URL(request.url).pathname} failed.`, error);
      return apiError("Something went wrong on the server.", 500);
    }
  };
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();

    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function toPublicUser(user: User) {
  return { id: user.id, name: user.name, email: user.email };
}

export function parseIdParam(value: string) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

export function readString(value: unknown, maxLength = 10_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function readMood(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10
    ? value
    : null;
}

// Accepts an array of strings or a comma-separated string; lower-cased, de-duplicated, max 8.
export function readTags(value: unknown) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];

  return Array.from(
    new Set(
      raw
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 8);
}
