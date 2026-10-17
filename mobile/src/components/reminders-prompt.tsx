import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button, Eyebrow } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { getPermissionState, registerForPush, requestPermission, syncReminders } from "@/lib/notifications";
import { colors, fonts, radius } from "@/lib/theme";

const DISMISSED_KEY = "reminders.prompt.dismissed";

// Asks for notification permission with context (instead of a bare system prompt), once.
export function RemindersPrompt() {
  const { request } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    (async () => {
      const state = await getPermissionState();
      const dismissed = await SecureStore.getItemAsync(DISMISSED_KEY).catch(() => null);
      setVisible(state === "undetermined" && !dismissed);
    })();
  }, []);

  if (!visible) return null;

  async function dismiss() {
    setVisible(false);
    await SecureStore.setItemAsync(DISMISSED_KEY, "1").catch(() => {});
  }

  async function turnOn() {
    const state = await requestPermission();
    await dismiss();

    if (state === "granted") {
      await syncReminders(request);
      await registerForPush(request);
      router.push("/reminders");
    }
  }

  return (
    <View style={styles.card}>
      <Eyebrow>New</Eyebrow>
      <Text style={styles.title}>Gentle reminders?</Text>
      <Text style={styles.body}>
        An evening nudge to close the day, your worry thinking time, and a check-in after a rough night. Never anything
        personal on your lock screen, and quiet from 11 pm to 7 am.
      </Text>
      <View style={styles.actions}>
        <Button title="Turn on" onPress={turnOn} style={{ flexGrow: 1 }} />
        <Pressable onPress={dismiss} hitSlop={8} style={styles.later}>
          <Text style={styles.laterText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 8,
  },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  body: { fontSize: 14, lineHeight: 21, color: colors.inkSoft },
  actions: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 4 },
  later: { paddingHorizontal: 8, paddingVertical: 8 },
  laterText: { color: colors.inkSoft, fontSize: 14 },
});
