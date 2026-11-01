import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet } from "react-native";

import { AnchorPicker, FocusSlider, MinutesStepper } from "@/components/attention/fields";
import {
  Button,
  Card,
  CardTitle,
  DateStepper,
  ErrorText,
  Field,
  LoadingState,
  MoodPicker,
  Muted,
} from "@/components/ui";
import {
  ATTENTION_COPY,
  describeFocusChange,
  sessionTypeLabel,
  type AttentionAnchor,
  type AttentionSession,
} from "@/lib/attention";
import { useAuth } from "@/lib/auth";
import { colomboToday } from "@/lib/dates";
import { errorMessage } from "@/lib/use-api";

export default function AttentionSessionScreen() {
  const params = useLocalSearchParams<{ id: string; reflect?: string }>();
  const { request } = useAuth();
  const [session, setSession] = useState<AttentionSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [taskName, setTaskName] = useState("");
  const [date, setDate] = useState<string | null>(colomboToday());
  const [minutes, setMinutes] = useState(5);
  const [before, setBefore] = useState<number | null>(null);
  const [after, setAfter] = useState<number | null>(null);
  const [anchors, setAnchors] = useState<AttentionAnchor[]>([]);
  const [moodBefore, setMoodBefore] = useState<number | null>(null);
  const [moodAfter, setMoodAfter] = useState<number | null>(null);
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [reflectMood, setReflectMood] = useState<number | null>(null);
  const [reflectText, setReflectText] = useState("");
  const [reflecting, setReflecting] = useState(false);
  const [reflectResult, setReflectResult] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function fill(value: AttentionSession) {
    setSession(value);
    setTaskName(value.task_name);
    setDate(value.entry_date);
    setMinutes(value.duration_minutes);
    setBefore(value.self_focus_before);
    setAfter(value.self_focus_after);
    setAnchors(value.anchors_used ?? []);
    setMoodBefore(value.mood_before);
    setMoodAfter(value.mood_after);
    setComments(value.comments ?? "");
    setReflectMood(value.mood_after ?? value.mood_before);
    setReflectText(value.comments ?? "");
  }

  async function load() {
    try {
      const result = await request<{ session: AttentionSession }>(`/v1/attention/sessions/${params.id}`);
      fill(result.session);
    } catch (caught) {
      setLoadError(errorMessage(caught));
    }
  }

  useEffect(() => {
    load();
    // Load once per session id.
  }, [params.id]);

  if (!session) return <LoadingState error={loadError} onRetry={load} />;

  const isMundane = session.session_type === "mundane_task";
  const change = describeFocusChange(session.task_focus_before, session.task_focus_after);

  async function save() {
    setSaving(true);
    setError(null);
    setSavedNote(null);

    try {
      const result = await request<{ session: AttentionSession }>(`/v1/attention/sessions/${params.id}`, {
        method: "PATCH",
        body: {
          taskName,
          entryDate: date,
          durationMinutes: minutes,
          moodBefore,
          moodAfter,
          comments,
          ...(isMundane ? { selfFocusBefore: before, selfFocusAfter: after, anchorsUsed: anchors } : {}),
        },
      });
      fill(result.session);
      setSavedNote("Changes saved.");
    } catch (caught) {
      setError(errorMessage(caught, "That couldn't be saved. Try again."));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Delete this session?", session?.task_name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await request(`/v1/attention/sessions/${params.id}`, { method: "DELETE" });
            router.back();
          } catch (caught) {
            Alert.alert("Couldn't delete", errorMessage(caught));
          }
        },
      },
    ]);
  }

  async function reflect() {
    if (reflectMood === null) {
      setReflectResult("Pick a mood for the journal entry first.");
      return;
    }

    setReflecting(true);
    setReflectResult(null);

    try {
      await request(`/v1/attention/sessions/${params.id}/reflection`, {
        method: "POST",
        body: { mood: reflectMood, text: reflectText },
      });
      setReflectResult(`Saved to your journal, tagged #${ATTENTION_COPY.reflectionTag}.`);
    } catch (caught) {
      setReflectResult(errorMessage(caught, "That couldn't be saved. Try again."));
    } finally {
      setReflecting(false);
    }
  }

  const reflectionCard = (
    <Card>
      <CardTitle eyebrow="Journal" title="Add reflection" />
      <Muted>Saves this session as a journal thought. You can edit the text first.</Muted>
      <MoodPicker value={reflectMood} onChange={setReflectMood} />
      <Field
        label="Reflection"
        value={reflectText}
        onChangeText={setReflectText}
        placeholder={ATTENTION_COPY.commentsPlaceholder}
        multiline
        maxLength={4000}
      />
      {reflectResult ? <Muted>{reflectResult}</Muted> : null}
      <Button title="Save to journal" onPress={reflect} busy={reflecting} />
    </Card>
  );

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: sessionTypeLabel(session.session_type) }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" scrollEnabled={!dragging}>
        {params.reflect === "1" ? reflectionCard : null}

        <Card>
          <CardTitle eyebrow={sessionTypeLabel(session.session_type)} title={session.task_name} />
          <Muted>
            {session.duration_minutes} min{change ? ` · ${change}` : ""}
          </Muted>
          {isMundane ? (
            <Field label="Everyday task" value={taskName} onChangeText={setTaskName} maxLength={120} />
          ) : null}
          <DateStepper
            label="Day"
            value={date}
            // Sessions can't be in the future: stepping past today stays on today.
            onChange={(value) => setDate(value && value > colomboToday() ? colomboToday() : value)}
            fallback={colomboToday()}
          />
          <MinutesStepper value={minutes} onChange={setMinutes} />
        </Card>

        {isMundane ? (
          <Card>
            <FocusSlider label={ATTENTION_COPY.beforeQuestion} value={before} onChange={setBefore} onDragChange={setDragging} />
            <AnchorPicker value={anchors} onChange={setAnchors} />
            <FocusSlider label={ATTENTION_COPY.afterQuestion} value={after} onChange={setAfter} onDragChange={setDragging} />
          </Card>
        ) : (
          <Card>
            <MoodPicker label="Mood before" value={moodBefore} onChange={setMoodBefore} />
            <MoodPicker label="Mood after" value={moodAfter} onChange={setMoodAfter} />
          </Card>
        )}

        <Card>
          <Field
            label={ATTENTION_COPY.commentsLabel}
            value={comments}
            onChangeText={setComments}
            placeholder={ATTENTION_COPY.commentsPlaceholder}
            multiline
            maxLength={4000}
          />
          <ErrorText message={error} />
          {savedNote ? <Muted>{savedNote}</Muted> : null}
          <Button title="Save changes" onPress={save} busy={saving} />
          <Button title="Delete session" variant="danger" onPress={confirmDelete} />
        </Card>

        {params.reflect === "1" ? null : reflectionCard}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
});
