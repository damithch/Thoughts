import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "@/lib/auth";
import { colors, fonts } from "@/lib/theme";

function RootNavigator() {
  const { ready, user } = useAuth();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.page }}>
        <ActivityIndicator color={colors.action} size="large" />
      </View>
    );
  }

  const signedIn = user !== null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.page },
        headerShadowVisible: false,
        headerTintColor: colors.action,
        headerTitleStyle: { fontFamily: fonts.display, color: colors.ink },
        contentStyle: { backgroundColor: colors.page },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="thought/new" options={{ title: "New thought", presentation: "modal" }} />
        <Stack.Screen name="thought/[id]" options={{ title: "Thought" }} />
        <Stack.Screen name="check-in" options={{ title: "Check-in", presentation: "modal" }} />
        <Stack.Screen name="task/[id]" options={{ title: "Task" }} />
        <Stack.Screen name="routine/[id]" options={{ title: "Routine" }} />
        <Stack.Screen name="agent" options={{ title: "Task assistant" }} />
        <Stack.Screen name="ask" options={{ title: "Ask your journal" }} />
        <Stack.Screen name="insights" options={{ title: "Insight library" }} />
        <Stack.Screen name="conversations" options={{ title: "Conversation logs" }} />
        <Stack.Screen name="anchors" options={{ title: "Anchor notes" }} />
        <Stack.Screen name="worry" options={{ title: "Worry postponement" }} />
        <Stack.Screen name="activation/index" options={{ title: "Behavioural activation" }} />
        <Stack.Screen name="activation/[id]" options={{ title: "Activity" }} />
        <Stack.Screen name="export" options={{ title: "Export reports" }} />
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
        <Stack.Screen name="support/index" options={{ title: "Support" }} />
        <Stack.Screen name="support/plan" options={{ title: "Your support plan" }} />
        <Stack.Screen name="breathe" options={{ title: "Breathe" }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
