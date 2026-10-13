import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { LoadingState, Muted, StatTile } from "@/components/ui";
import { formatLongDate } from "@/lib/dates";
import { colors } from "@/lib/theme";
import type { AnchorNote, AnchorStreak } from "@/lib/types";
import { useApi } from "@/lib/use-api";

// Past anchor notes ("What stayed true about you today?"). Today's is written on the Today tab.
export default function AnchorsScreen() {
  const { data, error, reload, refresh, refreshing } = useApi<{ streak: AnchorStreak; recentNotes: AnchorNote[] }>(
    "/anchor-notes?limit=100",
  );

  if (!data) return <LoadingState error={error} onRetry={reload} />;

  return (
    <FlatList
      data={data.recentNotes}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.action]} />}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <View style={styles.tiles}>
            <StatTile label="Current streak" value={`${data.streak.currentStreak}`} hint="days" />
            <StatTile label="Longest" value={`${data.streak.longestStreak}`} hint="days" />
            <StatTile label="Total" value={`${data.streak.totalEntries}`} hint="anchors" />
          </View>
          <Muted>{data.streak.hasToday ? "Today's anchor is down." : "Drop today's anchor from the Today tab."}</Muted>
        </View>
      }
      ListEmptyComponent={<Muted>No anchors yet.</Muted>}
      renderItem={({ item }) => (
        <View style={styles.note}>
          <Text style={styles.date}>{formatLongDate(item.date)}</Text>
          <Text style={styles.content}>⚓ {item.content}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10, paddingBottom: 40 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  note: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  date: { fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: colors.label },
  content: { fontSize: 15, lineHeight: 22, color: colors.ink, fontStyle: "italic" },
});
