import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { onServerChange, useAuth } from "@/lib/auth";
import {
  registerForPush,
  scheduleReminderSync,
  setupNotifications,
  SUPPORTED,
  useNotificationRouting,
} from "@/lib/notifications";

// While signed in: keeps the next week of reminders up to date (on launch, when the app comes
// back to the foreground, and after any change saved to the server), registers for push, and
// opens the right screen when a notification is tapped.
export function ReminderSync() {
  const { request, user } = useAuth();
  const signedIn = user !== null;
  const requestRef = useRef(request);
  requestRef.current = request;

  useNotificationRouting(signedIn);

  useEffect(() => {
    if (!SUPPORTED || !signedIn) return;

    setupNotifications().catch(() => {});
    scheduleReminderSync(requestRef.current, 0);
    registerForPush(requestRef.current).catch(() => {});

    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") scheduleReminderSync(requestRef.current, 0);
    });
    const unsubscribe = onServerChange((path) => {
      if (!path.startsWith("/v1/push")) scheduleReminderSync(requestRef.current);
    });

    return () => {
      appState.remove();
      unsubscribe();
    };
  }, [signedIn]);

  return null;
}
