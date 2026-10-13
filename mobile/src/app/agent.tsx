import Ionicons from "@expo/vector-icons/Ionicons";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Body, Button, Card, CardTitle, ErrorText, Field, Muted } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";
import type { AgentResponse } from "@/lib/types";
import { errorMessage } from "@/lib/use-api";

const QUICK_ACTIONS: { action: string; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { action: "auto_plan", label: "Plan my day", icon: "calendar-outline" },
  { action: "roll_forward", label: "Bring overdue to today", icon: "arrow-redo-outline" },
  { action: "apply_routines", label: "Add today's routines", icon: "repeat-outline" },
  { action: "complete_high_priority", label: "Finish high-priority", icon: "checkmark-done-outline" },
  { action: "task_audit", label: "Audit today", icon: "list-outline" },
];

const LOG_ICON = { success: "checkmark-circle", warning: "alert-circle", info: "information-circle" } as const;

export default function AgentScreen() {
  const { request } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentResponse | null>(null);
  const [undone, setUndone] = useState(false);

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setUndone(false);

    try {
      setResult(await request<AgentResponse>("/agent/tasks", { method: "POST", body: { ...body, requestId: randomUUID() } }));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!result?.undo) return;
    setBusy(true);

    try {
      await request("/v1/agent/undo", { method: "POST", body: { undo: result.undo } });
      setUndone(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const canUndo =
    !undone &&
    result?.undo &&
    result.undo.createdTaskIds.length + result.undo.changedTasks.length + result.undo.deletedTasks.length > 0;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <CardTitle eyebrow="Task assistant" title="What should change?" />
          <Field
            label="Ask in your own words"
            value={prompt}
            onChangeText={setPrompt}
            multiline
            placeholder="e.g. Add gym tomorrow at high priority and move my reading to Friday"
          />
          <Button title="Send" onPress={() => prompt.trim() && run({ prompt: prompt.trim() })} busy={busy} disabled={!prompt.trim()} />
          <Muted>Big or risky changes (deleting, bulk edits) wait for your OK before they happen.</Muted>
        </Card>

        <View style={styles.quick}>
          {QUICK_ACTIONS.map((item) => (
            <Pressable key={item.action} onPress={() => run({ action: item.action })} disabled={busy} style={styles.quickButton}>
              <Ionicons name={item.icon} size={18} color={colors.action} />
              <Text style={styles.quickText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <ErrorText message={error} />

        {result ? (
          <Card>
            <CardTitle eyebrow="Result" title={undone ? "Changes undone" : "Done"} />
            <Body>{result.summaryMessage}</Body>
            {result.actionLogs.map((log, index) => (
              <View key={index} style={styles.log}>
                <Ionicons
                  name={LOG_ICON[log.status]}
                  size={18}
                  color={log.status === "warning" ? colors.medium.fg : colors.accent}
                />
                <Text style={styles.logText}>{log.details}</Text>
              </View>
            ))}

            {result.pending && result.pending.length > 0 ? (
              <View style={styles.pending}>
                <Text style={styles.pendingTitle}>Needs your OK</Text>
                {result.pending.map((op, index) => (
                  <Text key={index} style={styles.logText}>
                    • {op.description}
                  </Text>
                ))}
                <Button title={`Apply ${result.pending.length} change(s)`} onPress={() => run({ confirm: result.pending })} busy={busy} />
              </View>
            ) : null}

            {canUndo ? <Button title="Undo these changes" variant="secondary" onPress={undo} busy={busy} /> : null}
          </Card>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  quick: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  quickText: { fontSize: 13, color: colors.action },
  log: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  logText: { flex: 1, fontSize: 14, color: colors.ink, lineHeight: 20 },
  pending: { backgroundColor: colors.medium.bg, borderRadius: 16, padding: 12, gap: 8 },
  pendingTitle: { fontWeight: "600", color: colors.medium.fg },
});
