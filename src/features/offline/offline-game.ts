import { sortCardsForHandDisplay } from '@/features/game/card-display';
import { validatePlay } from '@/features/game/combination';
import type { GameHand, TichuCard, TichuCombination } from '@/features/game/game-types';

export type OfflineSeat = GameHand['seat'];
export type OfflineTeam = 'team_one' | 'team_two';
export type PassDirection = 'left' | 'right' | 'teammate';
export type OfflineGameStatus = 'dealt' | 'finished' | 'playing';
export type OfflineHands = Record<OfflineSeat, TichuCard[]>;
export type OfflinePassSelection = Record<PassDirection, string>;
export type OfflineWishRank = '10' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'A' | 'J' | 'K' | 'Q';
export type OfflineWonCards = Record<OfflineSeat, TichuCard[]>;
export type OfflineWonTricks = Record<OfflineSeat, number>;

export type OfflinePlay = {
  action: 'pass' | 'play';
  cards: TichuCard[];
  combo: TichuCombination | null;
  id: string;
  seat: OfflineSeat;
  trickNumber: number;
  wishRank?: OfflineWishRank | null;
};

export type OfflineLegalMove = {
  action: 'play';
  cards: TichuCard[];
  combo: TichuCombination;
  wishRank?: OfflineWishRank | null;
};

export type OfflineSimulationMove = OfflineLegalMove | { action: 'pass' };

type OfflineBotDecision = OfflineSimulationMove;

export type OfflineBotCandidateScore = {
  cards: TichuCard[];
  label: string;
  score: number;
  visits?: number;
};

export type OfflineBotVersion =
  | 'heuristic-v2' | 'heuristic-v3' | 'heuristic-v4' | 'heuristic-v5' | 'heuristic-v6' | 'heuristic-v7' | 'heuristic-v8'
  | 'fair-v1' | 'fair-v2' | 'fair-v3'
  | 'heuristic-v8-phoenix'
  | 'ismcts-v1' | 'ismcts-v2' | 'ismcts-v3' | 'ismcts-v4';

export type OfflineBotExperiments = {
  extraPhoenixProtection: boolean;
  endgameSearch: boolean;
};

export type OfflineBotDiagnostics = {
  candidates: OfflineBotCandidateScore[];
  decision: 'pass' | 'play';
  decisionCards: TichuCard[];
  decisionLabel: string;
  reason: string;
  seat: OfflineSeat;
  trickNumber: number;
  engineVersion?: OfflineBotVersion;
  experiments?: OfflineBotExperiments;
  search?: {
    iterations: number;
    elapsedMs: number;
    fallback?: 'outside-endgame' | 'forced-move' | 'immediate-finish' | 'no-sample' | 'no-result' | 'incomplete-shortlist';
  };
};

type OfflineSearchSummary = Pick<OfflineBotDiagnostics, 'seat' | 'trickNumber'> & { iterations: number };

export type OfflineTurnState = {
  currentSeat: OfflineSeat;
  currentWinningSeat: OfflineSeat | null;
  passCount: number;
  trickNumber: number;
  wishRank: OfflineWishRank | null;
};

export type OfflinePlayer = {
  cardCount: number;
  isHuman: boolean;
  name: string;
  seat: OfflineSeat;
};

export type OfflineScoreSummary = {
  cardPoints: Record<OfflineTeam, number>;
  firstOutSeat: OfflineSeat | null;
  lastSeat: OfflineSeat | null;
  notes: string[];
  oneTwoTeam: OfflineTeam | null;
  teamOneScore: number;
  teamTwoScore: number;
};

export type OfflineDeal = {
  botDiagnostics: OfflineBotDiagnostics | null;
  lastBotSearch?: OfflineSearchSummary;
  botPlayers: OfflinePlayer[];
  finishOrder: OfflineSeat[];
  outgoingCards?: Record<OfflineSeat, readonly OfflineKnownCard[]>;
  humanHand: TichuCard[];
  humanSeat: OfflineSeat;
  hands: OfflineHands;
  plays: OfflinePlay[];
  scoreSummary: OfflineScoreSummary | null;
  status: OfflineGameStatus;
  turnState: OfflineTurnState | null;
  wonCards: OfflineWonCards;
  wonTricks: OfflineWonTricks;
};

type OfflineKnownCard = { card: TichuCard; toSeat: OfflineSeat };

export type OfflineBotObservation = Pick<OfflineDeal, 'finishOrder' | 'plays' | 'wonCards' | 'wonTricks'> & {
  turnState: OfflineTurnState;
  seat: OfflineSeat;
  hand: TichuCard[];
  handCounts: Record<OfflineSeat, number>;
  knownOutgoing: readonly OfflineKnownCard[];
};

type HeuristicView = OfflineBotObservation & { legacyHands?: OfflineHands };

export type FairBotSettings = {
  phoenixLooseSinglesPenalty?: number;
  phoenixLooseSinglesMaxWinnerCards?: number;
  protectTrickWinners?: boolean;
  strandedStraightCardPenalty?: number;
  finishWithDragonLead?: boolean;
  preserveLateControl?: boolean;
  delayDogLead?: boolean;
  opponentReplyThreshold?: number;
  replyPlayPenalty?: (move: OfflineLegalMove) => number;
};

export const liveOfflineBotSettings: FairBotSettings = { protectTrickWinners: true };

const suits: NonNullable<TichuCard['suit']>[] = ['jade', 'sword', 'pagoda', 'star'];
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const offlineWishRanks: OfflineWishRank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
export const offlineSeats = ['team_one_player_one', 'team_two_player_one', 'team_one_player_two', 'team_two_player_two'] as const;
const seats = offlineSeats;
const teams: OfflineTeam[] = ['team_one', 'team_two'];
const suitSymbols: Record<NonNullable<TichuCard['suit']>, string> = {
  jade: '♣',
  pagoda: '♦',
  star: '♥',
  sword: '♠',
};

function cardPoints(rank: string) {
  if (rank === '5') {
    return 5;
  }

  if (rank === '10' || rank === 'K') {
    return 10;
  }

  return 0;
}

export function createOfflineDeck() {
  const standardCards = suits.flatMap((suit, suitIndex) =>
    ranks.map<TichuCard>((rank, rankIndex) => ({
      id: `${suit}-${rank}`,
      kind: 'standard',
      label: `${rank} of ${suit}`,
      points: cardPoints(rank),
      rank,
      sort_value: (suitIndex + 1) * 100 + rankIndex + 1,
      suit,
    }))
  );

  const specialCards: TichuCard[] = [
    { id: 'mah-jong', kind: 'special', label: 'Mah Jong', points: 0, rank: null, sort_value: 1, suit: null },
    { id: 'dog', kind: 'special', label: 'Dog', points: 0, rank: null, sort_value: 2, suit: null },
    { id: 'phoenix', kind: 'special', label: 'Phoenix', points: -25, rank: null, sort_value: 3, suit: null },
    { id: 'dragon', kind: 'special', label: 'Dragon', points: 25, rank: null, sort_value: 4, suit: null },
  ];

  return [...standardCards, ...specialCards];
}

export function shuffleOfflineCards(deck: TichuCard[], random: () => number) {
  const shuffled = [...deck];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function sortCards(cards: TichuCard[]) {
  return [...cards].sort((a, b) => a.sort_value - b.sort_value || a.label.localeCompare(b.label));
}

function teammateSeat(seat: OfflineSeat): OfflineSeat {
  switch (seat) {
    case 'team_one_player_one':
      return 'team_one_player_two';
    case 'team_one_player_two':
      return 'team_one_player_one';
    case 'team_two_player_one':
      return 'team_two_player_two';
    case 'team_two_player_two':
      return 'team_two_player_one';
  }
}

export function teamForSeat(seat: OfflineSeat): OfflineTeam {
  return seat === 'team_one_player_one' || seat === 'team_one_player_two' ? 'team_one' : 'team_two';
}

function opponentTeam(team: OfflineTeam): OfflineTeam {
  return team === 'team_one' ? 'team_two' : 'team_one';
}

function emptyWonCards(): OfflineWonCards {
  return {
    team_one_player_one: [],
    team_one_player_two: [],
    team_two_player_one: [],
    team_two_player_two: [],
  };
}

function emptyWonTricks(): OfflineWonTricks {
  return {
    team_one_player_one: 0,
    team_one_player_two: 0,
    team_two_player_one: 0,
    team_two_player_two: 0,
  };
}

export function offlineLeftSeat(seat: OfflineSeat): OfflineSeat {
  switch (seat) {
    case 'team_one_player_one':
      return 'team_two_player_one';
    case 'team_two_player_one':
      return 'team_one_player_two';
    case 'team_one_player_two':
      return 'team_two_player_two';
    case 'team_two_player_two':
      return 'team_one_player_one';
  }
}

function rightSeat(seat: OfflineSeat): OfflineSeat {
  switch (seat) {
    case 'team_one_player_one':
      return 'team_two_player_two';
    case 'team_two_player_two':
      return 'team_one_player_two';
    case 'team_one_player_two':
      return 'team_two_player_one';
    case 'team_two_player_one':
      return 'team_one_player_one';
  }
}

function targetSeatForDirection(seat: OfflineSeat, direction: PassDirection) {
  if (direction === 'teammate') {
    return teammateSeat(seat);
  }

  if (direction === 'left') {
    return offlineLeftSeat(seat);
  }

  return rightSeat(seat);
}

function botPassSelection(hand: TichuCard[]): OfflinePassSelection {
  const cards = [...hand]
    .sort((a, b) => a.points - b.points || a.sort_value - b.sort_value || a.label.localeCompare(b.label))
    .slice(0, 3);

  return {
    left: cards[1].id,
    right: cards[2].id,
    teammate: cards[0].id,
  };
}

function createBotPlayers(hands: OfflineHands): OfflinePlayer[] {
  return [
    { cardCount: hands.team_two_player_one.length, isHuman: false, name: 'Bot Left', seat: 'team_two_player_one' },
    { cardCount: hands.team_one_player_two.length, isHuman: false, name: 'Bot Partner', seat: 'team_one_player_two' },
    { cardCount: hands.team_two_player_two.length, isHuman: false, name: 'Bot Right', seat: 'team_two_player_two' },
  ];
}

function findMahJongSeat(hands: OfflineHands) {
  return seats.find((seat) => hands[seat].some((card) => card.id === 'mah-jong')) ?? 'team_one_player_one';
}

function seatName(seat: OfflineSeat) {
  switch (seat) {
    case 'team_one_player_one':
      return 'You';
    case 'team_one_player_two':
      return 'Bot Partner';
    case 'team_two_player_one':
      return 'Bot Left';
    case 'team_two_player_two':
      return 'Bot Right';
  }
}

function cardLabel(card: TichuCard) {
  if (!card.suit) {
    return card.label;
  }

  return `${card.rank}${suitSymbols[card.suit]}`;
}

function playId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function currentWinningPlay(deal: Pick<OfflineDeal, 'turnState' | 'plays'>) {
  const winningSeat = deal.turnState?.currentWinningSeat;

  if (!winningSeat || !deal.turnState) {
    return null;
  }

  for (let index = deal.plays.length - 1; index >= 0; index -= 1) {
    const play = deal.plays[index];
    if (play.trickNumber < deal.turnState.trickNumber) break;
    if (play.action === 'play' && play.seat === winningSeat && play.trickNumber === deal.turnState.trickNumber) return play;
  }
  return null;
}

function cardsForTrick(plays: OfflinePlay[], trickNumber: number) {
  return plays.filter((play) => play.trickNumber === trickNumber).flatMap((play) => play.cards);
}

function cardPointTotal(cards: TichuCard[]) {
  return cards.reduce((sum, card) => sum + card.points, 0);
}

function cardRankValue(card: TichuCard) {
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

function cardRankForWish(rank: OfflineWishRank) {
  switch (rank) {
    case 'J':
      return 11;
    case 'Q':
      return 12;
    case 'K':
      return 13;
    case 'A':
      return 14;
    default:
      return Number(rank);
  }
}

function trickRecipient(winningPlay: OfflinePlay) {
  if (winningPlay.cards.some((card) => card.id === 'dragon')) {
    return offlineLeftSeat(winningPlay.seat);
  }

  return winningPlay.seat;
}

function awardTrick(
  wonCards: OfflineWonCards,
  wonTricks: OfflineWonTricks,
  recipientSeat: OfflineSeat,
  cards: TichuCard[]
) {
  if (cards.length === 0) {
    return { wonCards, wonTricks };
  }

  return {
    wonCards: {
      ...wonCards,
      [recipientSeat]: [...wonCards[recipientSeat], ...cards],
    },
    wonTricks: {
      ...wonTricks,
      [recipientSeat]: wonTricks[recipientSeat] + 1,
    },
  };
}

function awardCurrentTrick(deal: OfflineDeal, plays: OfflinePlay[]) {
  const winningPlay = currentWinningPlay({ ...deal, plays });

  if (!deal.turnState || !winningPlay) {
    return { wonCards: deal.wonCards, wonTricks: deal.wonTricks };
  }

  return awardTrick(deal.wonCards, deal.wonTricks, trickRecipient(winningPlay), cardsForTrick(plays, deal.turnState.trickNumber));
}

function oneTwoFinishTeam(finishOrder: OfflineSeat[]) {
  if (finishOrder.length < 2) {
    return null;
  }

  const firstTeam = teamForSeat(finishOrder[0]);
  return firstTeam === teamForSeat(finishOrder[1]) ? firstTeam : null;
}

function scoreOfflineHand(hands: OfflineHands, wonCards: OfflineWonCards, finishOrder: OfflineSeat[]): OfflineScoreSummary {
  const firstOutSeat = finishOrder[0] ?? null;
  const lastSeat = finishOrder[3] ?? null;
  const oneTwoTeam = oneTwoFinishTeam(finishOrder);
  const cardPoints = teams.reduce(
    (totals, team) => ({
      ...totals,
      [team]: 0,
    }),
    {} as Record<OfflineTeam, number>
  );
  const notes: string[] = [];

  if (oneTwoTeam) {
    notes.push('One-two finish: card points are replaced by a 200-0 hand.');

    return {
      cardPoints: {
        team_one: oneTwoTeam === 'team_one' ? 200 : 0,
        team_two: oneTwoTeam === 'team_two' ? 200 : 0,
      },
      firstOutSeat,
      lastSeat,
      notes,
      oneTwoTeam,
      teamOneScore: oneTwoTeam === 'team_one' ? 200 : 0,
      teamTwoScore: oneTwoTeam === 'team_two' ? 200 : 0,
    };
  }

  seats.forEach((seat) => {
    const scoringTeam = lastSeat && firstOutSeat && seat === lastSeat ? teamForSeat(firstOutSeat) : teamForSeat(seat);
    cardPoints[scoringTeam] += cardPointTotal(wonCards[seat]);
  });

  if (lastSeat) {
    const lastHandTeam = opponentTeam(teamForSeat(lastSeat));
    cardPoints[lastHandTeam] += cardPointTotal(hands[lastSeat]);
    notes.push(`${seatName(lastSeat)}'s remaining hand cards score for the opponents.`);
  }

  if (lastSeat && firstOutSeat && wonCards[lastSeat].length > 0) {
    notes.push(`${seatName(lastSeat)}'s captured tricks score for ${seatName(firstOutSeat)}.`);
  }

  return {
    cardPoints,
    firstOutSeat,
    lastSeat,
    notes,
    oneTwoTeam: null,
    teamOneScore: cardPoints.team_one,
    teamTwoScore: cardPoints.team_two,
  };
}

function countBits(bits: number) {
  let count = 0;
  for (; bits !== 0; bits &= bits - 1) count += 1;
  return count;
}

function candidateCardGroups(hand: TichuCard[], currentCombo: TichuCombination | null, requiredRank?: OfflineWishRank) {
  const groups: TichuCard[][] = [];
  const sortedHand = sortCards(hand);
  const groupCount = 2 ** sortedHand.length;
  const groupRanks = new Uint16Array(groupCount);
  const groupSizes = new Uint8Array(groupCount);
  const cardRanks = sortedHand.map(card => 1 << cardRankValue(card));
  const cardMask = (id: string) => {
    const index = sortedHand.findIndex(card => card.id === id);
    return index < 0 ? 0 : 1 << index;
  };
  const singlesOnly = cardMask('dragon') | cardMask('dog');
  const phoenix = cardMask('phoenix');
  const suitMasks = suits.map(suit => sortedHand.reduce((mask, card, index) => card.suit === suit ? mask | (1 << index) : mask, 0));
  const requiredBit = requiredRank ? 1 << cardRankForWish(requiredRank) : 0;

  for (let mask = 1; mask < groupCount; mask += 1) {
    const previous = mask & (mask - 1);
    const size = groupSizes[previous] + 1;
    const rankMask = groupRanks[previous] | cardRanks[31 - Math.clz32(mask ^ previous)];
    groupRanks[mask] = rankMask;
    groupSizes[mask] = size;
    if (requiredBit && !(rankMask & requiredBit)) continue;

    if (size > 1) {
      if (mask & singlesOnly) continue;
      const distinct = countBits(rankMask);
      const hasPhoenix = Boolean(mask & phoenix);
      const fixedRanks = hasPhoenix ? rankMask & ~1 : rankMask;
      const span = Math.clz32(fixedRanks & -fixedRanks) - Math.clz32(fixedRanks) + 1;
      const couldBeStraight = size >= 5 && distinct === size && span <= size;
      const couldBeBomb = !hasPhoenix && ((size === 4 && distinct === 1) ||
        (couldBeStraight && suitMasks.some(suitMask => (mask & suitMask) === mask)));
      if (currentCombo && (currentCombo.is_bomb || currentCombo.count !== size) && !couldBeBomb) continue;
      // Filter impossible shapes cheaply. validatePlay still decides ranks, suits and legality.
      const couldBeRankGroup = size <= 3 && distinct === 1 + Number(hasPhoenix);
      const couldBeFullHouse = size === 5 && distinct === 2 + Number(hasPhoenix);
      const couldBePairs = size >= 4 && size % 2 === 0 && distinct === size / 2 + Number(hasPhoenix) && span === size / 2;
      if (!couldBeBomb && !couldBeRankGroup && !couldBeFullHouse && !couldBeStraight && !couldBePairs) continue;
    } else if (currentCombo && currentCombo.count !== 1) {
      continue;
    }

    const cards: TichuCard[] = [];
    for (let bits = mask; bits !== 0; bits &= bits - 1) {
      cards.push(sortedHand[31 - Math.clz32(bits & -bits)]);
    }
    groups.push(cards);
  }

  return groups.sort((a, b) => {
    if (a.length !== b.length) {
      return a.length - b.length;
    }

    return (
      a.reduce((sum, card) => sum + card.sort_value, 0) -
      b.reduce((sum, card) => sum + card.sort_value, 0)
    );
  });
}

export function canFulfillOfflineWish(hand: TichuCard[], combo: TichuCombination | null, wishRank: OfflineWishRank) {
  return hand.some(card => card.rank === wishRank) &&
    candidateCardGroups(hand, combo, wishRank).some(cards => validatePlay(cards, combo).valid);
}

export function generateOfflineLegalMoves(
  hand: TichuCard[],
  currentCombo: TichuCombination | null,
  wishRank: OfflineWishRank | null = null
): OfflineLegalMove[] {
  const moves = candidateCardGroups(hand, currentCombo)
    .map((cards) => ({ cards, result: validatePlay(cards, currentCombo) }))
    .filter((candidate): candidate is { cards: TichuCard[]; result: TichuCombination } => candidate.result.valid)
    .map((candidate) => ({
      action: 'play' as const,
      cards: candidate.cards,
      combo: candidate.result,
    }));
  const wishedMoves = moves.filter((move) => cardsContainWishRank(move.cards, wishRank));

  return wishedMoves.length > 0 ? wishedMoves : moves;
}

function breaksFourBomb(hand: TichuCard[], move: OfflineLegalMove) {
  if (move.combo.type === 'four_bomb') {
    return false;
  }

  const rankCounts = new Map<number, number>();

  hand
    .filter((card) => card.kind === 'standard')
    .forEach((card) => {
      const rank = cardRankValue(card);
      rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
    });

  return move.cards
    .filter((card) => card.kind === 'standard')
    .some((card) => rankCounts.get(cardRankValue(card)) === 4);
}

function containsCard(move: OfflineLegalMove, cardId: string) {
  return move.cards.some((card) => card.id === cardId);
}

function cardsContainWishRank(cards: TichuCard[], wishRank: OfflineWishRank | null) {
  return Boolean(wishRank && cards.some((card) => card.rank === wishRank));
}

function playedRanksForCards(cards: TichuCard[]) {
  return new Set(cards.map((card) => card.rank).filter((rank): rank is OfflineWishRank => Boolean(rank)));
}

function chooseMahJongWish(cards: TichuCard[]): OfflineWishRank {
  const playedRanks = playedRanksForCards(cards);

  return offlineWishRanks.find((rank) => !playedRanks.has(rank)) ?? 'A';
}

function rankCount(cards: TichuCard[], rank: string) {
  return cards.filter((card) => card.rank === rank).length;
}

function rankIsInNaturalStraight(hand: TichuCard[], rank: number) {
  const ranks = new Set(hand.filter((card) => card.kind === 'standard' || card.id === 'mah-jong').map(cardRankValue));
  let low = rank;
  let high = rank;

  while (ranks.has(low - 1)) low -= 1;
  while (ranks.has(high + 1)) high += 1;

  return high - low + 1 >= 5;
}

function isWeakLooseSingle(hand: TichuCard[], card: TichuCard) {
  return card.kind === 'standard' && card.rank !== null && cardRankValue(card) <= 10 &&
    rankCount(hand, card.rank) === 1 && !rankIsInNaturalStraight(hand, cardRankValue(card));
}

function weakLooseSingles(hand: TichuCard[]) {
  return hand.filter(card => isWeakLooseSingle(hand, card)).length;
}

function isHighCombination(move: OfflineLegalMove) {
  return move.combo.is_bomb || (move.combo.count > 1 && move.combo.rank >= 11);
}

function isStrongCard(card: TichuCard) {
  return card.id === 'phoenix' || card.id === 'dragon' || cardRankValue(card) >= 13;
}

function hasStrongReserve(hand: TichuCard[]) {
  return hand.some(isStrongCard) || generateOfflineLegalMoves(hand, null).some(isHighCombination);
}

function spendsControlAndStrandsSingles(move: OfflineLegalMove, remainingHand: TichuCard[]) {
  if (remainingHand.length < 3 || (!isHighCombination(move) && !move.cards.some(isStrongCard))) return false;
  if (remainingHand.some(isStrongCard) || weakLooseSingles(remainingHand) < 3) return false;
  return !generateOfflineLegalMoves(remainingHand, null).some(isHighCombination);
}

export function describeOfflineReply(view: OfflineBotObservation, move: OfflineLegalMove) {
  const remaining = remainingCardsAfterMove(view.hand, move);
  const winner = view.turnState.currentWinningSeat;
  return {
    weakSinglesLeft: weakLooseSingles(remaining),
    hasStrongReserve: hasStrongReserve(remaining),
    winnerCards: winner ? view.handCounts[winner] : 0,
    trickPoints: cardPointTotal(cardsForTrick(view.plays, view.turnState.trickNumber)),
  };
}

function visiblePlayedRankCount(deal: Pick<OfflineDeal, 'plays'>, rank: OfflineWishRank) {
  return deal.plays.reduce((sum, play) => sum + rankCount(play.cards, rank), 0);
}

function opponentSeatsFor(seat: OfflineSeat) {
  return seats.filter((candidateSeat) => teamForSeat(candidateSeat) !== teamForSeat(seat));
}

function opponentNearOut(deal: HeuristicView, seat: OfflineSeat, maxCards = 1) {
  return opponentSeatsFor(seat).some(
    (opponentSeat) => !deal.finishOrder.includes(opponentSeat) && deal.handCounts[opponentSeat] > 0 && deal.handCounts[opponentSeat] <= maxCards
  );
}

function teammateNearOut(deal: HeuristicView, seat: OfflineSeat, maxCards = 2) {
  const teammate = teammateSeat(seat);
  const cardCount = deal.handCounts[teammate];

  return !deal.finishOrder.includes(teammate) && cardCount > 0 && cardCount <= maxCards;
}

function remainingCardsAfterMove(hand: TichuCard[], move: OfflineLegalMove) {
  const playedIds = new Set(move.cards.map((card) => card.id));

  return hand.filter((card) => !playedIds.has(card.id));
}

function breaksConsecutivePairs(hand: TichuCard[], move: OfflineLegalMove, remainingHand: TichuCard[]) {
  const ranks = [...new Set(move.cards.filter(card => card.kind === 'standard').map(cardRankValue))];
  const copies = (cards: TichuCard[], rank: number) =>
    cards.filter(card => card.kind === 'standard' && cardRankValue(card) === rank).length;

  return ranks.some(rank => copies(hand, rank) >= 2 && copies(remainingHand, rank) < 2 &&
    (copies(remainingHand, rank - 1) >= 2 || copies(remainingHand, rank + 1) >= 2));
}

function quietLeadScore(
  hand: TichuCard[],
  move: OfflineLegalMove,
  remainingHand: TichuCard[],
  strandedStraightCardPenalty: number,
) {
  if (remainingHand.length === 0 || containsCard(move, 'dog') || containsCard(move, 'mah-jong')) return 0;

  // Prefer weak leads while keeping combinations intact for when they are needed.
  const allStandard = move.cards.every(card => card.kind === 'standard');
  let score = -move.combo.count * 22;
  if (allStandard) {
    const highestRankSpent = Math.max(...move.cards.map(cardRankValue));
    score += (8 - highestRankSpent) * 30;
  }
  if (move.combo.type === 'single' && move.cards[0].rank) {
    const copies = rankCount(hand, move.cards[0].rank);
    if (copies > 1) score -= 100;
    else if (rankIsInNaturalStraight(hand, move.combo.rank)) {
      score -= 65;
      if (strandedStraightCardPenalty > 0) {
        const strandedCards = remainingHand.filter(card =>
          isWeakLooseSingle(remainingHand, card) && rankIsInNaturalStraight(hand, cardRankValue(card)),
        );
        score -= strandedCards.length * strandedStraightCardPenalty;
      }
    }
  }
  if (breaksConsecutivePairs(hand, move, remainingHand)) score -= 110;
  return score + twoTurnExitPlanScore(move, remainingHand);
}

function cleanRemainingCombo(cards: TichuCard[]) {
  if (cards.length === 0) {
    return null;
  }

  const combo = validatePlay(cards, null);

  return combo.valid ? combo : null;
}

function twoTurnExitPlanScore(move: OfflineLegalMove, remainingHand: TichuCard[]) {
  const remainingCombo = cleanRemainingCombo(remainingHand);

  if (!remainingCombo) {
    return 0;
  }

  const firstMoveCost = move.combo.count * 18 + move.combo.rank * 0.5 + Math.max(0, cardPointTotal(move.cards)) * 0.6;
  const remainingComboValue = remainingCombo.count * 28 + remainingCombo.rank * 0.6;

  return 120 + remainingComboValue - firstMoveCost;
}

function leadLetsTeammateFinish(deal: HeuristicView, seat: OfflineSeat, move: OfflineLegalMove) {
  const teammate = teammateSeat(seat);
  if (deal.handCounts[teammate] === 0 || deal.handCounts[teammate] > 3 || deal.finishOrder.includes(teammate)) return false;
  const teammateHand = deal.legacyHands?.[teammate] ?? deal.knownOutgoing
    .filter(({ toSeat }) => toSeat === teammate)
    .map(({ card }) => card);

  if (teammateHand.length !== deal.handCounts[teammate]) {
    return false;
  }

  return validatePlay(teammateHand, move.combo).valid;
}

function isOpeningLead(deal: HeuristicView) {
  return Boolean(deal.turnState && deal.turnState.trickNumber === 1 && deal.plays.length === 0 && !deal.turnState.currentWinningSeat);
}

function chooseBotMahJongWish(deal: HeuristicView, seat: OfflineSeat, cards: TichuCard[]): OfflineWishRank {
  const playedRanks = new Set(cards.map((card) => card.rank).filter((rank): rank is OfflineWishRank => Boolean(rank)));
  const partner = teammateSeat(seat);
  const knownCards = (recipient: OfflineSeat) => deal.knownOutgoing
    .filter(({ toSeat }) => toSeat === recipient)
    .map(({ card }) => card);

  const [bestRank] = offlineWishRanks
    .filter((rank) => !playedRanks.has(rank))
    .map((rank) => {
      const partnerCount = rankCount(deal.legacyHands?.[partner] ?? knownCards(partner), rank);
      const ownCount = rankCount(deal.hand, rank);
      const opponentCount = seats
        .filter((candidateSeat) => teamForSeat(candidateSeat) !== teamForSeat(seat))
        .reduce((sum, opponentSeat) => sum + rankCount(deal.legacyHands?.[opponentSeat] ?? knownCards(opponentSeat), rank), 0);
      const visibleCount = visiblePlayedRankCount(deal, rank) + (playedRanks.has(rank) ? 1 : 0);

      return {
        rank,
        score: partnerCount * 80 - ownCount * 45 - opponentCount * 24 - visibleCount * 30 + cardRankForWish(rank) * 0.5,
      };
    })
    .sort((a, b) => b.score - a.score || cardRankForWish(b.rank) - cardRankForWish(a.rank));

  return bestRank?.rank ?? chooseMahJongWish(cards);
}

function describeBotMove(move: OfflineLegalMove) {
  const wishLabel = move.wishRank ? ` (wish ${move.wishRank})` : '';

  return `${move.combo.label}${wishLabel} - ${visibleCardList(move.cards)}`;
}

function scoreBotMove(deal: HeuristicView, seat: OfflineSeat, move: OfflineLegalMove, settings: FairBotSettings) {
  const hand = deal.hand;
  const remainingCards = hand.length - move.cards.length;
  const remainingHand = remainingCardsAfterMove(hand, move);
  const winningPlay = currentWinningPlay(deal);
  const currentTrickPoints = deal.turnState ? cardPointTotal(cardsForTrick(deal.plays, deal.turnState.trickNumber)) : 0;
  const teammateIsWinning = Boolean(winningPlay && teamForSeat(winningPlay.seat) === teamForSeat(seat));
  const opponentIsWinning = Boolean(winningPlay && teamForSeat(winningPlay.seat) !== teamForSeat(seat));
  const activeWishRank = deal.turnState?.wishRank ?? null;
  const teammateIsNearOut = teammateNearOut(deal, seat);
  const leadFinishesTeammate = !winningPlay && leadLetsTeammateFinish(deal, seat, move);
  const openingLead = isOpeningLead(deal);
  const opponentIsNearOut = opponentNearOut(deal, seat);
  const quietLead = !winningPlay && !leadFinishesTeammate && !opponentIsNearOut;
  const opponentHasNearOutThreat = opponentIsWinning && opponentNearOut(deal, seat);
  const opponentNearOutPressure = Boolean(
    winningPlay?.combo && opponentHasNearOutThreat && (winningPlay.combo.type !== 'single' || winningPlay.combo.rank < 14)
  );
  const opponentSingleNearOutPressure = Boolean(
    winningPlay?.combo && opponentHasNearOutThreat && winningPlay.combo.type === 'single' && winningPlay.combo.rank < 14
  );
  let score = 0;
  const phoenixLooseSinglesPenalty = settings.phoenixLooseSinglesPenalty ?? 0;

  if (activeWishRank && cardsContainWishRank(move.cards, activeWishRank)) {
    score = 220;
    score -= move.combo.count * 12;
    score -= move.combo.rank * 0.7;
    score -= Math.max(0, cardPointTotal(move.cards)) * 0.4;

    if (remainingCards === 0) {
      score += 500;
    }

    if (move.combo.is_bomb) {
      score -= 300;
    }

    if (breaksFourBomb(hand, move)) {
      score -= 240;
    }

    if (containsCard(move, 'dragon')) {
      score -= 180;
    }

    if (containsCard(move, 'phoenix')) {
      score -= 100;
    }

    return score;
  }

  score += move.combo.count * 22;
  score -= move.combo.rank * 0.8;
  score += cardPointTotal(move.cards) * 0.15;

  if (remainingCards === 0) {
    score += 500;
  } else if (remainingCards <= 2) {
    score += 60;
  }

  if (!winningPlay) {
    score += move.combo.count * 8;

    if (containsCard(move, 'mah-jong')) {
      score += openingLead ? 240 : 45;
    } else if (openingLead && hand.some((card) => card.id === 'mah-jong')) {
      score -= move.combo.count >= 5 ? 120 : 70;
    }

    if (leadFinishesTeammate) {
      score += 380;
    }

    if (quietLead) {
      score += quietLeadScore(hand, move, remainingHand, settings.strandedStraightCardPenalty ?? 0);
    }

    if (opponentIsNearOut) {
      if (move.combo.type === 'single') {
        score += move.combo.rank * 2.2;
      } else {
        score += 55 + move.combo.count * 12;
      }
    }

    if (move.combo.type === 'single' && hand.length > 5) {
      score -= 10;
    }
  }

  if (teammateIsWinning && remainingCards > 0) {
    score -= 1000;
  }

  if (opponentIsWinning) {
    score += 75 + currentTrickPoints * 1.2;

    if (opponentNearOutPressure) {
      score += 150;
    } else if (move.combo.type === 'single' && move.cards[0]?.rank) {
      const copies = rankCount(hand, move.cards[0].rank);

      if (copies === 2 || copies === 3) {
        score -= 8;
      } else if (copies === 1 && rankIsInNaturalStraight(hand, move.combo.rank)) {
        score -= 12;
      }
    }
  }

  if (move.combo.is_bomb) {
    score += remainingCards === 0 || currentTrickPoints >= 30 ? 120 : -280;
  }

  if (breaksFourBomb(hand, move)) {
    score -= 240;
  }

  if (containsCard(move, 'dragon')) {
    score += remainingCards === 0 || currentTrickPoints >= 25 ? 35 : -160;

    if (opponentSingleNearOutPressure) {
      score += 130;
    }
  }

  if (settings.protectTrickWinners && !opponentIsNearOut && !leadFinishesTeammate &&
      spendsControlAndStrandsSingles(move, remainingHand)) {
    score -= 160;
  }

  if (containsCard(move, 'phoenix')) {
    score += remainingCards === 0 ? 45 : -55;

    if (phoenixLooseSinglesPenalty > 0 && opponentIsWinning && !opponentIsNearOut &&
        remainingCards >= 3 && weakLooseSingles(remainingHand) >= 3) {
      score -= phoenixLooseSinglesPenalty;
    }

    if (move.cards.length === 1) {
      score += remainingCards === 0 ? 0 : -110;
    }

    if (opponentSingleNearOutPressure) {
      score += 80;
    }
  }

  if (containsCard(move, 'dog')) {
    const teammate = teammateSeat(seat);
    const teammateCanLead = deal.handCounts[teammate] > 0 && !deal.finishOrder.includes(teammate);
    const hasOpeningMahJong = openingLead && hand.some((card) => card.id === 'mah-jong');
    score += teammateCanLead ? (hasOpeningMahJong ? 90 : 360) : -160;

    if (teammateIsNearOut) {
      score += 170;
    }

    if (remainingCards <= 2) {
      score -= 45;
    }
  }

  return score;
}

export function withOfflineBotWish(view: OfflineBotObservation, move: OfflineLegalMove): OfflineLegalMove {
  return botMoveWithWish(view, view.seat, move);
}

function botMoveWithWish(deal: HeuristicView, seat: OfflineSeat, move: OfflineLegalMove): OfflineLegalMove {
  return containsCard(move, 'mah-jong')
    ? { ...move, wishRank: chooseBotMahJongWish(deal, seat, move.cards) }
    : move;
}

function scoredBotMoves(deal: HeuristicView, seat: OfflineSeat, moves: OfflineLegalMove[], settings: FairBotSettings) {
  return moves
    .map((move) => botMoveWithWish(deal, seat, move))
    .map((move) => ({
      move,
      score: scoreBotMove(deal, seat, move, settings) - (settings.replyPlayPenalty?.(move) ?? 0),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      if (b.move.combo.count !== a.move.combo.count) {
        return b.move.combo.count - a.move.combo.count;
      }

      return a.move.combo.rank - b.move.combo.rank;
    });
}

function diagnosticCandidates(scoredMoves: ReturnType<typeof scoredBotMoves>) {
  return scoredMoves.slice(0, 3).map(({ move, score }) => ({
    cards: move.cards,
    label: describeBotMove(move),
    score: Math.round(score),
  }));
}

function passDecision(
  deal: HeuristicView,
  seat: OfflineSeat,
  reason: string,
  scoredMoves: ReturnType<typeof scoredBotMoves> = []
): { decision: OfflineBotDecision; diagnostics: OfflineBotDiagnostics } {
  return {
    decision: { action: 'pass' },
    diagnostics: {
      candidates: diagnosticCandidates(scoredMoves),
      decision: 'pass',
      decisionCards: [],
      decisionLabel: 'Pass',
      reason,
      seat,
      trickNumber: deal.turnState?.trickNumber ?? 0,
    },
  };
}

function playDecision(
  deal: HeuristicView,
  seat: OfflineSeat,
  move: OfflineLegalMove,
  reason: string,
  scoredMoves: ReturnType<typeof scoredBotMoves>
): { decision: OfflineBotDecision; diagnostics: OfflineBotDiagnostics } {
  return {
    decision: move,
    diagnostics: {
      candidates: diagnosticCandidates(scoredMoves),
      decision: 'play',
      decisionCards: move.cards,
      decisionLabel: describeBotMove(move),
      reason,
      seat,
      trickNumber: deal.turnState?.trickNumber ?? 0,
    },
  };
}

function moveReason(deal: HeuristicView, seat: OfflineSeat, move: OfflineLegalMove) {
  const winningPlay = currentWinningPlay(deal);

  if (move.cards.length === deal.hand.length) {
    return 'Best score because it empties the hand.';
  }

  if (containsCard(move, 'dog')) {
    if (teammateNearOut(deal, seat)) {
      return 'Best score because Dog gives a close partner the lead.';
    }

    return 'Best score because Dog hands the lead to partner.';
  }

  if (containsCard(move, 'mah-jong') && move.wishRank) {
    if (isOpeningLead(deal)) {
      return `Best score because Mah Jong should open the hand and asks for ${move.wishRank}.`;
    }

    return `Best score and asks for ${move.wishRank} to pressure the next players.`;
  }

  if (!winningPlay && leadLetsTeammateFinish(deal, seat, move)) {
    return 'Best score because it sets partner up to finish.';
  }

  if (move.combo.is_bomb) {
    return 'Best score because the trick is valuable enough to spend a bomb.';
  }

  if (opponentNearOut(deal, seat) && (!winningPlay || teamForSeat(winningPlay.seat) !== teamForSeat(seat))) {
    return 'Best score because it pressures an opponent who is nearly out.';
  }

  if (!winningPlay && cleanRemainingCombo(remainingCardsAfterMove(deal.hand, move))) {
    return 'Best score because it creates a two-play exit plan.';
  }

  if (!winningPlay && move.cards.every(card => card.kind === 'standard' && cardRankValue(card) <= 7)) {
    return move.combo.type === 'single'
      ? 'Best score because it clears a weak single.'
      : 'Best score because it sheds a weak combination.';
  }

  if (winningPlay && teamForSeat(winningPlay.seat) !== teamForSeat(seat)) {
    return 'Best score because it challenges the opponent-winning trick.';
  }

  return 'Best score by shedding cards while preserving stronger resources.';
}

export function observeOfflineBot(deal: OfflineDeal, seat: OfflineSeat): OfflineBotObservation {
  if (!deal.turnState || deal.turnState.currentSeat !== seat) {
    throw new Error('A bot observation requires its active turn.');
  }

  return {
    seat,
    hand: deal.hands[seat],
    handCounts: {
      team_one_player_one: deal.hands.team_one_player_one.length,
      team_one_player_two: deal.hands.team_one_player_two.length,
      team_two_player_one: deal.hands.team_two_player_one.length,
      team_two_player_two: deal.hands.team_two_player_two.length,
    },
    knownOutgoing: deal.outgoingCards?.[seat]?.filter(
      ({ card }) => !deal.plays.some(play => play.cards.some(played => played.id === card.id))
    ) ?? [],
    finishOrder: deal.finishOrder,
    plays: deal.plays,
    turnState: deal.turnState,
    wonCards: deal.wonCards,
    wonTricks: deal.wonTricks,
  };
}

export function legalOfflineBotActions(view: OfflineBotObservation): OfflineSimulationMove[] {
  const winningPlay = currentWinningPlay(view);
  const { wishRank } = view.turnState;
  const moves = generateOfflineLegalMoves(view.hand, winningPlay?.combo ?? null, wishRank);
  if (winningPlay && !moves.some(move => cardsContainWishRank(move.cards, wishRank))) {
    return [...moves, { action: 'pass' }];
  }
  return moves;
}

export function isOptionalOfflineReply(view: OfflineBotObservation, actions: OfflineSimulationMove[]) {
  const winner = view.turnState.currentWinningSeat;
  return winner !== null && teamForSeat(winner) !== teamForSeat(view.seat) &&
    !opponentNearOut(view, view.seat) &&
    actions.some(move => move.action === 'pass') &&
    actions.some(move => move.action === 'play') &&
    !actions.some(move => move.action === 'play' && move.cards.length === view.hand.length);
}

function chooseHeuristicDecision(
  deal: HeuristicView,
  actions = legalOfflineBotActions(deal),
  settings: FairBotSettings = {},
  onRankedPlays?: (moves: OfflineLegalMove[]) => void,
): { decision: OfflineBotDecision; diagnostics: OfflineBotDiagnostics } {
  const { seat } = deal;
  const winningPlay = currentWinningPlay(deal);
  const currentCombo = winningPlay?.combo ?? null;
  const appliesToWinner = winningPlay &&
    deal.handCounts[winningPlay.seat] <= (settings.phoenixLooseSinglesMaxWinnerCards ?? Infinity);
  const optionalReply = (settings.opponentReplyThreshold !== undefined || settings.replyPlayPenalty !== undefined) &&
    isOptionalOfflineReply(deal, actions);
  const scoredMoves = scoredBotMoves(
    deal,
    seat,
    actions.filter(move => move.action === 'play'),
    {
      ...settings,
      replyPlayPenalty: optionalReply && actions.length <= 3 ? settings.replyPlayPenalty : undefined,
      phoenixLooseSinglesPenalty: appliesToWinner && actions.some(move => move.action === 'pass')
        ? settings.phoenixLooseSinglesPenalty
        : 0,
    }
  );
  const moves = scoredMoves.map(({ move }) => move);
  onRankedPlays?.(moves);

  if (moves.length === 0) {
    return passDecision(deal, seat, 'No legal move can beat the current table.');
  }

  if (deal.turnState?.wishRank && moves.some((move) => cardsContainWishRank(move.cards, deal.turnState?.wishRank ?? null))) {
    const [bestWishMove] = scoredMoves;

    return playDecision(deal, seat, bestWishMove.move, `Mah Jong wish is active, so the bot must play ${deal.turnState.wishRank}.`, scoredMoves);
  }

  const teammate = teammateSeat(seat);
  if (settings.preserveLateControl && winningPlay?.combo?.type === 'single' && winningPlay.combo.rank === 14 &&
      deal.finishOrder.length === 1 && deal.finishOrder[0] === winningPlay.seat &&
      teamForSeat(winningPlay.seat) !== teamForSeat(seat) && offlineLeftSeat(winningPlay.seat) === seat &&
      deal.hand.length > 2 && deal.plays.some(play => play.cards.some(card => card.id === 'phoenix')) &&
      moves.length === 1 && containsCard(moves[0], 'dragon') && actions.some(move => move.action === 'pass')) {
    return passDecision(deal, seat, 'Passing saves Dragon and can let the bot inherit the lead.', scoredMoves);
  }

  if ((settings.preserveLateControl || settings.delayDogLead) && !winningPlay &&
      !moves.some(move => move.cards.length === deal.hand.length || leadLetsTeammateFinish(deal, seat, move))) {
    const next = offlineLeftSeat(seat);
    if (settings.preserveLateControl && deal.finishOrder.length === 0 && deal.handCounts[next] === 1 &&
        deal.handCounts[teammate] >= 3 && deal.handCounts[teammate] <= 7 && deal.hand.length <= 7 &&
        weakLooseSingles(deal.hand) >= 2 && moves.some(move => move.combo.type === 'pair' && move.combo.rank >= 13)) {
      const lowLead = scoredMoves.filter(({ move }) => move.combo.type === 'single' && move.combo.rank <= 5 &&
        isWeakLooseSingle(deal.hand, move.cards[0])).sort((a, b) => a.move.combo.rank - b.move.combo.rank)[0];
      if (lowLead) {
        return playDecision(deal, seat, lowLead.move, 'Leading low keeps the high pair to take control later.',
          [lowLead, ...scoredMoves.filter(candidate => candidate !== lowLead)]);
      }
    }

    if (settings.delayDogLead && deal.finishOrder.length === 1 &&
        teamForSeat(deal.finishOrder[0]) !== teamForSeat(seat) && deal.handCounts[teammate] > 3 &&
        moves.some(move => move.combo.type === 'dog') &&
        deal.hand.filter(card => cardRankValue(card) >= 13).length >= 2 &&
        deal.hand.some(card => cardRankValue(card) <= 3 && isWeakLooseSingle(deal.hand, card))) {
      const previousLead = deal.plays.find(play => play.trickNumber === deal.turnState.trickNumber - 1);
      if (previousLead && previousLead.seat !== seat) {
        const middleLead = scoredMoves.filter(({ move }) => move.combo.type === 'single' &&
          move.combo.rank >= 7 && move.combo.rank <= 10 && move.cards[0].rank &&
          rankCount(deal.hand, move.cards[0].rank) === 1).sort((a, b) => a.move.combo.rank - b.move.combo.rank)[0];
        if (middleLead) {
          return playDecision(deal, seat, middleLead.move, 'Keeping the lead for another trick can clear cards before using Dog.',
            [middleLead, ...scoredMoves.filter(candidate => candidate !== middleLead)]);
        }
      }
    }
  }

  if (settings.finishWithDragonLead && !winningPlay && deal.hand.length === 2) {
    const dragon = scoredMoves.find(({ move }) => containsCard(move, 'dragon'));
    const otherSeats = seats.filter(other => other !== seat && deal.handCounts[other] > 0);
    const [opponent] = otherSeats;
    if (dragon && otherSeats.length === 1 && teamForSeat(opponent) !== teamForSeat(seat) &&
        deal.handCounts[opponent] < 4) {
      return playDecision(
        deal, seat, dragon.move, 'Dragon keeps the lead so the bot can play its last card next.',
        [dragon, ...scoredMoves.filter(candidate => candidate !== dragon)],
      );
    }
  }

  if (winningPlay && teamForSeat(winningPlay.seat) === teamForSeat(seat)) {
      const finishingMoves = moves.filter((move) => move.cards.length === deal.hand.length);

    if (finishingMoves.length === 0) {
      return passDecision(deal, seat, 'Partner is winning, so the bot stays out of the way.', scoredMoves);
    }
  }

  const [bestMove] = scoredMoves;

  if (currentCombo && bestMove.score < (optionalReply ? settings.opponentReplyThreshold ?? 1 : 1)) {
    if (settings.protectTrickWinners && !opponentNearOut(deal, seat) &&
        spendsControlAndStrandsSingles(bestMove.move, remainingCardsAfterMove(deal.hand, bestMove.move))) {
      return passDecision(deal, seat, 'Passing keeps a strong play available for the remaining weak singles.', scoredMoves);
    }
    return passDecision(deal, seat, 'Top move scored poorly, so passing keeps stronger cards.', scoredMoves);
  }

  return playDecision(deal, seat, bestMove.move, moveReason(deal, seat, bestMove.move), scoredMoves);
}

function chooseOfflineBotDecision(deal: OfflineDeal, seat: OfflineSeat, settings?: FairBotSettings) {
  const result = chooseHeuristicDecision({ ...observeOfflineBot(deal, seat), legacyHands: deal.hands }, undefined, settings);
  result.diagnostics.engineVersion = settings?.protectTrickWinners ? 'heuristic-v4' : 'heuristic-v3';
  return result;
}

type LiveBotOptions = Pick<FairBotSettings,
  'strandedStraightCardPenalty' | 'finishWithDragonLead' | 'preserveLateControl' | 'delayDogLead' | 'phoenixLooseSinglesPenalty'>;

export function liveOfflineSettingsForView(
  { turnState, hand, handCounts }: OfflineBotObservation,
  { strandedStraightCardPenalty = 8, finishWithDragonLead = true, preserveLateControl = true,
    delayDogLead = true, phoenixLooseSinglesPenalty = 0 }: LiveBotOptions = {},
) {
  const winner = turnState?.currentWinningSeat;
  const challengeBonus = winner && handCounts[winner] <= 3 ? 95 : 0;
  return {
    ...liveOfflineBotSettings,
    strandedStraightCardPenalty,
    finishWithDragonLead,
    preserveLateControl,
    delayDogLead,
    phoenixLooseSinglesPenalty,
    replyPlayPenalty: move => {
      const leavesOnePlayFinish = hand.length - move.cards.length >= 3 &&
        validatePlay(remainingCardsAfterMove(hand, move), null).valid;
      return -(challengeBonus + (leavesOnePlayFinish ? 95 : 0));
    },
  } satisfies FairBotSettings;
}

export function chooseLiveOfflineBot(deal: OfflineDeal, seat: OfflineSeat, options?: LiveBotOptions) {
  const view = observeOfflineBot(deal, seat);
  const settings = liveOfflineSettingsForView(view, options);
  const result = chooseHeuristicDecision({ ...view, legacyHands: deal.hands }, undefined, settings);
  const { preserveLateControl, delayDogLead, finishWithDragonLead, strandedStraightCardPenalty, phoenixLooseSinglesPenalty } = settings;
  result.diagnostics.engineVersion = phoenixLooseSinglesPenalty > 0 ? 'heuristic-v8-phoenix' :
    preserveLateControl || delayDogLead ? 'heuristic-v8' :
    finishWithDragonLead ? 'heuristic-v7' : strandedStraightCardPenalty > 0 ? 'heuristic-v6' : 'heuristic-v5';
  return result;
}

export function shortlistOfflineBotActions(view: OfflineBotObservation, settings: FairBotSettings) {
  const legal = legalOfflineBotActions(view);
  let ranked: OfflineLegalMove[] = [];
  const preferred = chooseHeuristicDecision(view, legal, settings, moves => { ranked = moves; });
  const finishingPlay = ranked.find(move => move.cards.length === view.hand.length);
  if (finishingPlay) {
    return {
      actions: [finishingPlay],
      preferred: playDecision(view, view.seat, finishingPlay, 'This play empties the hand.', [{ move: finishingPlay, score: 0 }]),
      immediateFinish: true,
    };
  }
  const plays = preferred.decision.action === 'play'
    ? [preferred.decision, ...ranked.filter(move => move !== preferred.decision)]
    : ranked;
  const pass = legal.find(move => move.action === 'pass');
  const actions: OfflineSimulationMove[] = plays.slice(0, 3);
  if (pass) actions.push(pass);
  return { actions, preferred, immediateFinish: false };
}

export function chooseFairOfflineBot(view: OfflineBotObservation, actions?: OfflineSimulationMove[], settings?: FairBotSettings) {
  const result = chooseHeuristicDecision(view, actions, settings);
  result.diagnostics.engineVersion = settings?.protectTrickWinners ? 'fair-v3' : 'fair-v2';
  return result;
}

function refreshDeal(deal: OfflineDeal, nextHands: OfflineHands): OfflineDeal {
  return {
    ...deal,
    botPlayers: createBotPlayers(nextHands),
    hands: nextHands,
    humanHand: nextHands[deal.humanSeat],
  };
}

function appendFinishedSeat(finishOrder: OfflineSeat[], seat: OfflineSeat, nextHands: OfflineHands) {
  if (nextHands[seat].length > 0 || finishOrder.includes(seat)) {
    return finishOrder;
  }

  return [...finishOrder, seat];
}

function nextActiveSeat(startSeat: OfflineSeat, nextHands: OfflineHands, finishOrder: OfflineSeat[]) {
  let candidate = startSeat;

  for (let index = 0; index < seats.length; index += 1) {
    if (nextHands[candidate].length > 0 && !finishOrder.includes(candidate)) {
      return candidate;
    }

    candidate = offlineLeftSeat(candidate);
  }

  return startSeat;
}

function completedFinishOrder(finishOrder: OfflineSeat[]) {
  if (finishOrder.length < 3) {
    return null;
  }

  const remainingSeat = seats.find((seat) => !finishOrder.includes(seat));
  return remainingSeat ? [...finishOrder, remainingSeat] : finishOrder;
}

function activeSeatCount(nextHands: OfflineHands, finishOrder: OfflineSeat[]) {
  return seats.filter((seat) => nextHands[seat].length > 0 && !finishOrder.includes(seat)).length;
}

function cloneHands(hands: OfflineHands): OfflineHands {
  return {
    team_one_player_one: [...hands.team_one_player_one],
    team_one_player_two: [...hands.team_one_player_two],
    team_two_player_one: [...hands.team_two_player_one],
    team_two_player_two: [...hands.team_two_player_two],
  };
}

function cloneWonCards(wonCards: OfflineWonCards): OfflineWonCards {
  return {
    team_one_player_one: [...wonCards.team_one_player_one],
    team_one_player_two: [...wonCards.team_one_player_two],
    team_two_player_one: [...wonCards.team_two_player_one],
    team_two_player_two: [...wonCards.team_two_player_two],
  };
}

function cloneWonTricks(wonTricks: OfflineWonTricks): OfflineWonTricks {
  return {
    team_one_player_one: wonTricks.team_one_player_one,
    team_one_player_two: wonTricks.team_one_player_two,
    team_two_player_one: wonTricks.team_two_player_one,
    team_two_player_two: wonTricks.team_two_player_two,
  };
}

export function cloneOfflineDeal(deal: OfflineDeal): OfflineDeal {
  const hands = cloneHands(deal.hands);

  return {
    ...deal,
    botDiagnostics: deal.botDiagnostics
      ? {
          ...deal.botDiagnostics,
          candidates: deal.botDiagnostics.candidates.map((candidate) => ({
            ...candidate,
            cards: [...candidate.cards],
          })),
          decisionCards: [...deal.botDiagnostics.decisionCards],
        }
      : null,
    botPlayers: deal.botPlayers.map((player) => ({ ...player })),
    finishOrder: [...deal.finishOrder],
    hands,
    humanHand: hands[deal.humanSeat],
    plays: deal.plays.map((play) => ({
      ...play,
      cards: [...play.cards],
      combo: play.combo ? { ...play.combo } : null,
    })),
    scoreSummary: deal.scoreSummary
      ? {
          ...deal.scoreSummary,
          cardPoints: { ...deal.scoreSummary.cardPoints },
          notes: [...deal.scoreSummary.notes],
        }
      : null,
    turnState: deal.turnState ? { ...deal.turnState } : null,
    wonCards: cloneWonCards(deal.wonCards),
    wonTricks: cloneWonTricks(deal.wonTricks),
  };
}

export function applyOfflineMove(deal: OfflineDeal, seat: OfflineSeat, move: OfflineSimulationMove): OfflineDeal {
  if (move.action === 'pass') {
    return submitOfflinePass(deal, seat);
  }

  return submitOfflinePlay(deal, seat, move.cards, move.wishRank);
}

export function simulateOfflineMove(deal: OfflineDeal, seat: OfflineSeat, move: OfflineSimulationMove): OfflineDeal {
  return applyOfflineMove(cloneOfflineDeal(deal), seat, move);
}

export function createOfflineDeal(random = Math.random): OfflineDeal {
  const deck = shuffleOfflineCards(createOfflineDeck(), random);
  const hands = {} as OfflineHands;

  seats.forEach((seat, seatIndex) => {
    hands[seat] = sortCards(deck.slice(seatIndex * 14, seatIndex * 14 + 14));
  });

  const humanSeat: OfflineSeat = 'team_one_player_one';

  return {
    botDiagnostics: null,
    botPlayers: createBotPlayers(hands),
    finishOrder: [],
    hands,
    humanHand: hands[humanSeat],
    humanSeat,
    plays: [],
    scoreSummary: null,
    status: 'dealt',
    turnState: null,
    wonCards: emptyWonCards(),
    wonTricks: emptyWonTricks(),
  };
}

export function applyOfflinePassing(deal: OfflineDeal, humanPassSelection?: OfflinePassSelection): OfflineDeal {
  const passSelections = {} as Record<OfflineSeat, OfflinePassSelection>;

  seats.forEach((seat) => {
    passSelections[seat] = seat === deal.humanSeat && humanPassSelection
      ? humanPassSelection
      : botPassSelection(deal.hands[seat]);
  });

  const outgoingCards = seats.flatMap((seat) =>
    (Object.keys(passSelections[seat]) as PassDirection[]).map((direction) => {
      const cardId = passSelections[seat][direction];
      const card = deal.hands[seat].find((handCard) => handCard.id === cardId);

      if (!card) {
        throw new Error('A selected pass card is not in that hand.');
      }

      return {
        card,
        fromSeat: seat,
        toSeat: targetSeatForDirection(seat, direction),
      };
    })
  );

  const nextHands = {} as OfflineHands;
  const knownOutgoing = {} as NonNullable<OfflineDeal['outgoingCards']>;

  seats.forEach((seat) => {
    const sent = outgoingCards.filter(pass => pass.fromSeat === seat);
    knownOutgoing[seat] = sent.map(({ card, toSeat }) => ({ card, toSeat }));
    const outgoingIds = new Set(sent.map((pass) => pass.card.id));
    const keptCards = deal.hands[seat].filter((card) => !outgoingIds.has(card.id));
    const incomingCards = outgoingCards.filter((pass) => pass.toSeat === seat).map((pass) => pass.card);
    nextHands[seat] = sortCards([...keptCards, ...incomingCards]);
  });

  return {
    botDiagnostics: null,
    botPlayers: createBotPlayers(nextHands),
    finishOrder: [],
    outgoingCards: knownOutgoing,
    hands: nextHands,
    humanHand: nextHands[deal.humanSeat],
    humanSeat: deal.humanSeat,
    plays: [],
    scoreSummary: null,
    status: 'playing',
    turnState: {
      currentSeat: findMahJongSeat(nextHands),
      currentWinningSeat: null,
      passCount: 0,
      trickNumber: 1,
      wishRank: null,
    },
    wonCards: emptyWonCards(),
    wonTricks: emptyWonTricks(),
  };
}

export function submitOfflinePlay(
  deal: OfflineDeal,
  seat: OfflineSeat,
  cards: TichuCard[],
  wishRankRequest?: OfflineWishRank | null
): OfflineDeal {
  if (!deal.turnState || deal.status !== 'playing') {
    return deal;
  }

  if (deal.turnState.currentSeat !== seat) {
    return deal;
  }

  const playedIds = new Set(cards.map(card => card.id));
  if (playedIds.size !== cards.length || cards.some(card => !deal.hands[seat].some(held => held.id === card.id))) {
    throw new Error('Play distinct cards from your own hand.');
  }

  const currentCombo = currentWinningPlay(deal)?.combo ?? null;
  const activeWishRank = deal.turnState.wishRank;
  const canSatisfyWish = activeWishRank
    ? canFulfillOfflineWish(deal.hands[seat], currentCombo, activeWishRank)
    : false;

  if (canSatisfyWish && !cardsContainWishRank(cards, activeWishRank)) {
    throw new Error(`Mah Jong wish is active: play ${activeWishRank} if possible.`);
  }

  const result = validatePlay(cards, currentCombo);

  if (!result.valid) {
    throw new Error(result.reason);
  }

  const playedMahJong = cards.some((card) => card.id === 'mah-jong');
  const nextWishRank = playedMahJong
    ? (wishRankRequest ?? chooseMahJongWish(cards))
    : cardsContainWishRank(cards, activeWishRank)
      ? null
      : activeWishRank;
  const nextHands: OfflineHands = {
    ...deal.hands,
    [seat]: sortCards(deal.hands[seat].filter((card) => !playedIds.has(card.id))),
  };
  const nextDeal = refreshDeal(deal, nextHands);
  const nextFinishOrder = appendFinishedSeat(deal.finishOrder, seat, nextHands);
  const finalFinishOrder = completedFinishOrder(nextFinishOrder);
  const play: OfflinePlay = {
    action: 'play',
    cards,
    combo: result,
    id: playId(),
    seat,
    trickNumber: deal.turnState.trickNumber,
    wishRank: playedMahJong ? nextWishRank : null,
  };
  const plays = [...deal.plays, play];

  if (result.type === 'dog') {
    const finishOrder = finalFinishOrder ?? nextFinishOrder;
    const scoreSummary = finalFinishOrder ? scoreOfflineHand(nextHands, deal.wonCards, finishOrder) : null;
    const status: OfflineGameStatus = finalFinishOrder ? 'finished' : 'playing';

    return {
      ...nextDeal,
      finishOrder,
      plays,
      scoreSummary,
      status,
      turnState: finalFinishOrder
        ? null
        : {
            currentSeat: nextActiveSeat(teammateSeat(seat), nextHands, nextFinishOrder),
            currentWinningSeat: null,
            passCount: 0,
            trickNumber: deal.turnState.trickNumber + 1,
            wishRank: nextWishRank,
          },
    };
  }

  if (finalFinishOrder) {
    const awarded = awardCurrentTrick({ ...deal, turnState: { ...deal.turnState, currentWinningSeat: seat } }, plays);

    return {
      ...nextDeal,
      finishOrder: finalFinishOrder,
      plays,
      scoreSummary: scoreOfflineHand(nextHands, awarded.wonCards, finalFinishOrder),
      status: 'finished' as const,
      turnState: null,
      wonCards: awarded.wonCards,
      wonTricks: awarded.wonTricks,
    };
  }

  return {
    ...nextDeal,
    finishOrder: nextFinishOrder,
    plays,
    scoreSummary: null,
    status: 'playing',
    turnState: {
      currentSeat: nextActiveSeat(offlineLeftSeat(seat), nextHands, nextFinishOrder),
      currentWinningSeat: seat,
      passCount: 0,
      trickNumber: deal.turnState.trickNumber,
      wishRank: nextWishRank,
    },
  };
}

export function submitOfflinePass(deal: OfflineDeal, seat: OfflineSeat) {
  if (!deal.turnState || deal.status !== 'playing') {
    return deal;
  }

  if (deal.turnState.currentSeat !== seat || !deal.turnState.currentWinningSeat) {
    return deal;
  }

  const activeWishRank = deal.turnState.wishRank;
  const currentCombo = currentWinningPlay(deal)?.combo ?? null;
  const canSatisfyWish = activeWishRank
    ? canFulfillOfflineWish(deal.hands[seat], currentCombo, activeWishRank)
    : false;

  if (canSatisfyWish) {
    return deal;
  }

  const nextPassCount = deal.turnState.passCount + 1;
  const neededPasses = Math.max(1, activeSeatCount(deal.hands, deal.finishOrder) - 1);
  const trickNumber = deal.turnState.trickNumber;
  const plays = [
    ...deal.plays,
    {
      action: 'pass' as const,
      cards: [],
      combo: null,
      id: playId(),
      seat,
      trickNumber,
    },
  ];

  if (nextPassCount >= neededPasses) {
    const winningSeat = deal.turnState.currentWinningSeat;
    const winningPlay = currentWinningPlay(deal);
    const awarded = winningPlay
      ? awardTrick(deal.wonCards, deal.wonTricks, trickRecipient(winningPlay), cardsForTrick(plays, trickNumber))
      : { wonCards: deal.wonCards, wonTricks: deal.wonTricks };
    const nextLeader =
      deal.hands[winningSeat].length > 0 && !deal.finishOrder.includes(winningSeat)
        ? winningSeat
        : nextActiveSeat(offlineLeftSeat(winningSeat), deal.hands, deal.finishOrder);

    return {
      ...deal,
      plays,
      turnState: {
        currentSeat: nextLeader,
        currentWinningSeat: null,
        passCount: 0,
        trickNumber: trickNumber + 1,
        wishRank: deal.turnState.wishRank,
      },
      wonCards: awarded.wonCards,
      wonTricks: awarded.wonTricks,
    };
  }

  return {
    ...deal,
    plays,
    turnState: {
      ...deal.turnState,
      currentSeat: nextActiveSeat(offlineLeftSeat(seat), deal.hands, deal.finishOrder),
      passCount: nextPassCount,
    },
  };
}

export function advanceOfflineBotTurn(deal: OfflineDeal, chooseBot = chooseOfflineBotDecision, includeHumanSeat = false) {
  if (!deal.turnState || deal.status !== 'playing' || (!includeHumanSeat && deal.turnState.currentSeat === deal.humanSeat)) {
    return deal;
  }

  const botSeat = deal.turnState.currentSeat;

  if (deal.hands[botSeat].length === 0 || deal.finishOrder.includes(botSeat)) {
    return {
      ...deal,
      turnState: {
        ...deal.turnState,
        currentSeat: nextActiveSeat(offlineLeftSeat(botSeat), deal.hands, deal.finishOrder),
      },
    };
  }

  const { decision, diagnostics } = chooseBot(deal, botSeat);
  const iterations = diagnostics.search?.iterations ?? 0;
  const lastBotSearch = iterations > 0
    ? { iterations, seat: botSeat, trickNumber: diagnostics.trickNumber }
    : deal.lastBotSearch;

  return {
    ...applyOfflineMove(deal, botSeat, decision),
    botDiagnostics: diagnostics,
    lastBotSearch,
  };
}

export function visibleCardList(cards: TichuCard[]) {
  return sortCardsForHandDisplay(cards).reverse().map(cardLabel).join(' ');
}

export function offlineCapturedPointTotal(deal: OfflineDeal, seat: OfflineSeat) {
  return cardPointTotal(deal.wonCards[seat]);
}

export function offlineWonTrickCount(deal: OfflineDeal, seat: OfflineSeat) {
  return deal.wonTricks[seat];
}

export function currentOfflineWinningPlay(deal: OfflineDeal) {
  return currentWinningPlay(deal);
}

export function currentOfflineTrickPlays(deal: OfflineDeal) {
  if (!deal.turnState) {
    return [];
  }

  return deal.plays.filter((play) => play.trickNumber === deal.turnState?.trickNumber);
}
