import { useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Body, Button, Card, CardTitle, ErrorText, Field, LoadingState, MoodPicker, Muted } from "@/components/ui";
import {
  ATTENTION_COPY,
  meditationSteps,
  minutesFromSeconds,
  type AttentionSettings,
  type MeditationStep,
  type SaveResult,
} from "@/lib/attention";
import { useAuth } from "@/lib/auth";
import { colors, fonts } from "@/lib/theme";
import { errorMessage, useApi } from "@/lib/use-api";

const KEEP_AWAKE_TAG = "attention-meditation";
// Shorter than this isn't worth offering to save.
const MIN_SAVE_SECONDS = 20;

type Run = { steps: MeditationStep[]; startedAt: number; stepIndex: number; stepEndsAt: number };
type Phase = "ready" | "running" | "stopped-early" | "done";

// Guided meditation: observe, belly breathing, whole-body breathing. A soft chime and a light tap
// mark each step so the eyes can stay closed. A finished session saves itself.
export default function MeditateScreen() {
  const { request } = useAuth();
  const settings = useApi<{ settings: AttentionSettings }>("/v1/settings");
  const chime = useAudioPlayer(require("../../../assets/sounds/chime.wav"));
  const [phase, setPhase] = useState<Phase>("ready");
  const [run, setRun] = useState<Run | null>(null);
  const [now, setNow] = useState(Date.now());
  const [moodBefore, setMoodBefore] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [saved, setSaved] = useState<SaveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState("");
  const [moodAfter, setMoodAfter] = useState<number | null>(null);
  const [notesSaved, setNotesSaved] = useState(false);
  const runRef = useRef<Run | null>(null);

  // Leaving the screen mid-session stops the timer and lets the screen sleep again.
  useEffect(
    () => () => {
      runRef.current = null;
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    },
    [],
  );

  useEffect(() => {
    if (phase !== "running") return;

    const interval = setInterval(() => {
      const current = runRef.current;
      const time = Date.now();
      setNow(time);
      if (!current || time < current.stepEndsAt) return;

      const nextIndex = current.stepIndex + 1;
      signal();

      if (nextIndex >= current.steps.length) {
        finish(current, true);
        return;
      }

      const next = { ...current, stepIndex: nextIndex, stepEndsAt: time + current.steps[nextIndex].seconds * 1000 };
      runRef.current = next;
      setRun(next);
    }, 250);

    return () => clearInterval(interval);
    // Only restarts when the phase changes: the step state lives in runRef.
  }, [phase]);

  function signal() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
    try {
      chime.seekTo(0).catch(() => {});
      chime.play();
    } catch {
      // A missing sound is fine: the tap still marks the step.
    }
  }

  function start(steps: MeditationStep[]) {
    const time = Date.now();
    const current: Run = { steps, startedAt: time, stepIndex: 0, stepEndsAt: time + steps[0].seconds * 1000 };
    runRef.current = current;
    setRun(current);
    setNow(time);
    setError(null);
    setPhase("running");
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    signal();
  }

  function finish(current: Run, completed: boolean) {
    runRef.current = null;
    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    const seconds = Math.round((Date.now() - current.startedAt) / 1000);
    setElapsedSeconds(seconds);
    setRun(null);

    if (completed) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPhase("done");
      save(seconds);
    } else {
      setPhase("stopped-early");
    }
  }

  async function save(seconds: number) {
    setSaving(true);
    setError(null);

    try {
      const result = await request<SaveResult>("/v1/attention/sessions", {
        method: "POST",
        body: {
          sessionType: "meditation",
          durationMinutes: minutesFromSeconds(seconds),
          moodBefore,
          startedAt: new Date(Date.now() - seconds * 1000).toISOString(),
          completeTask: true,
        },
      });
      setSaved(result);
      setPhase("done");
    } catch (caught) {
      setError(errorMessage(caught, "That couldn't be saved. Try again."));
    } finally {
      setSaving(false);
    }
  }

  async function saveNotes() {
    if (!saved) return;
    setSaving(true);
    setError(null);

    try {
      await request(`/v1/attention/sessions/${saved.session.id}`, {
        method: "PATCH",
        body: { comments, moodAfter },
      });
      setNotesSaved(true);
    } catch (caught) {
      setError(errorMessage(caught, "That couldn't be saved. Try again."));
    } finally {
      setSaving(false);
    }
  }

  if (!settings.data) return <LoadingState error={settings.error} onRetry={settings.reload} />;

  const steps = meditationSteps(settings.data.settings);
  const totalSeconds = steps.reduce((sum, step) => sum + step.seconds, 0);

  if (phase === "running" && run) {
    const step = run.steps[run.stepIndex];
    const stepLeft = Math.max(0, Math.ceil((run.stepEndsAt - now) / 1000));
    const elapsed = Math.min(totalSeconds, (now - run.startedAt) / 1000);

    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.stepCount}>
          Step {run.stepIndex + 1} of {run.steps.length}
        </Text>
        <View style={styles.stage} accessibilityLiveRegion="polite">
          <Text style={styles.stepTitle}>{step.title}</Text>
          <Text style={styles.count}>
            {Math.floor(stepLeft / 60)}:{String(stepLeft % 60).padStart(2, "0")}
          </Text>
          <Body style={styles.prompt}>{step.prompt}</Body>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${(elapsed / Math.max(totalSeconds, 1)) * 100}%` }]} />
        </View>
        <Muted>When you notice your mind has wandered, gently come back. That moment of noticing is the practice.</Muted>
        <Button title="Stop" variant="secondary" onPress={() => finish(run, false)} />
      </ScrollView>
    );
  }

  if (phase === "stopped-early") {
    const canSave = elapsedSeconds >= MIN_SAVE_SECONDS;

    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <CardTitle eyebrow="Paused" title={canSave ? `${minutesFromSeconds(elapsedSeconds)} min practised` : "Stopped"} />
          <Body>{canSave ? ATTENTION_COPY.meditationEarly : "Come back whenever you're ready."}</Body>
          {canSave ? <Button title="Save it" onPress={() => save(elapsedSeconds)} busy={saving} /> : null}
          <Button title="Start again" variant="secondary" onPress={() => setPhase("ready")} />
          <ErrorText message={error} />
        </Card>
      </ScrollView>
    );
  }

  if (phase === "done") {
    return (
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <CardTitle eyebrow="Meditation" title={`${minutesFromSeconds(elapsedSeconds)} min`} />
          <Body>{ATTENTION_COPY.meditationDone}</Body>
          {saving && !saved ? <Muted>Saving…</Muted> : null}
          {saved ? <Muted>Saved{saved.completedTask ? ` · ticked off “${saved.completedTask}”` : ""}.</Muted> : null}
          <ErrorText message={error} />
          {!saved && error ? <Button title="Try saving again" onPress={() => save(elapsedSeconds)} busy={saving} /> : null}
        </Card>
        {saved ? (
          <Card>
            <MoodPicker label="Mood now (optional)" value={moodAfter} onChange={setMoodAfter} />
            <Field
              label={ATTENTION_COPY.commentsLabel}
              value={comments}
              onChangeText={setComments}
              placeholder="Where did your mind go? Could you come back to the breath?"
              multiline
              maxLength={4000}
            />
            {notesSaved ? <Muted>Notes saved.</Muted> : <Button title="Save notes" onPress={saveNotes} busy={saving} />}
            <Button
              title="Add reflection to journal"
              variant="secondary"
              onPress={() => router.replace({ pathname: "/attention/[id]", params: { id: String(saved.session.id), reflect: "1" } })}
            />
            <Button title="Done" variant="secondary" onPress={() => router.back()} />
          </Card>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Muted>{ATTENTION_COPY.meditationIntro}</Muted>
      <Card>
        {steps.map((step, index) => (
          <View key={step.key} style={{ gap: 2 }}>
            <Text style={styles.listTitle}>
              {index + 1}. {step.title} ·{" "}
              {step.seconds % 60 === 0 ? `${step.seconds / 60} min` : `${Math.floor(step.seconds / 60)}:${String(step.seconds % 60).padStart(2, "0")}`}
            </Text>
            <Muted>{step.prompt}</Muted>
          </View>
        ))}
      </Card>
      <MoodPicker label="Mood before (optional)" value={moodBefore} onChange={setMoodBefore} />
      <Button title={`Begin · ${Math.round(totalSeconds / 60)} min`} onPress={() => start(steps)} />
      <Muted>A soft chime and a light tap mark each step, so you can keep your eyes closed. Step lengths are in settings.</Muted>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 18, paddingBottom: 48 },
  stepCount: { textAlign: "center", fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: colors.label },
  stage: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 32,
    paddingHorizontal: 20,
    borderRadius: 28,
    backgroundColor: "#CDEBD5",
  },
  stepTitle: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, textAlign: "center" },
  count: { fontSize: 44, fontWeight: "600", color: "#2F7A55" },
  prompt: { textAlign: "center", color: colors.inkSoft },
  track: { height: 6, borderRadius: 3, backgroundColor: "rgba(2,44,34,0.08)", overflow: "hidden" },
  fill: { height: 6, backgroundColor: colors.accent },
  listTitle: { fontSize: 15, fontWeight: "600", color: colors.ink },
});
