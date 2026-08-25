import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  createWorryEvidence,
  updateWorryEvidence,
  deleteWorryEvidence,
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
  const side = payload.side;
  const content =
    typeof payload.content === "string" ? payload.content.trim() : "";

  if (!Number.isInteger(moduleId) || moduleId <= 0) {
    return NextResponse.json(
      { error: "A valid moduleId is required." },
      { status: 400 },
    );
  }

  if (side !== "for" && side !== "against") {
    return NextResponse.json(
      { error: "Side must be 'for' or 'against'." },
      { status: 400 },
    );
  }

  if (!content) {
    return NextResponse.json(
      { error: "Evidence content is required." },
      { status: 400 },
    );
  }

  try {
    // Verify module ownership
    const ownerCheck = await getWorryModuleById(moduleId, currentUser.id);

    if (!ownerCheck) {
      return NextResponse.json({ error: "Module not found." }, { status: 404 });
    }

    const evidence = await createWorryEvidence({ moduleId, side, content });

    return NextResponse.json({ evidence }, { status: 201 });
  } catch (error) {
    console.error("Failed to create worry evidence.", error);
    return NextResponse.json(
      { error: "Unable to add evidence right now." },
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

  const id = Number(payload.id);
  const moduleId = Number(payload.moduleId);
  const content =
    typeof payload.content === "string" ? payload.content.trim() : "";

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: "A valid evidence id is required." },
      { status: 400 },
    );
  }

  if (!Number.isInteger(moduleId) || moduleId <= 0) {
    return NextResponse.json(
      { error: "A valid moduleId is required." },
      { status: 400 },
    );
  }

  if (!content) {
    return NextResponse.json(
      { error: "Evidence content is required." },
      { status: 400 },
    );
  }

  try {
    // Verify module ownership
    const ownerCheck = await getWorryModuleById(moduleId, currentUser.id);

    if (!ownerCheck) {
      return NextResponse.json({ error: "Module not found." }, { status: 404 });
    }

    const evidence = await updateWorryEvidence({ id, moduleId, content });

    if (!evidence) {
      return NextResponse.json(
        { error: "Evidence not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ evidence });
  } catch (error) {
    console.error("Failed to update worry evidence.", error);
    return NextResponse.json(
      { error: "Unable to update evidence right now." },
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
  const id = Number(searchParams.get("id"));
  const moduleId = Number(searchParams.get("moduleId"));

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: "A valid evidence id is required." },
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

    const deleted = await deleteWorryEvidence(id, moduleId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Evidence not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Failed to delete worry evidence.", error);
    return NextResponse.json(
      { error: "Unable to delete evidence right now." },
      { status: 500 },
    );
  }
}
