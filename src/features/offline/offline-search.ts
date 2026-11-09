import {
  applyOfflineMove,
  canFulfillOfflineWish,
  chooseFairOfflineBot,
  createOfflineDeck,
  legalOfflineBotActions,
  observeOfflineBot,
  offlineSeats,
  offlineWishRanks,
  shuffleOfflineCards,
  teamForSeat,
  visibleCardList,
  type FairBotSettings,
  type OfflineBotDiagnostics,
  type OfflineBotObservation,
  type OfflineDeal,
  type OfflineHands,
  type OfflineSimulationMove,
  type OfflineWishRank,
} from './offline-game';

const deck = createOfflineDeck();
const maxHandTurns = 224;

function wishConstraints(view: OfflineBotObservation) {
  const constraints: {
    seat: OfflineBotObservation['seat'];
    rank: NonNullable<OfflineBotObservation['turnState']['wishRank']>;
    combo: OfflineBotObservation['plays'][number]['combo'];
    laterCards: OfflineBotObservation['hand'];
  }[] = [];
  let wish: OfflineWishRank | null = null;
  let combo: OfflineBotObservation['plays'][number]['combo'] = null;
  let trickNumber: number | null = null;
  for (const [index, play] of view.plays.entries()) {
    if (play.trickNumber !== trickNumber) {
      trickNumber = play.trickNumber;
      combo = null;
    }
    if (wish) {
      if (play.cards.some(card => card.rank === wish)) {
        wish = null;
      } else {
        constraints.push({
          seat: play.seat,
          rank: wish,
          combo,
          laterCards: view.plays.slice(index).filter(next => next.seat === play.seat).flatMap(next => next.cards),
        });
      }
    }
    if (play.wishRank) wish = play.wishRank;
    if (play.combo) combo = play.combo.type === 'dog' ? null : play.combo;
  }
  return constraints;
}

export function createOfflineSampler(view: OfflineBotObservation) {
  const played = view.plays.flatMap(play => play.cards);
  const used = new Set([...view.hand, ...played].map(card => card.id));
  const fixed = Object.fromEntries(offlineSeats.map(seat => [seat, [] as OfflineBotObservation['hand']])) as OfflineHands;
  fixed[view.seat] = [...view.hand];
  let valid = used.size === view.hand.length + played.length;
  for (const { card, toSeat } of view.knownOutgoing) {
    if (used.has(card.id) || toSeat === view.seat) {
      valid = false;
      break;
    }
    fixed[toSeat].push(card);
    used.add(card.id);
  }

  // The first actor held the Mah Jong even if they opened with another combination.
  const mahJong = deck.find(card => card.id === 'mah-jong')!;
  const opener = view.plays[0]?.seat ?? view.turnState.currentSeat;
  if (!used.has(mahJong.id)) {
    fixed[opener].push(mahJong);
    used.add(mahJong.id);
    if (opener === view.seat) valid = false;
  } else if (fixed[opener].every(card => card.id !== mahJong.id) &&
      !view.plays.some(play => play.seat === opener && play.cards.some(card => card.id === mahJong.id))) {
    valid = false;
  }

  const unknown = deck.filter(card => !used.has(card.id));
  const gaps = offlineSeats.map(seat => view.handCounts[seat] - fixed[seat].length);
  valid &&= gaps.every(gap => gap >= 0) && gaps.reduce((sum, gap) => sum + gap, 0) === unknown.length;
  const constraints = valid ? wishConstraints(view) : [];

  return (random: () => number, deadline = Infinity): OfflineDeal | null => {
    if (!valid) return null;
    for (let attempt = 0; attempt < 32 && performance.now() < deadline; attempt += 1) {
      const pool = shuffleOfflineCards(unknown, random);
      let offset = 0;
      const hands = Object.fromEntries(offlineSeats.map((seat, index) => {
        const end = offset + gaps[index];
        const hand = [...fixed[seat], ...pool.slice(offset, end)];
        offset = end;
        return [seat, hand];
      })) as OfflineHands;
      if (constraints.some(({ seat, laterCards, combo, rank }) =>
        canFulfillOfflineWish([...hands[seat], ...laterCards], combo, rank)
      )) continue;

      // Only the observer's own exchange is known in this hypothetical world.
      const outgoingCards = Object.fromEntries(offlineSeats.map(seat => [
        seat, seat === view.seat ? view.knownOutgoing : [],
      ])) as NonNullable<OfflineDeal['outgoingCards']>;
      return {
        hands,
        outgoingCards,
        botDiagnostics: null,
        botPlayers: [],
        humanHand: hands[view.seat],
        humanSeat: view.seat,
        status: 'playing',
        scoreSummary: null,
        plays: view.plays,
        finishOrder: view.finishOrder,
        turnState: view.turnState,
        wonCards: view.wonCards,
        wonTricks: view.wonTricks,
      };
    }
    return null;
  };
}

function teamMargin(deal: OfflineDeal, seat: OfflineBotObservation['seat']) {
  if (!deal.scoreSummary) return null;
  const { teamOneScore, teamTwoScore } = deal.scoreSummary;
  return teamForSeat(seat) === 'team_one' ? teamOneScore - teamTwoScore : teamTwoScore - teamOneScore;
}

export function rollOutOfflineHand(deal: OfflineDeal, deadline = Infinity, settings?: FairBotSettings): OfflineDeal | null {
  for (let turn = 0; deal.turnState && turn < maxHandTurns && performance.now() < deadline; turn += 1) {
    const seat = deal.turnState.currentSeat;
    const { decision } = chooseFairOfflineBot(observeOfflineBot(deal, seat), undefined, settings);
    const next = applyOfflineMove(deal, seat, decision);
    if (next === deal) return null;
    deal = next;
  }
  return deal.status === 'finished' ? deal : null;
}

type Edge = {
  move: OfflineSimulationMove;
  available: number;
  visits: number;
  points: number;
  children: Map<string, Edge>;
};

function actionKey(move: OfflineSimulationMove) {
  return move.action === 'pass' ? 'pass' : `${move.cards.map(card => card.id).sort().join(',')}:${move.wishRank ?? ''}`;
}

function searchActions(view: OfflineBotObservation) {
  return legalOfflineBotActions(view).flatMap<OfflineSimulationMove>(move =>
    move.action === 'play' && move.cards.some(card => card.id === 'mah-jong')
      ? offlineWishRanks.map(wishRank => ({ ...move, wishRank }))
      : [move]
  );
}

function selectEdge(children: Map<string, Edge>, actions: OfflineSimulationMove[], teamSign: number, random: () => number) {
  const available = actions.map(move => {
    const key = actionKey(move);
    let edge = children.get(key);
    if (!edge) {
      edge = { move, available: 0, visits: 0, points: 0, children: new Map() };
      children.set(key, edge);
    }
    edge.available += 1;
    return { edge, move };
  });
  const unvisited = available.filter(({ edge }) => edge.visits === 0);
  if (unvisited.length) return unvisited[Math.floor(random() * unvisited.length)];
  let best = available[0];
  let bestScore = -Infinity;
  for (const entry of available) {
    const { edge } = entry;
    const score = teamSign * edge.points / (200 * edge.visits)
      + Math.SQRT2 * Math.sqrt(Math.log(edge.available) / edge.visits);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
}

type SearchOptions = {
  random?: () => number;
  iterations?: number;
  budgetMs?: number;
  heuristicSettings?: FairBotSettings;
};

export function chooseSearchOfflineBot(view: OfflineBotObservation, options: SearchOptions = {}) {
  const start = performance.now();
  const deadline = start + (options.budgetMs ?? Infinity);
  const random = options.random ?? Math.random;
  const counts = Object.values(view.handCounts);
  const root = new Map<string, Edge>();
  let iterations = 0;
  let fallback: NonNullable<OfflineBotDiagnostics['search']>['fallback'];

  if (counts.reduce((sum, count) => sum + count, 0) > 16 || counts.some(count => count > 8)) {
    fallback = 'outside-endgame';
  } else {
    const actions = searchActions(view);
    if (actions.length === 1) fallback = 'forced-move';
    const sample = createOfflineSampler(view);
    const rootTeam = teamForSeat(view.seat);
    for (let index = 0; actions.length > 1 && index < (options.iterations ?? 128) && performance.now() < deadline; index += 1) {
      let deal = sample(random, deadline);
      if (!deal) {
        if (iterations === 0) fallback = 'no-sample';
        break;
      }
      let children = root;
      const path: Edge[] = [];
      while (deal.turnState && performance.now() < deadline) {
        const seat = deal.turnState.currentSeat;
        const moves = path.length ? searchActions(observeOfflineBot(deal, seat)) : actions;
        const selected = selectEdge(children, moves, teamForSeat(seat) === rootTeam ? 1 : -1, random);
        if (!selected) break;
        const { edge, move } = selected;
        const next = applyOfflineMove(deal, seat, move);
        if (next === deal) break;
        path.push(edge);
        deal = next;
        children = edge.children;
        if (!edge.visits) break;
      }
      if (!path.length) break;
      const finished = rollOutOfflineHand(deal, deadline, options.heuristicSettings);
      const points = finished && teamMargin(finished, view.seat);
      if (points === null) break;
      for (const edge of path) {
        edge.visits += 1;
        edge.points += points;
      }
      iterations += 1;
    }
  }

  const explored = [...root.values()].filter(edge => edge.visits > 0)
    .sort((a, b) => b.visits - a.visits || b.points / b.visits - a.points / a.visits);
  if (!explored.length) {
    const result = chooseFairOfflineBot(view, undefined, options.heuristicSettings);
    result.diagnostics.search = { iterations, elapsedMs: performance.now() - start, fallback: fallback ?? 'no-result' };
    return result;
  }

  const label = (move: OfflineSimulationMove) => move.action === 'pass'
    ? 'Pass'
    : `${move.combo.label} - ${visibleCardList(move.cards)}${move.wishRank ? ` (wish ${move.wishRank})` : ''}`;
  const mostVisited = explored[0];
  const heuristicLead = view.turnState.currentWinningSeat === null
    ? root.get(actionKey(chooseFairOfflineBot(view, undefined, options.heuristicSettings).decision))
    : undefined;
  // Close lead estimates favor the heuristic, which values weak cards and intact shapes.
  const selected = heuristicLead && heuristicLead.visits >= 4 &&
    mostVisited.points / mostVisited.visits - heuristicLead.points / heuristicLead.visits <= 10
    ? heuristicLead
    : mostVisited;
  const decision = selected.move;
  const candidates = [selected, ...explored.filter(edge => edge !== selected)].slice(0, 3);
  return {
    decision,
    diagnostics: {
      engineVersion: options.heuristicSettings?.protectTrickWinners ? 'ismcts-v3' : 'ismcts-v2',
      search: { iterations, elapsedMs: performance.now() - start },
      candidates: candidates.map(({ move, points, visits }) => ({
        cards: move.action === 'play' ? move.cards : [],
        label: label(move),
        score: points / visits,
        visits,
      })),
      decision: decision.action,
      decisionCards: decision.action === 'play' ? decision.cards : [],
      decisionLabel: label(decision),
      reason: `Search ran ${iterations} simulations. Candidate scores estimate team point margin.`,
      seat: view.seat,
      trickNumber: view.turnState.trickNumber,
    } satisfies OfflineBotDiagnostics,
  };
}
