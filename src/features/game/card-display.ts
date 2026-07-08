import type { TichuCard } from './game-types';

const rankOrder: Record<string, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

const specialDisplayOrder: Record<string, number> = {
  'mah-jong': 1,
  dog: 1.5,
  phoenix: 14.5,
  dragon: 15,
};

function displayRank(card: TichuCard) {
  if (card.kind === 'special') {
    return specialDisplayOrder[card.id] ?? card.sort_value;
  }

  return card.rank ? rankOrder[card.rank] ?? card.sort_value : card.sort_value;
}

export function sortCardsForHandDisplay(cards: TichuCard[]) {
  return [...cards].sort((a, b) => displayRank(a) - displayRank(b) || a.sort_value - b.sort_value || a.label.localeCompare(b.label));
}
