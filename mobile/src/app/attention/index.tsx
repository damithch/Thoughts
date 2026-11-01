import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { AnchorPicker, FocusSlider, MinutesStepper, TaskPicker } from "@/components/attention/fields";
import { TrendChart, WeekStrip } from "@/components/attention/progress";
import {
  Body,
  Button,
  Card,
  CardTitle,
  ChoiceRow,
  ErrorText,
  Eyebrow,
  Field,
  LoadingState,
  Muted,
  Segmented,
  StatTile,
  SwitchRow,
} from "@/components/ui";
import {
  ATTENTION_COPY,
  describeFocusChange,
  groupSessionsByDay,
  meditationSteps,
  minutesFromSeconds,
  sessionTypeLabel,
  type AttentionAnchor,
  type AttentionIdea,
  type AttentionSession,
  type AttentionSettings,
  type AttentionStats,
  type SaveResult,
} from "@/lib/attention";
import { useAuth } from "@/lib/auth";
import { colomboToday, formatLongDate, formatTime } from "@/lib/dates";
import { colors, fonts } from "@/lib/theme";
import { errorMessage, useApi } from "@/lib/use-api";

type Tab = "log" | "history" | "progress";

export default function AttentionScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "history" || params.tab === "progress" ? params.tab : "log");

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <Stack.Screen
        options={{
          title: ATTENTION_COPY.title,
          headerRight: () => (
            <Pressable onPress={() => router.push("/attention/settings")} hitSlop={10} accessibilityLabel="Attention training settings">
              <Ionicons name="settings-outline" size={22} color={colors.action} />
            </Pressable>
          ),
        }}
      />
      <View style={styles.tabs}>
        <Segmented
          options={[
            { value: "log", label: "Log" },
            { value: "history", label: "History" },
            { value: "progress", label: "Progress" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === "log" ? <LogTab /> : tab === "history" ? <HistoryTab /> : <ProgressTab />}
    </KeyboardAvoidingView>
  );
}

// --- Log ---

type Kind = "mundane_task" | "meditation";

function LogTab() {
  const { request } = useAuth();
  const ideas = useApi<{ ideas: AttentionIdea[] }>("/v1/attention/ideas");
  const settings = useApi<{ settings: AttentionSettings }>("/v1/settings");
  const [kind, setKind] = useState<Kind>("mundane_task");
  const [taskName, setTaskName] = useState("");
  const [before, setBefore] = useState<number | null>(null);
  const [after, setAfter] = useState<number | null>(null);
  const [minutes, setMinutes] = useState(5);
  const [anchors, setAnchors] = useState<AttentionAnchor[]>([]);
  const [comments, setComments] = useState("");
  const [completeTask, setCompleteTask] = useState(true);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SaveResult | null>(null);
  // Scrolling pauses while a slider is being dragged, so the drag isn't taken over by the page.
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (timerStart === null) return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [timerStart]);

  function startTimer() {
    const start = Date.now();
    setTimerStart(start);
    setStartedAt(new Date(start).toISOString());
    setNow(start);
  }

  function stopTimer() {
    if (timerStart === null) return;
    setMinutes(minutesFromSeconds((Date.now() - timerStart) / 1000));
    setTimerStart(null);
  }

  function reset() {
    setSaved(null);
    setTaskName("");
    setBefore(null);
    setAfter(null);
    setMinutes(5);
    setAnchors([]);
    setComments("");
    setStartedAt(null);
    setTimerStart(null);
    setError(null);
  }

  async function save() {
    if (kind === "mundane_task" && !taskName.trim()) {
      setError("Pick or type the everyday task you practised with.");
      return;
    }

    const elapsedMinutes = timerStart !== null ? minutesFromSeconds((Date.now() - timerStart) / 1000) : minutes;
    setTimerStart(null);
    setSaving(true);
    setError(null);

    try {
      const result = await request<SaveResult>("/v1/attention/sessions", {
        method: "POST",
        body:
          kind === "mundane_task"
            ? {
                sessionType: kind,
                taskName,
                durationMinutes: elapsedMinutes,
                selfFocusBefore: before,
                selfFocusAfter: after,
                anchorsUsed: anchors,
                comments,
                startedAt,
                completeTask,
              }
            : { sessionType: kind, durationMinutes: elapsedMinutes, comments, completeTask },
      });
      setSaved(result);
      ideas.reload();
    } catch (caught) {
      setError(errorMessage(caught, "That couldn't be saved. Try again."));
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    const change = describeFocusChange(saved.session.task_focus_before, saved.session.task_focus_after);

    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <CardTitle eyebrow="Saved" title={saved.session.task_name} />
          <Body>{ATTENTION_COPY.saved}</Body>
          <Muted>
            {saved.session.duration_minutes} min{change ? ` · ${change}` : ""}
          </Muted>
          {saved.completedTask ? <Muted>Ticked off “{saved.completedTask}” for today.</Muted> : null}
          <Button
            title="Add reflection to journal"
            variant="secondary"
            onPress={() => router.push({ pathname: "/attention/[id]", params: { id: String(saved.session.id), reflect: "1" } })}
          />
          <Button title="Log another" onPress={reset} />
        </Card>
      </ScrollView>
    );
  }

  const steps = meditationSteps(settings.data?.settings);
  const elapsed = timerStart !== null ? Math.max(0, Math.floor((now - timerStart) / 1000)) : 0;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" scrollEnabled={!dragging}>
      <Muted>{ATTENTION_COPY.principle}</Muted>
      <ChoiceRow
        options={[
          { value: "mundane_task", label: "Mundane task" },
          { value: "meditation", label: "Meditation" },
        ]}
        value={kind}
        onChange={setKind}
      />

      {kind === "mundane_task" ? (
        <Card>
          <Muted>{ATTENTION_COPY.mundaneIntro}</Muted>
          <TaskPicker ideas={ideas.data?.ideas ?? []} value={taskName} onChange={setTaskName} />
          <FocusSlider label={ATTENTION_COPY.beforeQuestion} value={before} onChange={setBefore} onDragChange={setDragging} />

          <View style={styles.timerRow}>
            {timerStart !== null ? (
              <>
                <Text style={styles.timer} accessibilityLiveRegion="polite">
                  {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
                </Text>
                <Button title="Stop timer" variant="secondary" onPress={stopTimer} style={{ flex: 1 }} />
              </>
            ) : (
              <Button title="Start timer (optional)" variant="secondary" onPress={startTimer} style={{ flex: 1 }} />
            )}
          </View>
          {timerStart === null ? <MinutesStepper value={minutes} onChange={setMinutes} /> : null}

          <AnchorPicker value={anchors} onChange={setAnchors} />
          <FocusSlider label={ATTENTION_COPY.afterQuestion} value={after} onChange={setAfter} onDragChange={setDragging} />
          <Field
            label={ATTENTION_COPY.commentsLabel}
            value={comments}
            onChangeText={setComments}
            placeholder={ATTENTION_COPY.commentsPlaceholder}
            multiline
            maxLength={4000}
          />
        </Card>
      ) : (
        <Card>
          <Muted>{ATTENTION_COPY.meditationIntro}</Muted>
          {steps.map((step, index) => (
            <View key={step.key} style={styles.stepRow}>
              <Text style={styles.stepNumber}>{index + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>
                  {step.title} · {formatSeconds(step.seconds)}
                </Text>
                <Muted>{step.prompt}</Muted>
              </View>
            </View>
          ))}
          <Button title="Start guided meditation" onPress={() => router.push("/attention/meditate")} />
          <Eyebrow>Practised without the timer?</Eyebrow>
          <MinutesStepper value={minutes} onChange={setMinutes} />
          <Field
            label={ATTENTION_COPY.commentsLabel}
            value={comments}
            onChangeText={setComments}
            placeholder="What did you notice?"
            multiline
            maxLength={4000}
          />
        </Card>
      )}

      <SwitchRow
        label="Tick off today's attention task"
        hint="Marks an open “Attention training” task done (meditation also counts for a breathing habit)."
        value={completeTask}
        onChange={setCompleteTask}
      />
      <ErrorText message={error} />
      <Button title={kind === "meditation" ? "Save meditation" : "Save session"} onPress={save} busy={saving} />
    </ScrollView>
  );
}

function formatSeconds(seconds: number) {
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// --- History ---

function HistoryTab() {
  const { data, error, reload, refresh, refreshing } = useApi<{ sessions: AttentionSession[] }>(
    "/v1/attention/sessions?limit=200",
  );

  if (!data) return <LoadingState error={error} onRetry={reload} />;

  const groups = groupSessionsByDay(data.sessions);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.action]} />}
    >
      {groups.length === 0 ? <Muted>{ATTENTION_COPY.emptyHistory}</Muted> : null}
      {groups.map((group) => (
        <View key={group.date} style={{ gap: 8 }}>
          <Eyebrow>{formatLongDate(group.date)}</Eyebrow>
          {group.sessions.map((session) => {
            const change = describeFocusChange(session.task_focus_before, session.task_focus_after);

            return (
              <Pressable
                key={session.id}
                onPress={() => router.push({ pathname: "/attention/[id]", params: { id: String(session.id) } })}
                style={({ pressed }) => [styles.entry, pressed && { opacity: 0.75 }]}
              >
                <View style={styles.entryTop}>
                  <Text style={styles.entryMeta}>
                    {formatTime(session.started_at)} · {sessionTypeLabel(session.session_type)}
                  </Text>
                  <Text style={styles.entryMeta}>{session.duration_minutes} min</Text>
                </View>
                <Text style={styles.entryTitle}>{session.task_name}</Text>
                {change ? <Text style={styles.entryChange}>{change}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

// --- Progress ---

function ProgressTab() {
  const week = useApi<{ stats: AttentionStats }>("/v1/attention/stats?range=7d");
  const month = useApi<{ stats: AttentionStats }>("/v1/attention/stats?range=30d");

  if (!week.data || !month.data) {
    return <LoadingState error={week.error ?? month.error} onRetry={() => (week.reload(), month.reload())} />;
  }

  const stats = week.data.stats;
  const change = month.data.stats.avgTaskFocusChange;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={week.refreshing || month.refreshing}
          onRefresh={() => (week.refresh(), month.refresh())}
          colors={[colors.action]}
        />
      }
    >
      <Card>
        <CardTitle eyebrow="Last 7 days" title="Your practice" />
        <WeekStrip days={stats.days} today={stats.to || colomboToday()} />
        <Muted>{ATTENTION_COPY.targetHint}</Muted>
      </Card>
      <View style={styles.tiles}>
        <StatTile label="Streak" value={String(stats.streak)} hint={stats.streak === 1 ? "day" : "days in a row"} />
        <StatTile label="Minutes" value={String(stats.totalMinutes)} hint="last 7 days" />
      </View>
      <View style={styles.tiles}>
        <StatTile label="Both kinds" value={`${stats.daysWithBoth}/7`} hint="days with task + meditation" />
        <StatTile
          label="Task focus"
          value={change === null ? "—" : `${change > 0 ? "+" : ""}${change}`}
          hint="avg change, 30 days"
        />
      </View>
      <Card>
        <CardTitle eyebrow="Last 30 days" title="Attention on the task" />
        <TrendChart trend={month.data.stats.trend} />
      </Card>
      <Button title="Homework report (PDF)" variant="secondary" onPress={() => router.push("/export")} />
      <Muted>{ATTENTION_COPY.principle}</Muted>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: 16, paddingTop: 8 },
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  timerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  timer: { fontFamily: fonts.display, fontSize: 28, color: colors.ink, minWidth: 70 },
  stepRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    textAlign: "center",
    lineHeight: 26,
    backgroundColor: colors.cardSoft,
    color: colors.action,
    fontWeight: "700",
    overflow: "hidden",
  },
  stepTitle: { fontSize: 15, fontWeight: "600", color: colors.ink },
  entry: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 4,
  },
  entryTop: { flexDirection: "row", justifyContent: "space-between" },
  entryMeta: { fontSize: 12, color: colors.inkSoft },
  entryTitle: { fontSize: 16, color: colors.ink },
  entryChange: { fontSize: 13, color: colors.action },
  tiles: { flexDirection: "row", gap: 12 },
});
