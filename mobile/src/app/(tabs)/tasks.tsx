import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { TaskList, TaskQuickAdd } from "@/components/tasks";
import {
  Button,
  Card,
  CardTitle,
  Fab,
  LoadingState,
  Muted,
  ProgressBar,
  Segmented,
  StatTile,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatDayLabel, formatShortDate } from "@/lib/dates";
import { describeDays } from "@/lib/routines";
import { colors, fonts } from "@/lib/theme";
import type { AgentResponse, Routine, StatsResponse, Task, UpcomingResponse } from "@/lib/types";
import { errorMessage, useApi } from "@/lib/use-api";

type TasksView = "upcoming" | "inbox" | "routines" | "review";

const VIEWS: { value: TasksView; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "inbox", label: "Inbox" },
  { value: "routines", label: "Routines" },
  { value: "review", label: "Review" },
];

export default function TasksScreen() {
  const [view, setView] = useState<TasksView>("upcoming");

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Segmented options={VIEWS} value={view} onChange={setView} />
        <Pressable onPress={() => router.push("/agent")} style={styles.agentButton}>
          <Ionicons name="sparkles-outline" size={18} color={colors.action} />
          <Text style={styles.agentText}>Ask the task assistant…</Text>
        </Pressable>
      </View>
      {view === "upcoming" ? <UpcomingView /> : null}
      {view === "inbox" ? <InboxView /> : null}
      {view === "routines" ? <RoutinesView /> : null}
      {view === "review" ? <ReviewView /> : null}
    </View>
  );
}

function UpcomingView() {
  const { data, error, reload, refresh, refreshing } = useApi<UpcomingResponse>("/v1/tasks?view=upcoming");

  if (!data) return <LoadingState error={error} onRetry={reload} />;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.action]} />}
    >
      {data.overdue.length > 0 ? <OverdueCard tasks={data.overdue} today={data.today} onChanged={reload} /> : null}
      {data.days.map((day) => (
        <UpcomingDay key={day.date} day={day} today={data.today} onChanged={reload} />
      ))}
    </ScrollView>
  );
}

function UpcomingDay({
  day,
  today,
  onChanged,
}: {
  day: UpcomingResponse["days"][number];
  today: string;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const open = day.tasks.filter((task) => task.status === "todo" || task.status === "in_progress").length;

  return (
    <Card>
      <View style={styles.dayHeader}>
        <View>
          <Text style={styles.dayTitle}>{formatDayLabel(day.date, today)}</Text>
          <Text style={styles.meta}>
            {formatShortDate(day.date)} · {open} open
          </Text>
        </View>
        <Pressable onPress={() => setAdding((value) => !value)} hitSlop={10} accessibilityLabel="Add a task to this day">
          <Ionicons name={adding ? "close" : "add-circle-outline"} size={26} color={colors.action} />
        </Pressable>
      </View>
      <TaskList tasks={day.tasks} onChanged={onChanged} />
      {day.pendingRoutines.length > 0 ? (
        <Text style={styles.meta}>Routines: {day.pendingRoutines.join(" · ")}</Text>
      ) : null}
      {day.tasks.length === 0 && day.pendingRoutines.length === 0 && !adding ? <Muted>Free day.</Muted> : null}
      {adding ? <TaskQuickAdd date={day.date} onAdded={onChanged} /> : null}
    </Card>
  );
}

function OverdueCard({ tasks, today, onChanged }: { tasks: Task[]; today: string; onChanged: () => void }) {
  const { request } = useAuth();
  const [busy, setBusy] = useState(false);

  async function moveAll() {
    setBusy(true);

    try {
      const result = await request<AgentResponse>("/agent/tasks", { method: "POST", body: { action: "roll_forward", date: today } });
      Alert.alert("Overdue tasks", result.summaryMessage);
      onChanged();
    } catch (caught) {
      Alert.alert("Couldn't move the tasks", errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ backgroundColor: colors.medium.bg }}>
      <CardTitle eyebrow="Overdue" title={`${tasks.length} unfinished from earlier`} />
      <TaskList tasks={tasks} showDate onChanged={onChanged} />
      <Button title="Move all to today" variant="secondary" onPress={moveAll} busy={busy} />
    </Card>
  );
}

function InboxView() {
  const { data, error, reload, refresh, refreshing } = useApi<{ tasks: Task[] }>("/v1/tasks?view=inbox");

  if (!data) return <LoadingState error={error} onRetry={reload} />;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.action]} />}
    >
      <Card>
        <CardTitle eyebrow="Inbox" title="Tasks without a day" />
        <Muted>Capture tasks that don&apos;t have a day yet. Open one and pick a day to schedule it.</Muted>
        <TaskQuickAdd date={null} onAdded={reload} placeholder="Add to Inbox…" />
        <TaskList tasks={data.tasks} onChanged={reload} emptyText="Inbox is empty." />
      </Card>
    </ScrollView>
  );
}

function RoutinesView() {
  const { data, error, reload, refresh, refreshing } = useApi<{ routines: Routine[] }>("/v1/routines");

  if (!data) return <LoadingState error={error} onRetry={reload} />;

  const active = data.routines.filter((routine) => routine.is_active);
  const paused = data.routines.filter((routine) => !routine.is_active);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.action]} />}
      >
        <Muted>Routines add themselves to each matching day. Deleting one occurrence only removes that day.</Muted>
        {data.routines.length === 0 ? <Muted>No routines yet. Tap + to create one.</Muted> : null}
        {[...active, ...paused].map((routine) => (
          <Pressable
            key={routine.id}
            onPress={() => router.push({ pathname: "/routine/[id]", params: { id: String(routine.id) } })}
            style={({ pressed }) => [styles.routine, !routine.is_active && { opacity: 0.55 }, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.routineTitle}>{routine.title}</Text>
              <Text style={styles.meta}>
                {describeDays(routine.days_of_week)} · {routine.priority}
                {routine.is_active ? "" : " · paused"}
                {routine.end_date ? ` · until ${formatShortDate(routine.end_date)}` : ""}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
          </Pressable>
        ))}
      </ScrollView>
      <Fab label="New routine" onPress={() => router.push({ pathname: "/routine/[id]", params: { id: "new" } })} />
    </View>
  );
}

function ReviewView() {
  const { data, error, reload, refresh, refreshing } = useApi<StatsResponse>("/v1/stats");

  if (!data) return <LoadingState error={error} onRetry={reload} />;

  const weekRate = data.week.total === 0 ? 0 : data.week.done / data.week.total;
  const monthTotals = data.history.reduce(
    (sum, day) => ({ total: sum.total + day.total_tasks, done: sum.done + day.completed_tasks }),
    { total: 0, done: 0 },
  );
  const maxDay = Math.max(1, ...data.history.map((day) => day.total_tasks));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.action]} />}
    >
      <View style={styles.tiles}>
        <StatTile label="This week" value={`${Math.round(weekRate * 100)}%`} hint={`${data.week.done} of ${data.week.total} done`} />
        <StatTile label="Streak" value={`${data.streak.current}`} hint={`best ${data.streak.best} days`} />
        <StatTile
          label="30 days"
          value={`${monthTotals.total === 0 ? 0 : Math.round((monthTotals.done / monthTotals.total) * 100)}%`}
          hint={`${monthTotals.done} of ${monthTotals.total}`}
        />
        <StatTile label="Skipped" value={`${data.week.skipped}`} hint="this week" />
      </View>

      <Card>
        <CardTitle eyebrow="This week" title="Day by day" />
        {data.week.days.map((day) => (
          <View key={day.date} style={styles.weekRow}>
            <Text style={styles.weekDay}>{formatShortDate(day.date)}</Text>
            <View style={{ flex: 1 }}>
              <ProgressBar value={day.total === 0 ? 0 : day.done / day.total} />
            </View>
            <Text style={styles.meta}>{day.total === 0 ? "—" : `${day.done}/${day.total}`}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <CardTitle eyebrow="Completion" title="Last 30 days" />
        <View style={styles.chart}>
          {data.history.map((day) => (
            <View key={day.date} style={styles.chartColumn}>
              <View style={[styles.chartTotal, { height: `${(day.total_tasks / maxDay) * 100}%` }]}>
                <View
                  style={[
                    styles.chartDone,
                    { height: `${day.total_tasks === 0 ? 0 : (day.completed_tasks / day.total_tasks) * 100}%` },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
        <Text style={styles.meta}>Bar height = tasks that day; green = done. Skipped tasks don&apos;t count.</Text>
      </Card>

      <Card>
        <CardTitle eyebrow="Routines" title="How they're holding up" />
        {data.routinesMonth.length === 0 ? <Muted>No active routines with scheduled days yet.</Muted> : null}
        {data.routinesMonth.map((routine) => {
          const week = data.routinesWeek.find((row) => row.id === routine.id);

          return (
            <View key={routine.id} style={{ gap: 6 }}>
              <View style={styles.routineStatHeader}>
                <Text style={styles.rowTitle}>{routine.title}</Text>
                <Text style={styles.meta}>
                  {week ? `week ${week.done}/${week.scheduled} · ` : ""}30d {routine.done}/{routine.scheduled}
                </Text>
              </View>
              <ProgressBar value={routine.scheduled === 0 ? 0 : routine.done / routine.scheduled} />
            </View>
          );
        })}
      </Card>

      {data.slipping.length > 0 ? (
        <Card>
          <CardTitle eyebrow="Slipping" title="Keeps getting pushed" />
          <Muted>Open tasks moved to a later day at least twice. Do it, shrink it, or drop it.</Muted>
          <TaskList tasks={data.slipping} showDate onChanged={reload} />
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  agentButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  agentText: { color: colors.inkSoft, fontSize: 14 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  dayHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dayTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  meta: { fontSize: 12, color: colors.inkSoft },
  rowTitle: { fontSize: 15, color: colors.ink, flex: 1 },
  routine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  routineTitle: { fontSize: 16, color: colors.ink },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  weekRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  weekDay: { width: 56, fontSize: 13, color: colors.ink },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 110, gap: 2 },
  chartColumn: { flex: 1, height: "100%", justifyContent: "flex-end" },
  chartTotal: {
    backgroundColor: "rgba(2,44,34,0.10)",
    borderRadius: 3,
    justifyContent: "flex-end",
    overflow: "hidden",
    minHeight: 2,
  },
  chartDone: { backgroundColor: colors.accent },
  routineStatHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
});
