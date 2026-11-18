const assert = require('node:assert/strict');
const { seededRandom } = require('./run-offline-self-play');
const g = require('../src/features/offline/offline-game');
const { chooseConfiguredOfflineBot, createOfflineSampler } = require('../src/features/offline/offline-search');
const { chooseReserveBot, lowPartition, moveKey, options, reserveCount, reserveRisk } = require('./control-reserve-policy');

const deck = Object.values(g.createOfflineDeal(seededRandom(2)).hands).flat();
function take(ranks) {
  const used = new Set();
  return ranks.map(rank => {
    const card = deck.find(item => !used.has(item.id) && (item.rank === rank || item.id === rank));
    assert(card, rank);
    used.add(card.id);
    return card;
  });
}
const initial = g.applyOfflinePassing(g.createOfflineDeal(seededRandom(5)));
const root = g.observeOfflineBot(initial, initial.turnState.currentSeat);
function viewFor(hand) {
  return { ...root, hand, plays: [], knownOutgoing: [], finishOrder: [],
    handCounts: Object.fromEntries(g.offlineSeats.map(seat => [seat, seat === root.seat ? hand.length : 8])),
    turnState: { ...root.turnState, currentWinningSeat: null, wishRank: null },
  };
}
const plans = ['single-reserve', 'adaptive-reserve', 'adaptive-penalty'];
assert.deepEqual(lowPartition(take(['2','2','3','3','4','4'])), { groups: 1, weakGroups: 1 });
assert.deepEqual(lowPartition(take(['2','2','5','5','8','8'])), { groups: 3, weakGroups: 3 });
assert.equal(reserveCount(take(['Q','Q','A','dragon','phoenix'])), 4);
const multi = viewFor(take(['Q','A','2','2','5','5','8','8']));
const queen = { action: 'play', cards: multi.hand.filter(card => card.rank === 'Q') };
assert.equal(reserveRisk(multi, queen, false).shortfall, 0);
assert.equal(reserveRisk(multi, queen, true).needed, 2);
assert.equal(reserveRisk(multi, queen, true).shortfall, 1);
const many = viewFor(take(['Q','K','A','2','2','4','4','6','6','8','8']));
assert.equal(reserveRisk(many, { action: 'play', cards: many.hand.filter(card => card.rank === 'Q') }, true).needed, 3);
const integratedChoice = view => g.chooseFairOfflineBot(view, undefined,
  { ...g.liveOfflineSettingsForView(view, options), reserveOneHighCard: true });
const reply = viewFor(take(['A','2','2','5','5','8','8']));
const winner = g.offlineSeats.find(seat => g.teamForSeat(seat) !== g.teamForSeat(reply.seat));
const king = take(['K']);
reply.plays = [{ action: 'play', cards: king, combo: require('../src/features/game/combination').validatePlay(king, null),
  seat: winner, trickNumber: 1, id: 'reserve-fixture' }];
reply.turnState = { ...reply.turnState, currentWinningSeat: winner, trickNumber: 1 };
assert.equal(chooseReserveBot(reply, 'current').decision.action, 'play');
assert.equal(integratedChoice(reply).decision.action, 'pass');
assert.match(integratedChoice(reply).diagnostics.reason, /reserve/);
assert.deepEqual(g.shortlistOfflineBotActions(reply,
  { ...g.liveOfflineSettingsForView(reply, options), reserveOneHighCard: true }).actions, [{ action: 'pass' }]);
const lead = integratedChoice({ ...reply, plays: [], turnState: { ...reply.turnState, currentWinningSeat: null } });
assert.equal(lead.decision.cards.length, 2);
assert(lead.decision.cards.every(card => card.rank !== 'A'));
for (const plan of plans) {
  const finish = viewFor(take(['Q','Q']));
  assert.equal(chooseReserveBot(finish, plan).decision.cards.length, 2);
  assert.equal(integratedChoice(finish).decision.cards.length, 2);
  const wish = { ...multi, turnState: { ...multi.turnState, wishRank: '2' } };
  assert.equal(moveKey(chooseReserveBot(wish, plan).decision), moveKey(chooseReserveBot(wish, 'current').decision));
  assert.equal(moveKey(integratedChoice(wish).decision), moveKey(chooseReserveBot(wish, 'current').decision));
  const urgent = { ...multi, handCounts: { ...multi.handCounts } };
  urgent.handCounts[g.offlineSeats.find(seat => g.teamForSeat(seat) !== g.teamForSeat(multi.seat))] = 1;
  assert.equal(moveKey(chooseReserveBot(urgent, plan).decision), moveKey(chooseReserveBot(urgent, 'current').decision));
  assert.equal(moveKey(integratedChoice(urgent).decision), moveKey(chooseReserveBot(urgent, 'current').decision));
}

let checked = 0;
for (let seed = 280001; seed < 280026; seed++) {
  let state = g.applyOfflinePassing(g.createOfflineDeal(seededRandom(seed)));
  for (let turn = 0; state.turnState && turn < 12; turn++) {
    const view = g.observeOfflineBot(state, state.turnState.currentSeat);
    const settings = g.liveOfflineSettingsForView(view, options);
    const normal = g.chooseFairOfflineBot(view, undefined, settings);
    const zero = g.chooseFairOfflineBot(view, undefined, { ...settings, moveScorePenalty: () => 0 });
    assert.deepEqual(zero, normal, 'An unused score hook changed the baseline.');
    const disabled = g.chooseFairOfflineBot(view, undefined, { ...settings, reserveOneHighCard: false });
    assert.deepEqual(disabled, normal, 'The reserve switch changed decisions while off.');
    const integrated = g.chooseFairOfflineBot(view, undefined, { ...settings, reserveOneHighCard: true });
    assert.equal(moveKey(integrated.decision), moveKey(chooseReserveBot(view, 'single-reserve').decision),
      'The app rule differs from the tested single-reserve policy.');
    const configured = chooseConfiguredOfflineBot(state, view.seat, {
      extraPhoenixProtection: true, exitProtection: true, protectLowCards: true,
      reserveOneHighCard: true, endgameSearch: false,
    });
    const live = g.chooseLiveOfflineBot(state, view.seat, { ...options, reserveOneHighCard: true });
    assert.equal(moveKey(configured.decision), moveKey(live.decision));
    assert.equal(configured.diagnostics.experiments.reserveOneHighCard, true);
    const sampled = createOfflineSampler(view)(seededRandom(seed + turn));
    assert(sampled);
    const other = g.observeOfflineBot(sampled, view.seat);
    assert.deepEqual(other, view);
    assert.equal(moveKey(integrated.decision), moveKey(g.chooseFairOfflineBot(other, undefined,
      { ...settings, reserveOneHighCard: true }).decision));
    for (const plan of plans) {
      const result = chooseReserveBot(view, plan);
      assert.equal(moveKey(result.decision), moveKey(chooseReserveBot(other, plan).decision));
      const next = g.applyOfflineMove(state, view.seat, result.decision);
      assert.notStrictEqual(next, state, 'Policy selected an illegal move.');
    }
    state = g.applyOfflineMove(state, view.seat, normal.decision);
    checked++;
  }
}
console.log(`Control reserve checks passed: disjoint covers, multiple reserves, finishes, wishes, pressure, switch-off parity, app/experiment parity and ${checked} hidden-hand-invariant positions.`);
