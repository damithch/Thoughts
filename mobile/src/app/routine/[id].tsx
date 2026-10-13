import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { PRIORITY_OPTIONS } from "@/components/tasks";
import {
  Button,
  ChoiceRow,
  DateStepper,
  ErrorText,
  Eyebrow,
  Field,
  LoadingState,
  SwitchRow,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colomboToday } from "@/lib/dates";
import { WEEKDAYS } from "@/lib/routines";
import { colors, radius } from "@/lib/theme";
import type { Routine, TaskPriority, Weekday } from "@/lib/types";
import { errorMessage } from "@/lib/use-api";

const PRESETS: { label: string; days: Weekday[] }[] = [
  { label: "Every day", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
  { label: "Weekdays", days: ["mon", "tue", "wed", "thu", "fri"] },
  { label: "Weekends", days: ["sat", "sun"] },
];

export default function RoutineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const { request } = useAuth();
  const [loaded, setLoaded] = useState(isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [days, setDays] = useState<Weekday[]>(["mon", "tue", "wed", "thu", "fri"]);
  const [startDate, setStartDate] = useState<string | null>(colomboToday());
  const [endDate, setEndDate] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const { routines } = await request<{ routines: Routine[] }>("/v1/routines");
      const routine = routines.find((item) => String(item.id) === id);

      if (!routine) {
        setLoadError("That routine doesn't exist any more.");
        return;
      }

      setTitle(routine.title);
      setPriority(routine.priority);
      setDays(routine.days_of_week);
      setStartDate(routine.start_date);
      setEndDate(routine.end_date);
      setNote(routine.note);
      setIsActive(routine.is_active);
      setLoaded(true);
      setLoadError(null);
    } catch (caught) {
      setLoadError(errorMessage(caught));
    }
  }

  useEffect(() => {
    if (!isNew) load();
    // Load once per routine id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function toggleDay(day: Weekday) {
    setDays((current) => (current.includes(day) ? current.filter((value) => value !== day) : [...current, day]));
  }

  async function save() {
    setSaving(true);
    setError(null);

    const body = { title: title.trim(), priority, daysOfWeek: days, startDate, endDate, note: note.trim(), isActive };

    try {
      await request(isNew ? "/v1/routines" : `/v1/routines/${id}`, { method: isNew ? "POST" : "PATCH", body });
      router.back();
    } catch (caught) {
      setError(errorMessage(caught));
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await request(`/v1/routines/${id}`, { method: "DELETE" });
      router.back();
    } catch (caught) {
      Alert.alert("Couldn't delete the routine", errorMessage(caught));
    }
  }

  if (!loaded) {
    return <LoadingState error={loadError} onRetry={load} />;
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: isNew ? "New routine" : "Edit routine" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Morning walk" />
        <ChoiceRow label="Priority" options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} />

        <View style={{ gap: 8 }}>
          <Eyebrow>Days</Eyebrow>
          <View style={styles.days}>
            {WEEKDAYS.map((day) => {
              const selected = days.includes(day.value);

              return (
                <Pressable
                  key={day.value}
                  onPress={() => toggleDay(day.value)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  style={[styles.day, selected && styles.daySelected]}
                >
                  <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{day.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.presets}>
            {PRESETS.map((preset) => (
              <Pressable key={preset.label} onPress={() => setDays(preset.days)} hitSlop={6}>
                <Text style={styles.link}>{preset.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <DateStepper label="Starts" value={startDate} onChange={setStartDate} fallback={colomboToday()} />
        <DateStepper
          label="Ends"
          value={endDate}
          onChange={setEndDate}
          allowNone
          noneLabel="No end date"
          fallback={startDate ?? colomboToday()}
        />
        <Field label="Note" value={note} onChangeText={setNote} multiline />
        {!isNew ? (
          <SwitchRow label="Active" hint="Paused routines stop adding tasks." value={isActive} onChange={setIsActive} />
        ) : null}
        <ErrorText message={error} />
        <Button title={isNew ? "Create routine" : "Save"} onPress={save} busy={saving} />
        {!isNew ? (
          <Button
            title="Delete routine"
            variant="danger"
            onPress={() =>
              Alert.alert("Delete this routine?", "Tasks it already added stay as one-off tasks.", [
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
  content: { padding: 16, gap: 18, paddingBottom: 48 },
  days: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  day: {
    width: 44,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.field,
    alignItems: "center",
  },
  daySelected: { backgroundColor: colors.action, borderColor: colors.action },
  dayText: { fontSize: 13, color: colors.ink },
  dayTextSelected: { color: colors.actionText, fontWeight: "600" },
  presets: { flexDirection: "row", gap: 16 },
  link: { color: colors.accent, fontSize: 13 },
});
