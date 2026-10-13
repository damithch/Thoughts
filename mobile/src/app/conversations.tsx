import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { Body, Card, Eyebrow, LoadingState, Muted, Tag } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatLongDate } from "@/lib/dates";
import { colors, fonts } from "@/lib/theme";
import type { ConversationSummary } from "@/lib/types";
import { errorMessage, useApi } from "@/lib/use-api";

// Structured summaries pushed from Claude conversations (kept apart from the thought journal).
export default function ConversationsScreen() {
  const { request } = useAuth();
  const { data, setData, error, reload, refresh, refreshing } = useApi<{ conversations: ConversationSummary[] }>(
    "/v1/conversations",
  );

  if (!data) return <LoadingState error={error} onRetry={reload} />;

  function remove(conversation: ConversationSummary) {
    Alert.alert("Delete this conversation log?", conversation.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await request(`/v1/conversations/${conversation.id}`, { method: "DELETE" });
            setData((current) =>
              current ? { conversations: current.conversations.filter((item) => item.id !== conversation.id) } : current,
            );
          } catch (caught) {
            Alert.alert("Couldn't delete", errorMessage(caught));
          }
        },
      },
    ]);
  }

  return (
    <FlatList
      data={data.conversations}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.action]} />}
      ListHeaderComponent={
        <Muted>Summaries pushed from Claude: topics, insights, action items and mood context. Hold one to delete it.</Muted>
      }
      ListEmptyComponent={<Muted>No conversation logs yet.</Muted>}
      renderItem={({ item }) => (
        <Pressable onLongPress={() => remove(item)} delayLongPress={400}>
          <Card>
            <View style={styles.top}>
              <Eyebrow>{formatLongDate(item.conversation_date)}</Eyebrow>
              {item.mood_context ? <Text style={styles.meta}>Mood {item.mood_context}/10</Text> : null}
            </View>
            <Text style={styles.title}>{item.title}</Text>
            {item.key_topics.length > 0 ? (
              <View style={styles.tags}>
                {item.key_topics.map((topic) => (
                  <Tag key={topic}>{topic}</Tag>
                ))}
              </View>
            ) : null}
            {item.insights ? <Body>{item.insights}</Body> : null}
            {item.action_items.length > 0 ? (
              <View style={{ gap: 4 }}>
                <Eyebrow>Action items</Eyebrow>
                {item.action_items.map((action, index) => (
                  <Text key={index} style={styles.action}>
                    • {action}
                  </Text>
                ))}
              </View>
            ) : null}
          </Card>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  top: { flexDirection: "row", justifyContent: "space-between" },
  meta: { fontSize: 12, color: colors.inkSoft },
  title: { fontFamily: fonts.display, fontSize: 21, color: colors.ink },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  action: { fontSize: 14, color: colors.ink, lineHeight: 20 },
});
