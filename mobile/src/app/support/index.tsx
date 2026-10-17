import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button, Card, CardTitle, Eyebrow, LoadingState, Muted } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { BASICS, smsUrl, supportHeadline, telUrl, urgentLine } from "@/lib/support";
import { colors, fonts, radius } from "@/lib/theme";
import type { SupportOverview } from "@/lib/types";
import { errorMessage, useApi } from "@/lib/use-api";

type BasicsKey = (typeof BASICS)[number]["key"];

// Support on hard days: the basics, breathing, your own steps, and people to reach.
export default function SupportScreen() {
  const { request } = useAuth();
  const { data, setData, error, reload, refresh, refreshing } = useApi<SupportOverview>("/v1/support");

  if (!data) return <LoadingState error={error} onRetry={reload} />;

  const { status, today, plan } = data;
  const { title, body } = supportHeadline(status);

  async function save(update: Record<string, unknown>, optimistic: SupportOverview) {
    const previous = data;
    setData(optimistic);

    try {
      setData(await request<SupportOverview>("/v1/support/today", { method: "PUT", body: update }));
    } catch (caught) {
      setData(previous);
      Alert.alert("Couldn't save that", errorMessage(caught));
    }
  }

  function toggleBasic(key: BasicsKey) {
    if (!data) return;
    const next = !today[key];
    save({ [key]: next }, { ...data, today: { ...today, [key]: next } });
  }

  function toggleStep(step: string) {
    if (!data) return;
    const stepsTried = today.stepsTried.includes(step) ? today.stepsTried.filter((item) => item !== step) : [...today.stepsTried, step];
    save({ stepsTried }, { ...data, today: { ...today, stepsTried } });
  }

  function okayForNow() {
    if (!data) return;
    save({ dismiss: true }, { ...data, status: { ...status, active: false } });
    router.back();
  }

  function call(phone: string) {
    Linking.openURL(telUrl(phone)).catch(() => Alert.alert("Couldn't open the phone app", phone));
  }

  const missing = BASICS.find((item) => !today[item.key]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.action]} />}
    >
      <View style={[styles.hero, status.active && styles.heroActive]}>
        <Eyebrow>{status.active ? "Go gently" : "Support"}</Eyebrow>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroBody}>{body}</Text>
        {status.active ? (
          <Pressable onPress={okayForNow} hitSlop={8} style={{ alignSelf: "flex-start" }}>
            <Text style={styles.okay}>I&apos;m okay for now</Text>
          </Pressable>
        ) : null}
      </View>

      <Card>
        <CardTitle eyebrow="First" title="The basics" />
        <Muted>Hunger, tiredness and being alone make hard moments harder.</Muted>
        <View style={styles.pills}>
          {BASICS.map((item) => {
            const checked = Boolean(today[item.key]);

            return (
              <Pressable
                key={item.key}
                onPress={() => toggleBasic(item.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                style={[styles.pill, checked && styles.pillOn]}
              >
                <Text style={[styles.pillText, checked && styles.pillTextOn]}>
                  {checked ? "✓ " : ""}
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {missing ? <Text style={styles.nudge}>{missing.nudge}</Text> : null}
      </Card>

      <Card>
        <CardTitle eyebrow="Breathe" title="Slow it down" />
        <Muted>
          Two minutes of slow breathing, with a light tap at each change so you can close your eyes.
          {today.breathingSeconds > 0 ? ` ${Math.round(today.breathingSeconds / 60)} min so far today.` : ""}
        </Muted>
        <Button title="Breathe for 2 minutes" onPress={() => router.push({ pathname: "/breathe", params: { minutes: "2" } })} />
      </Card>

      <Card>
        <CardTitle eyebrow="What helps you" title="Your steps" />
        {plan.copingSteps.length === 0 ? <Muted>Add the steps that help you in your plan.</Muted> : null}
        {plan.copingSteps.map((step) => {
          const done = today.stepsTried.includes(step);

          return (
            <Pressable
              key={step}
              onPress={() => toggleStep(step)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              style={[styles.step, done && styles.stepDone]}
            >
              <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={22} color={colors.accent} />
              <Text style={styles.stepText}>{step}</Text>
            </Pressable>
          );
        })}
        {plan.copingSteps.length > 0 ? <Text style={styles.hint}>Tick the ones you&apos;ve tried. One is enough to start.</Text> : null}
      </Card>

      <Card>
        <CardTitle eyebrow="Reach out" title="You don't have to hold this alone" />
        {plan.contacts.length === 0 ? (
          <Pressable onPress={() => router.push("/support/plan")}>
            <Text style={styles.link}>Add your counsellor or someone you trust so they&apos;re one tap away</Text>
          </Pressable>
        ) : null}
        {plan.contacts.map((contact) => (
          <View key={`${contact.name}-${contact.phone}`} style={styles.contact}>
            <View style={{ flex: 1 }}>
              <Text style={styles.contactName}>{contact.name}</Text>
              <Text style={styles.hint}>{contact.phone}</Text>
            </View>
            <Pressable onPress={() => call(contact.phone)} style={styles.callButton} accessibilityLabel={`Call ${contact.name}`}>
              <Ionicons name="call" size={16} color={colors.actionText} />
              <Text style={styles.callText}>Call</Text>
            </Pressable>
            <Pressable
              onPress={() => Linking.openURL(smsUrl(contact.phone)).catch(() => {})}
              style={styles.textButton}
              accessibilityLabel={`Text ${contact.name}`}
            >
              <Ionicons name="chatbubble-outline" size={16} color={colors.action} />
            </Pressable>
          </View>
        ))}
        <View style={[styles.contact, styles.helpline]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.contactName}>{plan.helpline.name}</Text>
            <Text style={styles.hint}>{plan.helpline.phone} · free, 24 hours</Text>
          </View>
          <Pressable onPress={() => call(plan.helpline.phone)} style={styles.callButton} accessibilityLabel={`Call ${plan.helpline.name}`}>
            <Ionicons name="call" size={16} color={colors.actionText} />
            <Text style={styles.callText}>Call</Text>
          </Pressable>
        </View>
        <Text style={styles.urgent}>{urgentLine(plan.helpline.phone)}</Text>
      </Card>

      <Button title="Edit my plan" variant="secondary" onPress={() => router.push("/support/plan")} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  hero: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 8,
  },
  heroActive: { backgroundColor: "#FFF7EC", borderColor: "rgba(120,80,30,0.12)" },
  heroTitle: { fontFamily: fonts.display, fontSize: 28, color: colors.ink },
  heroBody: { fontSize: 15, lineHeight: 23, color: colors.inkSoft },
  okay: { color: colors.inkSoft, fontSize: 14, textDecorationLine: "underline", marginTop: 4 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.field,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pillOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { fontSize: 14, color: colors.ink },
  pillTextOn: { color: colors.actionText, fontWeight: "600" },
  nudge: { fontSize: 14, lineHeight: 20, color: colors.inkSoft },
  step: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardSoft,
    padding: 12,
  },
  stepDone: { backgroundColor: "#ECFDF5", borderColor: "rgba(4,120,87,0.25)" },
  stepText: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.ink },
  hint: { fontSize: 12, color: colors.inkSoft },
  link: { color: colors.accent, fontSize: 14, lineHeight: 20 },
  contact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardSoft,
    padding: 12,
  },
  helpline: { backgroundColor: "#FFF7EC" },
  contactName: { fontSize: 15, color: colors.ink, fontWeight: "500" },
  callButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.action,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  callText: { color: colors.actionText, fontSize: 14, fontWeight: "600" },
  textButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  urgent: { fontSize: 12, lineHeight: 18, color: colors.inkSoft },
});
