import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { FormTextInput } from '@/components/form-text-input';
import { Screen } from '@/components/screen';
import { colors, spacing } from '@/constants/ui';
import { createRoomWithMatch } from '@/features/rooms/room-service';
import { parseInteger } from '@/utils/number';

export default function NewRoomScreen() {
  const [displayName, setDisplayName] = useState('');
  const [teamOneName, setTeamOneName] = useState('Team 1');
  const [teamTwoName, setTeamTwoName] = useState('Team 2');
  const [targetScore, setTargetScore] = useState('1000');
  const [saving, setSaving] = useState(false);

  async function handleCreateRoom() {
    const name = displayName.trim();
    const teamOne = teamOneName.trim();
    const teamTwo = teamTwoName.trim();
    const target = parseInteger(targetScore, 1000);

    if (!name || !teamOne || !teamTwo || target <= 0) {
      Alert.alert('Check the room', 'Add your name, both team names, and a positive target score.');
      return;
    }

    setSaving(true);
    const { data, error } = await createRoomWithMatch({
      displayName: name,
      targetScore: target,
      teamOneName: teamOne,
      teamTwoName: teamTwo,
    });
    setSaving(false);

    if (error) {
      Alert.alert('Could not create room', error.message);
      return;
    }

    if (data) {
      router.replace(`/rooms/${data.id}` as Href);
    }
  }

  return (
    <Screen keyboardAware>
      <View style={styles.header}>
        <Text style={styles.title}>Create room</Text>
        <Text style={styles.subtitle}>Start a shared scorer and invite friends with a room code.</Text>
      </View>

      <View style={styles.form}>
        <FormTextInput label="Your display name" onChangeText={setDisplayName} placeholder="Example: Eli" value={displayName} />
        <FormTextInput label="Team 1" onChangeText={setTeamOneName} value={teamOneName} />
        <FormTextInput label="Team 2" onChangeText={setTeamTwoName} value={teamTwoName} />
        <FormTextInput
          keyboardType="number-pad"
          label="Target score"
          onChangeText={setTargetScore}
          value={targetScore}
        />
        <Button label="Create room" loading={saving} onPress={handleCreateRoom} />
        <Button label="Cancel" onPress={() => router.back()} variant="secondary" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
});
