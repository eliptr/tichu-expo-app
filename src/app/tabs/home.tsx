import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { StateCard } from '@/components/state-card';
import { colors, spacing } from '@/constants/ui';
import { listMatchSummaries } from '@/features/scores/score-service';
import type { MatchSummary } from '@/features/scores/score-types';

const featureCards: {
  body: string;
  label: string;
  route: Href;
  title: string;
  variant: 'accent' | 'default' | 'green';
}[] = [
  {
    body: 'Deal a local hand against three bots. No network or Supabase gameplay state.',
    label: 'Start offline',
    route: '/offline/game' as Href,
    title: 'Offline bot game',
    variant: 'green',
  },
  {
    body: 'Shared rooms, private hands, passing, turns, and live table state.',
    label: 'Create room',
    route: '/rooms/new' as Href,
    title: 'Online rooms',
    variant: 'accent',
  },
  {
    body: 'Track real-world Tichu scores, rounds, Tichu calls, and match history.',
    label: 'Create match',
    route: '/matches/new',
    title: 'Score tracker',
    variant: 'default',
  },
];

export default function HomeScreen() {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMatches() {
    setLoadingMatches(true);
    setError(null);
    const { data, error: matchError } = await listMatchSummaries();
    setLoadingMatches(false);

    if (matchError) {
      setError(matchError.message);
      return;
    }

    setMatches(data ?? []);
  }

  useFocusEffect(
    useCallback(() => {
      void loadMatches();
    }, [])
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Tichu dashboard</Text>
        <Text style={styles.title}>Choose a table</Text>
        <Text style={styles.subtitle}>Keep online rooms parked, practice against bots offline, or track a real match.</Text>
      </View>

      <View style={styles.featureGrid}>
        {featureCards.map((feature) => (
          <Pressable
            accessibilityRole="button"
            key={feature.title}
            onPress={() => router.push(feature.route)}
            style={({ pressed }) => [
              styles.featureCard,
              feature.variant === 'accent' && styles.accentFeature,
              feature.variant === 'green' && styles.greenFeature,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.featureTitle}>{feature.title}</Text>
            <Text style={styles.featureBody}>{feature.body}</Text>
            <Text style={styles.featureAction}>{feature.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.roomActions}>
        <View style={styles.roomAction}>
          <Button label="Join room" onPress={() => router.push('/rooms/join' as Href)} variant="secondary" />
        </View>
        <View style={styles.roomAction}>
          <Button label="Create match" onPress={() => router.push('/matches/new')} variant="secondary" />
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent matches</Text>
        {loadingMatches ? <Text style={styles.loadingText}>Loading</Text> : null}
      </View>

      {loadingMatches ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Loading matches</Text>
        </View>
      ) : error ? (
        <View style={styles.section}>
          <StateCard
            title="Could not load matches"
            body={error}
            action={<Button label="Try again" onPress={loadMatches} variant="secondary" />}
          />
        </View>
      ) : matches.length === 0 ? (
        <View style={styles.section}>
          <StateCard
            title="No matches yet"
            body="Create your first match, then add rounds as you play."
            action={<Button label="Create match" onPress={() => router.push('/matches/new')} variant="secondary" />}
          />
        </View>
      ) : (
        <View style={styles.list}>
          {matches.map((match) => (
            <Pressable
              key={match.id}
              style={({ pressed }) => [styles.matchCard, pressed && styles.pressed]}
              onPress={() =>
                match.room_id
                  ? router.push(`/rooms/${match.room_id}` as Href)
                  : router.push({
                      pathname: '/matches/[matchId]',
                      params: { matchId: match.id },
                    })
              }>
              <View style={styles.matchHeader}>
                <Text style={styles.matchTitle}>
                  {match.team_one_name} vs {match.team_two_name}
                </Text>
                <View style={styles.badges}>
                  {match.room_code ? <Text style={styles.roomBadge}>Room {match.room_code}</Text> : null}
                  <Text style={[styles.status, match.status === 'completed' && styles.completed]}>
                    {match.status}
                  </Text>
                </View>
              </View>

              <View style={styles.scoreRow}>
                <View style={styles.scoreColumn}>
                  <Text style={styles.teamName}>{match.team_one_name}</Text>
                  <Text style={styles.score}>{match.team_one_total}</Text>
                </View>
                <View style={styles.scoreColumn}>
                  <Text style={styles.teamName}>{match.team_two_name}</Text>
                  <Text style={styles.score}>{match.team_two_total}</Text>
                </View>
              </View>

              <Text style={styles.meta}>
                {match.round_count} round{match.round_count === 1 ? '' : 's'} - first to {match.target_score}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  accentFeature: {
    backgroundColor: '#F8FBFF',
    borderColor: colors.accentSoft,
  },
  featureAction: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '900',
  },
  featureBody: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  featureCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  featureGrid: {
    gap: spacing.md,
  },
  featureTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  greenFeature: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '900',
  },
  inlineLoading: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  list: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  roomActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  roomAction: {
    flex: 1,
  },
  matchCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  pressed: {
    opacity: 0.78,
  },
  matchHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  matchTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
  },
  badges: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  roomBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  status: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  completed: {
    backgroundColor: '#DCFCE7',
    color: '#15803D',
  },
  scoreRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  scoreColumn: {
    flex: 1,
    gap: spacing.sm,
  },
  teamName: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  score: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
  },
  meta: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
});
