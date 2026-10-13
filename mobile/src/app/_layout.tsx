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
