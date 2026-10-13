import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  Body,
  Button,
  Card,
  CardTitle,
  ChoiceRow,
  DateStepper,
  ErrorText,
  Field,
  LoadingState,
  Muted,
  ProgressBar,
  ScalePicker,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colomboToday, formatShortDate, formatTime } from "@/lib/dates";
import { colors, radius } from "@/lib/theme";
import type { WorryModule, WorryPostponedItem } from "@/lib/types";
import { errorMessage, useApi } from "@/lib/use-api";

const DAYS_TO_COMPLETE = 7;
const PERCENT_OPTIONS = Array.from({ length: 11 }, (_, index) => ({ value: index * 10, label: `${index * 10}` }));
const DURATIONS = [5, 10, 15, 20, 30].map((value) => ({ value, label: `${value} min` }));

type PatchModule = (fields: Record<string, unknown>) => Promise<void>;

// Worry postponement: write down a worry belief, gather evidence, set a daily "thinking time",
// postpone worries to it, log each day, then compare with your prediction after a week.
export default function WorryScreen() {
  const { request } = useAuth();
  const { data, setData, error, reload, refresh, refreshing } = useApi<{ module: WorryModule | null }>(
    "/worry-postponement/module",
  );

  if (!data) return <LoadingState error={error} onRetry={reload} />;

  const worryModule = data.module;

  const patch: PatchModule = async (fields) => {
    if (!worryModule) return;
    const result = await request<{ module: WorryModule }>("/worry-postponement/module", {
      method: "PATCH",
      body: { id: worryModule.id, ...fields },
    });
    setData({ module: result.module });
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.action]} />}
      >
        {!worryModule || worryModule.status !== "active" ? (
          <>
            {worryModule ? <PreviousModule module={worryModule} onPatch={patch} /> : null}
            <StartModule onStarted={reload} />
          </>
        ) : (
          <>
            <BeliefCard module={worryModule} onPatch={patch} />
            <EvidenceCard module={worryModule} onChanged={reload} />
            <ThinkingTimeCard module={worryModule} onPatch={patch} />
            <PostponeCard module={worryModule} />
            <DailyLogCard module={worryModule} onPatch={patch} onSaved={reload} />
            <ReflectionCard module={worryModule} onPatch={patch} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function StartModule({ onStarted }: { onStarted: () => void }) {
  const { request } = useAuth();
  const [belief, setBelief] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!belief.trim() || pct === null) {
      setError("Write the worry belief and rate how strongly you believe it.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await request("/worry-postponement/module", { method: "POST", body: { beliefText: belief.trim(), beliefBeforePct: pct } });
      onStarted();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle eyebrow="Worry postponement" title="Test a worry belief" />
      <Muted>
        Name the worry belief you want to test (e.g. &quot;If I don&apos;t worry about it, something bad will happen&quot;). For
        a week you&apos;ll postpone worrying to a fixed daily slot and log what actually happens.
      </Muted>
      <Field label="Worry belief" value={belief} onChangeText={setBelief} multiline />
      <ChoiceRow label="How much do you believe it now? (%)" options={PERCENT_OPTIONS} value={pct} onChange={setPct} />
      <ErrorText message={error} />
      <Button title="Start module" onPress={start} busy={busy} />
    </Card>
  );
}

function PreviousModule({ module: worryModule, onPatch }: { module: WorryModule; onPatch: PatchModule }) {
  const change =
    worryModule.belief_before_pct !== null && worryModule.belief_after_pct !== null
      ? worryModule.belief_before_pct - worryModule.belief_after_pct
      : null;

  return (
    <Card>
      <CardTitle eyebrow={worryModule.status === "completed" ? "Completed" : "Abandoned"} title="Previous module" />
      <Body>&ldquo;{worryModule.belief_text}&rdquo;</Body>
      {worryModule.status === "completed" ? (
        <>
          <ChoiceRow
            label="How much do you believe it now? (%)"
            options={PERCENT_OPTIONS}
            value={worryModule.belief_after_pct}
            onChange={(value) => onPatch({ beliefAfterPct: value }).catch((caught) => Alert.alert("Couldn't save", errorMessage(caught)))}
          />
          {change !== null ? (
            <Muted>
              Belief: {worryModule.belief_before_pct}% → {worryModule.belief_after_pct}%
              {change > 0 ? ` (dropped ${change} points)` : change < 0 ? ` (rose ${-change} points)` : " (no change)"}
            </Muted>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function BeliefCard({ module: worryModule, onPatch }: { module: WorryModule; onPatch: PatchModule }) {
  const [belief, setBelief] = useState(worryModule.belief_text);
  const [busy, setBusy] = useState(false);

  async function save(fields: Record<string, unknown>) {
    setBusy(true);
    try {
      await onPatch(fields);
    } catch (caught) {
      Alert.alert("Couldn't save", errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle eyebrow="1 · Belief" title="The worry you're testing" />
      <Field label="Belief" value={belief} onChangeText={setBelief} multiline />
      {belief.trim() !== worryModule.belief_text ? (
        <Button title="Save belief" variant="secondary" busy={busy} onPress={() => save({ beliefText: belief.trim() })} />
      ) : null}
      <ChoiceRow
        label="How much did you believe it at the start? (%)"
        options={PERCENT_OPTIONS}
        value={worryModule.belief_before_pct}
        onChange={(value) => save({ beliefBeforePct: value })}
      />
    </Card>
  );
}

function EvidenceCard({ module: worryModule, onChanged }: { module: WorryModule; onChanged: () => void }) {
  return (
    <Card>
      <CardTitle eyebrow="2 · Evidence" title="For and against" />
      <Muted>Weigh the evidence objectively. Hold an item to delete it.</Muted>
      <EvidenceSide module={worryModule} side="for" title="Evidence for" onChanged={onChanged} />
      <EvidenceSide module={worryModule} side="against" title="Evidence against" onChanged={onChanged} />
    </Card>
  );
}

function EvidenceSide({
  module: worryModule,
  side,
  title,
  onChanged,
}: {
  module: WorryModule;
  side: "for" | "against";
  title: string;
  onChanged: () => void;
}) {
  const { request } = useAuth();
  const [text, setText] = useState("");
  const items = worryModule.evidence.filter((item) => item.side === side);

  async function add() {
    if (!text.trim()) return;

    try {
      await request("/worry-postponement/evidence", {
        method: "POST",
        body: { moduleId: worryModule.id, side, content: text.trim() },
      });
      setText("");
      onChanged();
    } catch (caught) {
      Alert.alert("Couldn't add evidence", errorMessage(caught));
    }
  }

  function remove(id: number, content: string) {
    Alert.alert("Delete this evidence?", content, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await request(`/worry-postponement/evidence?id=${id}&moduleId=${worryModule.id}`, { method: "DELETE" });
            onChanged();
          } catch (caught) {
            Alert.alert("Couldn't delete", errorMessage(caught));
          }
        },
      },
    ]);
  }

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.sideTitle}>{title}</Text>
      {items.map((item) => (
        <Pressable key={item.id} onLongPress={() => remove(item.id, item.content)} style={styles.item}>
          <Text style={styles.itemText}>• {item.content}</Text>
        </Pressable>
      ))}
      <InlineAdd value={text} onChange={setText} onAdd={add} placeholder={`Add evidence ${side}…`} />
    </View>
  );
}

function ThinkingTimeCard({ module: worryModule, onPatch }: { module: WorryModule; onPatch: PatchModule }) {
  const [start, setStart] = useState(worryModule.thinking_time_start);
  const [place, setPlace] = useState(worryModule.thinking_time_place);
  const [duration, setDuration] = useState(worryModule.thinking_time_duration);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (start && !/^([01]\d|2[0-3]):[0-5]\d$/.test(start.trim())) {
      setError("Use 24-hour time, e.g. 18:30.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await onPatch({ thinkingTimeStart: start.trim(), thinkingTimeDuration: duration, thinkingTimePlace: place.trim() });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle eyebrow="3 · Thinking time" title="Your daily worry slot" />
      <Muted>Outside this window, practise postponing worries to it.</Muted>
      <Field label="Start time (24h)" value={start} onChangeText={setStart} placeholder="18:30" keyboardType="numbers-and-punctuation" />
      <ChoiceRow label="Length" options={DURATIONS} value={duration} onChange={setDuration} />
      <Field label="Place" value={place} onChangeText={setPlace} placeholder="e.g. The desk by the window" />
      <ErrorText message={error} />
      <Button title="Save thinking time" variant="secondary" onPress={save} busy={busy} />
    </Card>
  );
}

// Jot a worry down now and leave it for thinking time.
function PostponeCard({ module: worryModule }: { module: WorryModule }) {
  const { request } = useAuth();
  const today = colomboToday();
  const [items, setItems] = useState<WorryPostponedItem[]>([]);
  const [text, setText] = useState("");

  async function load() {
    try {
      const result = await request<{ items: WorryPostponedItem[] }>(
        `/worry-postponement/postponed-item?moduleId=${worryModule.id}&entryDate=${today}`,
      );
      setItems(result.items);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    load();
    // Reload when the module changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worryModule.id]);

  async function add() {
    if (!text.trim()) return;

    try {
      await request("/worry-postponement/postponed-item", {
        method: "POST",
        body: { moduleId: worryModule.id, entryDate: today, content: text.trim() },
      });
      setText("");
      load();
    } catch (caught) {
      Alert.alert("Couldn't save", errorMessage(caught));
    }
  }

  async function remove(itemId: number) {
    try {
      await request(`/worry-postponement/postponed-item?itemId=${itemId}&moduleId=${worryModule.id}`, { method: "DELETE" });
      load();
    } catch (caught) {
      Alert.alert("Couldn't delete", errorMessage(caught));
    }
  }

  return (
    <Card>
      <CardTitle eyebrow="Postpone" title="A worry just came up?" />
      <Muted>
        Write it down and leave it for thinking time
        {worryModule.thinking_time_start ? ` at ${worryModule.thinking_time_start}` : ""}.
      </Muted>
      <InlineAdd value={text} onChange={setText} onAdd={add} placeholder="Postpone a worry…" />
      {items.map((item) => (
        <View key={item.id} style={styles.postponed}>
          <Text style={styles.itemText}>{item.content}</Text>
          <Text style={styles.meta}>{formatTime(item.created_at)}</Text>
          <Pressable onPress={() => remove(item.id)} hitSlop={8} accessibilityLabel="Delete">
            <Ionicons name="close" size={18} color={colors.inkFaint} />
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

function DailyLogCard({
  module: worryModule,
  onPatch,
  onSaved,
}: {
  module: WorryModule;
  onPatch: PatchModule;
  onSaved: () => void;
}) {
  const { request } = useAuth();
  const [prediction, setPrediction] = useState(worryModule.prediction_text);
  const [confidence, setConfidence] = useState<number | null>(worryModule.prediction_confidence);
  const [date, setDate] = useState<string | null>(colomboToday());
  const existing = worryModule.experiment_days.find((day) => day.entry_date === date);
  const [whatHappened, setWhatHappened] = useState(existing?.what_happened ?? "");
  const [notes, setNotes] = useState(existing?.thinking_time_notes ?? "");
  const [controllability, setControllability] = useState<number | null>(existing?.controllability ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show the saved entry (or a blank form) when switching days.
  useEffect(() => {
    const day = worryModule.experiment_days.find((item) => item.entry_date === date);
    setWhatHappened(day?.what_happened ?? "");
    setNotes(day?.thinking_time_notes ?? "");
    setControllability(day?.controllability ?? null);
  }, [date, worryModule.experiment_days]);

  async function savePrediction() {
    try {
      await onPatch({ predictionText: prediction.trim(), predictionConfidence: confidence });
    } catch (caught) {
      Alert.alert("Couldn't save the prediction", errorMessage(caught));
    }
  }

  async function saveDay() {
    if (!date || controllability === null) {
      setError("Rate how controllable the worry felt (0-10).");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await request("/worry-postponement/experiment-day", {
        method: "PUT",
        body: { moduleId: worryModule.id, entryDate: date, whatHappened: whatHappened.trim(), thinkingTimeNotes: notes.trim(), controllability },
      });
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const logged = worryModule.experiment_days.length;

  return (
    <Card>
      <CardTitle eyebrow="4 · Postponement log" title="Predict, then log each day" />
      <Field
        label="Your prediction"
        value={prediction}
        onChangeText={setPrediction}
        multiline
        placeholder="What do you predict will happen if you postpone your worry?"
      />
      <ScalePicker label="How sure are you? (0-10)" value={confidence} onChange={setConfidence} max={10} />
      {prediction.trim() !== worryModule.prediction_text || confidence !== worryModule.prediction_confidence ? (
        <Button title="Save prediction" variant="secondary" onPress={savePrediction} />
      ) : null}

      <View style={styles.progress}>
        <Text style={styles.meta}>
          {logged} of {DAYS_TO_COMPLETE} days logged
        </Text>
        <ProgressBar value={logged / DAYS_TO_COMPLETE} />
        <View style={styles.loggedDays}>
          {worryModule.experiment_days
            .slice()
            .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
            .map((day) => (
              <Pressable key={day.id} onPress={() => setDate(day.entry_date)} style={styles.loggedDay}>
                <Text style={styles.loggedDayText}>{formatShortDate(day.entry_date)}</Text>
              </Pressable>
            ))}
        </View>
      </View>

      <DateStepper label="Day" value={date} onChange={setDate} fallback={colomboToday()} />
      <Field label="What happened?" value={whatHappened} onChangeText={setWhatHappened} multiline placeholder="What actually happened today?" />
      <Field
        label="What happened at thinking time?"
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="What came up during your thinking time?"
      />
      <ScalePicker
        label="Controllability"
        value={controllability}
        onChange={setControllability}
        max={10}
        lowLabel="out of control"
        highLabel="fully in control"
      />
      <ErrorText message={error} />
      <Button title={existing ? "Update this day" : "Log this day"} onPress={saveDay} busy={busy} />
    </Card>
  );
}

function ReflectionCard({ module: worryModule, onPatch }: { module: WorryModule; onPatch: PatchModule }) {
  const [reflection, setReflection] = useState(worryModule.reflection_text);
  const [busy, setBusy] = useState(false);
  const canComplete = worryModule.experiment_days.length >= DAYS_TO_COMPLETE;

  async function run(fields: Record<string, unknown>) {
    setBusy(true);
    try {
      await onPatch(fields);
    } catch (caught) {
      Alert.alert("Couldn't save", errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle eyebrow="5 · Reflection" title="Prediction vs. reality" />
      <Field
        label="Reflection"
        value={reflection}
        onChangeText={setReflection}
        multiline
        placeholder="Looking back, what did you learn? How did reality compare to your prediction?"
      />
      {reflection !== worryModule.reflection_text ? (
        <Button title="Save reflection" variant="secondary" busy={busy} onPress={() => run({ reflectionText: reflection.trim() })} />
      ) : null}
      {canComplete ? (
        <Button
          title="Mark module complete"
          busy={busy}
          onPress={() => run({ reflectionText: reflection.trim(), status: "completed" })}
        />
      ) : (
        <Muted>Log {DAYS_TO_COMPLETE - worryModule.experiment_days.length} more day(s) to unlock completion.</Muted>
      )}
      <Pressable
        onPress={() =>
          Alert.alert("Abandon this module?", "You can start a new one afterwards.", [
            { text: "Cancel", style: "cancel" },
            { text: "Abandon", style: "destructive", onPress: () => run({ status: "abandoned" }) },
          ])
        }
        hitSlop={8}
      >
        <Text style={styles.danger}>Abandon module</Text>
      </Pressable>
    </Card>
  );
}

function InlineAdd({
  value,
  onChange,
  onAdd,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  placeholder: string;
}) {
  return (
    <View style={styles.inlineAdd}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        style={styles.inlineInput}
        onSubmitEditing={onAdd}
        returnKeyType="done"
      />
      <Pressable onPress={onAdd} disabled={!value.trim()} style={[styles.inlineButton, !value.trim() && { opacity: 0.4 }]} accessibilityLabel="Add">
        <Ionicons name="add" size={22} color={colors.actionText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  sideTitle: { fontSize: 13, fontWeight: "600", color: colors.action },
  item: { paddingVertical: 4 },
  itemText: { flex: 1, fontSize: 14, color: colors.ink, lineHeight: 20 },
  meta: { fontSize: 12, color: colors.inkSoft },
  danger: { color: colors.danger, fontSize: 13, textAlign: "center" },
  postponed: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.cardSoft, borderRadius: 12, padding: 10 },
  progress: { gap: 6 },
  loggedDays: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  loggedDay: { backgroundColor: "#D1FAE5", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  loggedDayText: { fontSize: 11, color: "#064E3B" },
  inlineAdd: { flexDirection: "row", gap: 8, alignItems: "center" },
  inlineInput: {
    flex: 1,
    backgroundColor: colors.field,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
  inlineButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.action,
    alignItems: "center",
    justifyContent: "center",
  },
});
