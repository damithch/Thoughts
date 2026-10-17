import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

import type { useAuth } from "@/lib/auth";
import { planReminders, type PlannedReminder } from "@/lib/reminder-plan";
import type { Routine, Settings, SupportOverview, TodayResponse, WorryModule } from "@/lib/types";

// Reminders are scheduled on the phone (no server needed). Push alerts from the server arrive
// as data messages that this library shows the same way (same channels, same tap handling).

type Request = ReturnType<typeof useAuth>["request"];

export const SUPPORTED = Platform.OS === "android" || Platform.OS === "ios";

let setupDone: Promise<void> | null = null;

// Notification categories (Android channels). Content is kept off the lock screen.
export function setupNotifications() {
  if (!SUPPORTED) return Promise.resolve();

  setupDone ??= (async () => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS === "android") {
      const privateOnLockScreen = Notifications.AndroidNotificationVisibility.PRIVATE;

      await Notifications.setNotificationChannelAsync("reminders", {
        name: "Reminders",
        description: "Evening close and habit reminders",
        importance: Notifications.AndroidImportance.DEFAULT,
        lockscreenVisibility: privateOnLockScreen,
      });
      await Notifications.setNotificationChannelAsync("thinking", {
        name: "Thinking time",
        description: "Your daily worry thinking time",
        importance: Notifications.AndroidImportance.DEFAULT,
        lockscreenVisibility: privateOnLockScreen,
      });
      await Notifications.setNotificationChannelAsync("care", {
        name: "Support",
        description: "Gentle check-ins on hard days",
        importance: Notifications.AndroidImportance.HIGH,
        lockscreenVisibility: privateOnLockScreen,
      });
    }
  })().catch((error) => {
    setupDone = null;
    throw error;
  });

  return setupDone;
}

export type PermissionState = "granted" | "denied" | "undetermined" | "unsupported";

export async function getPermissionState(): Promise<PermissionState> {
  if (!SUPPORTED) return "unsupported";

  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
  } catch {
    return "unsupported";
  }
}

export async function requestPermission(): Promise<PermissionState> {
  if (!SUPPORTED) return "unsupported";

  // Android 13+ only shows the system prompt once a channel exists.
  await setupNotifications();
  const { status } = await Notifications.requestPermissionsAsync();

  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

// Everything the planner needs, read from the server.
export async function loadReminderPlan(request: Request): Promise<PlannedReminder[]> {
  const [settingsResponse, today, routinesResponse, worryResponse, support] = await Promise.all([
    request<{ settings: Settings }>("/v1/settings"),
    request<TodayResponse>("/v1/today"),
    request<{ routines: Routine[] }>("/v1/routines"),
    request<{ module: WorryModule | null }>("/worry-postponement/module").catch(() => ({ module: null })),
    request<SupportOverview>("/v1/support").catch(() => null),
  ]);

  const worry = worryResponse.module;
  const dayRecord = today.dayRecord;

  return planReminders({
    now: new Date(),
    settings: settingsResponse.settings,
    dayClosed: Boolean(today.anchorNote || dayRecord?.note?.trim() || dayRecord?.end_of_day_mood),
    doneRoutineIdsToday: today.tasks
      .filter((task) => task.recurring_task_id !== null && (task.status === "done" || task.status === "skipped"))
      .map((task) => task.recurring_task_id as number),
    worry: worry
      ? {
          active: worry.status === "active",
          start: worry.thinking_time_start,
          minutes: worry.thinking_time_duration,
          place: worry.thinking_time_place,
        }
      : null,
    routines: routinesResponse.routines,
    roughPatchAt: support?.recent?.triggeredAt ?? null,
  });
}

let syncing: Promise<number> | null = null;
let syncAgain = false;

// Replaces everything scheduled with a fresh plan for the next 7 days. Returns how many were set.
export async function syncReminders(request: Request): Promise<number> {
  if (!SUPPORTED || (await getPermissionState()) !== "granted") return 0;

  if (syncing) {
    syncAgain = true;
    return syncing;
  }

  syncing = (async () => {
    try {
      await setupNotifications();
      const plan = await loadReminderPlan(request);

      await Notifications.cancelAllScheduledNotificationsAsync();
      for (const reminder of plan) {
        await Notifications.scheduleNotificationAsync({
          identifier: reminder.id,
          content: { title: reminder.title, body: reminder.body, data: { url: reminder.url } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: reminder.at,
            channelId: reminder.channelId,
          },
        });
      }

      return plan.length;
    } finally {
      syncing = null;
    }
  })();

  const count = await syncing;

  if (syncAgain) {
    syncAgain = false;
    return syncReminders(request);
  }

  return count;
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

// Coalesces bursts of changes (e.g. ticking several tasks) into one re-plan.
export function scheduleReminderSync(request: Request, delayMs = 1500) {
  if (!SUPPORTED) return;
  if (syncTimer) clearTimeout(syncTimer);

  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncReminders(request).catch((error) => console.warn("Reminder sync failed.", error));
  }, delayMs);
}

export async function cancelAllReminders() {
  if (!SUPPORTED) return;
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

export async function sendTestNotification() {
  await setupNotifications();
  await Notifications.scheduleNotificationAsync({
    content: { title: "Thoughts", body: "Reminders are working.", data: { url: "/reminders" } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3, channelId: "reminders" },
  });
}

// Push: register this phone's Firebase token with the server. Returns null if this build has no
// Firebase setup (google-services.json) or permission isn't granted.
export async function registerForPush(request: Request) {
  if (Platform.OS !== "android" || (await getPermissionState()) !== "granted") return null;

  try {
    const token = await Notifications.getDevicePushTokenAsync();
    return await request<{ registered: boolean; configured: boolean }>("/v1/push/devices", {
      method: "POST",
      body: { token: String(token.data), platform: "android" },
    });
  } catch {
    return null;
  }
}

export async function unregisterPush(request: Request) {
  if (Platform.OS !== "android") return;

  try {
    const token = await Notifications.getDevicePushTokenAsync();
    await request("/v1/push/devices", { method: "DELETE", body: { token: String(token.data) } });
  } catch {
    // Nothing registered (or no Firebase in this build).
  }
}

// Opens the screen a notification points to, including when it launched the app.
export function useNotificationRouting(enabled: boolean) {
  useEffect(() => {
    if (!SUPPORTED || !enabled) return;

    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;

      if (typeof url === "string" && url.startsWith("/")) {
        router.push(url as never);
      }
    };

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        open(response);
        return Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => {});

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      open(response);
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    });

    return () => subscription.remove();
  }, [enabled]);
}
