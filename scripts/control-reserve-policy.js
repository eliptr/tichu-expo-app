require('./load-offline-engine');
const g = require('../src/features/offline/offline-game');
const { validatePlay } = require('../src/features/game/combination');

const options = {
  phoenixLooseSinglesPenalty: 120,
  strandedSinglesPenalty: g.exitProtectionPenalty,
  strandedLowCardPenalty: g.lowCardProtectionPenalty,
};
const premium = card => ['Q', 'K', 'A'].includes(card.rank) || ['phoenix', 'dragon'].includes(card.id);
const moveKey = move => move.action === 'pass' ? 'pass' : move.cards.map(card => card.id).sort().join(',');
const partitions = new Map();

// A disjoint minimum-play cover. Among equally short covers, prefer fewer weak
// groups. This is an own-hand rank proxy, not a probability of beating opponents.
function lowPartition(cards) {
  if (!cards.length) return { groups: 0, weakGroups: 0 };
  const key = cards.map(card => card.id).sort().join(',');
  if (partitions.has(key)) return partitions.get(key);
  const index = new Map(cards.map((card, i) => [card.id, i]));
  const byBit = cards.map(() => []);
  for (const move of g.generateOfflineLegalMoves(cards, null)) {
    const mask = move.cards.reduce((bits, card) => bits | (1 << index.get(card.id)), 0);
    const weak = !move.combo.is_bomb && move.combo.type !== 'dog' &&
      move.combo.rank < (move.combo.type === 'single' ? 12 : 11);
    for (let i = 0; i < cards.length; i++) if (mask & (1 << i)) byBit[i].push({ mask, weak });
  }
  const memo = new Map([[0, 0]]);
  function cover(mask) {
    if (memo.has(mask)) return memo.get(mask);
    const first = 31 - Math.clz32(mask & -mask);
    let best = Infinity;
    for (const move of byBit[first]) {
      if ((mask & move.mask) === move.mask) best = Math.min(best, 16 + Number(move.weak) + cover(mask ^ move.mask));
    }
    memo.set(mask, best);
    return best;
  }
  const cost = cover((1 << cards.length) - 1);
  if (!Number.isFinite(cost)) throw new Error('Hand has no legal disjoint cover.');
  const result = { groups: Math.floor(cost / 16), weakGroups: cost % 16 };
  if (partitions.size >= 30000) partitions.clear();
  partitions.set(key, result);
  return result;
}

// A pair/triple of the same high rank is one reserve, rather than two/three
// independent lead-winning plays. Phoenix and Dragon each count separately.
function reserveCount(cards) {
  return new Set(cards.filter(premium).map(card => card.kind === 'standard' ? card.rank : card.id)).size;
}

function reserveRisk(view, move, adaptive = true) {
  if (move.action === 'pass' || !move.cards.some(premium)) return { shortfall: 0 };
  const spent = new Set(move.cards.map(card => card.id));
  const remaining = view.hand.filter(card => !spent.has(card.id));
  const low = remaining.filter(card => !premium(card));
  if (low.length < 3 || validatePlay(low, null).valid) return { shortfall: 0 };
  const cover = adaptive ? lowPartition(low) : null;
  const needed = adaptive ? Math.min(3, Math.max(0, cover.weakGroups - 1), reserveCount(view.hand)) : 1;
  const reserves = reserveCount(remaining);
  return { shortfall: Math.max(0, needed - reserves), needed, reserves, lowCards: low.length, ...cover };
}

function chooseReserveBot(view, plan, baseOptions = options) {
  const actions = g.legalOfflineBotActions(view);
  const settings = g.liveOfflineSettingsForView(view, baseOptions);
  const baseline = g.chooseFairOfflineBot(view, actions, settings);
  if (plan === 'current') return baseline;
  const finish = actions.find(move => move.action === 'play' && move.cards.length === view.hand.length);
  if (finish) return g.chooseFairOfflineBot(view, [finish], settings);
  const urgent = g.offlineSeats.some(seat => g.teamForSeat(seat) !== g.teamForSeat(view.seat) &&
    view.handCounts[seat] === 1);
  if (urgent || view.turnState.wishRank) return baseline;
  const adaptive = plan !== 'single-reserve';
  const soft = plan === 'adaptive-penalty';
  let candidates = soft ? actions : actions.filter(move => reserveRisk(view, move, adaptive).shortfall === 0);
  if (!candidates.length) candidates = actions;
  if (view.turnState.currentWinningSeat === null && view.hand.some(premium)) {
    const lowPlays = candidates.filter(move => move.action === 'play' && move.cards.every(card => !premium(card)));
    if (lowPlays.length) {
      const largest = Math.max(...lowPlays.map(move => move.cards.length));
      candidates = lowPlays.filter(move => move.cards.length === largest);
    }
  }
  if (soft) settings.moveScorePenalty = move => 120 * reserveRisk(view, move, true).shortfall;
  return g.chooseFairOfflineBot(view, candidates, settings);
}

module.exports = { chooseReserveBot, lowPartition, moveKey, options, premium, reserveCount, reserveRisk };
