import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db/client";
import { ensureInitialized } from "@/lib/db/init";
import { getThoughtsByUser, getTasksByUser, getRecurringTasksByUser, getBookIdeasByUser } from "@/lib/db";

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureInitialized();

    const [thoughts, tasks, recurringTasks, bookIdeas] = await Promise.all([
      getThoughtsByUser(currentUser.id, 10000),
      getTasksByUser(currentUser.id),
      getRecurringTasksByUser(currentUser.id),
      getBookIdeasByUser(currentUser.id),
    ]);

    const backupPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      user: {
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.name,
      },
      data: {
        thoughts,
        tasks,
        recurringTasks,
        bookIdeas,
      },
    };

    return new NextResponse(JSON.stringify(backupPayload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="thoughts-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    console.error("Backup export failed:", error);
    return NextResponse.json({ error: "Backup export failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!body || !body.data) {
      return NextResponse.json({ error: "Invalid backup file payload." }, { status: 400 });
    }

    const { thoughts = [], tasks = [], recurringTasks = [] } = body.data;

    await ensureInitialized();

    let importedCount = 0;

    // Import thoughts
    for (const t of thoughts) {
      if (t.title && t.category) {
        await pool.query(
          `
            INSERT INTO thoughts (title, category, mood, tags, excerpt, body, user_id, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT DO NOTHING
          `,
          [t.title, t.category, t.mood ?? 5, t.tags ?? [], t.summary ?? t.excerpt ?? "", t.body ?? "", currentUser.id],
        );
        importedCount++;
      }
    }

    // Import recurring tasks
    for (const r of recurringTasks) {
      if (r.title) {
        await pool.query(
          `
            INSERT INTO recurring_tasks (user_id, title, priority, tags, note, is_active, days_of_week)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT DO NOTHING
          `,
          [currentUser.id, r.title, r.priority ?? "medium", r.tags ?? [], r.note ?? "", r.is_active ?? true, r.days_of_week ?? ["mon","tue","wed","thu","fri","sat","sun"]],
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: `Backup imported successfully. Processed ${importedCount} records.`,
    });
  } catch (error) {
    console.error("Backup import failed:", error);
    return NextResponse.json({ error: "Backup import failed." }, { status: 500 });
  }
}
