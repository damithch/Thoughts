import Constants from "expo-constants";
import { router } from "expo-router";
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button, Card, Eyebrow, NavRow } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { cancelAllReminders, unregisterPush } from "@/lib/notifications";
import { colors, fonts } from "@/lib/theme";

export default function MoreScreen() {
  const { user, serverUrl, signOut, request } = useAuth();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Eyebrow>Reflect & grow</Eyebrow>
      <View style={styles.group}>
        <NavRow
          icon="library-outline"
          title="Insight library"
          subtitle="Books, articles and ideas you're applying"
          onPress={() => router.push("/insights")}
        />
        <NavRow icon="search-outline" title="Ask your journal" subtitle="AI answers from your own entries" onPress={() => router.push("/ask")} />
        <NavRow icon="chatbubbles-outline" title="Conversation logs" subtitle="Summaries pushed from Claude" onPress={() => router.push("/conversations")} />
        <NavRow icon="boat-outline" title="Anchor notes" subtitle="What stayed true, day by day" onPress={() => router.push("/anchors")} />
      </View>

      <Eyebrow>Wellbeing tools</Eyebrow>
      <View style={styles.group}>
        <NavRow
          icon="heart-outline"
          title="Support & breathing"
          subtitle="Your plan for hard moments, and guided breathing"
          onPress={() => router.push("/support")}
        />
        <NavRow
          icon="cloud-outline"
          title="Worry postponement"
          subtitle="Test a worry belief over a week"
          onPress={() => router.push("/worry")}
        />
        <NavRow
          icon="eye-outline"
          title="Attention training"
          subtitle="Everyday task focusing and short meditations"
          onPress={() => router.push("/attention")}
        />
        <NavRow
          icon="walk-outline"
          title="Behavioural activation"
          subtitle="Rate activities before and after"
          onPress={() => router.push("/activation")}
        />
      </View>

      <Eyebrow>Data</Eyebrow>
      <View style={styles.group}>
        <NavRow icon="notifications-outline" title="Reminders" subtitle="Evening close, thinking time, habits, quiet hours" onPress={() => router.push("/reminders")} />
        <NavRow icon="share-outline" title="Export reports" subtitle="Daily and monthly JSON or CSV" onPress={() => router.push("/export")} />
        <NavRow icon="settings-outline" title="Settings" subtitle="AI model and assistant options" onPress={() => router.push("/settings")} />
      </View>

      <Card>
        <Eyebrow>Signed in as</Eyebrow>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.detail}>{user?.email}</Text>
        <Button title="Open web app" variant="secondary" onPress={() => Linking.openURL(`${serverUrl}/dashboard`)} />
        <Button
          title="Sign out"
          variant="danger"
          onPress={() =>
            Alert.alert("Sign out?", "You'll need your password to sign in again.", [
              { text: "Cancel", style: "cancel" },
              {
              text: "Sign out",
              style: "destructive",
              // Stop server alerts reaching this phone before the token is forgotten.
              onPress: async () => {
                await unregisterPush(request);
                await cancelAllReminders();
                await signOut();
              },
            },
            ])
          }
        />
      </Card>

      <Text style={styles.version}>
        Thoughts {Constants.expoConfig?.version} · {serverUrl.replace(/^https?:\/\//, "")}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  group: { gap: 8, marginBottom: 8 },
  name: { fontFamily: fonts.display, fontSize: 26, color: colors.ink },
  detail: { fontSize: 14, lineHeight: 21, color: colors.inkSoft },
  version: { textAlign: "center", fontSize: 12, color: colors.inkFaint },
});
