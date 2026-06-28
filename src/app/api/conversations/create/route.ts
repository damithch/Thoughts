import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createConversationSummary, getUserById } from "@/lib/db";

const MCP_API_KEY_HEADER = "x-api-key";
const MCP_API_KEY_QUERY_PARAM = "api_key";

type ConversationCreatePayload = {
  conversationDate?: unknown;
  title?: unknown;
  keyTopics?: unknown;
  insights?: unknown;
  actionItems?: unknown;
  moodContext?: unknown;
};

function normalizeDate(value: unknown) {
  const date = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
  ).slice(0, 12);
}

function normalizeMood(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10) {
    return null;
  }

  return value;
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

function isAuthorizedMcpRequest(request: Request) {
  const expectedApiKey = process.env.MCP_API_KEY;

  if (!expectedApiKey) {
    return false;
  }

  const requestUrl = new URL(request.url);
  const providedApiKey =
    request.headers.get(MCP_API_KEY_HEADER) ??
    requestUrl.searchParams.get(MCP_API_KEY_QUERY_PARAM);

  return Boolean(providedApiKey && providedApiKey === expectedApiKey);
}

async function resolveRequestUser(request: Request) {
  const currentUser = await getCurrentUser();

  if (currentUser) {
    return currentUser;
  }

  if (isAuthorizedMcpRequest(request)) {
    return requireMcpUser();
  }

  return null;
}

export async function POST(request: Request) {
  const currentUser = await resolveRequestUser(request);

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: ConversationCreatePayload;

  try {
    body = (await request.json()) as ConversationCreatePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const conversationDate = normalizeDate(body.conversationDate);
  const title = normalizeString(body.title);
  const insights = normalizeString(body.insights);
  const keyTopics = normalizeStringArray(body.keyTopics);
  const actionItems = normalizeStringArray(body.actionItems);
  const moodContext = normalizeMood(body.moodContext);

  if (!conversationDate || !title || !insights) {
    return NextResponse.json(
      {
        error: "conversationDate, title, and insights are required.",
      },
      { status: 400 },
    );
  }

  if (body.moodContext !== undefined && body.moodContext !== null && moodContext === null) {
    return NextResponse.json(
      {
        error: "moodContext must be an integer from 1 to 10 when provided.",
      },
      { status: 400 },
    );
  }

  try {
    const created = await createConversationSummary({
      conversationDate,
      title,
      keyTopics,
      insights,
      actionItems,
      moodContext,
      userId: currentUser.id,
    });

    return NextResponse.json(
      {
        created: true,
        conversation: created,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to create conversation summary.", error);

    return NextResponse.json(
      { error: "Unable to save the conversation summary right now." },
      { status: 500 },
    );
  }
}
