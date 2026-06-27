import { NextResponse } from "next/server";

import {
  createTask,
  createThought,
  getDailyCheckInsByUserAndDate,
  getDayRecordByUserAndDate,
  getTasksByUserAndDate,
  getThoughtsByUserAndDate,
  getUserById,
} from "@/lib/db";
import type { NewTask, NewThought, TaskItem, Thought } from "@/lib/db";
import { pool } from "@/lib/db/client";
import { ensureInitialized } from "@/lib/db/init";

const MCP_API_KEY_HEADER = "x-api-key";
const MCP_JSON_RPC_VERSION = "2.0";
const MCP_PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "thoughts-mcp";
const SERVER_VERSION = "0.1.0";

type JsonObject = Record<string, unknown>;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: JsonObject;
};

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonObject;
};

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "get_daily_summary",
    description:
      "Fetch thoughts, tasks, daily check-ins, and mood summary for a single date.",
    inputSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Date in YYYY-MM-DD format.",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
      },
      required: ["date"],
      additionalProperties: false,
    },
  },
  {
    name: "get_thoughts",
    description: "Fetch thoughts filtered by date, tag, or mood.",
    inputSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Optional date in YYYY-MM-DD format.",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
        tag: {
          type: "string",
          description: "Optional tag match. Case-insensitive.",
        },
        mood: {
          type: "integer",
          description: "Optional exact mood filter from 1 to 10.",
          minimum: 1,
          maximum: 10,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "create_thought",
    description: "Insert a new thought into the database for the configured MCP user.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        category: { type: "string" },
        mood: { type: "integer", minimum: 1, maximum: 10 },
        tags: { type: "array", items: { type: "string" } },
        conceptTags: { type: "array", items: { type: "string" } },
        summary: { type: "string" },
        body: { type: "string" },
        linkedBookIdeaId: { type: ["integer", "null"] },
        insightReflection: { type: "string" },
      },
      required: ["title", "category", "mood", "summary", "body"],
      additionalProperties: false,
    },
  },
  {
    name: "get_tasks",
    description: "Fetch tasks and their status, optionally filtered by date or status.",
    inputSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Optional scheduled date in YYYY-MM-DD format.",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
        status: {
          type: "string",
          enum: ["todo", "in_progress", "done", "skipped"],
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "create_task",
    description: "Insert a new task into the database for the configured MCP user.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        tags: { type: "array", items: { type: "string" } },
        note: { type: "string" },
        scheduledDate: {
          type: "string",
          description: "Scheduled date in YYYY-MM-DD format.",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
      },
      required: ["title", "scheduledDate"],
      additionalProperties: false,
    },
  },
];

function jsonRpcResult(id: JsonRpcRequest["id"], result: JsonObject) {
  return NextResponse.json({
    jsonrpc: MCP_JSON_RPC_VERSION,
    id: id ?? null,
    result,
  });
}

function jsonRpcError(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  status: number,
  data?: JsonObject,
) {
  return NextResponse.json(
    {
      jsonrpc: MCP_JSON_RPC_VERSION,
      id: id ?? null,
      error: {
        code,
        message,
        ...(data ? { data } : {}),
      },
    },
    { status },
  );
}

function normalizeDate(value: unknown) {
  const date = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeMood(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10) {
    return null;
  }

  return value;
}

function normalizeStatus(value: unknown) {
  return value === "todo" ||
    value === "in_progress" ||
    value === "done" ||
    value === "skipped"
    ? value
    : null;
}

function normalizePriority(value: unknown) {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function formatToolResult(data: JsonObject) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: data,
  };
}

function averageMood(thoughts: Thought[], checkIns: Array<{ mood: number }>, dayMood: number | null) {
  const values = [
    ...thoughts.map((thought) => thought.mood),
    ...checkIns.map((checkIn) => checkIn.mood),
    ...(dayMood === null ? [] : [dayMood]),
  ];

  if (values.length === 0) {
    return null;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

async function requireMcpUser() {
  const userIdValue = process.env.MCP_USER_ID;

  if (!userIdValue) {
    throw new Error("MCP_USER_ID is not configured.");
  }

  const userId = Number(userIdValue);

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("MCP_USER_ID must be a positive integer.");
  }

  const user = await getUserById(userId);

  if (!user) {
    throw new Error("Configured MCP user was not found.");
  }

  return user;
}

async function listThoughtsForUser(userId: number, filters: { date?: string | null; tag?: string; mood?: number | null }) {
  await ensureInitialized();

  const clauses = ["t.user_id = $1"];
  const values: unknown[] = [userId];

  if (filters.date) {
    values.push(filters.date);
    clauses.push(`(t.created_at AT TIME ZONE 'Asia/Colombo')::date = $${values.length}::date`);
  }

  if (filters.tag) {
    values.push(filters.tag.toLowerCase());
    clauses.push(`EXISTS (
      SELECT 1
      FROM unnest(t.tags) AS tag
      WHERE lower(tag) = $${values.length}
    )`);
  }

  if (filters.mood !== null && filters.mood !== undefined) {
    values.push(filters.mood);
    clauses.push(`t.mood = $${values.length}`);
  }

  const { rows } = await pool.query<Thought>(
    `
      SELECT t.id, t.title, t.category, t.excerpt AS summary, t.body, t.user_id, t.created_at,
             t.updated_at, t.mood, t.tags,
             COALESCE(
               ARRAY_AGG(DISTINCT ct.name) FILTER (WHERE ct.name IS NOT NULL),
               ARRAY[]::TEXT[]
             ) AS concept_tags,
             il.book_idea_id AS linked_book_idea_id,
             b.title AS linked_book_title,
             bi.idea_text AS linked_idea_text,
             il.reflection AS insight_reflection
      FROM thoughts t
      LEFT JOIN thought_concept_tags tct ON tct.thought_id = t.id
      LEFT JOIN concept_tags ct ON ct.id = tct.concept_tag_id
      LEFT JOIN insight_logs il ON il.thought_id = t.id
      LEFT JOIN book_ideas bi ON bi.id = il.book_idea_id
      LEFT JOIN books b ON b.id = bi.book_id
      WHERE ${clauses.join(" AND ")}
      GROUP BY t.id, il.book_idea_id, b.title, bi.idea_text, il.reflection
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 100
    `,
    values,
  );

  return rows;
}

async function listTasksForUser(userId: number, filters: { date?: string | null; status?: string | null }) {
  await ensureInitialized();

  const clauses = ["user_id = $1"];
  const values: unknown[] = [userId];

  if (filters.date) {
    values.push(filters.date);
    clauses.push(`scheduled_date = $${values.length}::date`);
  }

  if (filters.status) {
    values.push(filters.status);
    clauses.push(`status = $${values.length}`);
  }

  const { rows } = await pool.query<TaskItem>(
    `
      SELECT id, title, status, priority, tags, note,
             TO_CHAR(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
             recurring_task_id,
             user_id, created_at, updated_at, started_at, completed_at
      FROM daily_tasks
      WHERE ${clauses.join(" AND ")}
      ORDER BY scheduled_date DESC,
        CASE priority
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        created_at ASC,
        id ASC
      LIMIT 100
    `,
    values,
  );

  return rows;
}

async function handleToolCall(name: string, args: JsonObject, userId: number) {
  if (name === "get_daily_summary") {
    const date = normalizeDate(args.date);

    if (!date) {
      throw new Error("get_daily_summary requires a valid date in YYYY-MM-DD format.");
    }

    const [thoughts, tasks, dayRecord, checkIns] = await Promise.all([
      getThoughtsByUserAndDate(userId, date),
      getTasksByUserAndDate(userId, date),
      getDayRecordByUserAndDate(userId, date),
      getDailyCheckInsByUserAndDate(userId, date),
    ]);

    const taskCounts = tasks.reduce(
      (acc, task) => {
        acc[task.status] += 1;
        return acc;
      },
      { todo: 0, in_progress: 0, done: 0, skipped: 0 },
    );

    return formatToolResult({
      date,
      summary: {
        thoughtCount: thoughts.length,
        taskCount: tasks.length,
        checkInCount: checkIns.length,
        averageMood: averageMood(thoughts, checkIns, dayRecord?.end_of_day_mood ?? null),
        taskCounts,
      },
      dayRecord,
      thoughts,
      tasks,
      checkIns,
    });
  }

  if (name === "get_thoughts") {
    const date = args.date === undefined ? null : normalizeDate(args.date);
    const tag = normalizeOptionalString(args.tag);
    const mood = args.mood === undefined ? null : normalizeMood(args.mood);

    if (args.date !== undefined && !date) {
      throw new Error("get_thoughts date must be in YYYY-MM-DD format.");
    }

    if (args.mood !== undefined && mood === null) {
      throw new Error("get_thoughts mood must be an integer from 1 to 10.");
    }

    const thoughts = await listThoughtsForUser(userId, { date, tag, mood });

    return formatToolResult({
      filters: {
        date,
        tag: tag || null,
        mood,
      },
      count: thoughts.length,
      thoughts,
    });
  }

  if (name === "create_thought") {
    const title = normalizeOptionalString(args.title);
    const category = normalizeOptionalString(args.category);
    const summary = normalizeOptionalString(args.summary);
    const body = normalizeOptionalString(args.body);
    const insightReflection = normalizeOptionalString(args.insightReflection);
    const mood = normalizeMood(args.mood);
    const linkedBookIdeaId =
      args.linkedBookIdeaId === null
        ? null
        : typeof args.linkedBookIdeaId === "number" &&
            Number.isInteger(args.linkedBookIdeaId) &&
            args.linkedBookIdeaId > 0
          ? args.linkedBookIdeaId
          : null;

    if (!title || !category || !summary || !body || mood === null) {
      throw new Error("create_thought requires title, category, mood, summary, and body.");
    }

    const input: NewThought = {
      title,
      category,
      mood,
      tags: normalizeStringArray(args.tags),
      conceptTags: normalizeStringArray(args.conceptTags),
      summary,
      body,
      linkedBookIdeaId,
      insightReflection,
      userId,
    };

    await createThought(input);

    return formatToolResult({
      created: true,
      thought: {
        title: input.title,
        category: input.category,
        mood: input.mood,
        tags: input.tags,
        conceptTags: input.conceptTags,
      },
    });
  }

  if (name === "get_tasks") {
    const date = args.date === undefined ? null : normalizeDate(args.date);
    const status = args.status === undefined ? null : normalizeStatus(args.status);

    if (args.date !== undefined && !date) {
      throw new Error("get_tasks date must be in YYYY-MM-DD format.");
    }

    if (args.status !== undefined && !status) {
      throw new Error("get_tasks status must be one of todo, in_progress, done, or skipped.");
    }

    const tasks = await listTasksForUser(userId, { date, status });

    return formatToolResult({
      filters: { date, status },
      count: tasks.length,
      tasks,
    });
  }

  if (name === "create_task") {
    const title = normalizeOptionalString(args.title);
    const scheduledDate = normalizeDate(args.scheduledDate);

    if (!title || !scheduledDate) {
      throw new Error("create_task requires title and scheduledDate in YYYY-MM-DD format.");
    }

    const input: NewTask = {
      title,
      priority: normalizePriority(args.priority),
      tags: normalizeStringArray(args.tags),
      note: normalizeOptionalString(args.note),
      scheduledDate,
      userId,
    };

    await createTask(input);

    return formatToolResult({
      created: true,
      task: input,
    });
  }

  throw new Error(`Unknown tool: ${name}`);
}

function isAuthorized(request: Request) {
  const expectedApiKey = process.env.MCP_API_KEY;

  if (!expectedApiKey) {
    return { ok: false, reason: "MCP_API_KEY is not configured." };
  }

  const providedApiKey = request.headers.get(MCP_API_KEY_HEADER);

  if (!providedApiKey || providedApiKey !== expectedApiKey) {
    return { ok: false, reason: `Missing or invalid ${MCP_API_KEY_HEADER} header.` };
  }

  return { ok: true as const };
}

export async function POST(request: Request) {
  const auth = isAuthorized(request);

  if (!auth.ok) {
    return jsonRpcError(null, -32001, auth.reason, 401);
  }

  let body: JsonRpcRequest;

  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, "Invalid JSON body.", 400);
  }

  if (body.jsonrpc !== MCP_JSON_RPC_VERSION || !body.method) {
    return jsonRpcError(body.id, -32600, "Invalid JSON-RPC request.", 400);
  }

  try {
    if (body.method === "initialize") {
      return jsonRpcResult(body.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION,
        },
      });
    }

    if (body.method === "notifications/initialized") {
      return new NextResponse(null, { status: 204 });
    }

    if (body.method === "tools/list") {
      return jsonRpcResult(body.id, {
        tools: TOOL_DEFINITIONS,
      });
    }

    if (body.method === "tools/call") {
      const name = typeof body.params?.name === "string" ? body.params.name : "";
      const args =
        body.params?.arguments && typeof body.params.arguments === "object"
          ? (body.params.arguments as JsonObject)
          : {};

      if (!name) {
        return jsonRpcError(body.id, -32602, "Tool name is required.", 400);
      }

      const user = await requireMcpUser();
      const result = await handleToolCall(name, args, user.id);

      return jsonRpcResult(body.id, result);
    }

    return jsonRpcError(body.id, -32601, `Method not found: ${body.method}`, 404);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected MCP server error.";

    return jsonRpcError(body.id, -32000, message, 500);
  }
}

export async function GET(request: Request) {
  const auth = isAuthorized(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  return NextResponse.json({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    protocolVersion: MCP_PROTOCOL_VERSION,
    endpoint: new URL("/api/mcp", request.url).toString(),
    auth: {
      header: MCP_API_KEY_HEADER,
    },
    tools: TOOL_DEFINITIONS,
    env: ["MCP_API_KEY", "MCP_USER_ID", "DATABASE_URL"],
  });
}
