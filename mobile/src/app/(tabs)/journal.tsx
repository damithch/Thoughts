import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { Fab, LoadingState, Segmented, Tag } from "@/components/ui";
import { formatTimestamp } from "@/lib/dates";
import { colors, fonts, radius } from "@/lib/theme";
import type { Thought } from "@/lib/types";
import { useApi } from "@/lib/use-api";

type Visibility = "active" | "hidden";

export default function JournalScreen() {
  const [visibility, setVisibility] = useState<Visibility>("active");
  const [tag, setTag] = useState<string | null>(null);
  const { data, error, reload, refresh, refreshing } = useApi<{ thoughts: Thought[] }>(
    `/v1/thoughts?limit=200&visibility=${visibility}`,
  );

  const thoughts = data?.thoughts ?? [];
  const tags = Array.from(new Set(thoughts.flatMap((thought) => thought.tags))).sort();
  const shown = tag ? thoughts.filter((thought) => thought.tags.includes(tag)) : thoughts;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push("/ask")} style={styles.askButton}>
          <Ionicons name="search-outline" size={18} color={colors.action} />
          <Text style={styles.askText}>Ask your journal…</Text>
        </Pressable>
        <Segmented
          options={[
            { value: "active", label: "Journal" },
            { value: "hidden", label: "Hidden" },
          ]}
          value={visibility}
          onChange={(value) => {
            setVisibility(value);
            setTag(null);
          }}
        />
        {tags.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagBar}>
            {tags.map((value) => (
              <Pressable
                key={value}
                onPress={() => setTag(tag === value ? null : value)}
                style={[styles.tagChip, tag === value && styles.tagChipSelected]}
              >
                <Text style={[styles.tagChipText, tag === value && styles.tagChipTextSelected]}>#{value}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

      {!data ? (
        <LoadingState error={error} onRetry={reload} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(thought) => String(thought.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.action]} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {visibility === "hidden" ? "No hidden thoughts." : "No thoughts yet. Tap + to capture your first card."}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: "/thought/[id]", params: { id: String(item.id) } })}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.cardTop}>
                <Text style={styles.category}>{item.category}</Text>
                <Text style={styles.mood}>Mood {item.mood}/10</Text>
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.summary} numberOfLines={3}>
                {item.summary}
              </Text>
              {item.linked_idea_text ? (
                <Text style={styles.linked} numberOfLines={1}>
                  💡 {item.linked_idea_text}
                </Text>
              ) : null}
              {item.tags.length > 0 ? (
                <View style={styles.tags}>
                  {item.tags.slice(0, 4).map((value) => (
                    <Tag key={value}>{value}</Tag>
                  ))}
                </View>
              ) : null}
              <Text style={styles.date}>{formatTimestamp(item.created_at)}</Text>
            </Pressable>
          )}
        />
      )}

      <Fab label="Speak a thought" icon="mic" secondary onPress={() => router.push("/voice")} />
      <Fab label="New thought" onPress={() => router.push("/thought/new")} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  askButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  askText: { color: colors.inkSoft, fontSize: 14 },
  tagBar: { gap: 6, paddingVertical: 2 },
  tagChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagChipSelected: { backgroundColor: colors.action, borderColor: colors.action },
  tagChipText: { fontSize: 12, color: colors.action },
  tagChipTextSelected: { color: colors.actionText },
  list: { padding: 16, gap: 12, paddingBottom: 160 },
  empty: { textAlign: "center", color: colors.inkSoft, marginTop: 60, fontSize: 15 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 8,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between" },
  category: { fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: colors.label },
  mood: { fontSize: 12, color: colors.inkSoft },
  title: { fontFamily: fonts.display, fontSize: 21, color: colors.ink },
  summary: { fontSize: 14, lineHeight: 21, color: colors.inkSoft },
  linked: { fontSize: 13, color: colors.accent },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  date: { fontSize: 12, color: colors.inkFaint },
});
