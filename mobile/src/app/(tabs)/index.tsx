import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Button, Card, Centered, ChoiceRow, ErrorText, Eyebrow, Field, MoodPicker } from "@/components/ui";
import { ApiError, useAuth } from "@/lib/auth";
import { formatDayLabel, formatTime, shiftDate } from "@/lib/dates";
import { colors, fonts, radius } from "@/lib/theme";
import type { Task, TaskPriority, TaskStatus, TodayResponse } from "@/lib/types";

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const STATUS_ORDER: Record<TaskStatus, number> = { in_progress: 0, todo: 1, done: 2, skipped: 3 };
const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

const ENERGY_LABEL = { low: "Low energy", steady: "Steady", high: "High energy" };
const FOCUS_LABEL = { scattered: "Scattered", okay: "Okay focus", locked_in: "Locked in" };

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

export default function TodayScreen() {
  const { request } = useAuth();
  // The day being shown; null until the server says what "today" is (Colombo time).
  const dateRef = useRef<string | null>(null);
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (forDate: string | null) => {
      dateRef.current = forDate;

      try {
        const result = await request<TodayResponse>(forDate ? `/today?date=${forDate}` : "/today");

        // Ignore an answer for a day the user has already navigated away from.
        if (dateRef.current === forDate) {
          dateRef.current = result.date;
          setData(result);
          setLoadError(null);
        }
      } catch (error) {
        if (dateRef.current === forDate) {
          setLoadError(errorMessage(error));
        }
      }
    },
    [request],
  );

  // Reload whenever the tab comes back into view (e.g. after adding a check-in).
  useFocusEffect(
    useCallback(() => {
      load(dateRef.current);
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load(dateRef.current);
    setRefreshing(false);
  }

  function goToDay(target: string) {
    setData(null);
    setLoadError(null);
    load(target);
  }

  if (!data) {
    return (
      <Centered>
        {loadError ? (
          <>
            <ErrorText message={loadError} />
            <Button title="Try again" onPress={() => load(dateRef.current)} variant="secondary" />
          </>
        ) : (
          <ActivityIndicator color={colors.action} size="large" />
        )}
      </Centered>
    );
  }

  const tasks = [...data.tasks].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  );
  const counted = data.tasks.filter((task) => task.status !== "skipped");
  const done = counted.filter((task) => task.status === "done").length;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.action]} />}
    >
      <View style={styles.dayNav}>
        <Pressable onPress={() => goToDay(shiftDate(data.date, -1))} hitSlop={12} accessibilityLabel="Previous day">
          <Ionicons name="chevron-back" size={26} color={colors.action} />
        </Pressable>
        <Pressable
          onPress={() => data.date !== data.today && goToDay(data.today)}
          style={{ alignItems: "center" }}
          accessibilityHint="Jumps back to today"
        >
          <Text style={styles.dayLabel}>{formatDayLabel(data.date, data.today)}</Text>
          <Text style={styles.daySub}>
            {counted.length === 0 ? "No tasks yet" : `${done} of ${counted.length} done`}
          </Text>
        </Pressable>
        <Pressable onPress={() => goToDay(shiftDate(data.date, 1))} hitSlop={12} accessibilityLabel="Next day">
          <Ionicons name="chevron-forward" size={26} color={colors.action} />
        </Pressable>
      </View>

      {counted.length > 0 ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(done / counted.length) * 100}%` }]} />
        </View>
      ) : null}

      {data.overdueCount > 0 && data.date === data.today ? (
        <View style={styles.banner}>
          <Ionicons name="time-outline" size={18} color={colors.medium.fg} />
          <Text style={styles.bannerText}>
            {data.overdueCount} unfinished {data.overdueCount === 1 ? "task" : "tasks"} from earlier days.
            Move them on the web Tasks page.
          </Text>
        </View>
      ) : null}

      <TasksCard date={data.date} tasks={tasks} onChanged={() => load(data.date)} setData={setData} />
      <CheckInsCard data={data} />
      <DayNoteCard key={data.date} data={data} onSaved={() => load(data.date)} />
    </ScrollView>
  );
}

function TasksCard({
  date,
  tasks,
  onChanged,
  setData,
}: {
  date: string;
  tasks: Task[];
  onChanged: () => void;
  setData: React.Dispatch<React.SetStateAction<TodayResponse | null>>;
}) {
  const { request } = useAuth();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addTask() {
    if (!title.trim()) return;
    setAdding(true);
    setError(null);

    try {
      await request("/tasks", { method: "POST", body: { title: title.trim(), priority, date } });
      setTitle("");
      onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setAdding(false);
    }
  }

  // Updates the list straight away, then saves; reloads from the server if saving fails.
  async function setStatus(task: Task, status: TaskStatus) {
    setData((current) =>
      current
        ? { ...current, tasks: current.tasks.map((item) => (item.id === task.id ? { ...item, status } : item)) }
        : current,
    );

    try {
      await request(`/tasks/${task.id}`, { method: "PATCH", body: { status } });
    } catch (caught) {
      Alert.alert("Couldn't update the task", errorMessage(caught));
      onChanged();
    }
  }

  async function removeTask(task: Task) {
    try {
      await request(`/tasks/${task.id}`, { method: "DELETE" });
      onChanged();
    } catch (caught) {
      Alert.alert("Couldn't delete the task", errorMessage(caught));
    }
  }

  function openMenu(task: Task) {
    const options: { text: string; status?: TaskStatus; destructive?: boolean }[] = [
      { text: "In progress", status: "in_progress" },
      { text: "Done", status: "done" },
      { text: "Skip for today", status: "skipped" },
      { text: "Back to to-do", status: "todo" },
    ];

    Alert.alert(task.title, task.note || undefined, [
      ...options
        .filter((option) => option.status !== task.status)
        .map((option) => ({ text: option.text, onPress: () => setStatus(task, option.status!) })),
      {
        text: "Delete",
        style: "destructive" as const,
        onPress: () =>
          Alert.alert("Delete this task?", task.title, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => removeTask(task) },
          ]),
      },
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  return (
    <Card>
      <View>
        <Eyebrow>Tasks</Eyebrow>
        <Text style={styles.cardTitle}>Run the day</Text>
      </View>

      {tasks.length === 0 ? (
        <Text style={styles.muted}>Nothing planned for this day yet.</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={() => setStatus(task, task.status === "done" ? "todo" : "done")}
              onMenu={() => openMenu(task)}
            />
          ))}
        </View>
      )}

      <View style={styles.addRow}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Add a task…"
          placeholderTextColor={colors.inkFaint}
          style={styles.addInput}
          onSubmitEditing={addTask}
          returnKeyType="done"
        />
        <Pressable
          onPress={addTask}
          disabled={adding || !title.trim()}
          style={[styles.addButton, (adding || !title.trim()) && { opacity: 0.5 }]}
          accessibilityLabel="Add task"
        >
          {adding ? (
            <ActivityIndicator color={colors.actionText} />
          ) : (
            <Ionicons name="add" size={24} color={colors.actionText} />
          )}
        </Pressable>
      </View>
      {title.trim() ? <ChoiceRow options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} /> : null}
      <ErrorText message={error} />
      {tasks.length > 0 ? <Text style={styles.hint}>Tap the circle to finish a task. Hold a task for more.</Text> : null}
    </Card>
  );
}

function TaskRow({ task, onToggle, onMenu }: { task: Task; onToggle: () => void; onMenu: () => void }) {
  const finished = task.status === "done" || task.status === "skipped";
  const priorityColors = colors[task.priority];

  return (
    <Pressable onLongPress={onMenu} onPress={onMenu} delayLongPress={300} style={[styles.taskRow, finished && { opacity: 0.55 }]}>
      <Pressable onPress={onToggle} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: task.status === "done" }}>
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
        <Text style={styles.taskMeta}>
          {task.status === "in_progress" ? "In progress · " : task.status === "skipped" ? "Skipped · " : ""}
          {task.recurring_task_id ? "Routine" : "One-off"}
          {task.rollover_count > 0 ? ` · moved ${task.rollover_count}×` : ""}
        </Text>
      </View>
      <View style={[styles.priority, { backgroundColor: priorityColors.bg }]}>
        <Text style={[styles.priorityText, { color: priorityColors.fg }]}>{task.priority}</Text>
      </View>
    </Pressable>
  );
}

function CheckInsCard({ data }: { data: TodayResponse }) {
  return (
    <Card>
      <View>
        <Eyebrow>Check-ins</Eyebrow>
        <Text style={styles.cardTitle}>How are you doing?</Text>
      </View>
      {data.checkIns.length === 0 ? (
        <Text style={styles.muted}>No check-ins on this day.</Text>
      ) : (
        data.checkIns.map((checkIn) => (
          <View key={checkIn.id} style={styles.checkIn}>
            <Text style={styles.checkInMood}>{checkIn.mood}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.taskTitle}>
                {ENERGY_LABEL[checkIn.energy]} · {FOCUS_LABEL[checkIn.focus]}
              </Text>
              <Text style={styles.taskMeta}>
                {formatTime(checkIn.created_at)}
                {checkIn.note ? ` · ${checkIn.note}` : ""}
              </Text>
            </View>
          </View>
        ))
      )}
      <Button
        title="Add check-in"
        variant="secondary"
        onPress={() => router.push({ pathname: "/check-in", params: { date: data.date } })}
      />
    </Card>
  );
}

function DayNoteCard({ data, onSaved }: { data: TodayResponse; onSaved: () => void }) {
  const { request } = useAuth();
  const [intention, setIntention] = useState(data.dayRecord?.intention ?? "");
  const [note, setNote] = useState(data.dayRecord?.note ?? "");
  const [mood, setMood] = useState<number | null>(data.dayRecord?.end_of_day_mood ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setSaved(false), [intention, note, mood]);

  async function save() {
    setSaving(true);
    setError(null);

    try {
      await request("/day", { method: "PUT", body: { date: data.date, intention, note, endOfDayMood: mood } });
      setSaved(true);
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <View>
        <Eyebrow>Day note</Eyebrow>
        <Text style={styles.cardTitle}>Intention & reflection</Text>
      </View>
      <Field label="Intention" value={intention} onChangeText={setIntention} placeholder="What matters today?" />
      <Field label="End-of-day note" value={note} onChangeText={setNote} multiline placeholder="How did the day go?" />
      <MoodPicker label="End-of-day mood" value={mood} onChange={(value) => setMood(value === mood ? null : value)} />
      <ErrorText message={error} />
      <Button title={saved ? "Saved" : "Save day note"} onPress={save} busy={saving} disabled={saved} />
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  dayNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  dayLabel: { fontFamily: fonts.display, fontSize: 28, color: colors.ink },
  daySub: { fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(2,44,34,0.08)", overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: colors.accent },
  banner: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    backgroundColor: colors.medium.bg,
    borderRadius: 16,
    padding: 12,
  },
  bannerText: { flex: 1, color: colors.medium.fg, fontSize: 13 },
  cardTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, marginTop: 4 },
  muted: { color: colors.inkSoft, fontSize: 14 },
  hint: { color: colors.inkFaint, fontSize: 12 },
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
  checkIn: { flexDirection: "row", alignItems: "center", gap: 12 },
  checkInMood: {
    width: 40,
    height: 40,
    borderRadius: 20,
    textAlign: "center",
    textAlignVertical: "center",
    lineHeight: 40,
    backgroundColor: colors.field,
    color: colors.action,
    fontSize: 16,
    fontWeight: "600",
    overflow: "hidden",
  },
});
