import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { colors, spacing } from '@/constants/ui';

export default function DeleteAccountScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Account deletion</Text>
        <Text style={styles.subtitle}>
          This screen documents the production-safe path. Deleting an auth user requires a
          server-side Supabase Edge Function with the service-role key.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Phase 1 behavior</Text>
        <Text style={styles.body}>
          For this walking skeleton, do not delete users directly from the mobile app. Use the
          Supabase dashboard while testing. In a later milestone, add an Edge Function that verifies
          the current user and calls the Supabase admin API.
        </Text>
      </View>

      <Link href="/tabs/profile" asChild>
        <Button label="Back to profile" variant="secondary" />
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
});
