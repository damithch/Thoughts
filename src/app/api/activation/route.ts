import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  deleteBehaviouralActivationEntry,
  getBehaviouralActivationEntriesByUser,
  upsertBehaviouralActivationEntry,
} from "@/lib/db";

function parseScore(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const score = Number(value);

  if (!Number.isInteger(score) || score < 0 || score > 8) {
    return null;
  }

  return score;
}

function normalizeDate(value: unknown) {
  const date = typeof value === "string" ? value.trim() : "";

  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const entries = await getBehaviouralActivationEntriesByUser(currentUser.id);

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Failed to load behavioural activation entries.", error);

    return NextResponse.json(
      { error: "Unable to load entries right now." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const idValue = payload.id;
  const id =
    typeof idValue === "number" && Number.isInteger(idValue) && idValue > 0
      ? idValue
      : undefined;
  const activity = typeof payload.activity === "string" ? payload.activity.trim() : "";
  const entryDate = normalizeDate(payload.entryDate);
  const beforeDepression = parseScore(payload.beforeDepression);
  const beforePleasure = parseScore(payload.beforePleasure);
  const beforeAchievement = parseScore(payload.beforeAchievement);
  const afterDepression = parseScore(payload.afterDepression);
  const afterPleasure = parseScore(payload.afterPleasure);
  const afterAchievement = parseScore(payload.afterAchievement);

  if (!activity || !entryDate) {
    return NextResponse.json(
      { error: "Activity and date are required." },
      { status: 400 },
    );
  }

  try {
    const entry = await upsertBehaviouralActivationEntry({
      id,
      activity,
      entryDate,
      beforeDepression,
      beforePleasure,
      beforeAchievement,
      afterDepression,
      afterPleasure,
      afterAchievement,
      userId: currentUser.id,
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }

    return NextResponse.json({ entry });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save entry right now.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const idValue = Number(searchParams.get("id"));

  if (!Number.isInteger(idValue) || idValue <= 0) {
    return NextResponse.json({ error: "Valid entry id is required." }, { status: 400 });
  }

  try {
    const deleted = await deleteBehaviouralActivationEntry(idValue, currentUser.id);

    if (!deleted) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Failed to delete behavioural activation entry.", error);

    return NextResponse.json(
      { error: "Unable to delete entry right now." },
      { status: 500 },
    );
  }
}
