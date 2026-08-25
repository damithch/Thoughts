import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  getActiveWorryModule,
  createWorryModule,
  updateWorryModule,
} from "@/lib/db";

function normalizePercentage(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100) return null;
  return n;
}

function normalizeConfidence(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 10) return null;
  return n;
}

function normalizeDuration(value: unknown): number {
  const n = Number(value);
  if ([5, 10, 15, 20, 30].includes(n)) return n;
  return 15;
}

function normalizeStatus(value: unknown) {
  if (value === "active" || value === "completed" || value === "abandoned") {
    return value;
  }
  return null;
}

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const worryModule = await getActiveWorryModule(currentUser.id);
    return NextResponse.json({ module: worryModule });
  } catch (error) {
    console.error("Failed to load worry postponement module.", error);
    return NextResponse.json(
      { error: "Unable to load module right now." },
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

  const beliefText =
    typeof payload.beliefText === "string" ? payload.beliefText.trim() : "";
  const beliefBeforePct = normalizePercentage(payload.beliefBeforePct);

  if (!beliefText) {
    return NextResponse.json(
      { error: "A belief statement is required to start the module." },
      { status: 400 },
    );
  }

  try {
    // Prevent creating a second active module
    const existing = await getActiveWorryModule(currentUser.id);

    if (existing) {
      return NextResponse.json(
        { error: "An active module already exists. Complete or abandon it first." },
        { status: 409 },
      );
    }

    const worryModule = await createWorryModule({
      userId: currentUser.id,
      beliefText,
      beliefBeforePct,
    });

    return NextResponse.json({ module: worryModule }, { status: 201 });
  } catch (error) {
    console.error("Failed to create worry postponement module.", error);
    return NextResponse.json(
      { error: "Unable to create module right now." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
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

  const idValue = Number(payload.id);

  if (!Number.isInteger(idValue) || idValue <= 0) {
    return NextResponse.json(
      { error: "A valid module id is required." },
      { status: 400 },
    );
  }

  try {
    const update: Parameters<typeof updateWorryModule>[0] = {
      id: idValue,
      userId: currentUser.id,
    };

    if (payload.beliefText !== undefined) {
      update.beliefText =
        typeof payload.beliefText === "string" ? payload.beliefText.trim() : "";
    }

    if (payload.beliefBeforePct !== undefined) {
      update.beliefBeforePct = normalizePercentage(payload.beliefBeforePct);
    }

    if (payload.beliefAfterPct !== undefined) {
      update.beliefAfterPct = normalizePercentage(payload.beliefAfterPct);
    }

    if (payload.thinkingTimeStart !== undefined) {
      update.thinkingTimeStart =
        typeof payload.thinkingTimeStart === "string"
          ? payload.thinkingTimeStart.trim()
          : "";
    }

    if (payload.thinkingTimeDuration !== undefined) {
      update.thinkingTimeDuration = normalizeDuration(payload.thinkingTimeDuration);
    }

    if (payload.thinkingTimePlace !== undefined) {
      update.thinkingTimePlace =
        typeof payload.thinkingTimePlace === "string"
          ? payload.thinkingTimePlace.trim()
          : "";
    }

    if (payload.predictionText !== undefined) {
      update.predictionText =
        typeof payload.predictionText === "string"
          ? payload.predictionText.trim()
          : "";
    }

    if (payload.predictionConfidence !== undefined) {
      update.predictionConfidence = normalizeConfidence(payload.predictionConfidence);
    }

    if (payload.reflectionText !== undefined) {
      update.reflectionText =
        typeof payload.reflectionText === "string"
          ? payload.reflectionText.trim()
          : "";
    }

    if (payload.status !== undefined) {
      const status = normalizeStatus(payload.status);
      if (!status) {
        return NextResponse.json(
          { error: "Status must be active, completed, or abandoned." },
          { status: 400 },
        );
      }
      update.status = status;
    }

    const worryModule = await updateWorryModule(update);

    if (!worryModule) {
      return NextResponse.json({ error: "Module not found." }, { status: 404 });
    }

    return NextResponse.json({ module: worryModule });
  } catch (error) {
    console.error("Failed to update worry postponement module.", error);
    return NextResponse.json(
      { error: "Unable to update module right now." },
      { status: 500 },
    );
  }
}
