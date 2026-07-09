import type { TichuCard, TichuCombination } from './game-types';

type InvalidCombination = {
  reason: string;
  valid: false;
};

export type CombinationResult = InvalidCombination | TichuCombination;

const rankLabels: Record<number, string> = {
  1: 'Mah Jong',
  1.5: 'Phoenix',
  11: 'J',
  12: 'Q',
  13: 'K',
  14.5: 'Phoenix',
  14: 'A',
  15: 'Dragon',
};

function rankLabel(rank: number) {
  return rankLabels[rank] ?? String(rank);
}

function cardRank(card: TichuCard) {
  if (card.id === 'mah-jong') {
    return 1;
  }

  if (card.id === 'dragon') {
    return 15;
  }

  switch (card.rank) {
    case 'J':
      return 11;
    case 'Q':
      return 12;
    case 'K':
      return 13;
    case 'A':
      return 14;
    default:
      return Number(card.rank);
  }
}

function isPhoenix(card: TichuCard) {
  return card.id === 'phoenix';
}

function validCombo(combo: Omit<TichuCombination, 'valid'>): TichuCombination {
  return { ...combo, valid: true };
}

function rankCounts(ranks: number[]) {
  const counts = new Map<number, number>();
  ranks.forEach((rank) => {
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  });

  return counts;
}

function analyzePhoenixCards(cards: TichuCard[]): CombinationResult {
  const standardCards = cards.filter((card) => !isPhoenix(card));
  const count = cards.length;

  if (count === 1) {
    return validCombo({
      count: 1,
      is_bomb: false,
      label: 'Single Phoenix',
      rank: 1.5,
      type: 'single',
    });
  }

  if (standardCards.some((card) => card.kind !== 'standard')) {
    return { reason: 'Phoenix can only join normal suited cards.', valid: false };
  }

  const ranks = standardCards.map(cardRank).sort((a, b) => a - b);
  const counts = rankCounts(ranks);
  const distinctRanks = [...counts.keys()].sort((a, b) => a - b);

  if (standardCards.length !== count - 1) {
    return { reason: 'Phoenix can only join normal numbered cards.', valid: false };
  }

  if (count === 2) {
    const rank = ranks[0];
    return validCombo({ count, is_bomb: false, label: `Pair ${rankLabel(rank)}`, rank, type: 'pair' });
  }

  if (count === 3 && distinctRanks.length === 1 && counts.get(distinctRanks[0]) === 2) {
    const rank = distinctRanks[0];
    return validCombo({ count, is_bomb: false, label: `Triple ${rankLabel(rank)}`, rank, type: 'triple' });
  }

  if (count === 5) {
    const possibleFullHouseRanks = distinctRanks.filter((rank) => {
      const rankCount = counts.get(rank) ?? 0;
      const otherCounts = distinctRanks.filter((otherRank) => otherRank !== rank).map((otherRank) => counts.get(otherRank) ?? 0);

      return (rankCount === 2 && otherCounts.length === 1 && otherCounts[0] === 2) || (rankCount === 3 && otherCounts.length === 1 && otherCounts[0] === 1);
    });

    if (possibleFullHouseRanks.length > 0) {
      const rank = Math.max(...possibleFullHouseRanks);
      return validCombo({ count, is_bomb: false, label: `Full house ${rankLabel(rank)}`, rank, type: 'full_house' });
    }
  }

  if (count >= 5 && distinctRanks.length === ranks.length) {
    const maxPossibleRank = 14;

    for (let startRank = maxPossibleRank - count + 1; startRank >= 1; startRank -= 1) {
      const sequence = Array.from({ length: count }, (_, index) => startRank + index);
      const missingCount = sequence.filter((rank) => !counts.has(rank)).length;
      const allRanksFit = ranks.every((rank) => sequence.includes(rank));

      if (allRanksFit && missingCount === 1) {
        const rank = sequence[sequence.length - 1];
        return validCombo({ count, is_bomb: false, label: `Straight to ${rankLabel(rank)}`, rank, type: 'straight' });
      }
    }
  }

  if (count >= 4 && count % 2 === 0) {
    const singleRanks = distinctRanks.filter((rank) => counts.get(rank) === 1);
    const pairRanks = distinctRanks.filter((rank) => counts.get(rank) === 2);
    const hasOnlySinglesAndPairs = distinctRanks.every((rank) => {
      const rankCount = counts.get(rank);
      return rankCount === 1 || rankCount === 2;
    });

    if (hasOnlySinglesAndPairs && singleRanks.length === 1 && pairRanks.length === count / 2 - 1) {
      const minRank = distinctRanks[0];
      const maxRank = distinctRanks[distinctRanks.length - 1];

      if (maxRank - minRank + 1 === count / 2 && distinctRanks.length === count / 2) {
        return validCombo({
          count,
          is_bomb: false,
          label: `Consecutive pairs to ${rankLabel(maxRank)}`,
          rank: maxRank,
          type: 'consecutive_pairs',
        });
      }
    }
  }

  return { reason: 'Phoenix does not complete a supported combination.', valid: false };
}

function analyzeMahJongCards(cards: TichuCard[]): CombinationResult {
  const nonMahJongCards = cards.filter((card) => card.id !== 'mah-jong');

  if (cards.length === 1) {
    return validCombo({
      count: 1,
      is_bomb: false,
      label: 'Single Mah Jong',
      rank: 1,
      type: 'single',
    });
  }

  if (nonMahJongCards.some((card) => card.kind !== 'standard')) {
    return { reason: 'Mah Jong can only join normal suited cards in a straight.', valid: false };
  }

  const ranks = cards.map(cardRank).sort((a, b) => a - b);
  const distinctRanks = [...new Set(ranks)];
  const count = cards.length;
  const minRank = ranks[0];
  const maxRank = ranks[ranks.length - 1];
  const isStraight = count >= 5 && distinctRanks.length === count && minRank === 1 && maxRank - minRank + 1 === count;

  if (isStraight) {
    return validCombo({
      count,
      is_bomb: false,
      label: `Straight to ${rankLabel(maxRank)}`,
      rank: maxRank,
      type: 'straight',
    });
  }

  return { reason: 'Mah Jong can only be a single or the low card in a straight.', valid: false };
}

function analyzeMahJongPhoenixCards(cards: TichuCard[]): CombinationResult {
  const normalCards = cards.filter((card) => card.id !== 'mah-jong' && card.id !== 'phoenix');

  if (normalCards.some((card) => card.kind !== 'standard')) {
    return { reason: 'Mah Jong and Phoenix can only join normal suited cards in a straight.', valid: false };
  }

  const fixedRanks = [1, ...normalCards.map(cardRank)].sort((a, b) => a - b);
  const distinctRanks = [...new Set(fixedRanks)];
  const count = cards.length;
  const targetSequence = Array.from({ length: count }, (_, index) => index + 1);
  const fixedRanksFit = fixedRanks.every((rank) => targetSequence.includes(rank));
  const missingCount = targetSequence.filter((rank) => !distinctRanks.includes(rank)).length;

  if (count >= 5 && distinctRanks.length === fixedRanks.length && fixedRanksFit && missingCount === 1) {
    const maxRank = targetSequence[targetSequence.length - 1];

    return validCombo({
      count,
      is_bomb: false,
      label: `Straight to ${rankLabel(maxRank)}`,
      rank: maxRank,
      type: 'straight',
    });
  }

  return { reason: 'Mah Jong and Phoenix can only combine as the low straight with one missing rank.', valid: false };
}

export function analyzeCards(cards: TichuCard[]): CombinationResult {
  if (cards.length === 0) {
    return { reason: 'Choose cards to play.', valid: false };
  }

  if (cards.some((card) => card.id === 'dog')) {
    if (cards.length === 1) {
      return validCombo({
        count: 1,
        is_bomb: false,
        label: 'Dog',
        rank: 0,
        type: 'dog',
      });
    }

    return { reason: 'Dog must be played by itself.', valid: false };
  }

  if (cards.some((card) => card.id === 'mah-jong') && cards.some(isPhoenix)) {
    return analyzeMahJongPhoenixCards(cards);
  }

  if (cards.some(isPhoenix)) {
    return analyzePhoenixCards(cards);
  }

  if (cards.some((card) => card.id === 'mah-jong')) {
    return analyzeMahJongCards(cards);
  }

  const specialCards = cards.filter((card) => card.kind === 'special');

  if (specialCards.length > 0) {
    if (cards.length === 1) {
      const rank = cardRank(cards[0]);
      return validCombo({
        count: 1,
        is_bomb: false,
        label: `Single ${rankLabel(rank)}`,
        rank,
        type: 'single',
      });
    }

    return { reason: 'Special cards can only be singles for now.', valid: false };
  }

  const ranks = cards.map(cardRank).sort((a, b) => a - b);
  const rankCountsMap = rankCounts(ranks);

  const count = cards.length;
  const distinctRanks = [...rankCountsMap.keys()].sort((a, b) => a - b);
  const maxRank = ranks[ranks.length - 1];
  const minRank = ranks[0];
  const pairGroups = [...rankCountsMap.values()].filter((rankCount) => rankCount === 2).length;
  const tripleRanks = [...rankCountsMap.entries()].filter(([, rankCount]) => rankCount === 3).map(([rank]) => rank);
  const isStraight = count >= 5 && distinctRanks.length === count && maxRank - minRank + 1 === count;
  const isSameSuit = new Set(cards.map((card) => card.suit)).size === 1;

  if (count === 4 && distinctRanks.length === 1) {
    return validCombo({
      bomb_power: 1,
      count,
      is_bomb: true,
      label: `Bomb: four ${rankLabel(maxRank)}`,
      rank: maxRank,
      type: 'four_bomb',
    });
  }

  if (isStraight && isSameSuit) {
    return validCombo({
      bomb_power: 2,
      count,
      is_bomb: true,
      label: `Bomb: straight flush to ${rankLabel(maxRank)}`,
      rank: maxRank,
      type: 'straight_flush_bomb',
    });
  }

  if (count === 1) {
    return validCombo({ count, is_bomb: false, label: `Single ${rankLabel(maxRank)}`, rank: maxRank, type: 'single' });
  }

  if (count === 2 && distinctRanks.length === 1) {
    return validCombo({ count, is_bomb: false, label: `Pair ${rankLabel(maxRank)}`, rank: maxRank, type: 'pair' });
  }

  if (count === 3 && distinctRanks.length === 1) {
    return validCombo({ count, is_bomb: false, label: `Triple ${rankLabel(maxRank)}`, rank: maxRank, type: 'triple' });
  }

  if (count === 5 && tripleRanks.length === 1 && pairGroups === 1) {
    const rank = tripleRanks[0];
    return validCombo({ count, is_bomb: false, label: `Full house ${rankLabel(rank)}`, rank, type: 'full_house' });
  }

  if (isStraight) {
    return validCombo({ count, is_bomb: false, label: `Straight to ${rankLabel(maxRank)}`, rank: maxRank, type: 'straight' });
  }

  if (
    count >= 4 &&
    count % 2 === 0 &&
    pairGroups === count / 2 &&
    distinctRanks.length === count / 2 &&
    maxRank - minRank + 1 === count / 2
  ) {
    return validCombo({
      count,
      is_bomb: false,
      label: `Consecutive pairs to ${rankLabel(maxRank)}`,
      rank: maxRank,
      type: 'consecutive_pairs',
    });
  }

  return { reason: 'Not a supported Tichu combination.', valid: false };
}

export function comboBeats(newCombo: TichuCombination, currentCombo: TichuCombination | null) {
  if (!currentCombo) {
    return true;
  }

  if (newCombo.is_bomb && !currentCombo.is_bomb) {
    return true;
  }

  if (currentCombo.is_bomb) {
    if (!newCombo.is_bomb) {
      return false;
    }

    if ((newCombo.bomb_power ?? 0) !== (currentCombo.bomb_power ?? 0)) {
      return (newCombo.bomb_power ?? 0) > (currentCombo.bomb_power ?? 0);
    }

    if (newCombo.count !== currentCombo.count) {
      return newCombo.count > currentCombo.count;
    }

    return newCombo.rank > currentCombo.rank;
  }

  return newCombo.type === currentCombo.type && newCombo.count === currentCombo.count && newCombo.rank > currentCombo.rank;
}

export function validatePlay(cards: TichuCard[], currentCombo: TichuCombination | null): CombinationResult {
  const combo = analyzeCards(cards);

  if (!combo.valid) {
    return combo;
  }

  if (combo.type === 'dog' && currentCombo) {
    return { reason: 'Dog can only lead a trick.', valid: false };
  }

  if (combo.type === 'single' && cards.length === 1 && cards[0].id === 'phoenix') {
    if (!currentCombo) {
      return combo;
    }

    if (currentCombo.type !== 'single' || currentCombo.is_bomb) {
      return { reason: 'Phoenix can only answer a single as a single.', valid: false };
    }

    if (currentCombo.rank >= 15) {
      return { reason: 'Phoenix cannot beat the Dragon.', valid: false };
    }

    return {
      ...combo,
      label: `Single Phoenix over ${rankLabel(currentCombo.rank)}`,
      rank: Math.min(14.5, currentCombo.rank + 0.5),
    };
  }

  if (!comboBeats(combo, currentCombo)) {
    return { reason: 'Does not beat the current table.', valid: false };
  }

  return combo;
}
