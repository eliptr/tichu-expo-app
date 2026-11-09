import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OfflineBotVersion, OfflineDeal } from './offline-game';
import type { OfflineSave } from './offline-storage';

export type PositionReport = {
  version: 1;
  engineVersion: 'heuristic-v1' | OfflineBotVersion;
  id: string;
  createdAt: string;
  note: string;
  position: OfflineSave;
  beforeLastBotMove: OfflineDeal | null;
};
const key = 'tichu.position-reports.v1';
let queue = Promise.resolve();
export function capturePosition(position: OfflineSave, beforeLastBotMove: OfflineDeal | null): PositionReport {
  return JSON.parse(JSON.stringify({ version: 1, engineVersion: position.deal.botDiagnostics?.engineVersion ?? 'heuristic-v2',
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(), note: '', position, beforeLastBotMove }));
}
async function readReports(): Promise<PositionReport[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];
  const reports = JSON.parse(raw);
  if (!Array.isArray(reports) || reports.some(report => report?.version !== 1 || typeof report.id !== 'string' || !report.position?.deal)) {
    throw new Error('Saved reports could not be read.');
  }
  return reports;
}
export async function loadPositionReports() {
  await queue.catch(() => undefined);
  return readReports();
}
export function storePositionReport(report: PositionReport) {
  const snapshot = JSON.parse(JSON.stringify(report)) as PositionReport;
  const operation = queue.catch(() => undefined).then(async () => {
    const reports = await readReports();
    if (reports.some(item => item.id === snapshot.id)) return;
    if (reports.length >= 50) throw new Error('Report storage is full (50 reports). Copy and remove an older report first.');
    await AsyncStorage.setItem(key, JSON.stringify([snapshot, ...reports]));
  });
  queue = operation;
  return operation;
}
export function removePositionReport(id: string) {
  const operation = queue.catch(() => undefined).then(async () => {
    const reports = await readReports();
    await AsyncStorage.setItem(key, JSON.stringify(reports.filter(report => report.id !== id)));
  });
  queue = operation;
  return operation;
}
export function exportPositionReport(report: PositionReport) {
  return JSON.stringify(report, null, 2);
}
