import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button, Card, CardTitle, ErrorText, Eyebrow, Field, LoadingState, Muted } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatTimestamp } from "@/lib/dates";
import { colors } from "@/lib/theme";
import type { SessionNote, SessionNotesResponse } from "@/lib/types";
import { errorMessage, useApi } from "@/lib/use-api";

const SOURCE_LABELS: Record<SessionNote["source"], string> = {
  manual: "Added by you",
  thought: "From a thought",
  voice: "Voice capture",
  claude: "Added by Claude",
};

// "For my next session": things to bring up with your therapist. Notes arrive from here, from
// a thought ("Bring to session"), from voice capture and from Claude; tick them off once discussed.
export default function SessionScreen() {
  const { request } = useAuth();
  const { data, setData, error, reload, refresh, refreshing } = useApi<SessionNotesResponse>("/v1/session-notes");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!data) return <LoadingState error={error} onRetry={reload} />;

  const open = data.notes.filter((note) => !note.discussed_at);
  const discussed = data.notes.filter((note) => note.discussed_at);

  async function add() {
    const content = text.trim();
    if (!content) return;

    setBusy(true);
    setProblem(null);

    try {
      await request("/v1/session-notes", { method: "POST", body: { content } });
      setText("");
      await reload();
    } catch (caught) {
      setProblem(errorMessage(caught, "Couldn't add that. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function setDiscussed(note: SessionNote, value: boolean) {
    // Move it straight away; put the list back if the server says no.
    const before = data;
    setData({
      notes: data!.notes.map((item) =>
        item.id === note.id ? { ...item, discussed_at: value ? new Date().toISOString() : null } : item,
      ),
    });

    try {
      await request(`/v1/session-notes/${note.id}`, { method: "PATCH", body: { discussed: value } });
    } catch (caught) {
      setData(before);
      setProblem(errorMessage(caught, "Couldn't update that note."));
    }
  }

  function remove(note: SessionNote) {
    Alert.alert("Remove this note?", note.content, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await request(`/v1/session-notes/${note.id}`, { method: "DELETE" });
            setData({ notes: data!.notes.filter((item) => item.id !== note.id) });
          } catch (caught) {
            setProblem(errorMessage(caught, "Couldn't remove that note."));
          }
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.action]} />}
      >
        <Card>
          <CardTitle eyebrow="Add" title="What do you want to bring up?" />
          <Field label="Note" value={text} onChangeText={(value) => setText(value.slice(0, 500))} multiline />
          <ErrorText message={problem} />
          <Button title="Add to list" onPress={add} busy={busy} disabled={!text.trim()} />
        </Card>

        <Eyebrow>{open.length === 0 ? "Nothing waiting" : `To bring up · ${open.length}`}</Eyebrow>
        {open.length === 0 ? (
          <Muted>When something comes up that you want to talk through, add it here so it isn't lost by session day.</Muted>
        ) : (
          open.map((note) => (
            <NoteRow key={note.id} note={note} onToggle={() => setDiscussed(note, true)} onRemove={() => remove(note)} />
          ))
        )}

        {discussed.length > 0 ? (
          <>
            <Eyebrow>Discussed</Eyebrow>
            {discussed.slice(0, 30).map((note) => (
              <NoteRow key={note.id} note={note} onToggle={() => setDiscussed(note, false)} onRemove={() => remove(note)} />
            ))}
          </>
        ) : null}

        <Muted>The list is printed first in the therapy report (More → Export reports).</Muted>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function NoteRow({ note, onToggle, onRemove }: { note: SessionNote; onToggle: () => void; onRemove: () => void }) {
  const done = Boolean(note.discussed_at);

  return (
    <View style={styles.note}>
      <Pressable
        onPress={onToggle}
        hitSlop={10}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? "Put back on the list" : "Mark as discussed"}
        style={styles.check}
      >
        <Ionicons name={done ? "checkbox" : "square-outline"} size={24} color={done ? colors.accent : colors.inkFaint} />
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.text, done && styles.textDone]}>{note.content}</Text>
        <Text style={styles.meta}>
          {SOURCE_LABELS[note.source] ?? SOURCE_LABELS.manual} · {formatTimestamp(note.created_at)}
        </Text>
      </View>
      <Pressable onPress={onRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove note" style={styles.check}>
        <Ionicons name="close" size={20} color={colors.inkFaint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  check: { minWidth: 32, minHeight: 32, alignItems: "center", justifyContent: "center" },
  text: { fontSize: 15, lineHeight: 22, color: colors.ink },
  textDone: { color: colors.inkFaint, textDecorationLine: "line-through" },
  meta: { fontSize: 12, color: colors.inkFaint },
});
