import { useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Card, ErrorText, Eyebrow, Field, Heading } from "@/components/ui";
import { ApiError, useAuth } from "@/lib/auth";
import { colors, fonts } from "@/lib/theme";

export default function LoginScreen() {
  const { signIn, serverUrl } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState(serverUrl);
  // Ask for the server up front until one has been used successfully on this phone.
  const [showServer, setShowServer] = useState(!serverUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!server.trim()) {
      setShowServer(true);
      setError("Enter your Thoughts web address, e.g. thoughts-yourname.vercel.app");
      return;
    }

    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await signIn(server, email.trim(), password);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Sign-in failed. Try again.");
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text style={styles.title}>Thoughts</Text>
            <Text style={styles.subtitle}>A calm private space for reflection and your day.</Text>
          </View>

          <Card>
            <View>
              <Eyebrow>Welcome back</Eyebrow>
              <Heading>Sign in</Heading>
            </View>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={submit}
            />
            {showServer ? (
              <Field
                label="Server"
                value={server}
                onChangeText={setServer}
                autoCapitalize="none"
                keyboardType="url"
                placeholder="thoughts-yourname.vercel.app"
                hint="The address you open Thoughts at in your browser."
              />
            ) : null}
            <ErrorText message={error} />
            <Button title="Sign in" onPress={submit} busy={busy} />
            <Pressable onPress={() => setShowServer((value) => !value)} hitSlop={8}>
              <Text style={styles.link}>{showServer ? "Hide server settings" : "Server settings"}</Text>
            </Pressable>
          </Card>

          <Text style={styles.footnote}>
            Use the same account as the web app. New accounts and password resets are on the web.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  content: { flexGrow: 1, justifyContent: "center", padding: 20, gap: 24 },
  brand: { alignItems: "center", gap: 8 },
  title: { fontFamily: fonts.display, fontSize: 44, color: colors.action },
  subtitle: { fontSize: 15, color: colors.inkSoft, textAlign: "center" },
  link: { textAlign: "center", color: colors.accent, fontSize: 13 },
  footnote: { textAlign: "center", color: colors.inkSoft, fontSize: 12, paddingHorizontal: 16 },
});
