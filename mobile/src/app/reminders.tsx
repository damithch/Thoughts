import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  Button,
  Card,
  CardTitle,
  ErrorText,
  formatClock,
  LoadingState,
  Muted,
  SwitchRow,
  TimeStepper,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import {
  getPermissionState,
  loadReminderPlan,
  registerForPush,
  requestPermission,
  sendTestNotification,
  syncReminders,
  type PermissionState,
} from "@/lib/notifications";
import type { PlannedReminder } from "@/lib/reminder-plan";
import { isQuietTime } from "@/lib/reminder-plan";
import { colors } from "@/lib/theme";
import type { Routine, Settings, SettingsResponse, WorryModule } from "@/lib/types";
import { errorMessage, useApi } from "@/lib/use-api";

type ReminderKeys =
  | "reminders_evening_enabled"
  | "reminders_evening_time"
  | "reminders_thinking_enabled"
  | "reminders_morning_enabled"
  | "reminders_morning_time"
  | "reminders_habits_enabled"
  | "reminders_quiet_enabled"
  | "reminders_quiet_start"
  | "reminders_quiet_end"
  | "push_support_alerts";

const KEYS: ReminderKeys[] = [
  "reminders_evening_enabled",
  "reminders_evening_time",
  "reminders_thinking_enabled",
  "reminders_morning_enabled",
  "reminders_morning_time",
  "reminders_habits_enabled",
  "reminders_quiet_enabled",
  "reminders_quiet_start",
  "reminders_quiet_end",
  "push_support_alerts",
];

function whenLabel(at: Date) {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const day = sameDay(at, today) ? "Today" : sameDay(at, tomorrow) ? "Tomorrow" : at.toLocaleDateString("en-GB", { weekday: "short" });

  return `${day} ${formatClock(`${at.getHours()}:${String(at.getMinutes()).padStart(2, "0")}`)}`;
}

// Choose which reminders the phone gives, and when. Settings are saved to your account; the phone
// schedules them.
export default function RemindersScreen() {
  const { request } = useAuth();
  const { data, error, reload } = useApi<SettingsResponse>("/v1/settings");
  const routines = useApi<{ routines: Routine[] }>("/v1/routines");
  const worry = useApi<{ module: WorryModule | null }>("/worry-postponement/module");
  const [draft, setDraft] = useState<Pick<Settings, ReminderKeys> | null>(null);
  const [permission, setPermission] = useState<PermissionState>("undetermined");
  const [upcoming, setUpcoming] = useState<PlannedReminder[] | null>(null);
  const [push, setPush] = useState<{ registered: boolean; configured: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (data && !draft) {
      setDraft(Object.fromEntries(KEYS.map((key) => [key, data.settings[key]])) as Pick<Settings, ReminderKeys>);
    }
  }, [data, draft]);

  async function refreshStatus() {
    const state = await getPermissionState();
    setPermission(state);

    if (state === "granted") {
      setUpcoming((await loadReminderPlan(request).catch(() => [])).slice(0, 6));
      setPush(await registerForPush(request));
    }
  }

  useEffect(() => {
    refreshStatus();
    // Once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data || !draft) return <LoadingState error={error} onRetry={reload} />;

  const update = <K extends ReminderKeys>(key: K, value: Settings[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  async function turnOn() {
    const state = await requestPermission();
    setPermission(state);

    if (state === "granted") {
      await syncReminders(request);
      await refreshStatus();
    } else if (state === "denied") {
      Alert.alert("Notifications are off", "Turn them on for Thoughts in your phone's settings.", [
        { text: "Not now", style: "cancel" },
        { text: "Open settings", onPress: () => Linking.openSettings() },
      ]);
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);

    try {
      await request("/v1/settings", { method: "PATCH", body: draft });
      await syncReminders(request);
      await refreshStatus();
      Alert.alert("Reminders saved");
    } catch (caught) {
      setSaveError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function testPush() {
    try {
      const result = await request<{ configured: boolean; devices: number; sent: number }>("/v1/push/test", { method: "POST" });

      Alert.alert(
        "Server push",
        !result.configured
          ? "Push isn't set up on the server yet (FIREBASE_SERVICE_ACCOUNT)."
          : result.devices === 0
            ? "This phone isn't registered for push yet. This build may not include Firebase."
            : result.sent > 0
              ? "Sent. It should arrive in a few seconds."
              : "The server couldn't reach this phone.",
      );
    } catch (caught) {
      Alert.alert("Server push", errorMessage(caught));
    }
  }

  const quiet = (time: string) => {
    const [hour, minute] = time.split(":").map(Number);
    return isQuietTime(new Date(2026, 0, 1, hour, minute), draft);
  };
  const quietHint = "This is inside your quiet hours, so it won't notify.";
  const module = worry.data?.module;
  const withTimes = (routines.data?.routines ?? []).filter((routine) => routine.remind_at && routine.is_active);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {permission !== "granted" ? (
        <Card style={{ backgroundColor: "#FFF7EC" }}>
          <CardTitle eyebrow="Notifications" title={permission === "unsupported" ? "Not available here" : "Turn on reminders"} />
          <Muted>
            {permission === "unsupported"
              ? "Reminders work in the phone app."
              : "Gentle reminders, never anything personal on your lock screen. You choose which ones below."}
          </Muted>
          {permission !== "unsupported" ? <Button title="Turn on notifications" onPress={turnOn} /> : null}
        </Card>
      ) : null}

      <Card>
        <CardTitle eyebrow="Every evening" title="Close the day" />
        <SwitchRow label="Evening reminder" value={draft.reminders_evening_enabled} onChange={(value) => update("reminders_evening_enabled", value)} />
        {draft.reminders_evening_enabled ? (
          <TimeStepper
            value={draft.reminders_evening_time}
            onChange={(value) => value && update("reminders_evening_time", value)}
            hint={quiet(draft.reminders_evening_time) ? quietHint : "Skipped on days you've already closed."}
          />
        ) : null}
      </Card>

      <Card>
        <CardTitle eyebrow="Worry postponement" title="Thinking time" />
        <SwitchRow label="Remind me at thinking time" value={draft.reminders_thinking_enabled} onChange={(value) => update("reminders_thinking_enabled", value)} />
        <Muted>
          {module?.status === "active" && module.thinking_time_start
            ? `Daily at ${formatClock(module.thinking_time_start)} for ${module.thinking_time_duration} minutes${module.thinking_time_place ? ` · ${module.thinking_time_place}` : ""}.`
            : "Set a thinking time in your worry experiment to get this reminder."}
        </Muted>
        <Pressable onPress={() => router.push("/worry")} hitSlop={6}>
          <Text style={styles.link}>Open worry postponement</Text>
        </Pressable>
      </Card>

      <Card>
        <CardTitle eyebrow="After a rough night" title="A morning check" />
        <SwitchRow
          label="Check on me the next morning"
          hint="Only after the support card has appeared. Opens your support plan."
          value={draft.reminders_morning_enabled}
          onChange={(value) => update("reminders_morning_enabled", value)}
        />
        {draft.reminders_morning_enabled ? (
          <TimeStepper
            value={draft.reminders_morning_time}
            onChange={(value) => value && update("reminders_morning_time", value)}
            hint={quiet(draft.reminders_morning_time) ? quietHint : undefined}
          />
        ) : null}
      </Card>

      <Card>
        <CardTitle eyebrow="Routines" title="Habit reminders" />
        <SwitchRow label="Remind me about habits" value={draft.reminders_habits_enabled} onChange={(value) => update("reminders_habits_enabled", value)} />
        {withTimes.length === 0 ? (
          <Muted>Give a routine a reminder time in Tasks → Routines.</Muted>
        ) : (
          withTimes.map((routine) => (
            <Pressable
              key={routine.id}
              onPress={() => router.push({ pathname: "/routine/[id]", params: { id: String(routine.id) } })}
              style={styles.row}
            >
              <Text style={styles.rowTitle}>{routine.title}</Text>
              <Text style={styles.rowMeta}>{formatClock(routine.remind_at as string)}</Text>
            </Pressable>
          ))
        )}
      </Card>

      <Card>
        <CardTitle eyebrow="Quiet hours" title="Nothing at night" />
        <SwitchRow label="Quiet hours" value={draft.reminders_quiet_enabled} onChange={(value) => update("reminders_quiet_enabled", value)} />
        {draft.reminders_quiet_enabled ? (
          <View style={{ gap: 12 }}>
            <TimeStepper label="From" value={draft.reminders_quiet_start} onChange={(value) => value && update("reminders_quiet_start", value)} />
            <TimeStepper label="Until" value={draft.reminders_quiet_end} onChange={(value) => value && update("reminders_quiet_end", value)} />
          </View>
        ) : null}
      </Card>

      <Card>
        <CardTitle eyebrow="From the server" title="Support alerts" />
        <SwitchRow
          label="Alert this phone after a very low entry"
          hint="When you write one on the website or through Claude. At most once per rough patch, and since you're awake, even in quiet hours."
          value={draft.push_support_alerts}
          onChange={(value) => update("push_support_alerts", value)}
        />
        <Muted>
          {push === null
            ? "This phone isn't connected for server alerts yet."
            : push.configured
              ? "This phone is connected for server alerts."
              : "This phone is registered; the server still needs its Firebase key."}
        </Muted>
        <Button title="Send a test push" variant="secondary" onPress={testPush} />
      </Card>

      <ErrorText message={saveError} />
      <Button title="Save reminders" onPress={save} busy={saving} />

      {permission === "granted" ? (
        <Card>
          <CardTitle eyebrow="Coming up" title="Next reminders" />
          {upcoming && upcoming.length > 0 ? (
            upcoming.map((reminder) => (
              <View key={reminder.id} style={styles.row}>
                <Ionicons name={reminder.kind === "morning" ? "sunny-outline" : reminder.kind === "thinking" ? "cloud-outline" : "notifications-outline"} size={18} color={colors.accent} />
                <Text style={[styles.rowTitle, { flex: 1 }]}>{reminder.title}</Text>
                <Text style={styles.rowMeta}>{whenLabel(reminder.at)}</Text>
              </View>
            ))
          ) : (
            <Muted>Nothing scheduled in the next few days.</Muted>
          )}
          <Button title="Send a test notification" variant="secondary" onPress={() => sendTestNotification().catch((caught) => Alert.alert("Couldn't send", errorMessage(caught)))} />
          {Platform.OS === "android" ? (
            <Muted>
              If reminders arrive a few minutes late, allow exact timing: Settings → Apps → Thoughts → Alarms &amp; reminders.
            </Muted>
          ) : null}
          {Platform.OS === "android" ? (
            <Pressable onPress={() => Linking.openSettings()} hitSlop={6}>
              <Text style={styles.link}>Open app settings</Text>
            </Pressable>
          ) : null}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  link: { color: colors.accent, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  rowTitle: { fontSize: 15, color: colors.ink },
  rowMeta: { fontSize: 13, color: colors.inkSoft },
});
