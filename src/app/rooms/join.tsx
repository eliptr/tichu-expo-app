import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { FormTextInput } from '@/components/form-text-input';
import { Screen } from '@/components/screen';
import { colors, spacing } from '@/constants/ui';
import { joinRoomByCode } from '@/features/rooms/room-service';

export default function JoinRoomScreen() {
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joining, setJoining] = useState(false);

  async function handleJoinRoom() {
    const name = displayName.trim();
    const code = roomCode.trim().toUpperCase();

    if (!name || code.length !== 6) {
      Alert.alert('Check the room code', 'Add your name and the 6-character room code.');
      return;
    }

    setJoining(true);
    const { data, error } = await joinRoomByCode(code, name);
    setJoining(false);

    if (error) {
      Alert.alert('Could not join room', error.message);
      return;
    }

    if (data) {
      router.replace(`/rooms/${data}` as Href);
    }
  }

  return (
    <Screen keyboardAware>
      <View style={styles.header}>
        <Text style={styles.title}>Join room</Text>
        <Text style={styles.subtitle}>Enter the code from your friend to join their shared scorer.</Text>
      </View>

      <View style={styles.form}>
        <FormTextInput label="Your display name" onChangeText={setDisplayName} placeholder="Example: Alex" value={displayName} />
        <FormTextInput
          autoCapitalize="characters"
          label="Room code"
          maxLength={6}
          onChangeText={(value) => setRoomCode(value.toUpperCase())}
          placeholder="ABC123"
          value={roomCode}
        />
        <Button label="Join room" loading={joining} onPress={handleJoinRoom} />
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
