import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button, Card, CardTitle, ErrorText, Eyebrow, Field, MoodPicker, Muted } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colors, radius } from "@/lib/theme";
import type { InsightIdea, InsightsResponse, SmartCaptureResult, Thought } from "@/lib/types";
import { errorMessage } from "@/lib/use-api";

export type ThoughtInput = {
  title: string;
  category: string;
  mood: number;
  summary: string;
  body: string;
  tags: string[];
  conceptTags: string[];
  linkedBookIdeaId: number | null;
  insightReflection: string;
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
  const { request } = useAuth();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [mood, setMood] = useState<number | null>(initial?.mood ?? null);
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [conceptTags, setConceptTags] = useState(initial?.concept_tags.join(", ") ?? "");
  const [ideaId, setIdeaId] = useState<number | null>(initial?.linked_book_idea_id ?? null);
  const [reflection, setReflection] = useState(initial?.insight_reflection ?? "");
  const [ideas, setIdeas] = useState<InsightIdea[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    request<InsightsResponse>("/v1/insights")
      .then((result) => setIdeas(result.ideas))
      .catch(() => setIdeas([]));
  }, [request]);

  function applySmartCapture(result: SmartCaptureResult) {
    setTitle(result.title);
    setCategory(result.category);
    setMood(result.mood);
    setSummary(result.summary);
    setBody(result.body);
    setTags(result.tags.join(", "));
    setConceptTags(result.conceptTags.join(", "));
    setIdeaId(result.linkedBookIdeaId);
    setReflection(result.insightReflection);
  }

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
        linkedBookIdeaId: ideaId,
        insightReflection: ideaId ? reflection.trim() : "",
      });
    } catch (caught) {
      setError(errorMessage(caught, "Couldn't save the thought."));
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!initial ? <SmartCapture onResult={applySmartCapture} /> : null}

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

        {ideas.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Eyebrow>Linked idea</Eyebrow>
            <IdeaOption label="No linked idea" selected={ideaId === null} onPress={() => setIdeaId(null)} />
            {ideas.map((idea) => (
              <IdeaOption
                key={idea.id}
                label={idea.idea_text}
                detail={idea.book_title}
                selected={ideaId === idea.id}
                onPress={() => setIdeaId(idea.id)}
              />
            ))}
          </View>
        ) : null}
        {ideaId ? (
          <Field
            label="Insight reflection"
            value={reflection}
            onChangeText={setReflection}
            multiline
            placeholder="How did this idea show up today?"
          />
        ) : null}

        <ErrorText message={error} />
        <Button title={submitLabel} onPress={submit} busy={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function IdeaOption({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.idea, selected && styles.ideaSelected]} accessibilityRole="radio" accessibilityState={{ selected }}>
      <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={18} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={styles.ideaText} numberOfLines={2}>
          {label}
        </Text>
        {detail ? <Text style={styles.ideaDetail}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

// Paste or dictate raw text; the AI fills in the card (same as Smart Capture on the web).
function SmartCapture({ onResult }: { onResult: (result: SmartCaptureResult) => void }) {
  const { request } = useAuth();
  const [rawText, setRawText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);

    try {
      onResult(await request<SmartCaptureResult>("/smart-capture", { method: "POST", body: { rawText } }));
      setDone(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle eyebrow="Smart capture" title="Just write it out" />
      <Muted>Write or dictate freely. The AI fills in the card below; you review it before saving.</Muted>
      <Field
        label="Raw thought"
        value={rawText}
        onChangeText={(value) => {
          setRawText(value.slice(0, 10000));
          setDone(false);
        }}
        multiline
        style={{ minHeight: 120 }}
      />
      <ErrorText message={error} />
      <Button
        title={done ? "Filled in — review below" : "Fill in with AI"}
        variant="secondary"
        onPress={run}
        busy={busy}
        disabled={!rawText.trim() || done}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  idea: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    padding: 12,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.field,
  },
  ideaSelected: { borderColor: colors.accent, backgroundColor: colors.card },
  ideaText: { fontSize: 14, color: colors.ink },
  ideaDetail: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
});
