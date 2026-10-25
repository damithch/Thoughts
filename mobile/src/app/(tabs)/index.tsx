import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { InnerWeather } from "@/components/inner-weather";
import { RemindersPrompt } from "@/components/reminders-prompt";
import { SupportBanner } from "@/components/support-banner";
import { TaskList, TaskQuickAdd } from "@/components/tasks";
import {
  Body,
  Button,
  Card,
  CardTitle,
  ErrorText,
  Field,
  LoadingState,
  MoodPicker,
  Muted,
  Tag,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatDayLabel, formatTime, shiftDate } from "@/lib/dates";
import { colors, fonts } from "@/lib/theme";
import type { AgentResponse, AnchorStreak, Task, TodayResponse } from "@/lib/types";
import { errorMessage, useApi } from "@/lib/use-api";

const ENERGY_LABEL = { low: "Low energy", steady: "Steady", high: "High energy" };
const FOCUS_LABEL = { scattered: "Scattered", okay: "Okay focus", locked_in: "Locked in" };

export default function TodayScreen() {
  const { request } = useAuth();
  // null = "today" as the server sees it (Colombo time).
  const [date, setDate] = useState<string | null>(null);
  const { data, setData, error, reload, refresh, refreshing } = useApi<TodayResponse>(
    date ? `/v1/today?date=${date}` : "/v1/today",
  );

  if (!data || (date !== null && data.date !== date)) {
    return <LoadingState error={error} onRetry={reload} />;
  }

  const counted = data.tasks.filter((task) => task.status !== "skipped");
  const done = counted.filter((task) => task.status === "done").length;
  const isToday = data.date === data.today;
  const isPast = data.date < data.today;
  async function dismissSupport() {
    setData((current) => (current?.support ? { ...current, support: { ...current.support, active: false } } : current));

    try {
      await request("/v1/support/today", { method: "PUT", body: { dismiss: true } });
    } catch (caught) {
      Alert.alert("Couldn't save that", errorMessage(caught));
      reload();
    }
  }

  const setTasks = (update: (tasks: Task[]) => Task[]) =>
    setData((current) => (current ? { ...current, tasks: update(current.tasks) } : current));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.action]} />}
    >
      <View style={styles.dayNav}>
        <Pressable onPress={() => setDate(shiftDate(data.date, -1))} hitSlop={12} accessibilityLabel="Previous day">
          <Ionicons name="chevron-back" size={26} color={colors.action} />
        </Pressable>
        <Pressable onPress={() => setDate(null)} style={{ alignItems: "center" }} accessibilityHint="Jumps back to today">
          <Text style={styles.dayLabel}>{formatDayLabel(data.date, data.today)}</Text>
          <Text style={styles.daySub}>{counted.length === 0 ? "No tasks" : `${done} of ${counted.length} done`}</Text>
        </Pressable>
        <Pressable onPress={() => setDate(shiftDate(data.date, 1))} hitSlop={12} accessibilityLabel="Next day">
          <Ionicons name="chevron-forward" size={26} color={colors.action} />
        </Pressable>
      </View>

      {data.support?.active ? (
        <SupportBanner status={data.support} onDismiss={() => dismissSupport()} />
      ) : null}

      {isToday ? <RemindersPrompt /> : null}

      <InnerWeather data={data} />

      {isToday ? (
        <Pressable
          onPress={() => router.push("/voice")}
          style={({ pressed }) => [styles.speakRow, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
        >
          <View style={styles.speakIcon}>
            <Ionicons name="mic" size={22} color={colors.actionText} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.speakTitle}>Speak a thought</Text>
            <Text style={styles.speakHint}>Say it out loud. The AI makes the card, tasks and worries for you to check.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
        </Pressable>
      ) : null}

      {data.overdueCount > 0 && !isPast ? <OverdueBanner count={data.overdueCount} date={data.date} onMoved={reload} /> : null}

      <Card>
        <CardTitle eyebrow="Tasks" title="Run the day" />
        <TaskList tasks={data.tasks} onChanged={reload} setTasks={setTasks} emptyText="Nothing planned for this day." />
        <TaskQuickAdd date={data.date} onAdded={reload} />
        {!isToday && !isPast ? <AddRoutinesButton date={data.date} onDone={reload} /> : null}
        {data.tasks.length > 0 ? (
          <Text style={styles.hint}>Tap the circle to finish a task, tap a task to edit, hold for quick status.</Text>
        ) : null}
      </Card>

      <AnchorCard key={`anchor-${data.date}`} data={data} onSaved={reload} />
      <CheckInsCard data={data} />
      <DayNoteCard key={`note-${data.date}`} data={data} onSaved={reload} />
      <DayReviewCard data={data} />
    </ScrollView>
  );
}

function OverdueBanner({ count, date, onMoved }: { count: number; date: string; onMoved: () => void }) {
  const { request } = useAuth();
  const [busy, setBusy] = useState(false);

  async function move() {
    setBusy(true);

    try {
      const result = await request<AgentResponse>("/agent/tasks", { method: "POST", body: { action: "roll_forward", date } });
      Alert.alert("Overdue tasks", result.summaryMessage);
      onMoved();
    } catch (caught) {
      Alert.alert("Couldn't move the tasks", errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.banner}>
      <Ionicons name="time-outline" size={20} color={colors.medium.fg} />
      <Text style={styles.bannerText}>
        {count} unfinished {count === 1 ? "task" : "tasks"} from earlier days.
      </Text>
      <Button title="Move here" variant="secondary" onPress={move} busy={busy} style={styles.bannerButton} />
    </View>
  );
}

function AddRoutinesButton({ date, onDone }: { date: string; onDone: () => void }) {
  const { request } = useAuth();
  const [busy, setBusy] = useState(false);

  async function apply() {
    setBusy(true);

    try {
      const result = await request<AgentResponse>("/agent/tasks", { method: "POST", body: { action: "apply_routines", date } });
      Alert.alert("Routines", result.summaryMessage);
      onDone();
    } catch (caught) {
      Alert.alert("Couldn't add routines", errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return <Button title="Add this day's routines" variant="secondary" onPress={apply} busy={busy} />;
}

// "What stayed true about you today?" — one sentence per day.
function AnchorCard({ data, onSaved }: { data: TodayResponse; onSaved: () => void }) {
  const { request } = useAuth();
  const [content, setContent] = useState(data.anchorNote?.content ?? "");
  const [editing, setEditing] = useState(!data.anchorNote);
  const [streak, setStreak] = useState<AnchorStreak | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    request<{ streak: AnchorStreak }>("/anchor-notes?limit=1")
      .then((result) => setStreak(result.streak))
      .catch(() => setStreak(null));
  }, [request, data.anchorNote]);

  async function save() {
    if (!content.trim()) {
      setError("Write one true sentence first.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await request("/anchor-notes", { method: "POST", body: { content: content.trim(), date: data.date } });
      setEditing(false);
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  if (!editing && data.anchorNote) {
    return (
      <Card>
        <CardTitle eyebrow={streak ? `Anchor · ${streak.currentStreak}-day streak` : "Anchor"} title="What stayed true" />
        <Body style={styles.anchorText}>⚓ {data.anchorNote.content}</Body>
        <Pressable onPress={() => setEditing(true)} hitSlop={8}>
          <Text style={styles.link}>Edit</Text>
        </Pressable>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle eyebrow={streak ? `Anchor · ${streak.currentStreak}-day streak` : "Anchor"} title="What stayed true about you?" />
      <Field
        label="One true sentence"
        value={content}
        onChangeText={(value) => setContent(value.slice(0, 280))}
        multiline
        placeholder="e.g. I held my boundaries even when it felt uncomfortable."
        hint={`${content.length}/280`}
      />
      <ErrorText message={error} />
      <Button title="Drop anchor" onPress={save} busy={saving} />
    </Card>
  );
}

function CheckInsCard({ data }: { data: TodayResponse }) {
  return (
    <Card>
      <CardTitle eyebrow="Check-ins" title="How are you doing?" />
      {data.checkIns.length === 0 ? (
        <Muted>No check-ins on this day.</Muted>
      ) : (
        data.checkIns.map((checkIn) => (
          <View key={checkIn.id} style={styles.checkIn}>
            <Text style={styles.checkInMood}>{checkIn.mood}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {ENERGY_LABEL[checkIn.energy]} · {FOCUS_LABEL[checkIn.focus]}
              </Text>
              <Text style={styles.rowMeta}>
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
      await request("/v1/day", { method: "PUT", body: { date: data.date, intention, note, endOfDayMood: mood } });
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
      <CardTitle eyebrow="Day note" title="Intention & reflection" />
      <Field label="Intention" value={intention} onChangeText={setIntention} placeholder="What matters today?" />
      <Field label="End-of-day note" value={note} onChangeText={setNote} multiline placeholder="How did the day go?" />
      <MoodPicker label="End-of-day mood" value={mood} onChange={(value) => setMood(value === mood ? null : value)} />
      <ErrorText message={error} />
      <Button title={saved ? "Saved" : "Save day note"} onPress={save} busy={saving} disabled={saved} />
    </Card>
  );
}

// Everything else recorded on this day (same as the web Day page).
function DayReviewCard({ data }: { data: TodayResponse }) {
  const worry = data.worry;
  const hasWorry = Boolean(worry.module && (worry.experiment_day || worry.postponed_items.length > 0));

  if (data.thoughts.length === 0 && data.conversations.length === 0 && !hasWorry) {
    return null;
  }

  return (
    <Card>
      <CardTitle eyebrow="This day" title="What you recorded" />

      {data.thoughts.map((thought) => (
        <Pressable
          key={thought.id}
          onPress={() => router.push({ pathname: "/thought/[id]", params: { id: String(thought.id) } })}
          style={styles.reviewRow}
        >
          <Ionicons name="document-text-outline" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{thought.title}</Text>
            <Text style={styles.rowMeta}>
              {thought.category} · mood {thought.mood}/10 · {formatTime(thought.created_at)}
            </Text>
          </View>
        </Pressable>
      ))}

      {data.conversations.map((conversation) => (
        <View key={conversation.id} style={styles.reviewRow}>
          <Ionicons name="chatbubbles-outline" size={18} color={colors.accent} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.rowTitle}>{conversation.title}</Text>
            {conversation.insights ? (
              <Text style={styles.rowMeta} numberOfLines={3}>
                {conversation.insights}
              </Text>
            ) : null}
            <View style={styles.tags}>
              {conversation.key_topics.slice(0, 4).map((topic) => (
                <Tag key={topic}>{topic}</Tag>
              ))}
            </View>
          </View>
        </View>
      ))}

      {hasWorry ? (
        <Pressable onPress={() => router.push("/worry")} style={styles.reviewRow}>
          <Ionicons name="cloud-outline" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Worry postponement</Text>
            <Text style={styles.rowMeta}>
              {worry.postponed_items.length} postponed
              {worry.experiment_day ? ` · controllability ${worry.experiment_day.controllability}/10` : ""}
            </Text>
          </View>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  speakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
  },
  speakIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.action,
    alignItems: "center",
    justifyContent: "center",
  },
  speakTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  speakHint: { fontSize: 12, color: colors.inkSoft, marginTop: 2, lineHeight: 17 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  dayNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  dayLabel: { fontFamily: fonts.display, fontSize: 28, color: colors.ink },
  daySub: { fontSize: 13, color: colors.inkSoft, marginTop: 2, textAlign: "center" },
  banner: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: colors.medium.bg,
    borderRadius: 16,
    padding: 12,
  },
  bannerText: { flex: 1, color: colors.medium.fg, fontSize: 13 },
  bannerButton: { minHeight: 38, paddingVertical: 8, paddingHorizontal: 14 },
  hint: { color: colors.inkFaint, fontSize: 12 },
  link: { color: colors.accent, fontSize: 13 },
  anchorText: { fontStyle: "italic" },
  rowTitle: { fontSize: 15, color: colors.ink },
  rowMeta: { fontSize: 12, color: colors.inkSoft },
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
  reviewRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
