import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button, Eyebrow } from "@/components/ui";
import { supportHeadline } from "@/lib/support";
import { colors, fonts, radius } from "@/lib/theme";
import type { SupportStatus } from "@/lib/types";

// Shown at the top of Today during a rough patch.
export function SupportBanner({ status, onDismiss }: { status: SupportStatus; onDismiss: () => void }) {
  if (!status.active) return null;

  const { title, body } = supportHeadline(status);

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Eyebrow>Go gently</Eyebrow>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <View style={styles.actions}>
        <Button title="Open my support plan" onPress={() => router.push("/support")} style={styles.primary} />
        <Button
          title="Breathe 2 min"
          variant="secondary"
          onPress={() => router.push({ pathname: "/breathe", params: { minutes: "2" } })}
          style={styles.secondary}
        />
      </View>
      <Pressable onPress={onDismiss} hitSlop={8} style={{ alignSelf: "flex-start" }}>
        <Text style={styles.okay}>I&apos;m okay for now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF7EC",
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "rgba(120,80,30,0.12)",
    padding: 18,
    gap: 8,
  },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.inkSoft },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  primary: { flexGrow: 1 },
  secondary: { flexGrow: 1 },
  okay: { color: colors.inkSoft, fontSize: 14, textDecorationLine: "underline", marginTop: 2 },
});
