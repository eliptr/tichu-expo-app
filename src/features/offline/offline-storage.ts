import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OfflineBotExperiments, OfflineDeal } from './offline-game';

export type OfflineSave = {
  version: 1;
  deal: OfflineDeal;
  targetScore: 500 | 1000 | 2000 | null;
  matchScores: { teamOne: number; teamTwo: number };
  handNumber: number;
  scoredHandNumber: number;
  botDelay: number;
  showDiagnostics: boolean;
  botExperiments?: OfflineBotExperiments;
};

export function normalizeOfflineBotExperiments(settings?: OfflineBotExperiments): OfflineBotExperiments {
  return {
    extraPhoenixProtection: settings?.extraPhoenixProtection === true,
    exitProtection: settings?.exitProtection === true,
    protectLowCards: settings?.protectLowCards === true,
    endgameSearch: settings?.endgameSearch === true,
  };
}
const key = 'tichu.offline.v1';
let writes = Promise.resolve();
export async function loadOfflineSave(): Promise<OfflineSave | null> {
  await writes.catch(() => undefined);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  const save = JSON.parse(raw) as OfflineSave;
  if (save.version !== 1 || !save.deal?.hands || !Array.isArray(save.deal.humanHand) ||
      !Array.isArray(save.deal.plays) || !save.matchScores ||
      ![null, 500, 1000, 2000].includes(save.targetScore) ||
      !Number.isFinite(save.matchScores.teamOne) || !Number.isFinite(save.matchScores.teamTwo) ||
      !Number.isInteger(save.handNumber) || save.handNumber < 1 ||
      !Number.isInteger(save.scoredHandNumber) || ![250, 650, 1500].includes(save.botDelay) ||
      typeof save.showDiagnostics !== 'boolean') throw new Error('Saved game is incompatible or damaged.');
  return save;
}
export function saveOfflineGame(save: OfflineSave) {
  const raw = JSON.stringify(save);
  writes = writes.catch(() => undefined).then(() => AsyncStorage.setItem(key, raw));
  return writes;
}
