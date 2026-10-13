import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { Button, Card, CardTitle, DateStepper, ErrorText, Field, LoadingState, Muted, ScalePicker } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colomboToday } from "@/lib/dates";
import { colors } from "@/lib/theme";
import type { ActivationEntry } from "@/lib/types";
import { errorMessage } from "@/lib/use-api";

type Ratings = { depression: number | null; pleasure: number | null; achievement: number | null };

const EMPTY: Ratings = { depression: null, pleasure: null, achievement: null };

// 0 = absolutely none … 8 = extreme (same scale as the web worksheet).
function RatingGroup({ title, value, onChange }: { title: string; value: Ratings; onChange: (value: Ratings) => void }) {
  return (
    <Card>
      <CardTitle eyebrow="Ratings 0-8" title={title} />
      <ScalePicker label="Depression" value={value.depression} onChange={(n) => onChange({ ...value, depression: n })} max={8} lowLabel="none" highLabel="extreme" />
      <ScalePicker label="Pleasure" value={value.pleasure} onChange={(n) => onChange({ ...value, pleasure: n })} max={8} lowLabel="none" highLabel="extreme" />
      <ScalePicker label="Achievement" value={value.achievement} onChange={(n) => onChange({ ...value, achievement: n })} max={8} lowLabel="none" highLabel="extreme" />
    </Card>
  );
}

export default function ActivationEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const { request } = useAuth();
  const [loaded, setLoaded] = useState(isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activity, setActivity] = useState("");
  const [date, setDate] = useState<string | null>(colomboToday());
  const [before, setBefore] = useState<Ratings>(EMPTY);
  const [after, setAfter] = useState<Ratings>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const { entries } = await request<{ entries: ActivationEntry[] }>("/activation");
      const entry = entries.find((item) => String(item.id) === id);

      if (!entry) {
        setLoadError("That activity doesn't exist any more.");
        return;
      }

      setActivity(entry.activity);
      setDate(entry.entry_date);
      setBefore({ depression: entry.before_depression, pleasure: entry.before_pleasure, achievement: entry.before_achievement });
      setAfter({ depression: entry.after_depression, pleasure: entry.after_pleasure, achievement: entry.after_achievement });
      setLoaded(true);
    } catch (caught) {
      setLoadError(errorMessage(caught));
    }
  }

  useEffect(() => {
    if (!isNew) load();
    // Load once per entry id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    setSaving(true);
    setError(null);

    try {
      const result = await request<{ entry: ActivationEntry }>("/activation", {
        method: "POST",
        body: {
          ...(isNew ? {} : { id: Number(id) }),
          activity: activity.trim(),
          entryDate: date,
          beforeDepression: before.depression,
          beforePleasure: before.pleasure,
          beforeAchievement: before.achievement,
          afterDepression: after.depression,
          afterPleasure: after.pleasure,
          afterAchievement: after.achievement,
        },
      });
      router.back();
      Alert.alert(
        result.entry.status === "completed" ? "Saved as completed" : "Saved",
        result.entry.status === "completed" ? undefined : "Come back after the activity to add the After ratings.",
      );
    } catch (caught) {
      setError(errorMessage(caught));
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await request(`/activation?id=${id}`, { method: "DELETE" });
      router.back();
    } catch (caught) {
      Alert.alert("Couldn't delete", errorMessage(caught));
    }
  }

  if (!loaded) return <LoadingState error={loadError} onRetry={load} />;

  const afterStarted = after.depression !== null || after.pleasure !== null || after.achievement !== null;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: isNew ? "New activity" : "Activity" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Activity" value={activity} onChangeText={setActivity} placeholder="e.g. Walk to the park and get a coffee" />
        <DateStepper label="Date" value={date} onChange={setDate} fallback={colomboToday()} />
        <RatingGroup title="Before the activity" value={before} onChange={setBefore} />
        <RatingGroup title="After the activity" value={after} onChange={setAfter} />
        {afterStarted ? (
          <Pressable onPress={() => setAfter(EMPTY)} hitSlop={8}>
            <Text style={styles.link}>Clear the After ratings</Text>
          </Pressable>
        ) : (
          <Muted>Leave After empty for now and fill it in once you&apos;ve done the activity.</Muted>
        )}
        <ErrorText message={error} />
        <Button title="Save" onPress={save} busy={saving} />
        {!isNew ? (
          <Button
            title="Delete"
            variant="danger"
            onPress={() =>
              Alert.alert("Delete this activity?", activity, [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: remove },
              ])
            }
          />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  link: { color: colors.accent, fontSize: 13 },
});
