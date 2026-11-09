import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/button';
import { colors, spacing } from '@/constants/ui';
import { exportPositionReport, loadPositionReports, removePositionReport, type PositionReport } from './position-reports';

export function PositionReportList() {
  const [reports, setReports] = useState<PositionReport[]>([]);
  const [message, setMessage] = useState('Loading reports...');
  const [selected, setSelected] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
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
  async function saveAll() {
    setExporting(true);
    setMessage('');
    try {
      const filename = `tichu-position-reports-${new Date().toISOString().slice(0, 10)}.json`;
      const json = JSON.stringify(reports, null, 2);

      if (typeof File === 'function' && navigator.share && navigator.canShare) {
        const files = [new File([json], filename, { type: 'application/json' })];
        try {
          if (navigator.canShare({ files })) {
            await navigator.share({ files });
            return;
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return;
        }
      }

      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      try {
        link.click();
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
      setMessage('Download started. Look for the JSON file in Downloads.');
    } catch {
      setMessage('Could not save the reports. Please try again.');
    } finally {
      setExporting(false);
    }
  }
  async function remove(id: string) {
    try {
      await removePositionReport(id);
      setReports(items => items.filter(item => item.id !== id)); setRemoving(null);
    } catch { setMessage('Could not remove report. Please try again.'); }
  }
  return <View style={{ gap: spacing.md }}>
    <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>Saved position reports</Text>
    <Text>{Platform.OS === 'web'
      ? 'Reports stay on this device. Save all reports as one file, or copy a single report.'
      : 'Reports stay on this device. Copy a report and paste it into our chat when you want it reviewed.'}</Text>
    {Platform.OS === 'web' && reports.length > 0
      ? <Button label="Save all reports" variant="secondary" loading={exporting} onPress={() => void saveAll()} />
      : null}
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
