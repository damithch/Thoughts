import Ionicons from "@expo/vector-icons/Ionicons";
import { randomUUID } from "expo-crypto";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { router } from "expo-router";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Button, Card, CardTitle, ErrorText, Eyebrow, Field, MoodPicker, Muted, formatClock } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colomboToday, formatShortDate, shiftDate } from "@/lib/dates";
import { colors, fonts, radius } from "@/lib/theme";
import type { SupportOverview, VoiceCaptureResponse, VoiceSaveResponse, VoiceTaskDraft } from "@/lib/types";
import { errorMessage } from "@/lib/use-api";
import { appendSegment, isQuietSpeechError, saveLabel, speechErrorMessage } from "@/lib/voice";

// Speak a thought: the phone turns speech into text (nothing is recorded or kept), the server's
// AI turns the text into a draft card plus any tasks and worries, and nothing is saved until the
// person reviews it and taps Save.

const KEEP_AWAKE_TAG = "voice-capture";
const MAX_LENGTH = 10_000;

// Keep the screen on while listening. Releasing a lock that was never taken throws, so track it.
let screenKeptOn = false;

function keepScreenOn() {
  if (screenKeptOn) return;
  screenKeptOn = true;
  activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {
    screenKeptOn = false;
  });
}

function releaseScreen() {
  if (!screenKeptOn) return;
  screenKeptOn = false;
  try {
    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
  } catch {
    // already released
  }
}

type Phase = "speak" | "reading" | "review";

export default function VoiceCaptureScreen() {
  const { request } = useAuth();
  const [phase, setPhase] = useState<Phase>("speak");
  const [text, setText] = useState("");
  const [capture, setCapture] = useState<VoiceCaptureResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function read() {
    const transcript = text.trim();

    if (!transcript) return;

    setPhase("reading");
    setError(null);

    try {
      setCapture(await request<VoiceCaptureResponse>("/v1/voice/capture", { method: "POST", body: { transcript } }));
      setPhase("review");
    } catch (caught) {
      setError(errorMessage(caught, "Couldn't read that right now. Your words are kept, so try again."));
      setPhase("speak");
    }
  }

  if (phase === "review" && capture) {
    return <Review capture={capture} onBack={() => setPhase("speak")} />;
  }

  return (
    <Speak
      text={text}
      setText={setText}
      reading={phase === "reading"}
      error={error}
      onDone={read}
    />
  );
}

// ── Speaking ─────────────────────────────────────────────────────────────────

function Speak({
  text,
  setText,
  reading,
  error,
  onDone,
}: {
  text: string;
  setText: (update: string | ((current: string) => string)) => void;
  reading: boolean;
  error: string | null;
  onDone: () => void;
}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [speechError, setSpeechError] = useState<string | null>(null);
  // What the person wants: keep listening until they tap pause or Done. Android stops after
  // pauses, so on "end" we start again while this is true.
  const wantListening = useRef(false);
  const restarts = useRef<number[]>([]);
  const interimRef = useRef("");
  const level = useRef(new Animated.Value(0)).current;

  function commitInterim() {
    const pending = interimRef.current;
    interimRef.current = "";
    setInterim("");
    if (pending) setText((current) => appendSegment(current, pending).slice(0, MAX_LENGTH));
  }

  useSpeechRecognitionEvent("start", () => setListening(true));

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript ?? "";

    if (event.isFinal) {
      interimRef.current = "";
      setInterim("");
      setText((current) => appendSegment(current, transcript).slice(0, MAX_LENGTH));
      restarts.current = [];
    } else {
      interimRef.current = transcript;
      setInterim(transcript);
    }
  });

  useSpeechRecognitionEvent("volumechange", (event) => {
    Animated.timing(level, {
      toValue: Math.max(0, Math.min(1, event.value / 10)),
      duration: 120,
      useNativeDriver: true,
    }).start();
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (event.error === "aborted" || isQuietSpeechError(event.error)) return;

    wantListening.current = false;
    setSpeechError(speechErrorMessage(event.error));
  });

  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    level.setValue(0);
    commitInterim();

    if (!wantListening.current) {
      releaseScreen();
      return;
    }

    // Guard against a start/stop loop (e.g. the recogniser ending straight away every time).
    const now = Date.now();
    restarts.current = [...restarts.current.filter((time) => now - time < 10_000), now];

    if (restarts.current.length > 5) {
      wantListening.current = false;
      releaseScreen();
      setSpeechError("Listening keeps stopping. Tap the mic to try again, or type below.");
      return;
    }

    setTimeout(() => {
      if (wantListening.current) beginRecognition();
    }, 250);
  });

  useEffect(
    () => () => {
      wantListening.current = false;
      ExpoSpeechRecognitionModule.abort();
      releaseScreen();
    },
    [],
  );

  function beginRecognition() {
    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      maxAlternatives: 1,
      continuous: true,
      // No audio file is ever written.
      recordingOptions: { persist: false },
      volumeChangeEventOptions: { enabled: true, intervalMillis: 150 },
      androidIntentOptions: { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 4000 },
    });
  }

  async function startListening() {
    setSpeechError(null);

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setSpeechError(speechErrorMessage("service-not-allowed"));
      return;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();

    if (!permission.granted) {
      setSpeechError(speechErrorMessage("not-allowed"));
      return;
    }

    wantListening.current = true;
    restarts.current = [];
    keepScreenOn();
    beginRecognition();
  }

  function stopListening() {
    wantListening.current = false;
    // stop() (not abort) so the last words still come through as a final result.
    ExpoSpeechRecognitionModule.stop();
  }

  function finish() {
    if (listening || wantListening.current) {
      stopListening();
      // Give the recogniser a moment to deliver the final words before reading.
      setTimeout(onDone, 700);
      return;
    }
    onDone();
  }

  const active = listening || wantListening.current;
  const hasWords = Boolean(text.trim() || interim.trim());
  const ringScale = level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.micArea}>
          <Animated.View style={[styles.micRing, active && { opacity: 1, transform: [{ scale: ringScale }] }]} />
          <Pressable
            onPress={active ? stopListening : startListening}
            disabled={reading}
            accessibilityRole="button"
            accessibilityLabel={active ? "Pause listening" : "Start listening"}
            style={({ pressed }) => [styles.mic, active && styles.micActive, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name={active ? "pause" : "mic"} size={40} color={active ? colors.action : colors.actionText} />
          </Pressable>
          <Text style={styles.micLabel}>
            {reading
              ? "Reading your words…"
              : active
                ? "Listening. Talk as long as you like."
                : hasWords
                  ? "Paused. Tap the mic to carry on."
                  : "Tap the mic and say what's on your mind."}
          </Text>
        </View>

        <ErrorText message={speechError ?? error} />

        <Card>
          <Eyebrow>Your words</Eyebrow>
          {active ? (
            <Text style={styles.transcript}>
              {text}
              {interim ? <Text style={styles.interim}>{text ? " " : ""}{interim}</Text> : null}
              {!text && !interim ? <Text style={styles.interim}>Listening…</Text> : null}
            </Text>
          ) : (
            <TextInput
              value={text}
              onChangeText={(value) => setText(value.slice(0, MAX_LENGTH))}
              multiline
              editable={!reading}
              placeholder="Your words appear here. You can also type, or fix anything it misheard."
              placeholderTextColor={colors.inkFaint}
              style={styles.transcriptInput}
            />
          )}
          <Muted>Only the text is sent to your server's AI. No audio is recorded or kept.</Muted>
        </Card>

        <Button title={reading ? "Reading…" : "Done, make my card"} onPress={finish} busy={reading} disabled={!hasWords} />
        {text && !active && !reading ? (
          <Button
            title="Clear and start over"
            variant="secondary"
            onPress={() =>
              Alert.alert("Clear your words?", "This removes what you've said so far.", [
                { text: "Keep", style: "cancel" },
                { text: "Clear", style: "destructive", onPress: () => setText("") },
              ])
            }
          />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Review ───────────────────────────────────────────────────────────────────

type TaskChoice = VoiceTaskDraft & { keep: boolean };

function Review({ capture, onBack }: { capture: VoiceCaptureResponse; onBack: () => void }) {
  const { request } = useAuth();
  const { draft, worryParking } = capture;
  const today = colomboToday();
  const [requestId] = useState(() => randomUUID());
  const [title, setTitle] = useState(draft.thought.title);
  const [category, setCategory] = useState(draft.thought.category);
  const [mood, setMood] = useState<number | null>(draft.thought.mood);
  const [summary, setSummary] = useState(draft.thought.summary);
  const [body, setBody] = useState(draft.thought.body);
  const [tags, setTags] = useState(draft.thought.tags.join(", "));
  const [tasks, setTasks] = useState<TaskChoice[]>(draft.tasks.map((task) => ({ ...task, keep: true })));
  // Parking a worry is a choice, so these start unticked.
  const [worries, setWorries] = useState(draft.worries.map((worry) => ({ text: worry, keep: false })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keptTasks = tasks.filter((task) => task.keep && task.title.trim());
  const keptWorries = worryParking ? worries.filter((worry) => worry.keep && worry.text.trim()) : [];

  function updateTask(index: number, patch: Partial<TaskChoice>) {
    setTasks((current) => current.map((task, at) => (at === index ? { ...task, ...patch } : task)));
  }

  async function save() {
    if (!title.trim() || !category.trim() || !mood || !summary.trim()) {
      setError("Add a title, category, mood and summary.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await request<VoiceSaveResponse>("/v1/voice/save", {
        method: "POST",
        body: {
          requestId,
          thought: {
            title: title.trim(),
            category: category.trim(),
            mood,
            summary: summary.trim(),
            body: body.trim(),
            tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
            linkedBookIdeaId: draft.thought.linkedBookIdeaId,
            insightReflection: draft.thought.insightReflection,
          },
          tasks: keptTasks.map(({ title: taskTitle, date, priority }) => ({ title: taskTitle.trim(), date, priority })),
          worries: keptWorries.map((worry) => worry.text.trim()),
        },
      });

      // A very low entry may start (or continue) a rough patch: offer support straight away.
      if (mood <= 2) {
        const support = await request<SupportOverview>("/v1/support").catch(() => null);

        if (support?.status.active) {
          router.replace("/support");
          return;
        }
      }

      router.back();

      const added = [
        result.tasksCreated > 0 ? `added ${result.tasksCreated} task${result.tasksCreated === 1 ? "" : "s"}` : null,
        result.worriesParked > 0
          ? `parked ${result.worriesParked} worr${result.worriesParked === 1 ? "y" : "ies"} for thinking time`
          : null,
      ].filter(Boolean);

      if (added.length > 0) Alert.alert("Saved", `Thought saved, ${added.join(" and ")}.`);
    } catch (caught) {
      setError(errorMessage(caught, "Couldn't save. Your draft is still here, so try again."));
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Muted>Here's what the AI made of it. Change anything, then save. Nothing is saved yet.</Muted>

        <Card>
          <CardTitle eyebrow="Thought" title="Your card" />
          <Field label="Title" value={title} onChangeText={setTitle} />
          <Field label="Category" value={category} onChangeText={setCategory} />
          <MoodPicker value={mood} onChange={setMood} />
          <Field label="Card summary" value={summary} onChangeText={setSummary} multiline />
          <Field label="Your words" value={body} onChangeText={setBody} multiline style={{ minHeight: 160 }} />
          <Field label="Tags" value={tags} onChangeText={setTags} autoCapitalize="none" hint="Separate tags with commas." />
        </Card>

        {tasks.length > 0 ? (
          <Card>
            <CardTitle eyebrow="Tasks" title="Things you mentioned doing" />
            {tasks.map((task, index) => (
              <TaskRow key={index} task={task} today={today} onChange={(patch) => updateTask(index, patch)} />
            ))}
            <Muted>Ticked tasks are added with the tag &quot;voice&quot;.</Muted>
          </Card>
        ) : null}

        {worries.length > 0 ? (
          <Card>
            <CardTitle eyebrow="Worries" title="Park for later?" />
            {worryParking ? (
              <>
                <Muted>
                  Tick any you'd like to set aside
                  {worryParking.thinkingTime ? ` until thinking time (${formatClock(worryParking.thinkingTime)})` : " for thinking time"}.
                  They stay in your words either way.
                </Muted>
                {worries.map((worry, index) => (
                  <CheckRow
                    key={index}
                    checked={worry.keep}
                    onToggle={() =>
                      setWorries((current) => current.map((item, at) => (at === index ? { ...item, keep: !item.keep } : item)))
                    }
                  >
                    <Text style={styles.rowText}>{worry.text}</Text>
                  </CheckRow>
                ))}
              </>
            ) : (
              <>
                {worries.map((worry, index) => (
                  <Text key={index} style={styles.worryText}>• {worry.text}</Text>
                ))}
                <Muted>To park worries for a set thinking time, start a worry postponement (More → Worry postponement).</Muted>
              </>
            )}
          </Card>
        ) : null}

        <ErrorText message={error} />
        <Button title={saveLabel(keptTasks.length, keptWorries.length)} onPress={save} busy={busy} />
        <Button title="Back to my words" variant="secondary" onPress={onBack} disabled={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CheckRow({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <View style={styles.checkRow}>
      <Pressable
        onPress={onToggle}
        hitSlop={10}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        style={styles.checkButton}
      >
        <Ionicons name={checked ? "checkbox" : "square-outline"} size={24} color={checked ? colors.accent : colors.inkFaint} />
      </Pressable>
      <View style={{ flex: 1, gap: 8 }}>{children}</View>
    </View>
  );
}

function TaskRow({ task, today, onChange }: { task: TaskChoice; today: string; onChange: (patch: Partial<TaskChoice>) => void }) {
  const tomorrow = shiftDate(today, 1);
  const options: { label: string; date: string | null }[] = [
    { label: "Today", date: today },
    { label: "Tomorrow", date: tomorrow },
    { label: "No date", date: null },
  ];

  if (task.date && task.date !== today && task.date !== tomorrow) {
    options.splice(2, 0, { label: formatShortDate(task.date), date: task.date });
  }

  return (
    <CheckRow checked={task.keep} onToggle={() => onChange({ keep: !task.keep })}>
      <TextInput
        value={task.title}
        onChangeText={(value) => onChange({ title: value })}
        style={[styles.taskInput, !task.keep && { opacity: 0.5 }]}
      />
      <View style={styles.chips}>
        {options.map((option) => {
          const selected = option.date === task.date;
          return (
            <Pressable
              key={option.label}
              onPress={() => onChange({ date: option.date, keep: true })}
              style={[styles.chip, selected && styles.chipSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
        {task.priority === "high" ? <Text style={styles.priority}>High priority</Text> : null}
      </View>
    </CheckRow>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  micArea: { alignItems: "center", gap: 14, paddingVertical: 16 },
  micRing: {
    position: "absolute",
    top: 16,
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: "rgba(4,120,87,0.18)",
    opacity: 0,
  },
  mic: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.action,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  micActive: { backgroundColor: colors.card, borderWidth: 3, borderColor: colors.accent },
  micLabel: { color: colors.inkSoft, fontSize: 15, textAlign: "center" },
  transcript: { fontFamily: fonts.display, fontSize: 18, lineHeight: 28, color: colors.ink, minHeight: 120 },
  interim: { color: colors.inkFaint },
  transcriptInput: {
    fontFamily: fonts.display,
    fontSize: 18,
    lineHeight: 28,
    color: colors.ink,
    minHeight: 140,
    textAlignVertical: "top",
    backgroundColor: colors.field,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  checkRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  checkButton: { paddingTop: 10 },
  rowText: { fontSize: 15, color: colors.ink, lineHeight: 22, paddingTop: 10 },
  worryText: { fontSize: 15, color: colors.ink, lineHeight: 22 },
  taskInput: {
    backgroundColor: colors.field,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.field,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: { backgroundColor: colors.action, borderColor: colors.action },
  chipText: { fontSize: 12, color: colors.action },
  chipTextSelected: { color: colors.actionText },
  priority: { fontSize: 12, color: colors.high.fg },
});

