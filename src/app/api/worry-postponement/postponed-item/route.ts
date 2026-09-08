import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  createPostponedItem,
  getPostponedItemsForDay,
  deletePostponedItem,
  getWorryModuleById,
  getPostponedItemCountsByDate,
} from "@/lib/db";

function normalizeDate(value: unknown) {
  const date = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
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

  const moduleId = Number(payload.moduleId);
  const entryDate =
    normalizeDate(payload.entryDate) ||
    new Date().toISOString().slice(0, 10);
  const content =
    typeof payload.content === "string" ? payload.content.trim() : "";

  if (!Number.isInteger(moduleId) || moduleId <= 0) {
    return NextResponse.json(
      { error: "A valid moduleId is required." },
      { status: 400 },
    );
  }

  if (!content) {
    return NextResponse.json(
      { error: "Content is required." },
      { status: 400 },
    );
  }

  try {
    // Verify module ownership
    const ownerCheck = await getWorryModuleById(moduleId, currentUser.id);

    if (!ownerCheck) {
      return NextResponse.json({ error: "Module not found." }, { status: 404 });
    }

    const item = await createPostponedItem(moduleId, entryDate, content);

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("Failed to create postponed item.", error);
    return NextResponse.json(
      { error: "Unable to add item right now." },
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

  if (!Number.isInteger(moduleId) || moduleId <= 0) {
    return NextResponse.json(
      { error: "A valid moduleId is required." },
      { status: 400 },
    );
  }

  try {
    // Verify module ownership
    const ownerCheck = await getWorryModuleById(moduleId, currentUser.id);

    if (!ownerCheck) {
      return NextResponse.json({ error: "Module not found." }, { status: 404 });
    }

    // Single date query
    const entryDate = normalizeDate(searchParams.get("entryDate"));
    if (entryDate) {
      const items = await getPostponedItemsForDay(moduleId, entryDate);
      return NextResponse.json({ items });
    }

    // Date range query — returns counts per date for calendar badges
    const startDate = normalizeDate(searchParams.get("startDate"));
    const endDate = normalizeDate(searchParams.get("endDate"));
    if (startDate && endDate) {
      const counts = await getPostponedItemCountsByDate(
        moduleId,
        startDate,
        endDate,
      );
      return NextResponse.json({ counts });
    }

    return NextResponse.json(
      {
        error:
          "Provide entryDate (YYYY-MM-DD) or startDate + endDate range.",
      },
      { status: 400 },
    );
  } catch (error) {
    console.error("Failed to load postponed items.", error);
    return NextResponse.json(
      { error: "Unable to load items right now." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const itemId = Number(searchParams.get("itemId"));
  const moduleId = Number(searchParams.get("moduleId"));

  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json(
      { error: "A valid itemId is required." },
      { status: 400 },
    );
  }

  if (!Number.isInteger(moduleId) || moduleId <= 0) {
    return NextResponse.json(
      { error: "A valid moduleId is required." },
      { status: 400 },
    );
  }

  try {
    // Verify module ownership
    const ownerCheck = await getWorryModuleById(moduleId, currentUser.id);

    if (!ownerCheck) {
      return NextResponse.json({ error: "Module not found." }, { status: 404 });
    }

    const deleted = await deletePostponedItem(itemId, moduleId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Item not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Failed to delete postponed item.", error);
    return NextResponse.json(
      { error: "Unable to delete item right now." },
      { status: 500 },
    );
  }
}
