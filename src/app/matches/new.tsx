import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { FormTextInput } from '@/components/form-text-input';
import { Screen } from '@/components/screen';
import { colors, spacing } from '@/constants/ui';
import { createMatch } from '@/features/scores/score-service';
import { parseInteger } from '@/utils/number';

export default function NewMatchScreen() {
  const [teamOneName, setTeamOneName] = useState('Us');
  const [teamTwoName, setTeamTwoName] = useState('Them');
  const [targetScore, setTargetScore] = useState('1000');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    const teamOne = teamOneName.trim();
    const teamTwo = teamTwoName.trim();
    const target = parseInteger(targetScore, 1000);

    if (!teamOne || !teamTwo || target <= 0) {
      Alert.alert('Check the match', 'Add both team names and a positive target score.');
      return;
    }

    setSaving(true);
    const { data, error } = await createMatch(teamOne, teamTwo, target);
    setSaving(false);

    if (error) {
      Alert.alert('Could not create match', error.message);
      return;
    }

    if (data) {
      router.replace({
        pathname: '/matches/[matchId]',
        params: { matchId: data.id },
      });
    }
  }

  return (
    <Screen keyboardAware>
      <View style={styles.header}>
        <Text style={styles.title}>New match</Text>
        <Text style={styles.subtitle}>Name the two teams and set the score target.</Text>
      </View>

      <View style={styles.form}>
        <FormTextInput label="Team 1" onChangeText={setTeamOneName} value={teamOneName} />
        <FormTextInput label="Team 2" onChangeText={setTeamTwoName} value={teamTwoName} />
        <FormTextInput
          keyboardType="number-pad"
          label="Target score"
          onChangeText={setTargetScore}
          value={targetScore}
        />
        <Button label="Create match" loading={saving} onPress={handleCreate} />
        <Button label="Cancel" onPress={() => router.back()} variant="secondary" />
      </View>
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
    lineHeight: 23,
  },
  form: {
    gap: spacing.md,
  },
});
