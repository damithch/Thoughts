import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  createPostponedItem,
  getPostponedItemsForDay,
  deletePostponedItem,
  getWorryModuleById,
} from "@/lib/db";

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
  const dayNumber = Number(payload.dayNumber);
  const content =
    typeof payload.content === "string" ? payload.content.trim() : "";

  if (!Number.isInteger(moduleId) || moduleId <= 0) {
    return NextResponse.json(
      { error: "A valid moduleId is required." },
      { status: 400 },
    );
  }

  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 7) {
    return NextResponse.json(
      { error: "Day number must be between 1 and 7." },
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

    const item = await createPostponedItem(moduleId, dayNumber, content);

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
  const dayNumber = Number(searchParams.get("dayNumber"));

  if (!Number.isInteger(moduleId) || moduleId <= 0) {
    return NextResponse.json(
      { error: "A valid moduleId is required." },
      { status: 400 },
    );
  }

  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 7) {
    return NextResponse.json(
      { error: "Day number must be between 1 and 7." },
      { status: 400 },
    );
  }

  try {
    // Verify module ownership
    const ownerCheck = await getWorryModuleById(moduleId, currentUser.id);

    if (!ownerCheck) {
      return NextResponse.json({ error: "Module not found." }, { status: 404 });
    }

    const items = await getPostponedItemsForDay(moduleId, dayNumber);

    return NextResponse.json({ items });
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
