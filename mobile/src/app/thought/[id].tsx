import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { ThoughtForm } from "@/components/thought-form";
import { Button, Card, Centered, ErrorText, Eyebrow, Tag } from "@/components/ui";
import { ApiError, useAuth } from "@/lib/auth";
import { formatTimestamp } from "@/lib/dates";
import { colors, fonts } from "@/lib/theme";
import type { Thought } from "@/lib/types";

export default function ThoughtScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { request } = useAuth();
  const [thought, setThought] = useState<Thought | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hiding, setHiding] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await request<{ thought: Thought }>(`/v1/thoughts/${id}`);
      setThought(result.thought);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't load this thought.");
    }
  }, [id, request]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove() {
    setDeleting(true);

    try {
      await request(`/v1/thoughts/${id}`, { method: "DELETE" });
      router.back();
    } catch (caught) {
      setDeleting(false);
      Alert.alert("Couldn't delete", caught instanceof ApiError ? caught.message : "Try again.");
    }
  }

  async function toggleHidden() {
    if (!thought) return;
    setHiding(true);

    try {
      const result = await request<{ thought: Thought }>(`/v1/thoughts/${id}`, {
        method: "PATCH",
        body: { isHidden: !thought.is_hidden },
      });
      setThought(result.thought);
    } catch (caught) {
      Alert.alert("Couldn't change visibility", caught instanceof ApiError ? caught.message : "Try again.");
    } finally {
      setHiding(false);
    }
  }

  if (!thought) {
    return (
      <Centered>
        {error ? <ErrorText message={error} /> : <ActivityIndicator color={colors.action} size="large" />}
      </Centered>
    );
  }

  if (editing) {
    return (
      <>
        <Stack.Screen options={{ title: "Edit thought" }} />
        <ThoughtForm
          initial={thought}
          submitLabel="Save changes"
          onSubmit={async (input) => {
            const result = await request<{ thought: Thought }>(`/v1/thoughts/${id}`, { method: "PATCH", body: input });
            setThought(result.thought);
            setEditing(false);
          }}
        />
      </>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <View style={styles.top}>
          <Eyebrow>{thought.category}</Eyebrow>
          <Text style={styles.mood}>Mood {thought.mood}/10</Text>
        </View>
        <Text style={styles.title}>{thought.title}</Text>
        <Text style={styles.summary}>{thought.summary}</Text>
        {thought.body ? <Text style={styles.body}>{thought.body}</Text> : null}
        {thought.tags.length + thought.concept_tags.length > 0 ? (
          <View style={styles.tags}>
            {thought.tags.map((tag) => (
              <Tag key={`t-${tag}`}>{tag}</Tag>
            ))}
            {thought.concept_tags.map((tag) => (
              <Tag key={`c-${tag}`}>◆ {tag}</Tag>
            ))}
          </View>
        ) : null}
        {thought.linked_idea_text ? (
          <View style={styles.linked}>
            <Eyebrow>Linked idea · {thought.linked_book_title}</Eyebrow>
            <Text style={styles.body}>{thought.linked_idea_text}</Text>
            {thought.insight_reflection ? <Text style={styles.reflection}>{thought.insight_reflection}</Text> : null}
          </View>
        ) : null}
        <Text style={styles.date}>
          {formatTimestamp(thought.created_at)}
          {thought.updated_at !== thought.created_at ? ` · edited ${formatTimestamp(thought.updated_at)}` : ""}
        </Text>
      </Card>

      {thought.is_hidden ? <Text style={styles.hiddenNote}>Hidden from your journal and AI search.</Text> : null}
      <Button title="Edit" onPress={() => setEditing(true)} />
      <Button
        title={thought.is_hidden ? "Unhide" : "Hide"}
        variant="secondary"
        busy={hiding}
        onPress={toggleHidden}
      />
      <Button
        title="Delete"
        variant="danger"
        busy={deleting}
        onPress={() =>
          Alert.alert("Delete this thought?", "This can't be undone.", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: remove },
          ])
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  top: { flexDirection: "row", justifyContent: "space-between" },
  mood: { fontSize: 12, color: colors.inkSoft },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.ink },
  summary: { fontSize: 16, lineHeight: 24, color: colors.ink },
  body: { fontSize: 15, lineHeight: 24, color: colors.inkSoft },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  linked: { backgroundColor: colors.cardSoft, borderRadius: 16, padding: 14, gap: 6 },
  reflection: { fontSize: 14, fontStyle: "italic", color: colors.inkSoft },
  date: { fontSize: 12, color: colors.inkFaint },
  hiddenNote: { fontSize: 13, color: colors.inkSoft, textAlign: "center" },
});
