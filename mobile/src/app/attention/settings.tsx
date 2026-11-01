import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Button, Card, CardTitle, ErrorText, Eyebrow, LoadingState, Muted, TimeStepper } from "@/components/ui";
import {
  DEFAULT_ATTENTION_SETTINGS,
  MEDITATION_STEP_COPY,
  type AttentionIdea,
  type AttentionReminder,
  type AttentionSettings,
} from "@/lib/attention";
import { useAuth } from "@/lib/auth";
import { colors, radius } from "@/lib/theme";
import { errorMessage, useApi } from "@/lib/use-api";

const STEP_KEYS = ["attention_observe_seconds", "attention_belly_seconds", "attention_body_seconds"] as const;
const STEP_SECONDS = 15;

function formatSeconds(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function AttentionSettingsScreen() {
  const { request } = useAuth();
  const settings = useApi<{ settings: AttentionSettings & { reminders_morning_time: string } }>("/v1/settings");
  const reminder = useApi<{ reminder: AttentionReminder }>("/v1/attention/reminder");
  const ideas = useApi<{ ideas: AttentionIdea[] }>("/v1/attention/ideas");
  const [steps, setSteps] = useState<AttentionSettings>(DEFAULT_ATTENTION_SETTINGS);
  const [time, setTime] = useState<string | null>(null);
  const [newIdea, setNewIdea] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    const loaded = settings.data.settings;
    setSteps({
      attention_observe_seconds: loaded.attention_observe_seconds,
      attention_belly_seconds: loaded.attention_belly_seconds,
      attention_body_seconds: loaded.attention_body_seconds,
    });
  }, [settings.data]);

  useEffect(() => {
    if (reminder.data) setTime(reminder.data.reminder?.time ?? null);
  }, [reminder.data]);

  if (!settings.data || !reminder.data || !ideas.data) {
    return (
      <LoadingState
        error={settings.error ?? reminder.error ?? ideas.error}
        onRetry={() => (settings.reload(), reminder.reload(), ideas.reload())}
      />
    );
  }

  async function run(key: string, action: () => Promise<void>, done: string) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(done);
    } catch (caught) {
      setError(errorMessage(caught, "That couldn't be saved. Try again."));
    } finally {
      setBusy(null);
    }
  }

  const saveReminder = () =>
    run(
      "reminder",
      async () => {
        await request("/v1/attention/reminder", { method: "PUT", body: { time } });
        await reminder.reload();
      },
      time ? "Reminder saved. It's the daily “Attention training” routine." : "Reminder turned off. The daily task stays.",
    );

  const saveSteps = () =>
    run(
      "steps",
      async () => {
        await request("/v1/settings", { method: "PATCH", body: steps });
      },
      "Meditation steps saved.",
    );

  const addIdea = () => {
    if (!newIdea.trim()) return;
    return run(
      "idea",
      async () => {
        const result = await request<{ ideas: AttentionIdea[] }>("/v1/attention/ideas", { method: "POST", body: { name: newIdea } });
        ideas.setData(result);
        setNewIdea("");
      },
      "Added.",
    );
  };

  function removeIdea(idea: AttentionIdea) {
    Alert.alert("Remove from your list?", `${idea.name}\n\nPast sessions keep their name.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          run(
            `idea-${idea.id}`,
            async () => {
              await request(`/v1/attention/ideas/${idea.id}`, { method: "DELETE" });
              ideas.setData({ ideas: (ideas.data?.ideas ?? []).filter((item) => item.id !== idea.id) });
            },
            "Removed.",
          ),
      },
    ]);
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <CardTitle eyebrow="Reminder" title="Daily nudge" />
          <Muted>
            A good time is right after waking, alongside your morning breathing. This adds a daily “Attention training” task that a
            session ticks off.
          </Muted>
          <TimeStepper
            value={time}
            onChange={setTime}
            allowNone
            noneLabel="No reminder"
            fallback={settings.data.settings.reminders_morning_time || "07:00"}
          />
          <Button title="Save reminder" onPress={saveReminder} busy={busy === "reminder"} />
        </Card>

        <Card>
          <CardTitle eyebrow="Meditation" title="Step lengths" />
          {MEDITATION_STEP_COPY.map((step, index) => {
            const key = STEP_KEYS[index];
            const set = (delta: number) =>
              setSteps((current) => ({ ...current, [key]: Math.min(600, Math.max(15, current[key] + delta)) }));

            return (
              <View key={step.key} style={styles.stepRow}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <View style={styles.stepper}>
                  <Pressable onPress={() => set(-STEP_SECONDS)} hitSlop={10} accessibilityLabel={`Shorter ${step.title}`}>
                    <Ionicons name="remove-circle-outline" size={26} color={colors.action} />
                  </Pressable>
                  <Text style={styles.stepValue}>{formatSeconds(steps[key])}</Text>
                  <Pressable onPress={() => set(STEP_SECONDS)} hitSlop={10} accessibilityLabel={`Longer ${step.title}`}>
                    <Ionicons name="add-circle-outline" size={26} color={colors.action} />
                  </Pressable>
                </View>
              </View>
            );
          })}
          <Muted>The worksheet suggests building up to ten minutes, twice a day. Start where it feels manageable.</Muted>
          <Button title="Save steps" onPress={saveSteps} busy={busy === "steps"} />
        </Card>

        <Card>
          <CardTitle eyebrow="Everyday tasks" title="Your practice list" />
          <Muted>Routine tasks you can do with full attention: walking, eating, brushing teeth, washing dishes…</Muted>
          {ideas.data.ideas.length === 0 ? <Muted>No saved tasks yet. They're also added when you log a session.</Muted> : null}
          {ideas.data.ideas.map((idea) => (
            <View key={idea.id} style={styles.ideaRow}>
              <Text style={styles.ideaName}>{idea.name}</Text>
              <Pressable onPress={() => removeIdea(idea)} hitSlop={10} accessibilityLabel={`Remove ${idea.name}`}>
                <Ionicons name="close-circle-outline" size={22} color={colors.inkSoft} />
              </Pressable>
            </View>
          ))}
          <Eyebrow>Add a task</Eyebrow>
          <View style={styles.addRow}>
            <TextInput
              value={newIdea}
              onChangeText={setNewIdea}
              placeholder="e.g. Making tea"
              placeholderTextColor={colors.inkFaint}
              maxLength={120}
              style={styles.input}
              onSubmitEditing={addIdea}
              returnKeyType="done"
            />
            <Button title="Add" onPress={addIdea} busy={busy === "idea"} disabled={!newIdea.trim()} />
          </View>
        </Card>

        <ErrorText message={error} />
        {message ? <Muted>{message}</Muted> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  stepTitle: { flex: 1, fontSize: 15, color: colors.ink },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepValue: { minWidth: 44, textAlign: "center", fontSize: 16, color: colors.ink },
  ideaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ideaName: { fontSize: 15, color: colors.ink },
  addRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  input: {
    flex: 1,
    backgroundColor: colors.field,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
  },
});
