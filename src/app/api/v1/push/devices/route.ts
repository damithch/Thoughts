import { registerPushDevice, removePushDevice } from "@/lib/db";
import { apiError, readJsonObject, readString, withMobileUser } from "@/lib/mobile-api";
import { isPushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

function readToken(body: Record<string, unknown> | null) {
  const token = readString(body?.token, 4096);

  return /^[A-Za-z0-9_:\-.]{20,4096}$/.test(token) ? token : null;
}

// POST /api/v1/push/devices { token, platform } -> { registered, configured }
// Registers this phone's Firebase token so the server can send alerts to it. `configured` says
// whether the server has push set up (FIREBASE_SERVICE_ACCOUNT).
export const POST = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);
  const token = readToken(body);

  if (!token) {
    return apiError("Send this phone's push token.", 400);
  }

  const platform = body?.platform === "ios" ? "ios" : "android";
  await registerPushDevice(user.id, token, platform);

  return Response.json({ registered: true, configured: isPushConfigured() });
});

// DELETE /api/v1/push/devices { token } -> 204 (on sign-out, so a shared phone stops getting alerts)
export const DELETE = withMobileUser(async (request, user) => {
  const token = readToken(await readJsonObject(request));

  if (!token) {
    return apiError("Send this phone's push token.", 400);
  }

  await removePushDevice(user.id, token);

  return new Response(null, { status: 204 });
});
