import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";

import { Button, Card, CardTitle, ErrorText, Field, LoadingState, Muted, ScalePicker, SwitchRow } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colors, radius } from "@/lib/theme";
import type { Settings, SettingsResponse } from "@/lib/types";
import { errorMessage, useApi } from "@/lib/use-api";

// The everyday settings from the web Settings page. Tuning options (chunk sizes, token limits)
// stay on the web.
export default function SettingsScreen() {
  const { request } = useAuth();
  const { data, error, reload } = useApi<SettingsResponse>("/v1/settings");
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setDraft(data.settings);
  }, [data]);

  if (!data || !draft) return <LoadingState error={error} onRetry={reload} />;

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  async function save() {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);

    try {
      const result = await request<SettingsResponse>("/v1/settings", {
        method: "PATCH",
        body: {
          llm_model: draft.llm_model,
          rag_default_k: draft.rag_default_k,
          rag_exclude_hidden_thoughts: draft.rag_exclude_hidden_thoughts,
          agent_default_tag: draft.agent_default_tag.trim(),
          rag_custom_prompt: draft.rag_custom_prompt,
          agent_custom_prompt: draft.agent_custom_prompt,
        },
      });
      setDraft(result.settings);
      Alert.alert("Settings saved");
    } catch (caught) {
      setSaveError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card>
        <CardTitle eyebrow="AI model" title="Which Gemini model to use" />
        <Muted>Used by Smart capture, Ask your journal and the task assistant.</Muted>
        {data.models.map((model) => {
          const selected = draft.llm_model === model.value;

          return (
            <Pressable
              key={model.value}
              onPress={() => update("llm_model", model.value)}
              style={[styles.option, selected && styles.optionSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={18} color={colors.accent} />
              <Text style={styles.optionText}>{model.label}</Text>
            </Pressable>
          );
        })}
      </Card>

      <Card>
        <CardTitle eyebrow="Ask your journal" title="Search & answers" />
        <ScalePicker
          label="Passages to use per answer"
          value={draft.rag_default_k}
          onChange={(value) => update("rag_default_k", value)}
          min={3}
          max={12}
          lowLabel="focused"
          highLabel="broad"
        />
        <SwitchRow
          label="Leave out hidden thoughts"
          value={draft.rag_exclude_hidden_thoughts}
          onChange={(value) => update("rag_exclude_hidden_thoughts", value)}
        />
        <Field
          label="Extra instructions for answers"
          value={draft.rag_custom_prompt}
          onChangeText={(value) => update("rag_custom_prompt", value)}
          multiline
          placeholder="Optional, e.g. Answer briefly and kindly."
        />
      </Card>

      <Card>
        <CardTitle eyebrow="Task assistant" title="How it works" />
        <Field
          label="Tag for tasks it creates"
          value={draft.agent_default_tag}
          onChangeText={(value) => update("agent_default_tag", value)}
          autoCapitalize="none"
        />
        <Field
          label="Extra instructions"
          value={draft.agent_custom_prompt}
          onChangeText={(value) => update("agent_custom_prompt", value)}
          multiline
          placeholder="Optional, e.g. Prefer mornings for deep work."
        />
      </Card>

      <View style={{ gap: 8 }}>
        <ErrorText message={saveError} />
        <Button title="Save settings" onPress={save} busy={saving} />
        <Muted>Advanced tuning (chunk sizes, temperatures, token limits) is on the web Settings page.</Muted>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.field,
  },
  optionSelected: { borderColor: colors.accent, backgroundColor: colors.card },
  optionText: { fontSize: 14, color: colors.ink },
});
