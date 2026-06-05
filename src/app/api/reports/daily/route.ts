import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getThoughtsByUserAndDate } from "@/lib/db";
import { toColomboExportParts } from "@/lib/time";

type DailyThought = Awaited<ReturnType<typeof getThoughtsByUserAndDate>>[number];

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? "";
  const format = searchParams.get("format") ?? "csv";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new NextResponse("Invalid date.", { status: 400 });
  }

  if (format !== "csv" && format !== "json") {
    return new NextResponse("Invalid format.", { status: 400 });
  }

  try {
    const thoughts = await getThoughtsByUserAndDate(currentUser.id, date);

    if (format === "json") {
      return NextResponse.json(
        {
          date,
          user: {
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
          },
          total_thoughts: thoughts.length,
          thoughts: thoughts.map((thought: DailyThought) => {
            const createdAt = toColomboExportParts(thought.created_at);
            const updatedAt = toColomboExportParts(thought.updated_at);

            return {
              id: thought.id,
              user_id: thought.user_id,
              title: thought.title,
              category: thought.category,
              mood: thought.mood,
              tags: thought.tags,
              summary: thought.summary,
              full_note: thought.body,
              content: thought.summary,
              created_at: createdAt.localIso,
              created_at_utc: createdAt.isoUtc,
              created_date: createdAt.date,
              created_time: createdAt.time,
              updated_at: updatedAt.localIso,
              updated_at_utc: updatedAt.isoUtc,
              updated_date: updatedAt.date,
              updated_time: updatedAt.time,
            };
          }),
        },
        {
          status: 200,
          headers: {
            "Content-Disposition": `attachment; filename="thoughts-${date}.json"`,
          },
        },
      );
    }

    const lines = [
      [
        "id",
        "user_id",
        "title",
        "category",
        "mood",
        "tags",
        "summary",
        "full_note",
        "created_date",
        "created_time",
        "created_at",
        "created_at_utc",
        "updated_date",
        "updated_time",
        "updated_at",
        "updated_at_utc",
      ].join(","),
      ...thoughts.map((thought: DailyThought) => {
        const createdAt = toColomboExportParts(thought.created_at);
        const updatedAt = toColomboExportParts(thought.updated_at);

        return [
          String(thought.id),
          String(thought.user_id ?? ""),
          escapeCsv(thought.title),
          escapeCsv(thought.category),
          String(thought.mood),
          escapeCsv(thought.tags.join("|")),
          escapeCsv(thought.summary),
          escapeCsv(thought.body),
          escapeCsv(createdAt.date),
          escapeCsv(createdAt.time),
          escapeCsv(createdAt.localIso),
          escapeCsv(createdAt.isoUtc),
          escapeCsv(updatedAt.date),
          escapeCsv(updatedAt.time),
          escapeCsv(updatedAt.localIso),
          escapeCsv(updatedAt.isoUtc),
        ].join(",");
      }),
    ];

    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="thoughts-${date}.csv"`,
      },
    });
  } catch (error) {
    console.error("Failed to build daily report.", error);

    return new NextResponse("Unable to generate report right now.", {
      status: 500,
    });
  }
}
