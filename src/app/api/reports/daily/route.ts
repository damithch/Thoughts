import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getThoughtsByUserAndDate } from "@/lib/db";

type DailyThought = Awaited<ReturnType<typeof getThoughtsByUserAndDate>>[number];

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function formatDateParts(value: Date) {
  const iso = value.toISOString();

  return {
    iso,
    date: iso.slice(0, 10),
    time: iso.slice(11, 19),
  };
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
            const createdAt = formatDateParts(new Date(thought.created_at));
            const updatedAt = formatDateParts(new Date(thought.updated_at));

            return {
              id: thought.id,
              user_id: thought.user_id,
              title: thought.title,
              category: thought.category,
              content: thought.excerpt,
              created_at: createdAt.iso,
              created_date: createdAt.date,
              created_time: createdAt.time,
              updated_at: updatedAt.iso,
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
        "content",
        "created_date",
        "created_time",
        "created_at",
        "updated_date",
        "updated_time",
        "updated_at",
      ].join(","),
      ...thoughts.map((thought: DailyThought) => {
        const createdAt = formatDateParts(new Date(thought.created_at));
        const updatedAt = formatDateParts(new Date(thought.updated_at));

        return [
          String(thought.id),
          String(thought.user_id ?? ""),
          escapeCsv(thought.title),
          escapeCsv(thought.category),
          escapeCsv(thought.excerpt),
          escapeCsv(createdAt.date),
          escapeCsv(createdAt.time),
          escapeCsv(createdAt.iso),
          escapeCsv(updatedAt.date),
          escapeCsv(updatedAt.time),
          escapeCsv(updatedAt.iso),
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
