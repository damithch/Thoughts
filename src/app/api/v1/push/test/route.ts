import { withMobileUser } from "@/lib/mobile-api";
import { isPushConfigured, sendPushToUser } from "@/lib/push";

export const dynamic = "force-dynamic";

// POST /api/v1/push/test -> { configured, devices, sent, failed }
// Sends a test alert to the user's registered phones, to check the whole push setup.
export const POST = withMobileUser(async (_request, user) => {
  if (!isPushConfigured()) {
    return Response.json({ configured: false, devices: 0, sent: 0, failed: 0 });
  }

  return Response.json(
    await sendPushToUser(user.id, {
      title: "Thoughts",
      message: "Push alerts from your server are working.",
      url: "/reminders",
      channelId: "reminders",
    }),
  );
});
