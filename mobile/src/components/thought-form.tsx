import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet } from "react-native";

import { Button, ErrorText, Field, MoodPicker } from "@/components/ui";
import type { Thought } from "@/lib/types";

export type ThoughtInput = {
  title: string;
  category: string;
  mood: number;
  summary: string;
  body: string;
  tags: string[];
  conceptTags: string[];
};

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function ThoughtForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Thought;
  submitLabel: string;
  // Resolves when saved; throws an Error whose message is shown under the form.
  onSubmit: (input: ThoughtInput) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [mood, setMood] = useState<number | null>(initial?.mood ?? null);
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [conceptTags, setConceptTags] = useState(initial?.concept_tags.join(", ") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || !category.trim() || !mood || !summary.trim()) {
      setError("Add a title, category, mood and summary.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await onSubmit({
        title: title.trim(),
        category: category.trim(),
        mood,
        summary: summary.trim(),
        body: body.trim(),
        tags: splitTags(tags),
        conceptTags: splitTags(conceptTags),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save the thought.");
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="What's on your mind?" />
        <Field label="Category" value={category} onChangeText={setCategory} placeholder="work, family, health…" />
        <MoodPicker value={mood} onChange={setMood} />
        <Field
          label="Card summary"
          value={summary}
          onChangeText={setSummary}
          multiline
          hint="Keep it short so your cards stay easy to scan."
        />
        <Field label="Long-form note" value={body} onChangeText={setBody} multiline style={{ minHeight: 160 }} />
        <Field
          label="Tags"
          value={tags}
          onChangeText={setTags}
          autoCapitalize="none"
          placeholder="work, family, health"
          hint="Separate tags with commas."
        />
        <Field
          label="Concept tags"
          value={conceptTags}
          onChangeText={setConceptTags}
          autoCapitalize="none"
          placeholder="stoicism, ego, delayed gratification"
        />
        <ErrorText message={error} />
        <Button title={submitLabel} onPress={submit} busy={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 48 },
});
