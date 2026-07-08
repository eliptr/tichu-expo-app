import { Redirect, Tabs } from 'expo-router';

import { LoadingScreen } from '@/components/loading-screen';
import { colors } from '@/constants/ui';
import { useAuth } from '@/features/auth/auth-context';

export default function TabsLayout() {
  const { initializing, session } = useAuth();

  if (initializing) {
    return <LoadingScreen message="Loading your app" />;
  }

  if (!session) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          borderTopColor: colors.border,
        },
      }}>
      <Tabs.Screen name="home" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
