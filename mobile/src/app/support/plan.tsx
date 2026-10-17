import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Button, Card, CardTitle, ErrorText, LoadingState, Muted, SwitchRow } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colors, radius } from "@/lib/theme";
import type { SupportContact, SupportOverview } from "@/lib/types";
import { errorMessage, useApi } from "@/lib/use-api";

const MAX_STEPS = 8;
const MAX_CONTACTS = 3;

// Edit the support plan: steps that help, people to reach, the helpline, and on/off.
// Everything is stored in your own Thoughts account.
export default function SupportPlanScreen() {
  const { request } = useAuth();
  const { data, error, reload } = useApi<SupportOverview>("/v1/support");
  const [steps, setSteps] = useState<string[] | null>(null);
  const [contacts, setContacts] = useState<SupportContact[]>([]);
  const [helpline, setHelpline] = useState<SupportContact>({ name: "", phone: "" });
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fill the form once, from the first load.
  useEffect(() => {
    if (data && steps === null) {
      setSteps(data.plan.copingSteps);
      setContacts(data.plan.contacts);
      setHelpline(data.plan.helpline);
      setEnabled(data.plan.enabled);
    }
  }, [data, steps]);

  if (!data || steps === null) return <LoadingState error={error} onRetry={reload} />;

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      await request("/v1/support/plan", {
        method: "PUT",
        body: {
          enabled,
          copingSteps: (steps ?? []).map((step) => step.trim()).filter(Boolean),
          contacts: contacts.filter((contact) => contact.name.trim() || contact.phone.trim()),
          helpline,
        },
      });
      router.back();
    } catch (caught) {
      setSaveError(errorMessage(caught));
      setSaving(false);
    }
  }

  const updateStep = (index: number, value: string) => setSteps((current) => (current ?? []).map((step, i) => (i === index ? value : step)));
  const updateContact = (index: number, field: keyof SupportContact, value: string) =>
    setContacts((current) => current.map((contact, i) => (i === index ? { ...contact, [field]: value } : contact)));

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Muted>Set this up on a good day, so it&apos;s ready on a hard one.</Muted>

        <Card>
          <CardTitle eyebrow="What helps you" title="Your steps" />
          {steps.map((step, index) => (
            <View key={index} style={styles.row}>
              <TextInput
                value={step}
                onChangeText={(value) => updateStep(index, value.slice(0, 140))}
                multiline
                style={[styles.input, { flex: 1 }]}
                placeholder="A small thing that helps"
                placeholderTextColor={colors.inkFaint}
              />
              <Pressable onPress={() => setSteps((current) => (current ?? []).filter((_, i) => i !== index))} hitSlop={8} accessibilityLabel="Remove step">
                <Ionicons name="close-circle-outline" size={24} color={colors.inkFaint} />
              </Pressable>
            </View>
          ))}
          {steps.length < MAX_STEPS ? (
            <Pressable onPress={() => setSteps((current) => [...(current ?? []), ""])} style={styles.add}>
              <Ionicons name="add" size={18} color={colors.accent} />
              <Text style={styles.addText}>Add a step</Text>
            </Pressable>
          ) : null}
        </Card>

        <Card>
          <CardTitle eyebrow="Reach out" title="People to reach" />
          <Muted>Your counsellor, a friend, family. Stored only in your Thoughts account.</Muted>
          {contacts.map((contact, index) => (
            <View key={index} style={styles.row}>
              <View style={{ flex: 1, gap: 6 }}>
                <TextInput
                  value={contact.name}
                  onChangeText={(value) => updateContact(index, "name", value.slice(0, 60))}
                  placeholder={index === 0 ? "Counsellor" : "Name"}
                  placeholderTextColor={colors.inkFaint}
                  style={styles.input}
                />
                <TextInput
                  value={contact.phone}
                  onChangeText={(value) => updateContact(index, "phone", value)}
                  placeholder="07X XXX XXXX"
                  placeholderTextColor={colors.inkFaint}
                  keyboardType="phone-pad"
                  style={styles.input}
                />
              </View>
              <Pressable onPress={() => setContacts((current) => current.filter((_, i) => i !== index))} hitSlop={8} accessibilityLabel="Remove person">
                <Ionicons name="close-circle-outline" size={24} color={colors.inkFaint} />
              </Pressable>
            </View>
          ))}
          {contacts.length < MAX_CONTACTS ? (
            <Pressable onPress={() => setContacts((current) => [...current, { name: "", phone: "" }])} style={styles.add}>
              <Ionicons name="person-add-outline" size={18} color={colors.accent} />
              <Text style={styles.addText}>Add someone</Text>
            </Pressable>
          ) : null}
        </Card>

        <Card>
          <CardTitle eyebrow="Helpline" title="Always there" />
          <TextInput
            value={helpline.name}
            onChangeText={(value) => setHelpline((current) => ({ ...current, name: value.slice(0, 60) }))}
            style={styles.input}
          />
          <TextInput
            value={helpline.phone}
            onChangeText={(value) => setHelpline((current) => ({ ...current, phone: value }))}
            keyboardType="phone-pad"
            style={styles.input}
          />
        </Card>

        <Card>
          <SwitchRow
            label="Show the support card on rough days"
            hint="After three very low entries in a row, or a very low entry late at night."
            value={enabled}
            onChange={setEnabled}
          />
        </Card>

        <ErrorText message={saveError} />
        <Button title="Save plan" onPress={save} busy={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  input: {
    backgroundColor: colors.field,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
  add: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4 },
  addText: { color: colors.accent, fontSize: 14 },
});
