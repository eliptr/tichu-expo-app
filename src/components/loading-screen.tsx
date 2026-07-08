import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/ui';

type LoadingScreenProps = {
  message?: string;
};

export function LoadingScreen({ message = 'Loading' }: LoadingScreenProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  message: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
  },
});
