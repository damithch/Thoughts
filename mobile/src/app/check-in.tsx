import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Button, ChoiceRow, ErrorText, Field, MoodPicker } from "@/components/ui";
import { ApiError, useAuth } from "@/lib/auth";
import type { CheckInEnergy, CheckInFocus } from "@/lib/types";

const ENERGY_OPTIONS: { value: CheckInEnergy; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "steady", label: "Steady" },
  { value: "high", label: "High" },
];

const FOCUS_OPTIONS: { value: CheckInFocus; label: string }[] = [
  { value: "scattered", label: "Scattered" },
  { value: "okay", label: "Okay" },
  { value: "locked_in", label: "Locked in" },
];

export default function CheckInScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { request } = useAuth();
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<CheckInEnergy | null>(null);
  const [focus, setFocus] = useState<CheckInFocus | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!mood || !energy || !focus) {
      setError("Choose a mood, energy level and focus.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await request("/check-ins", { method: "POST", body: { date, mood, energy, focus, note: note.trim() } });
      router.back();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't save the check-in.");
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <MoodPicker value={mood} onChange={setMood} />
      <ChoiceRow label="Energy" options={ENERGY_OPTIONS} value={energy} onChange={setEnergy} />
      <ChoiceRow label="Focus" options={FOCUS_OPTIONS} value={focus} onChange={setFocus} />
      <Field label="Note" value={note} onChangeText={setNote} multiline placeholder="Optional" />
      <ErrorText message={error} />
      <Button title="Save check-in" onPress={save} busy={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20, paddingBottom: 40 },
});
