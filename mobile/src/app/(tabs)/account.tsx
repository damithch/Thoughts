import Constants from "expo-constants";
import { Alert, Linking, ScrollView, StyleSheet, Text } from "react-native";

import { Button, Card, Eyebrow } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colors, fonts } from "@/lib/theme";

export default function AccountScreen() {
  const { user, serverUrl, signOut } = useAuth();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <Eyebrow>Signed in as</Eyebrow>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.detail}>{user?.email}</Text>
      </Card>

      <Card>
        <Eyebrow>On the web</Eyebrow>
        <Text style={styles.detail}>
          Routines, the insight library, completion stats and exports are on the web app for now.
        </Text>
        <Button title="Open web app" variant="secondary" onPress={() => Linking.openURL(`${serverUrl}/dashboard`)} />
      </Card>

      <Button
        title="Sign out"
        variant="danger"
        onPress={() =>
          Alert.alert("Sign out?", "You'll need your password to sign in again.", [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: signOut },
          ])
        }
      />

      <Text style={styles.version}>
        Thoughts {Constants.expoConfig?.version} · {serverUrl.replace(/^https?:\/\//, "")}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  name: { fontFamily: fonts.display, fontSize: 26, color: colors.ink },
  detail: { fontSize: 14, lineHeight: 21, color: colors.inkSoft },
  version: { textAlign: "center", fontSize: 12, color: colors.inkFaint },
});
