import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { Button, Centered, ErrorText, Tag } from "@/components/ui";
import { ApiError, useAuth } from "@/lib/auth";
import { formatTimestamp } from "@/lib/dates";
import { colors, fonts, radius } from "@/lib/theme";
import type { Thought } from "@/lib/types";

export default function JournalScreen() {
  const { request } = useAuth();
  const [thoughts, setThoughts] = useState<Thought[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await request<{ thoughts: Thought[] }>("/thoughts?limit=100");
      setThoughts(result.thoughts);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't load your journal.");
    }
  }, [request]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!thoughts) {
    return (
      <Centered>
        {error ? (
          <>
            <ErrorText message={error} />
            <Button title="Try again" onPress={load} variant="secondary" />
          </>
        ) : (
          <ActivityIndicator color={colors.action} size="large" />
        )}
      </Centered>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={thoughts}
        keyExtractor={(thought) => String(thought.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.action]} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No thoughts yet. Tap + to capture your first card.</Text>
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
            {item.tags.length > 0 ? (
              <View style={styles.tags}>
                {item.tags.slice(0, 4).map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </View>
            ) : null}
            <Text style={styles.date}>{formatTimestamp(item.created_at)}</Text>
          </Pressable>
        )}
      />
      <Pressable
        onPress={() => router.push("/thought/new")}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        accessibilityLabel="New thought"
      >
        <Ionicons name="add" size={30} color={colors.actionText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12, paddingBottom: 100 },
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
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  date: { fontSize: 12, color: colors.inkFaint },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.action,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
