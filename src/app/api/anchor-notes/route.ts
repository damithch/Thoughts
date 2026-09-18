import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  createAnchorNote,
  getAnchorNoteByDate,
  getAnchorStreak,
  getRecentAnchorNotes,
} from "@/lib/db";
import { getCurrentColomboDate } from "@/lib/time";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const queryDate = searchParams.get("date");
  const limitParam = Number(searchParams.get("limit") || "30");

  try {
    const today = getCurrentColomboDate();
    const [todayNote, streak, recentNotes] = await Promise.all([
      getAnchorNoteByDate(currentUser.id, queryDate || today),
      getAnchorStreak(currentUser.id, today),
      getRecentAnchorNotes(currentUser.id, limitParam),
    ]);

    return NextResponse.json({
      todayNote,
      streak,
      recentNotes,
    });
  } catch (error) {
    console.error("Failed to fetch anchor notes:", error);
    return NextResponse.json(
      { error: "Unable to load anchor notes." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    const rawDate = typeof body?.date === "string" ? body.date.trim() : "";
    const date =
      rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
        ? rawDate
        : getCurrentColomboDate();

    if (!content) {
      return NextResponse.json(
        { error: "Anchor note content cannot be empty." },
        { status: 400 },
      );
    }

    const sanitizedContent = content
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, 280);

    const note = await createAnchorNote({
      userId: currentUser.id,
      date,
      content: sanitizedContent,
    });

    const streak = await getAnchorStreak(currentUser.id, date);

    return NextResponse.json({ note, streak }, { status: 201 });
  } catch (error) {
    console.error("Failed to create anchor note:", error);
    return NextResponse.json(
      { error: "Unable to save anchor note." },
      { status: 500 },
    );
  }
}
