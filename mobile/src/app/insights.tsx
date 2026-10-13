import { useState } from "react";
import { Alert, KeyboardAvoidingView, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button, Card, CardTitle, ChoiceRow, ErrorText, Field, LoadingState, Muted } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colors, fonts, radius } from "@/lib/theme";
import type { IdeaStatus, InsightIdea, InsightsResponse, SourceType } from "@/lib/types";
import { errorMessage, useApi } from "@/lib/use-api";

const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: "book", label: "Book" },
  { value: "article", label: "Article" },
  { value: "podcast", label: "Podcast" },
  { value: "principle", label: "Principle" },
];

const STATUSES: { value: IdeaStatus; label: string }[] = [
  { value: "understood", label: "Understood" },
  { value: "noticed", label: "Noticed" },
  { value: "applied", label: "Applied" },
  { value: "internalized", label: "Internalized" },
];

const STATUS_COLORS: Record<IdeaStatus, { bg: string; fg: string }> = {
  understood: { bg: "#F5F5F4", fg: "#44403C" },
  noticed: { bg: "#FEF3C7", fg: "#78350F" },
  applied: { bg: "#DBEAFE", fg: "#1E3A8A" },
  internalized: { bg: "#D1FAE5", fg: "#064E3B" },
};

export default function InsightsScreen() {
  const { data, setData, error, reload, refresh, refreshing } = useApi<InsightsResponse>("/v1/insights");

  if (!data) return <LoadingState error={error} onRetry={reload} />;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.action]} />}
      >
        <Muted>
          Connect what you read to how you live. Move each idea along as it goes from understood to internalized, and link
          thoughts to ideas when they show up in real life.
        </Muted>

        <View style={styles.counts}>
          {STATUSES.map((status) => (
            <View key={status.value} style={[styles.count, { backgroundColor: STATUS_COLORS[status.value].bg }]}>
              <Text style={[styles.countValue, { color: STATUS_COLORS[status.value].fg }]}>
                {data.ideas.filter((idea) => idea.status === status.value).length}
              </Text>
              <Text style={[styles.countLabel, { color: STATUS_COLORS[status.value].fg }]}>{status.label}</Text>
            </View>
          ))}
        </View>

        {data.sources.map((source) => {
          const ideas = data.ideas.filter((idea) => idea.book_id === source.id);

          return (
            <Card key={source.id}>
              <CardTitle eyebrow={`${source.source_type}${source.author ? ` · ${source.author}` : ""}`} title={source.title} />
              {ideas.length === 0 ? <Muted>No ideas captured yet.</Muted> : null}
              {ideas.map((idea) => (
                <IdeaRow key={idea.id} idea={idea} onUpdated={setData} />
              ))}
            </Card>
          );
        })}

        {data.sources.length > 0 ? <AddIdeaCard data={data} onAdded={setData} /> : null}
        <AddSourceCard onAdded={setData} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function IdeaRow({ idea, onUpdated }: { idea: InsightIdea; onUpdated: (data: InsightsResponse) => void }) {
  const { request } = useAuth();
  const palette = STATUS_COLORS[idea.status];

  function changeStatus() {
    Alert.alert("How far along is this idea?", idea.idea_text, [
      ...STATUSES.filter((status) => status.value !== idea.status).map((status) => ({
        text: status.label,
        onPress: async () => {
          try {
            onUpdated(await request<InsightsResponse>(`/v1/insights/ideas/${idea.id}`, { method: "PATCH", body: { status: status.value } }));
          } catch (caught) {
            Alert.alert("Couldn't update the idea", errorMessage(caught));
          }
        },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  return (
    <Pressable onPress={changeStatus} style={styles.idea}>
      <Text style={styles.ideaText}>{idea.idea_text}</Text>
      <View style={[styles.status, { backgroundColor: palette.bg }]}>
        <Text style={[styles.statusText, { color: palette.fg }]}>{idea.status}</Text>
      </View>
    </Pressable>
  );
}

function AddIdeaCard({ data, onAdded }: { data: InsightsResponse; onAdded: (data: InsightsResponse) => void }) {
  const { request } = useAuth();
  const [sourceId, setSourceId] = useState<number | null>(data.sources[0]?.id ?? null);
  const [ideaText, setIdeaText] = useState("");
  const [status, setStatus] = useState<IdeaStatus>("understood");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!sourceId || !ideaText.trim()) {
      setError("Pick a source and write the idea.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      onAdded(await request<InsightsResponse>("/v1/insights", { method: "POST", body: { kind: "idea", sourceId, ideaText: ideaText.trim(), status } }));
      setIdeaText("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle eyebrow="New idea" title="Capture an idea" />
      <ChoiceRow
        label="From"
        options={data.sources.map((source) => ({ value: source.id, label: source.title }))}
        value={sourceId}
        onChange={setSourceId}
      />
      <Field label="Idea" value={ideaText} onChangeText={setIdeaText} multiline placeholder="The idea in your own words" />
      <ChoiceRow label="Where it is now" options={STATUSES} value={status} onChange={setStatus} />
      <ErrorText message={error} />
      <Button title="Add idea" onPress={add} busy={busy} />
    </Card>
  );
}

function AddSourceCard({ onAdded }: { onAdded: (data: InsightsResponse) => void }) {
  const { request } = useAuth();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("book");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!title.trim()) {
      setError("Give the source a title.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      onAdded(
        await request<InsightsResponse>("/v1/insights", {
          method: "POST",
          body: { kind: "source", title: title.trim(), author: author.trim(), sourceType },
        }),
      );
      setTitle("");
      setAuthor("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle eyebrow="New source" title="Add a book, article or principle" />
      <ChoiceRow label="Type" options={SOURCE_TYPES} value={sourceType} onChange={setSourceType} />
      <Field label="Title" value={title} onChangeText={setTitle} />
      <Field label="Author" value={author} onChangeText={setAuthor} placeholder="Optional" />
      <ErrorText message={error} />
      <Button title="Add source" variant="secondary" onPress={add} busy={busy} />
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  counts: { flexDirection: "row", gap: 8 },
  count: { flex: 1, borderRadius: 14, paddingVertical: 10, alignItems: "center" },
  countValue: { fontFamily: fonts.display, fontSize: 22 },
  countLabel: { fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase" },
  idea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.cardSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  ideaText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.ink },
  status: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontWeight: "600" },
});
