import { revalidatePath } from "next/cache";

import { DEFAULT_USER_SETTINGS, getUserSettings, upsertUserSettings } from "@/lib/db/settings";
import { LLM_MODELS } from "@/lib/llm-models";
import { apiError, readJsonObject, withMobileUser } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// GET /api/v1/settings -> { settings, models }
export const GET = withMobileUser(async (_request, user) => {
  return Response.json({ settings: await getUserSettings(user.id), models: LLM_MODELS });
});

// PATCH /api/v1/settings { ...any settings fields } -> { settings, models }
// Unknown keys and wrong types are ignored; out-of-range numbers are clamped when read back.
export const PATCH = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);

  if (!body) {
    return apiError("Send the settings as a JSON object.", 400);
  }

  const patch: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    const defaultValue = DEFAULT_USER_SETTINGS[key as keyof typeof DEFAULT_USER_SETTINGS];

    if (defaultValue === undefined) continue;

    if (Array.isArray(defaultValue)) {
      if (Array.isArray(value) && value.every((item) => typeof item === "string")) patch[key] = value;
    } else if (typeof value === typeof defaultValue && (typeof value !== "number" || Number.isFinite(value))) {
      patch[key] = value;
    }
  }

  if (typeof patch.llm_model === "string" && !LLM_MODELS.some((model) => model.value === patch.llm_model)) {
    return apiError("That AI model isn't available.", 400);
  }

  await upsertUserSettings(user.id, patch);
  revalidatePath("/dashboard/settings");

  return Response.json({ settings: await getUserSettings(user.id), models: LLM_MODELS });
});
