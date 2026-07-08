import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { StateCard } from '@/components/state-card';
import { colors, spacing } from '@/constants/ui';
import { useAuth } from '@/features/auth/auth-context';
import { deleteMatch, getMatchDetail, subscribeToMatch, updateMatchStatus } from '@/features/scores/score-service';
import type { MatchDetail, Round } from '@/features/scores/score-types';
import { formatSigned } from '@/utils/number';

export default function MatchDetailScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { user } = useAuth();
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  const loadMatch = useCallback(async () => {
    if (!matchId) {
      setError('Missing match id.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error: matchError } = await getMatchDetail(matchId);
    setLoading(false);

    if (matchError) {
      setError(matchError.message);
      return;
    }

    setMatch(data);
  }, [matchId]);

  async function handleToggleStatus() {
    if (!match) {
      return;
    }

    const nextStatus = match.status === 'active' ? 'completed' : 'active';
    setSavingStatus(true);
    const { error: statusError } = await updateMatchStatus(match.id, nextStatus);
    setSavingStatus(false);

    if (statusError) {
      Alert.alert('Could not update match', statusError.message);
      return;
    }

    await loadMatch();
  }

  function handleDeleteMatch() {
    Alert.alert('Delete match?', 'This permanently deletes the match, room if any, and all of its rounds.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void confirmDeleteMatch(),
      },
    ]);
  }

  async function confirmDeleteMatch() {
    if (!match) {
      return;
    }

    const { error: deleteError } = await deleteMatch(match.id);

    if (deleteError) {
      Alert.alert('Could not delete match', deleteError.message);
      return;
    }

    router.replace('/tabs/home');
  }

  useFocusEffect(
    useCallback(() => {
      void loadMatch();
    }, [loadMatch])
  );

  useEffect(() => {
    if (!matchId) {
      return undefined;
    }

    return subscribeToMatch(matchId, () => {
      void loadMatch();
    });
  }, [loadMatch, matchId]);

  if (loading) {
    return <LoadingScreen message="Loading match" />;
  }

  if (error || !match) {
    return (
      <Screen>
        <StateCard
          title="Match could not load"
          body={error ?? 'No match found.'}
          action={<Button label="Back to matches" onPress={() => router.replace('/tabs/home')} variant="secondary" />}
        />
      </Screen>
    );
  }

  const leadingTeam =
    match.team_one_total === match.team_two_total
      ? 'Tied'
      : match.team_one_total > match.team_two_total
        ? match.team_one_name
        : match.team_two_name;
  const targetReached =
    match.team_one_total >= match.target_score || match.team_two_total >= match.target_score;
  const winnerName =
    match.team_one_total === match.team_two_total
      ? 'Both teams'
      : match.team_one_total > match.team_two_total
        ? match.team_one_name
        : match.team_two_name;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{match.status}</Text>
        {match.room_code ? <Text style={styles.roomBadge}>Shared room {match.room_code}</Text> : null}
        <Text style={styles.title}>
          {match.team_one_name} vs {match.team_two_name}
        </Text>
        <Text style={styles.subtitle}>
          {targetReached
            ? `${winnerName} reached ${match.target_score}. Mark the match complete when the result is final.`
            : `${leadingTeam === 'Tied' ? 'The match is tied.' : `${leadingTeam} is leading.`} First to ${
                match.target_score
              }.`}
        </Text>
      </View>

      <View style={styles.scoreboard}>
        <ScorePanel name={match.team_one_name} score={match.team_one_total} />
        <ScorePanel name={match.team_two_name} score={match.team_two_total} />
      </View>

      <View style={styles.actions}>
        {match.status === 'active' ? (
          <Button
            label="Add round"
            onPress={() =>
              router.push({
                pathname: '/matches/[matchId]/add-round',
                params: { matchId: match.id },
              })
            }
          />
        ) : (
          <StateCard title="Match complete" body="Reopen this match before adding more rounds." />
        )}
        <View style={styles.secondaryActions}>
          <View style={styles.secondaryAction}>
            <Button
              label={match.status === 'active' ? 'Mark complete' : 'Reopen match'}
              loading={savingStatus}
              onPress={handleToggleStatus}
              variant="secondary"
            />
          </View>
          {(!match.room_id || match.room_host_user_id === user?.id) && (
            <Pressable
              accessibilityRole="button"
              onPress={handleDeleteMatch}
              style={({ pressed }) => [styles.deleteAction, pressed && styles.pressedDeleteLink]}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.rounds}>
        <Text style={styles.sectionTitle}>Rounds</Text>
        {match.rounds.length === 0 ? (
          <StateCard title="No rounds yet" body="Add the first round after scoring a hand." />
        ) : (
          [...match.rounds].reverse().map((round) => (
            <RoundCard key={round.id} round={round} teamOneName={match.team_one_name} teamTwoName={match.team_two_name} />
          ))
        )}
      </View>
    </Screen>
  );
}

function ScorePanel({ name, score }: { name: string; score: number }) {
  return (
    <View style={styles.scorePanel}>
      <Text style={styles.teamName}>{name}</Text>
      <Text style={styles.score}>{score}</Text>
    </View>
  );
}

function RoundCard({ round, teamOneName, teamTwoName }: { round: Round; teamOneName: string; teamTwoName: string }) {
  const teamOneTotal = round.team_one_points + round.team_one_tichu_bonus;
  const teamTwoTotal = round.team_two_points + round.team_two_tichu_bonus;

  return (
    <View style={styles.roundCard}>
      <Text style={styles.roundTitle}>Round {round.round_number}</Text>
      <View style={styles.roundLine}>
        <Text style={styles.roundTeam}>{teamOneName}</Text>
        <Text style={styles.roundScore}>
          {teamOneTotal} ({round.team_one_points} {formatSigned(round.team_one_tichu_bonus)})
        </Text>
      </View>
      <View style={styles.roundLine}>
        <Text style={styles.roundTeam}>{teamTwoName}</Text>
        <Text style={styles.roundScore}>
          {teamTwoTotal} ({round.team_two_points} {formatSigned(round.team_two_tichu_bonus)})
        </Text>
      </View>
      {round.notes ? <Text style={styles.notes}>{round.notes}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  roomBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  title: {
    color: colors.text,
    fontSize: 31,
    fontWeight: '800',
    lineHeight: 37,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  scoreboard: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  scorePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  teamName: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  score: {
    color: colors.text,
    fontSize: 38,
    fontWeight: '900',
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  secondaryActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  secondaryAction: {
    flex: 1,
  },
  deleteAction: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pressedDeleteLink: {
    opacity: 0.65,
  },
  deleteText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  rounds: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  roundCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  roundTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  roundLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  roundTeam: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  roundScore: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  notes: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
});
