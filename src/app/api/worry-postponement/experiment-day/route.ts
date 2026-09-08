import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  upsertWorryExperimentDay,
  getWorryModuleById,
  getExperimentDaysInRange,
} from "@/lib/db";

function normalizeDate(value: unknown) {
  const date = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export async function PUT(request: Request) {
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

  const moduleId = Number(payload.moduleId);
  const entryDate = normalizeDate(payload.entryDate);
  const whatHappened =
    typeof payload.whatHappened === "string" ? payload.whatHappened.trim() : "";
  const thinkingTimeNotes =
    typeof payload.thinkingTimeNotes === "string"
      ? payload.thinkingTimeNotes.trim()
      : "";
  const controllability = Number(payload.controllability);

  if (!Number.isInteger(moduleId) || moduleId <= 0) {
    return NextResponse.json(
      { error: "A valid moduleId is required." },
      { status: 400 },
    );
  }

  if (!entryDate) {
    return NextResponse.json(
      { error: "A valid date in YYYY-MM-DD format is required." },
      { status: 400 },
    );
  }

  if (
    !Number.isInteger(controllability) ||
    controllability < 0 ||
    controllability > 10
  ) {
    return NextResponse.json(
      { error: "Controllability must be between 0 and 10." },
      { status: 400 },
    );
  }

  try {
    // Verify module ownership
    const ownerCheck = await getWorryModuleById(moduleId, currentUser.id);

    if (!ownerCheck) {
      return NextResponse.json({ error: "Module not found." }, { status: 404 });
    }

    const day = await upsertWorryExperimentDay({
      moduleId,
      entryDate,
      whatHappened,
      thinkingTimeNotes,
      controllability,
    });

    return NextResponse.json({ day });
  } catch (error) {
    console.error("Failed to upsert worry experiment day.", error);
    return NextResponse.json(
      { error: "Unable to save experiment day right now." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const moduleId = Number(searchParams.get("moduleId"));
  const startDate = normalizeDate(searchParams.get("startDate"));
  const endDate = normalizeDate(searchParams.get("endDate"));

  if (!Number.isInteger(moduleId) || moduleId <= 0) {
    return NextResponse.json(
      { error: "A valid moduleId is required." },
      { status: 400 },
    );
  }

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate and endDate are required in YYYY-MM-DD format." },
      { status: 400 },
    );
  }

  try {
    const ownerCheck = await getWorryModuleById(moduleId, currentUser.id);

    if (!ownerCheck) {
      return NextResponse.json({ error: "Module not found." }, { status: 404 });
    }

    const days = await getExperimentDaysInRange(moduleId, startDate, endDate);

    return NextResponse.json({ days });
  } catch (error) {
    console.error("Failed to load experiment days.", error);
    return NextResponse.json(
      { error: "Unable to load experiment days right now." },
      { status: 500 },
    );
  }
}
