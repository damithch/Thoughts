import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ChoiceRow, ErrorText } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatShortDate } from "@/lib/dates";
import { colors, radius } from "@/lib/theme";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { errorMessage } from "@/lib/use-api";

export const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const STATUS_ORDER: Record<TaskStatus, number> = { in_progress: 0, todo: 1, done: 2, skipped: 3 };
const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

export function sortTasks(tasks: Task[]) {
  return [...tasks].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  );
}

// Offers Undo right after a delete by sending the deleted task back to the server.
export function offerUndoDelete(request: ReturnType<typeof useAuth>["request"], deleted: Task, onRestored: () => void) {
  Alert.alert("Task deleted", deleted.title, [
    { text: "OK", style: "cancel" },
    {
      text: "Undo",
      onPress: async () => {
        try {
          await request("/v1/tasks/restore", { method: "POST", body: { task: deleted } });
          onRestored();
        } catch (caught) {
          Alert.alert("Couldn't restore the task", errorMessage(caught));
        }
      },
    },
  ]);
}

// A task in a list: tap the circle to finish it, hold for a quick status menu, tap to edit.
export function TaskList({
  tasks,
  showDate,
  onChanged,
  setTasks,
  emptyText,
}: {
  tasks: Task[];
  showDate?: boolean;
  onChanged: () => void;
  // Applies a status change locally before the server confirms it.
  setTasks?: (update: (tasks: Task[]) => Task[]) => void;
  emptyText?: string;
}) {
  const { request } = useAuth();

  async function setStatus(task: Task, status: TaskStatus) {
    setTasks?.((current) => current.map((item) => (item.id === task.id ? { ...item, status } : item)));

    try {
      await request(`/v1/tasks/${task.id}`, { method: "PATCH", body: { status } });
      if (!setTasks) onChanged();
    } catch (caught) {
      Alert.alert("Couldn't update the task", errorMessage(caught));
      onChanged();
    }
  }

  function openMenu(task: Task) {
    const options: { text: string; status: TaskStatus }[] = [
      { text: "In progress", status: "in_progress" },
      { text: "Done", status: "done" },
      { text: "Skip", status: "skipped" },
      { text: "Back to to-do", status: "todo" },
    ];

    Alert.alert(task.title, undefined, [
      ...options
        .filter((option) => option.status !== task.status)
        .map((option) => ({ text: option.text, onPress: () => setStatus(task, option.status) })),
      { text: "Edit…", onPress: () => router.push({ pathname: "/task/[id]", params: { id: String(task.id) } }) },
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  if (tasks.length === 0) {
    return emptyText ? <Text style={styles.empty}>{emptyText}</Text> : null;
  }

  return (
    <View style={{ gap: 8 }}>
      {sortTasks(tasks).map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          showDate={showDate}
          onToggle={() => setStatus(task, task.status === "done" ? "todo" : "done")}
          onPress={() => router.push({ pathname: "/task/[id]", params: { id: String(task.id) } })}
          onLongPress={() => openMenu(task)}
        />
      ))}
    </View>
  );
}

function TaskRow({
  task,
  showDate,
  onToggle,
  onPress,
  onLongPress,
}: {
  task: Task;
  showDate?: boolean;
  onToggle: () => void;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const finished = task.status === "done" || task.status === "skipped";
  const priorityColors = colors[task.priority];
  const meta = [
    task.status === "in_progress" ? "In progress" : task.status === "skipped" ? "Skipped" : null,
    showDate ? (task.scheduled_date ? formatShortDate(task.scheduled_date) : "Inbox") : null,
    task.recurring_task_id ? "Routine" : null,
    task.rollover_count > 0 ? `moved ${task.rollover_count}×` : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={[styles.taskRow, finished && { opacity: 0.55 }]}
    >
      <Pressable
        onPress={onToggle}
        hitSlop={10}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.status === "done" }}
      >
        <Ionicons
          name={
            task.status === "done"
              ? "checkmark-circle"
              : task.status === "skipped"
                ? "remove-circle-outline"
                : task.status === "in_progress"
                  ? "time-outline"
                  : "ellipse-outline"
          }
          size={28}
          color={task.status === "in_progress" ? colors.medium.fg : colors.accent}
        />
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.taskTitle, task.status === "done" && styles.strike]}>{task.title}</Text>
        {meta.length > 0 ? <Text style={styles.taskMeta}>{meta.join(" · ")}</Text> : null}
        {task.note ? (
          <Text style={styles.taskMeta} numberOfLines={1}>
            {task.note}
          </Text>
        ) : null}
      </View>
      {/breath/i.test(task.title) && !finished ? (
        <Pressable
          onPress={() => router.push({ pathname: "/breathe", params: { minutes: "2" } })}
          hitSlop={8}
          style={styles.play}
          accessibilityLabel="Start a guided breathing session"
        >
          <Ionicons name="play" size={14} color={colors.actionText} />
        </Pressable>
      ) : null}
      <View style={[styles.priority, { backgroundColor: priorityColors.bg }]}>
        <Text style={[styles.priorityText, { color: priorityColors.fg }]}>{task.priority}</Text>
      </View>
    </Pressable>
  );
}

// One-line add box; `date` null adds to the Inbox.
export function TaskQuickAdd({
  date,
  onAdded,
  placeholder = "Add a task…",
}: {
  date: string | null;
  onAdded: () => void;
  placeholder?: string;
}) {
  const { request } = useAuth();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!title.trim()) return;
    setAdding(true);
    setError(null);

    try {
      await request("/v1/tasks", { method: "POST", body: { title: title.trim(), priority, date } });
      setTitle("");
      onAdded();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setAdding(false);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.addRow}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={placeholder}
          placeholderTextColor={colors.inkFaint}
          style={styles.addInput}
          onSubmitEditing={add}
          returnKeyType="done"
        />
        <Pressable
          onPress={add}
          disabled={adding || !title.trim()}
          style={[styles.addButton, (adding || !title.trim()) && { opacity: 0.5 }]}
          accessibilityLabel="Add task"
        >
          {adding ? <ActivityIndicator color={colors.actionText} /> : <Ionicons name="add" size={24} color={colors.actionText} />}
        </Pressable>
      </View>
      {title.trim() ? <ChoiceRow options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} /> : null}
      <ErrorText message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.inkSoft, fontSize: 14 },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.cardSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  taskTitle: { fontSize: 15, color: colors.ink },
  strike: { textDecorationLine: "line-through" },
  taskMeta: { fontSize: 12, color: colors.inkSoft },
  priority: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  play: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  priorityText: { fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontWeight: "600" },
  addRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  addInput: {
    flex: 1,
    backgroundColor: colors.field,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.action,
    alignItems: "center",
    justifyContent: "center",
  },
});
