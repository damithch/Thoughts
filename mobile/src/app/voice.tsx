import Ionicons from "@expo/vector-icons/Ionicons";
import { randomUUID } from "expo-crypto";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from "expo-audio";
import { File } from "expo-file-system";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { router } from "expo-router";
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
import type {
  SupportOverview,
  VoiceAudioCaptureResponse,
  VoiceCaptureResponse,
  VoiceSaveResponse,
  VoiceTaskDraft,
} from "@/lib/types";
import { errorMessage } from "@/lib/use-api";
import {
  VOICE_AUDIO_MIME_TYPE,
  VOICE_MAX_MS,
  formatElapsed,
  meteringToLevel,
  recordingHint,
  saveLabel,
} from "@/lib/voice";

// Speak a thought: the phone records what you say, Gemini (via your server) hears the recording
// and returns what it heard plus a draft card, tasks and worries, and nothing is saved until the
// person reviews it and taps Save. The recording stays on the phone until it has been read, so a
// failed upload never loses anything; then it is deleted. The server never stores audio.

const KEEP_AWAKE_TAG = "voice-capture";
const MAX_LENGTH = 10_000;

// AAC (ADTS) at 16 kHz mono: what Gemini hears anyway, and about 240 KB a minute.
const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.LOW_QUALITY,
  extension: ".aac",
  sampleRate: 16_000,
  numberOfChannels: 1,
  bitRate: 32_000,
  isMeteringEnabled: true,
  android: {
    extension: ".aac",
    sampleRate: 16_000,
    outputFormat: "aac_adts",
    audioEncoder: "aac",
  },
};

// Keep the screen on while recording. Releasing a lock that was never taken throws, so track it.
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

function deleteRecording(uri: string | null) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone, or the cache was cleared.
  }
}

type Recording = { uri: string; durationMs: number };
type Phase = "record" | "type" | "sending" | "review";

export default function VoiceCaptureScreen() {
  const { request } = useAuth();
  const [phase, setPhase] = useState<Phase>("record");
  const [text, setText] = useState("");
  const [capture, setCapture] = useState<VoiceCaptureResponse | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  // A recording that hasn't been read yet (kept for Try again after a failure).
  const [pending, setPending] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Leaving the screen with an unread recording deletes it.
  const pendingRef = useRef<Recording | null>(null);
  pendingRef.current = pending;
  useEffect(() => () => deleteRecording(pendingRef.current?.uri ?? null), []);

  async function sendRecording(recording: Recording) {
    setPending(recording);
    setPhase("sending");
    setError(null);

    let audio: string;

    try {
      audio = await new File(recording.uri).base64();
    } catch {
      setError("Couldn't read the recording on this phone. Try recording again.");
      setPending(null);
      setPhase("record");
      return;
    }

    try {
      const result = await request<VoiceAudioCaptureResponse>("/v1/voice/capture-audio", {
        method: "POST",
        body: { audio, mimeType: VOICE_AUDIO_MIME_TYPE, durationMs: recording.durationMs },
      });
      deleteRecording(recording.uri);
      setPending(null);
      setHeard(result.transcript);
      setText(result.transcript.slice(0, MAX_LENGTH));
      setCapture(result);
      setPhase("review");
    } catch (caught) {
      setError(errorMessage(caught, "Couldn't read that right now. Your recording is kept, so try again."));
      setPhase("record");
    }
  }

  function discardPending() {
    deleteRecording(pending?.uri ?? null);
    setPending(null);
    setError(null);
  }

  async function sendText() {
    const transcript = text.trim();

    if (!transcript) return;

    setPhase("sending");
    setError(null);

    try {
      setCapture(await request<VoiceCaptureResponse>("/v1/voice/capture", { method: "POST", body: { transcript } }));
      setHeard(null);
      setPhase("review");
    } catch (caught) {
      setError(errorMessage(caught, "Couldn't read that right now. Your words are kept, so try again."));
      setPhase("type");
    }
  }

  if (phase === "review" && capture) {
    return (
      <Review
        capture={capture}
        heard={heard}
        onFixWords={() => {
          setError(null);
          setPhase("type");
        }}
        onStartOver={() => {
          setCapture(null);
          setHeard(null);
          setText("");
          setError(null);
          setPhase("record");
        }}
      />
    );
  }

  if (phase === "type") {
    return (
      <TypeWords
        text={text}
        setText={setText}
        error={error}
        onSend={sendText}
        onRecordInstead={() => {
          setError(null);
          setPhase("record");
        }}
      />
    );
  }

  return (
    <Record
      sending={phase === "sending"}
      error={error}
      pending={pending}
      onRecorded={sendRecording}
      onRetry={() => pending && sendRecording(pending)}
      onDiscardPending={discardPending}
      onTypeInstead={() => {
        setError(null);
        setPhase("type");
      }}
    />
  );
}

// ── Recording ────────────────────────────────────────────────────────────────

function Record({
  sending,
  error,
  pending,
  onRecorded,
  onRetry,
  onDiscardPending,
  onTypeInstead,
}: {
  sending: boolean;
  error: string | null;
  pending: Recording | null;
  onRecorded: (recording: Recording) => void;
  onRetry: () => void;
  onDiscardPending: () => void;
  onTypeInstead: () => void;
}) {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, 150);
  const [started, setStarted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const stopping = useRef(false);
  const level = useRef(new Animated.Value(0)).current;
  const recording = state.isRecording;

  useEffect(() => {
    Animated.timing(level, {
      toValue: recording ? meteringToLevel(state.metering) : 0,
      duration: 140,
      useNativeDriver: true,
    }).start();
  }, [level, recording, state.metering]);

  // Stop by itself at the limit, keeping everything said so far.
  useEffect(() => {
    if (recording && state.durationMillis >= VOICE_MAX_MS) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, state.durationMillis]);

  // Leaving the screen mid-recording throws the unfinished clip away. (A finished clip has
  // already been handed to the parent, which owns and deletes it.)
  const inProgress = useRef(false);
  inProgress.current = started;
  useEffect(
    () => () => {
      releaseScreen();
      if (!inProgress.current || stopping.current) return;
      const uri = recorder.uri;
      recorder
        .stop()
        .then(() => deleteRecording(recorder.uri ?? uri))
        .catch(() => deleteRecording(uri));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function start() {
    setMicError(null);

    try {
      const permission = await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        setMicError("Thoughts needs microphone permission to listen. You can allow it in the phone's settings, or type instead.");
        return;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setStarted(true);
      keepScreenOn();
    } catch {
      setMicError("The microphone couldn't be started. Another app may be using it. Try again, or type instead.");
    }
  }

  function togglePause() {
    if (recording) {
      recorder.pause();
      releaseScreen();
    } else {
      recorder.record();
      keepScreenOn();
    }
  }

  async function finish() {
    if (stopping.current) return;
    stopping.current = true;

    const durationMs = recorder.getStatus().durationMillis;

    try {
      await recorder.stop();
    } catch {
      // Stopping an already-stopped recorder is fine; the file is what matters.
    }

    releaseScreen();
    setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    setStarted(false);
    stopping.current = false;

    if (!recorder.uri || durationMs < 1000) {
      deleteRecording(recorder.uri);
      setMicError("That was too short to hear anything. Tap the mic and try again.");
      return;
    }

    onRecorded({ uri: recorder.uri, durationMs });
  }

  function discard() {
    Alert.alert("Throw this recording away?", "Nothing has been sent yet.", [
      { text: "Keep recording", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: async () => {
          stopping.current = true;
          await recorder.stop().catch(() => {});
          deleteRecording(recorder.uri);
          releaseScreen();
          setStarted(false);
          stopping.current = false;
        },
      },
    ]);
  }

  const ringScale = level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });

  if (sending) {
    return (
      <View style={[styles.content, styles.centered]}>
        <View style={[styles.mic, styles.micActive]}>
          <Ionicons name="sparkles" size={36} color={colors.action} />
        </View>
        <Text style={styles.micLabel}>Gemini is listening to your recording…</Text>
        <Muted>A few seconds for a short entry, up to about half a minute for a long one.</Muted>
      </View>
    );
  }

  if (pending) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <ErrorText message={error} />
        <Card>
          <Eyebrow>Your recording ({formatElapsed(pending.durationMs)})</Eyebrow>
          <Muted>It's still on your phone, so nothing is lost.</Muted>
        </Card>
        <Button title="Try again" onPress={onRetry} />
        <Button
          title="Discard and record again"
          variant="secondary"
          onPress={() =>
            Alert.alert("Discard this recording?", "It hasn't been read yet.", [
              { text: "Keep", style: "cancel" },
              { text: "Discard", style: "destructive", onPress: onDiscardPending },
            ])
          }
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.micArea}>
        <Animated.View style={[styles.micRing, recording && { opacity: 1, transform: [{ scale: ringScale }] }]} />
        <Pressable
          onPress={started ? togglePause : start}
          accessibilityRole="button"
          accessibilityLabel={!started ? "Start recording" : recording ? "Pause recording" : "Resume recording"}
          style={({ pressed }) => [styles.mic, recording && styles.micActive, pressed && { opacity: 0.85 }]}
        >
          <Ionicons
            name={recording ? "pause" : "mic"}
            size={40}
            color={recording ? colors.action : colors.actionText}
          />
        </Pressable>
        {started ? <Text style={styles.timer}>{formatElapsed(state.durationMillis)}</Text> : null}
        <Text style={styles.micLabel}>
          {recordingHint({ started, recording, elapsedMs: state.durationMillis })}
        </Text>
      </View>

      <ErrorText message={micError ?? error} />

      {started ? (
        <>
          <Button title="Done, make my card" onPress={() => void finish()} />
          <Button title="Discard" variant="secondary" onPress={discard} />
        </>
      ) : (
        <Button title="Type instead" variant="secondary" onPress={onTypeInstead} />
      )}

      <Muted>
        Gemini hears your recording through your Thoughts server and writes out what you said, in
        whatever language you speak. The audio is deleted from your phone once it's read and is never
        stored on the server.
      </Muted>
    </ScrollView>
  );
}

// ── Typing (or fixing what Gemini heard) ─────────────────────────────────────

function TypeWords({
  text,
  setText,
  error,
  onSend,
  onRecordInstead,
}: {
  text: string;
  setText: (value: string) => void;
  error: string | null;
  onSend: () => void;
  onRecordInstead: () => void;
}) {
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ErrorText message={error} />
        <Card>
          <Eyebrow>Your words</Eyebrow>
          <TextInput
            value={text}
            onChangeText={(value) => setText(value.slice(0, MAX_LENGTH))}
            multiline
            autoFocus
            placeholder="Type what's on your mind, or fix anything that was misheard."
            placeholderTextColor={colors.inkFaint}
            style={styles.transcriptInput}
          />
        </Card>
        <Button title="Make my card" onPress={onSend} disabled={!text.trim()} />
        <Button title="Record instead" variant="secondary" onPress={onRecordInstead} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Review ───────────────────────────────────────────────────────────────────

type TaskChoice = VoiceTaskDraft & { keep: boolean };

function Review({
  capture,
  heard,
  onFixWords,
  onStartOver,
}: {
  capture: VoiceCaptureResponse;
  // What Gemini heard in the recording (null when the words were typed).
  heard: string | null;
  onFixWords: () => void;
  onStartOver: () => void;
}) {
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

        {heard ? (
          <Card>
            <Eyebrow>What Gemini heard</Eyebrow>
            <Text style={styles.heard}>{heard}</Text>
            <Muted>If it misheard something important, tap "Fix the words" to correct it and redo the card.</Muted>
          </Card>
        ) : null}

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
        <Button title="Fix the words" variant="secondary" onPress={onFixWords} disabled={busy} />
        <Button title="Start over" variant="secondary" onPress={onStartOver} disabled={busy} />
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
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  timer: { fontFamily: fonts.display, fontSize: 28, color: colors.ink, fontVariant: ["tabular-nums"] },
  heard: { fontFamily: fonts.display, fontSize: 17, lineHeight: 26, color: colors.ink },
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

