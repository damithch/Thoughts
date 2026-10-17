import "server-only";

import { NextResponse } from "next/server";

import { getMobileUser } from "@/lib/auth";
import { getBookIdeasByUser } from "@/lib/db";
import type { BookIdeaStatus } from "@/lib/db";
import {
  isValidTaskDate,
  normalizeTaskNote,
  normalizeTaskTags,
  normalizeTaskTitle,
  parseClockTime,
  parseTaskPriorityValue,
} from "@/lib/tasks/validation";

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

// A linked insight idea must be one of the user's own (the insert itself doesn't check this).
// Returns undefined for "not sent", null for "no link", or the id; false if it isn't theirs.
export async function readOwnedBookIdeaId(value: unknown, userId: number) {
  if (value === undefined) return undefined;
  if (value === null || value === 0) return null;

  const id = typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;

  if (!id) return false;

  const ideas = await getBookIdeasByUser(userId);

  return ideas.some((idea) => idea.id === id) ? id : false;
}

export const IDEA_STATUSES: BookIdeaStatus[] = ["understood", "noticed", "applied", "internalized"];

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// Same rules as the web routine form: a title, priority, at least one weekday and a start date
// (an end date, if given, can't be before it).
export function readRoutineInput(body: Record<string, unknown>) {
  const title = normalizeTaskTitle(body.title);
  const priority = parseTaskPriorityValue(body.priority ?? "medium");
  const daysOfWeek = Array.isArray(body.daysOfWeek)
    ? WEEKDAYS.filter((day) => (body.daysOfWeek as unknown[]).includes(day))
    : [];
  const startDate = body.startDate;
  const endDate = body.endDate === undefined || body.endDate === null || body.endDate === "" ? null : body.endDate;

  if (!title) return { error: "Give the routine a title." };
  if (!priority) return { error: "priority must be low, medium or high." };
  if (daysOfWeek.length === 0) return { error: "Pick at least one day of the week." };
  if (!isValidTaskDate(startDate)) return { error: "startDate must be a valid YYYY-MM-DD date." };
  if (endDate !== null && (!isValidTaskDate(endDate) || endDate < startDate)) {
    return { error: "The end date must be a valid date on or after the start date." };
  }

  // Optional phone reminder: left out keeps the current one, null or "" removes it.
  let remindAt: string | null | undefined;
  if (body.remindAt === null || body.remindAt === "") remindAt = null;
  else if (body.remindAt !== undefined) {
    remindAt = parseClockTime(body.remindAt);
    if (!remindAt) return { error: "The reminder time must look like 21:30." };
  }

  return {
    title,
    priority,
    daysOfWeek,
    startDate,
    endDate,
    note: normalizeTaskNote(body.note),
    tags: normalizeTaskTags(body.tags),
    remindAt,
  };
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
