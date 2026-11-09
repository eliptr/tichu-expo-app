import { useState } from 'react';
import { PositionReportList } from '@/features/offline/position-report-list';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { colors, spacing } from '@/constants/ui';
export default function OfflineHome() {
  const [reportsOpen, setReportsOpen] = useState(false);
  return <Screen contentStyle={styles.content}>
    <Text style={styles.badge}>TICHU / OFFLINE FIRST</Text>
    <Text style={styles.title}>Offline Home</Text>
    {Constants.expoConfig?.version ? <Text style={styles.body}>Version {Constants.expoConfig.version}</Text> : null}
    <Text style={styles.body}>Your table is ready. Play with three bots, inspect their decisions, and pick up where you left off.</Text>
    <View style={styles.card}>
      <Text style={styles.heading}>Play. Review. Repeat.</Text>
      <Text style={styles.body}>Your latest match and bot preferences save on this device. No account needed.</Text>
      <Button label="Offline bot game" onPress={() => router.push('/offline/game')} />
      <Text style={styles.body}>Automatically resumes your saved match.</Text>
    </View>
    <View style={styles.card}>
      <Text style={styles.heading}>Install on your phone</Text>
      <Text style={styles.body}>On iPhone, open in Safari and choose Share, then Add to Home Screen. Open once with internet to prepare offline play. Keep browser storage enabled to retain your save.</Text>
    </View>
    <Button label={reportsOpen ? "Hide saved reports" : "Saved position reports"} variant="secondary" onPress={() => setReportsOpen(!reportsOpen)} />
    {reportsOpen ? <PositionReportList /> : null}
    <Button label="Online prototype" variant="secondary" onPress={() => router.push('/onboarding')} />
  </Screen>;
}
const styles = StyleSheet.create({
  content: { gap: spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
  badge: { color: colors.accent, fontWeight: '800', marginTop: spacing.xl },
  title: { color: colors.text, fontSize: 36, fontWeight: '800' },
  heading: { color: colors.text, fontSize: 21, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  card: { backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
});
