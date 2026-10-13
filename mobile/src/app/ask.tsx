import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from "react-native";

import { Body, Button, Card, CardTitle, ErrorText, Field, Muted } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";
import type { RagExcerpt } from "@/lib/types";
import { errorMessage } from "@/lib/use-api";

// Search your journal by meaning (retrieval), or ask a question and get an answer written from your
// own entries (RAG) — the web's journal search.
export default function AskScreen() {
  const { request } = useAuth();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"answer" | "search" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [excerpts, setExcerpts] = useState<RagExcerpt[] | null>(null);

  async function ask() {
    setBusy("answer");
    setError(null);

    try {
      const result = await request<{ answer: string; provenance: RagExcerpt[] }>("/rag/generate", {
        method: "POST",
        body: { question: query.trim(), k: 6 },
      });
      setAnswer(result.answer);
      setExcerpts(result.provenance ?? []);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function search() {
    setBusy("search");
    setError(null);

    try {
      const result = await request<{ results: RagExcerpt[] }>("/retrieval", {
        method: "POST",
        body: { query: query.trim(), k: 8 },
      });
      setAnswer(null);
      setExcerpts(result.results);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <CardTitle eyebrow="Your journal" title="Ask or search" />
          <Field
            label="Question or topic"
            value={query}
            onChangeText={setQuery}
            multiline
            placeholder="e.g. When did I feel most energised this month, and why?"
          />
          <View style={styles.buttons}>
            <Button title="Ask" onPress={ask} busy={busy === "answer"} disabled={!query.trim() || busy !== null} style={{ flex: 1 }} />
            <Button
              title="Find entries"
              variant="secondary"
              onPress={search}
              busy={busy === "search"}
              disabled={!query.trim() || busy !== null}
              style={{ flex: 1 }}
            />
          </View>
          <Muted>Answers come only from your own entries and conversation logs. Hidden thoughts are left out.</Muted>
        </Card>

        <ErrorText message={error} />

        {answer ? (
          <Card>
            <CardTitle eyebrow="Answer" title="From your journal" />
            <Body>{answer}</Body>
          </Card>
        ) : null}

        {excerpts ? (
          <Card>
            <CardTitle eyebrow="Sources" title={excerpts.length === 0 ? "Nothing matched" : `${excerpts.length} matching passages`} />
            {excerpts.map((excerpt, index) => (
              <View key={`${excerpt.document_key ?? index}-${index}`} style={styles.excerpt}>
                <Text style={styles.excerptMeta}>
                  {[
                    excerpt.metadata?.title,
                    excerpt.metadata?.source_date ?? excerpt.metadata?.created_date,
                    excerpt.metadata?.mood ? `mood ${excerpt.metadata.mood}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || excerpt.document_key}
                </Text>
                <Text style={styles.excerptText}>{excerpt.chunk_text}</Text>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  buttons: { flexDirection: "row", gap: 10 },
  excerpt: { backgroundColor: colors.cardSoft, borderRadius: 14, padding: 12, gap: 6 },
  excerptMeta: { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: colors.label },
  excerptText: { fontSize: 14, lineHeight: 21, color: colors.ink },
});
