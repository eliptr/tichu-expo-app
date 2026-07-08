import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/features/auth/auth-context';
import { initSentry, wrapWithSentry } from '@/lib/sentry';

initSentry();

function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding/index" />
        <Stack.Screen name="auth/sign-in" />
        <Stack.Screen name="auth/sign-up" />
        <Stack.Screen name="auth/forgot-password" />
        <Stack.Screen name="tabs" />
        <Stack.Screen name="offline/game" />
        <Stack.Screen name="matches/new" />
        <Stack.Screen name="matches/[matchId]/index" />
        <Stack.Screen name="matches/[matchId]/add-round" />
        <Stack.Screen name="rooms/new" />
        <Stack.Screen name="rooms/join" />
        <Stack.Screen name="rooms/[roomId]/index" />
        <Stack.Screen name="rooms/[roomId]/hand" />
        <Stack.Screen name="settings/index" />
        <Stack.Screen name="settings/delete-account" />
      </Stack>
      <StatusBar style="auto" />
    </AuthProvider>
  );
}

export default wrapWithSentry(RootLayout);
