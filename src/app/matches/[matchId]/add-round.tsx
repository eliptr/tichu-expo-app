import type { ReactNode } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';

import { Button } from '@/components/button';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { StateCard } from '@/components/state-card';
import { colors, spacing } from '@/constants/ui';
import { addRound, getMatchDetail } from '@/features/scores/score-service';
import type { MatchDetail } from '@/features/scores/score-types';
import { formatSigned } from '@/utils/number';

type ResultMode = 'normal' | 'teamOneOneTwo' | 'teamTwoOneTwo';

const bonusOptions = [
  { label: 'None', value: 0 },
  { label: 'Tichu made', value: 100 },
  { label: 'Tichu failed', value: -100 },
  { label: 'Grand made', value: 200 },
  { label: 'Grand failed', value: -200 },
];

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export default function AddRoundScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [resultMode, setResultMode] = useState<ResultMode>('normal');
  const [teamOneCardPoints, setTeamOneCardPoints] = useState(50);
  const [teamOneBonus, setTeamOneBonus] = useState(0);
  const [teamTwoBonus, setTeamTwoBonus] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const scorePreview = useMemo(() => {
    const base =
      resultMode === 'teamOneOneTwo'
        ? { teamOne: 200, teamTwo: 0 }
        : resultMode === 'teamTwoOneTwo'
          ? { teamOne: 0, teamTwo: 200 }
          : { teamOne: teamOneCardPoints, teamTwo: 100 - teamOneCardPoints };

    return {
      teamOneBase: base.teamOne,
      teamOneTotal: base.teamOne + teamOneBonus,
      teamTwoBase: base.teamTwo,
      teamTwoTotal: base.teamTwo + teamTwoBonus,
    };
  }, [resultMode, teamOneBonus, teamOneCardPoints, teamTwoBonus]);

  function animateScoreChange() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }

  function updateResultMode(nextMode: ResultMode) {
    animateScoreChange();
    setResultMode(nextMode);

    if (nextMode === 'teamOneOneTwo') {
      setTeamTwoBonus(0);
    }

    if (nextMode === 'teamTwoOneTwo') {
      setTeamOneBonus(0);
    }
  }

  function updateTeamOneCardPoints(nextValue: number) {
    animateScoreChange();
    setTeamOneCardPoints(nextValue);
  }

  const loadMatch = useCallback(async () => {
    if (!matchId) {
      setLoading(false);
      return;
    }

    const { data, error } = await getMatchDetail(matchId);
    setLoading(false);

    if (error) {
      Alert.alert('Could not load match', error.message);
      return;
    }

    setMatch(data);
  }, [matchId]);

  async function handleSave() {
    if (!matchId) {
      Alert.alert('Missing match', 'Go back and choose a match again.');
      return;
    }

    if (match?.status === 'completed') {
      Alert.alert('Match completed', 'Reopen this match before adding more rounds.');
      return;
    }

    setSaving(true);
    const { error } = await addRound(matchId, {
      notes:
        resultMode === 'teamOneOneTwo'
          ? `${match?.team_one_name ?? 'Team 1'} one-two finish`
          : resultMode === 'teamTwoOneTwo'
            ? `${match?.team_two_name ?? 'Team 2'} one-two finish`
            : null,
      team_one_points: scorePreview.teamOneBase,
      team_one_tichu_bonus: teamOneBonus,
      team_two_points: scorePreview.teamTwoBase,
      team_two_tichu_bonus: teamTwoBonus,
    });
    setSaving(false);

    if (error) {
      Alert.alert('Could not add round', error.message);
      return;
    }

    router.dismissTo({
      pathname: '/matches/[matchId]',
      params: { matchId },
    });
  }

  useEffect(() => {
    void loadMatch();
  }, [loadMatch]);

  if (loading) {
    return <LoadingScreen message="Loading round form" />;
  }

  if (!match) {
    return (
      <Screen compact>
        <StateCard title="Match not found" body="Go back to the match list and try again." />
      </Screen>
    );
  }

  if (match.status === 'completed') {
    return (
      <Screen compact>
        <StateCard
          title="Match is completed"
          body="Rounds are locked for completed matches. Reopen the match from the scoreboard before adding points."
          action={<Button label="Back to match" onPress={() => router.back()} variant="secondary" />}
        />
      </Screen>
    );
  }

  return (
    <Screen compact>
      <View style={styles.header}>
        <Text style={styles.title}>Add round</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Round result</Text>
        <ChipRow>
          <ChoiceChip active={resultMode === 'normal'} label="Normal hand" onPress={() => updateResultMode('normal')} />
          <ChoiceChip
            active={resultMode === 'teamOneOneTwo'}
            label={`${match.team_one_name} 1-2`}
            onPress={() => updateResultMode('teamOneOneTwo')}
          />
          <ChoiceChip
            active={resultMode === 'teamTwoOneTwo'}
            label={`${match.team_two_name} 1-2`}
            onPress={() => updateResultMode('teamTwoOneTwo')}
          />
        </ChipRow>
      </View>

      {resultMode === 'normal' ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Card points</Text>
          <View style={styles.stepperCard}>
            <Text style={styles.teamLabel}>{match.team_one_name}</Text>
            <View style={styles.scoreControlRow}>
              <Button
                label="-5"
                onPress={() => updateTeamOneCardPoints(Math.max(-25, teamOneCardPoints - 5))}
                variant="secondary"
              />
              <View style={styles.scoreCenter}>
                <Text style={styles.bigNumber}>{teamOneCardPoints}</Text>
                <Text style={styles.autoScore}>{match.team_two_name}: {100 - teamOneCardPoints}</Text>
              </View>
              <Button
                label="+5"
                onPress={() => updateTeamOneCardPoints(Math.min(125, teamOneCardPoints + 5))}
                variant="secondary"
              />
            </View>
          </View>
        </View>
      ) : null}

      {resultMode !== 'teamTwoOneTwo' ? (
        <BonusPicker teamName={match.team_one_name} value={teamOneBonus} onChange={setTeamOneBonus} />
      ) : null}
      {resultMode !== 'teamOneOneTwo' ? (
        <BonusPicker teamName={match.team_two_name} value={teamTwoBonus} onChange={setTeamTwoBonus} />
      ) : null}

      <View style={styles.actions}>
        <Button label="Save round" loading={saving} onPress={handleSave} />
        <Button label="Cancel" onPress={() => router.back()} variant="secondary" />
      </View>
    </Screen>
  );
}

function BonusPicker({
  onChange,
  teamName,
  value,
}: {
  onChange: (value: number) => void;
  teamName: string;
  value: number;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{teamName} Tichu call</Text>
      <ChipRow>
        {bonusOptions.map((option) => (
          <ChoiceChip
            key={option.label}
            active={value === option.value}
            label={option.value === 0 ? option.label : `${option.label} ${formatSigned(option.value)}`}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              onChange(option.value);
            }}
          />
        ))}
      </ChipRow>
    </View>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

function ChoiceChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.activeChip, pressed && styles.pressed]}>
      <Text style={[styles.chipText, active && styles.activeChipText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 6,
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  section: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  activeChip: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pressed: {
    opacity: 0.78,
  },
  chipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  activeChipText: {
    color: colors.background,
  },
  stepperCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: spacing.md,
  },
  teamLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  scoreControlRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  scoreCenter: {
    alignItems: 'center',
    flex: 1,
  },
  bigNumber: {
    color: colors.text,
    fontSize: 46,
    fontWeight: '900',
    lineHeight: 50,
    minWidth: 88,
    textAlign: 'center',
  },
  autoScore: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  actions: {
    gap: spacing.sm,
  },
});
