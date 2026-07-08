import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { colors, spacing } from '@/constants/ui';

export default function OnboardingScreen() {
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.badge}>Tichu App</Text>
        <Text style={styles.title}>A tiny first step toward your Tichu table.</Text>
        <Text style={styles.subtitle}>
          This starter proves mobile auth, Supabase storage, and app routing before the game logic
          gets layered in.
        </Text>
      </View>

      <View style={styles.actions}>
        <Link href="/auth/sign-up" asChild>
          <Button label="Create account" />
        </Link>
        <Link href="/auth/sign-in" asChild>
          <Button label="Sign in" variant="secondary" />
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'space-between',
  },
  hero: {
    gap: spacing.md,
    paddingTop: spacing.xl,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 38,
    fontWeight: '800',
    lineHeight: 44,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 25,
  },
  actions: {
    gap: spacing.md,
  },
});
