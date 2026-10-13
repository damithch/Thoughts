import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { Card, CardTitle, Fab, LoadingState, Muted } from "@/components/ui";
import { formatLongDate } from "@/lib/dates";
import { colors, radius } from "@/lib/theme";
import type { ActivationEntry } from "@/lib/types";
import { useApi } from "@/lib/use-api";

function ratings(entry: ActivationEntry, when: "before" | "after") {
  const values = [entry[`${when}_depression`], entry[`${when}_pleasure`], entry[`${when}_achievement`]];

  return values.some((value) => value === null) ? null : `D ${values[0]} · P ${values[1]} · A ${values[2]}`;
}

export default function ActivationScreen() {
  const { data, error, reload, refresh, refreshing } = useApi<{ entries: ActivationEntry[] }>("/activation");

  if (!data) return <LoadingState error={error} onRetry={reload} />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={data.entries}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.action]} />}
        ListHeaderComponent={
          <Card>
            <CardTitle eyebrow="Behavioural activation" title="Prescribe yourself some fun" />
            <Muted>
              Simple pleasant activities, and small tasks that give a sense of achievement, can lift mood and energy. Rate
              depression (D), pleasure (P) and achievement (A) from 0 to 8 before an activity, then again after it.
            </Muted>
          </Card>
        }
        ListEmptyComponent={<Muted>No activities yet. Tap + to plan one.</Muted>}
        renderItem={({ item }) => {
          const before = ratings(item, "before");
          const after = ratings(item, "after");

          return (
            <Pressable
              onPress={() => router.push({ pathname: "/activation/[id]", params: { id: String(item.id) } })}
              style={({ pressed }) => [styles.entry, pressed && { opacity: 0.75 }]}
            >
              <View style={styles.entryTop}>
                <Text style={styles.date}>{formatLongDate(item.entry_date)}</Text>
                <View style={[styles.badge, item.status === "completed" ? styles.badgeDone : styles.badgePending]}>
                  <Text style={styles.badgeText}>{item.status === "completed" ? "Completed" : "Rate after"}</Text>
                </View>
              </View>
              <Text style={styles.activity}>{item.activity}</Text>
              <Text style={styles.meta}>
                Before {before ?? "—"}
                {after ? `   →   After ${after}` : ""}
              </Text>
            </Pressable>
          );
        }}
      />
      <Fab label="New activity" onPress={() => router.push({ pathname: "/activation/[id]", params: { id: "new" } })} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10, paddingBottom: 100 },
  entry: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  entryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  date: { fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: colors.label },
  activity: { fontSize: 16, color: colors.ink },
  meta: { fontSize: 12, color: colors.inkSoft },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  badgeDone: { backgroundColor: "#D1FAE5" },
  badgePending: { backgroundColor: colors.medium.bg },
  badgeText: { fontSize: 11, color: colors.ink },
});
