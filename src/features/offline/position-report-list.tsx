import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Button } from '@/components/button';
import { colors, spacing } from '@/constants/ui';
import { exportPositionReport, loadPositionReports, removePositionReport, type PositionReport } from './position-reports';

export function PositionReportList() {
  const [reports, setReports] = useState<PositionReport[]>([]);
  const [message, setMessage] = useState('Loading reports...');
  const [selected, setSelected] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  useEffect(() => {
    loadPositionReports().then(items => { setReports(items); setMessage(''); })
      .catch(() => setMessage('Could not load local reports. Your saved data has been left intact.'));
  }, []);
  async function copy(report: PositionReport) {
    try {
      const copied = await Clipboard.setStringAsync(exportPositionReport(report));
      setMessage(copied ? 'Copied. Paste the report into our chat for review.' : 'Copy unavailable. Use Show report and select the text.');
    } catch { setMessage('Copy unavailable. Use Show report and select the text.'); }
  }
  async function remove(id: string) {
    try {
      await removePositionReport(id);
      setReports(items => items.filter(item => item.id !== id)); setRemoving(null);
    } catch { setMessage('Could not remove report. Please try again.'); }
  }
  return <View style={{ gap: spacing.md }}>
    <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>Saved position reports</Text>
    <Text>Reports stay on this device. Copy a report and paste it into our chat when you want it reviewed.</Text>
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
    {!message && reports.length === 0 ? <Text>No reports yet. Use “Report this position” during a game.</Text> : null}
    {reports.map(report => <View key={report.id} style={{ gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}>
      <Text>{new Date(report.createdAt).toLocaleString()} · Hand {report.position.handNumber}</Text>
      <Text>{report.note || 'No note added'}</Text>
      <Text>{report.position.deal.botDiagnostics?.decisionLabel || report.position.deal.status}</Text>
      <Button label="Copy report" variant="secondary" onPress={() => void copy(report)} />
      <Button label={selected === report.id ? 'Hide report' : 'Show report'} variant="secondary" onPress={() => setSelected(selected === report.id ? null : report.id)} />
      {selected === report.id ? <TextInput accessibilityLabel="Report JSON" multiline value={exportPositionReport(report)} onChangeText={() => undefined} style={{ height: 200, color: colors.text, borderWidth: 1, borderColor: colors.border }} /> : null}
      {removing === report.id ? <><Text>Remove this saved report from this device?</Text><Button label="Confirm remove" variant="danger" onPress={() => void remove(report.id)} /><Button label="Keep report" variant="secondary" onPress={() => setRemoving(null)} /></> : <Button label="Remove report" variant="secondary" onPress={() => setRemoving(report.id)} />}
    </View>)}
  </View>;
}
