import { validatePlay } from '@/features/game/combination';
import type { GameHand, TichuCard, TichuCombination } from '@/features/game/game-types';

export type OfflineSeat = GameHand['seat'];
export type OfflineTeam = 'team_one' | 'team_two';
export type PassDirection = 'left' | 'right' | 'teammate';
export type OfflineGameStatus = 'dealt' | 'finished' | 'playing';
export type OfflineHands = Record<OfflineSeat, TichuCard[]>;
export type OfflinePassSelection = Record<PassDirection, string>;
export type OfflineWonCards = Record<OfflineSeat, TichuCard[]>;
export type OfflineWonTricks = Record<OfflineSeat, number>;

export type OfflinePlay = {
  action: 'pass' | 'play';
  cards: TichuCard[];
  combo: TichuCombination | null;
  id: string;
  seat: OfflineSeat;
  trickNumber: number;
};

export type OfflineLegalMove = {
  action: 'play';
  cards: TichuCard[];
  combo: TichuCombination;
};

type OfflineBotDecision = OfflineLegalMove | { action: 'pass' };

export type OfflineBotCandidateScore = {
  cards: TichuCard[];
  label: string;
  score: number;
};

export type OfflineBotDiagnostics = {
  candidates: OfflineBotCandidateScore[];
  decision: 'pass' | 'play';
  decisionCards: TichuCard[];
  decisionLabel: string;
  reason: string;
  seat: OfflineSeat;
  trickNumber: number;
};

export type OfflineTurnState = {
  currentSeat: OfflineSeat;
  currentWinningSeat: OfflineSeat | null;
  passCount: number;
  trickNumber: number;
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
  botPlayers: OfflinePlayer[];
  finishOrder: OfflineSeat[];
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

const suits: NonNullable<TichuCard['suit']>[] = ['jade', 'sword', 'pagoda', 'star'];
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const seats: OfflineSeat[] = ['team_one_player_one', 'team_two_player_one', 'team_one_player_two', 'team_two_player_two'];
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

function createDeck() {
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

function shuffleDeck(deck: TichuCard[]) {
  const shuffled = [...deck];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
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

function teamForSeat(seat: OfflineSeat): OfflineTeam {
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

function currentWinningPlay(deal: OfflineDeal) {
  const winningSeat = deal.turnState?.currentWinningSeat;

  if (!winningSeat || !deal.turnState) {
    return null;
  }

  return [...deal.plays]
    .reverse()
    .find((play) => play.action === 'play' && play.seat === winningSeat && play.trickNumber === deal.turnState?.trickNumber) ?? null;
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

function candidateCardGroups(hand: TichuCard[]) {
  const groups: TichuCard[][] = [];
  const sortedHand = sortCards(hand);
  const groupCount = 2 ** sortedHand.length;

  for (let mask = 1; mask < groupCount; mask += 1) {
    const cards: TichuCard[] = [];

    for (let cardIndex = 0; cardIndex < sortedHand.length; cardIndex += 1) {
      if (mask & (2 ** cardIndex)) {
        cards.push(sortedHand[cardIndex]);
      }
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

export function generateOfflineLegalMoves(hand: TichuCard[], currentCombo: TichuCombination | null): OfflineLegalMove[] {
  return candidateCardGroups(hand)
    .map((cards) => ({ cards, result: validatePlay(cards, currentCombo) }))
    .filter((candidate): candidate is { cards: TichuCard[]; result: TichuCombination } => candidate.result.valid)
    .map((candidate) => ({
      action: 'play' as const,
      cards: candidate.cards,
      combo: candidate.result,
    }));
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

function describeBotMove(move: OfflineLegalMove) {
  return `${move.combo.label} - ${visibleCardList(move.cards)}`;
}

function scoreBotMove(deal: OfflineDeal, seat: OfflineSeat, move: OfflineLegalMove) {
  const hand = deal.hands[seat];
  const remainingCards = hand.length - move.cards.length;
  const winningPlay = currentWinningPlay(deal);
  const currentTrickPoints = deal.turnState ? cardPointTotal(cardsForTrick(deal.plays, deal.turnState.trickNumber)) : 0;
  const teammateIsWinning = Boolean(winningPlay && teamForSeat(winningPlay.seat) === teamForSeat(seat));
  const opponentIsWinning = Boolean(winningPlay && teamForSeat(winningPlay.seat) !== teamForSeat(seat));
  let score = 0;

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

    if (move.combo.type === 'single' && hand.length > 5) {
      score -= 10;
    }
  }

  if (teammateIsWinning && remainingCards > 0) {
    score -= 1000;
  }

  if (opponentIsWinning) {
    score += 75 + currentTrickPoints * 1.2;
  }

  if (move.combo.is_bomb) {
    score += remainingCards === 0 || currentTrickPoints >= 30 ? 120 : -280;
  }

  if (breaksFourBomb(hand, move)) {
    score -= 240;
  }

  if (containsCard(move, 'dragon')) {
    score += remainingCards === 0 || currentTrickPoints >= 25 ? 35 : -95;
  }

  if (containsCard(move, 'phoenix')) {
    score += remainingCards === 0 ? 45 : -55;

    if (move.cards.length === 1) {
      score -= 35;
    }
  }

  if (containsCard(move, 'dog')) {
    const teammate = teammateSeat(seat);
    const teammateCanLead = deal.hands[teammate].length > 0 && !deal.finishOrder.includes(teammate);
    score += teammateCanLead ? 90 : -160;

    if (remainingCards <= 2) {
      score -= 45;
    }
  }

  return score;
}

function scoredBotMoves(deal: OfflineDeal, seat: OfflineSeat) {
  return generateOfflineLegalMoves(deal.hands[seat], currentWinningPlay(deal)?.combo ?? null)
    .map((move) => ({
      move,
      score: scoreBotMove(deal, seat, move),
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
  deal: OfflineDeal,
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
  deal: OfflineDeal,
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

function moveReason(deal: OfflineDeal, seat: OfflineSeat, move: OfflineLegalMove) {
  const winningPlay = currentWinningPlay(deal);

  if (move.cards.length === deal.hands[seat].length) {
    return 'Best score because it empties the hand.';
  }

  if (containsCard(move, 'dog')) {
    return 'Best score because Dog hands the lead to partner.';
  }

  if (move.combo.is_bomb) {
    return 'Best score because the trick is valuable enough to spend a bomb.';
  }

  if (winningPlay && teamForSeat(winningPlay.seat) !== teamForSeat(seat)) {
    return 'Best score because it challenges the opponent-winning trick.';
  }

  return 'Best score by shedding cards while preserving stronger resources.';
}

function chooseOfflineBotDecision(deal: OfflineDeal, seat: OfflineSeat): { decision: OfflineBotDecision; diagnostics: OfflineBotDiagnostics } {
  const currentCombo = currentWinningPlay(deal)?.combo ?? null;
  const scoredMoves = scoredBotMoves(deal, seat);
  const moves = scoredMoves.map(({ move }) => move);
  const winningPlay = currentWinningPlay(deal);

  if (moves.length === 0) {
    return passDecision(deal, seat, 'No legal move can beat the current table.');
  }

  if (winningPlay && teamForSeat(winningPlay.seat) === teamForSeat(seat)) {
    const finishingMoves = moves.filter((move) => move.cards.length === deal.hands[seat].length);

    if (finishingMoves.length === 0) {
      return passDecision(deal, seat, 'Partner is winning, so the bot stays out of the way.', scoredMoves);
    }
  }

  const [bestMove] = scoredMoves;

  if (currentCombo && bestMove.score < 1) {
    return passDecision(deal, seat, 'Top move scored poorly, so passing keeps stronger cards.', scoredMoves);
  }

  return playDecision(deal, seat, bestMove.move, moveReason(deal, seat, bestMove.move), scoredMoves);
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

export function createOfflineDeal(): OfflineDeal {
  const deck = shuffleDeck(createDeck());
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

export function applyOfflinePassing(deal: OfflineDeal, humanPassSelection: OfflinePassSelection): OfflineDeal {
  const passSelections = {} as Record<OfflineSeat, OfflinePassSelection>;

  seats.forEach((seat) => {
    passSelections[seat] = seat === deal.humanSeat ? humanPassSelection : botPassSelection(deal.hands[seat]);
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

  seats.forEach((seat) => {
    const outgoingIds = new Set(outgoingCards.filter((pass) => pass.fromSeat === seat).map((pass) => pass.card.id));
    const keptCards = deal.hands[seat].filter((card) => !outgoingIds.has(card.id));
    const incomingCards = outgoingCards.filter((pass) => pass.toSeat === seat).map((pass) => pass.card);
    nextHands[seat] = sortCards([...keptCards, ...incomingCards]);
  });

  return {
    botDiagnostics: null,
    botPlayers: createBotPlayers(nextHands),
    finishOrder: [],
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
    },
    wonCards: emptyWonCards(),
    wonTricks: emptyWonTricks(),
  };
}

export function submitOfflinePlay(deal: OfflineDeal, seat: OfflineSeat, cards: TichuCard[]): OfflineDeal {
  if (!deal.turnState || deal.status !== 'playing') {
    return deal;
  }

  if (deal.turnState.currentSeat !== seat) {
    return deal;
  }

  const currentCombo = currentWinningPlay(deal)?.combo ?? null;
  const result = validatePlay(cards, currentCombo);

  if (!result.valid) {
    throw new Error(result.reason);
  }

  const playedIds = new Set(cards.map((card) => card.id));
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

export function advanceOfflineBotTurn(deal: OfflineDeal) {
  if (!deal.turnState || deal.status !== 'playing' || deal.turnState.currentSeat === deal.humanSeat) {
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

  const { decision, diagnostics } = chooseOfflineBotDecision(deal, botSeat);

  if (decision.action === 'play') {
    return {
      ...submitOfflinePlay(deal, botSeat, decision.cards),
      botDiagnostics: diagnostics,
    };
  }

  return {
    ...submitOfflinePass(deal, botSeat),
    botDiagnostics: diagnostics,
  };
}

export function visibleCardList(cards: TichuCard[]) {
  return sortCards(cards).map(cardLabel).join(' ');
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
