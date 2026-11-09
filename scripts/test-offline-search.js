require('./load-offline-engine');

const assert = require('node:assert/strict');
const {
  advanceOfflineBotTurn,
  applyOfflineMove,
  applyOfflinePassing,
  chooseFairOfflineBot,
  chooseLiveOfflineBot,
  createOfflineDeal,
  createOfflineDeck,
  generateOfflineLegalMoves,
  legalOfflineBotActions,
  liveOfflineSettingsForView,
  observeOfflineBot,
  offlineSeats,
  shortlistOfflineBotActions,
} = require('../src/features/offline/offline-game');
const { chooseConfiguredOfflineBot, chooseSearchOfflineBot, createOfflineSampler } = require('../src/features/offline/offline-search');
const { validatePlay } = require('../src/features/game/combination');
const { seededRandom } = require('./run-offline-self-play');

function key(move) {
  return move.action === 'pass' ? 'pass' : move.cards.map(card => card.id).sort().join(',');
}

function verifyMoveGenerator() {
  const deck = createOfflineDeck();
  const card = id => deck.find(item => item.id === id);
  const handWith = (...ids) => ids.map(card);
  const combinations = [
    null,
    validatePlay(handWith('jade-3'), null),
    validatePlay(handWith('jade-4', 'sword-4'), null),
    validatePlay(handWith('jade-4', 'sword-4', 'pagoda-4'), null),
    validatePlay(handWith('jade-4', 'sword-4', 'pagoda-4', 'jade-6', 'sword-6'), null),
    validatePlay(handWith('jade-4', 'sword-4', 'jade-5', 'sword-5'), null),
    validatePlay(handWith('jade-4', 'sword-5', 'jade-6', 'jade-7', 'jade-8'), null),
    validatePlay(handWith('jade-4', 'sword-4', 'pagoda-4', 'star-4'), null),
    validatePlay(handWith('jade-4', 'jade-5', 'jade-6', 'jade-7', 'jade-8'), null),
  ];
  const hands = [
    handWith('mah-jong', 'phoenix', 'dragon', 'dog', 'star-2', 'star-3', 'star-4', 'star-5', 'star-6', 'star-7', 'jade-4', 'sword-4', 'pagoda-4', 'jade-5'),
    ...Object.values(createOfflineDeal(seededRandom(167)).hands),
  ];
  for (const hand of hands) {
    for (const combo of combinations) {
      const expected = [];
      for (let mask = 1; mask < 2 ** hand.length; mask += 1) {
        const cards = hand.filter((_, index) => mask & (1 << index));
        if (validatePlay(cards, combo).valid) expected.push(key({ cards, action: 'play' }));
      }
      const actual = generateOfflineLegalMoves(hand, combo).map(key);
      assert.deepEqual(actual.sort(), expected.sort(), 'Generated moves must match the exhaustive validator.');
    }
  }
  console.log('PASS move generator matches exhaustive validation on full hands and special-card combinations');
}

function findEndgame() {
  const deal = applyOfflinePassing(createOfflineDeal(seededRandom(1)));
  const opener = deal.turnState.currentSeat;
  const openingView = observeOfflineBot(deal, opener);
  const earlySample = createOfflineSampler(openingView)(seededRandom(4));
  assert(earlySample);
  assert.equal(openingView.knownOutgoing.length, 3);
  for (const { card, toSeat } of openingView.knownOutgoing) {
    assert(earlySample.hands[toSeat].some(held => held.id === card.id));
  }
  const early = chooseSearchOfflineBot(openingView);
  assert.equal(early.diagnostics.search.fallback, 'outside-endgame');
  assert.deepEqual(early.decision, chooseFairOfflineBot(openingView).decision);

  let next = deal;
  while (next.turnState) {
    const seat = next.turnState.currentSeat;
    const view = observeOfflineBot(next, seat);
    const counts = Object.values(view.handCounts);
    const known = new Set(view.knownOutgoing.map(entry => entry.card.id));
    const unknownSeats = offlineSeats.filter(candidate => candidate !== seat &&
      next.hands[candidate].some(card => !known.has(card.id)));
    if (counts.reduce((sum, count) => sum + count, 0) <= 16 && Math.max(...counts) <= 8 &&
      unknownSeats.length >= 2 && legalOfflineBotActions(view).length > 1) {
      return { deal: next, view, known, unknownSeats };
    }
    next = applyOfflineMove(next, seat, chooseFairOfflineBot(view).decision);
  }
  throw new Error('Expected a searchable endgame for the test seed.');
}

function verifyInformationBoundary() {
  const { deal, view, known, unknownSeats: [left, right] } = findEndgame();
  const { seat } = view;
  const sample = createOfflineSampler(view);
  const random = seededRandom(7);
  for (let index = 0; index < 12; index += 1) {
    const sampled = sample(random);
    assert(sampled);
    const allCards = [...Object.values(sampled.hands).flat(), ...sampled.plays.flatMap(play => play.cards)];
    assert.equal(allCards.length, 56);
    assert.equal(new Set(allCards.map(card => card.id)).size, 56);
    assert.deepEqual(sampled.hands[seat], view.hand);
    for (const candidate of offlineSeats) {
      assert.equal(sampled.hands[candidate].length, view.handCounts[candidate]);
    }
    for (const { card, toSeat } of view.knownOutgoing) {
      assert(sampled.hands[toSeat].some(held => held.id === card.id));
    }
  }

  const hands = { ...deal.hands, [left]: [...deal.hands[left]], [right]: [...deal.hands[right]] };
  const leftIndex = hands[left].findIndex(card => !known.has(card.id));
  const rightIndex = hands[right].findIndex(card => !known.has(card.id));
  [hands[left][leftIndex], hands[right][rightIndex]] = [hands[right][rightIndex], hands[left][leftIndex]];
  const changed = observeOfflineBot({ ...deal, hands }, seat);
  assert.deepEqual(changed, view);
  assert.deepEqual(chooseFairOfflineBot(changed), chooseFairOfflineBot(view));
  const first = chooseSearchOfflineBot(view, { random: seededRandom(7), iterations: 32 });
  const second = chooseSearchOfflineBot(changed, { random: seededRandom(7), iterations: 32 });
  assert.equal(first.diagnostics.engineVersion, 'ismcts-v2');
  assert.equal(first.diagnostics.search.iterations, 32);
  assert.deepEqual(first.decision, second.decision);
  assert.deepEqual(first.diagnostics.candidates, second.diagnostics.candidates);
  assert.equal(applyOfflineMove(deal, seat, first.decision).plays.length, deal.plays.length + 1);
  const afterSearch = advanceOfflineBotTurn(deal, () => first, true);
  assert.deepEqual(afterSearch.lastBotSearch, { seat, trickNumber: view.turnState.trickNumber, iterations: 32 });
  const afterHeuristic = advanceOfflineBotTurn(afterSearch, (state, actor) => chooseFairOfflineBot(observeOfflineBot(state, actor)), true);
  assert.equal(afterHeuristic.botDiagnostics.engineVersion, 'fair-v2');
  assert.deepEqual(JSON.parse(JSON.stringify(afterHeuristic)).lastBotSearch, afterSearch.lastBotSearch);

  const legacyView = observeOfflineBot({ ...deal, outgoingCards: undefined }, seat);
  assert.deepEqual(legacyView.knownOutgoing, []);
  assert(createOfflineSampler(legacyView)(seededRandom(7)));
  const timedOut = chooseSearchOfflineBot(view, { random: seededRandom(7), budgetMs: 0 });
  assert.equal(timedOut.diagnostics.search.iterations, 0);
  assert.deepEqual(timedOut.decision, chooseFairOfflineBot(view).decision);

  const experiments = { extraPhoenixProtection: true, endgameSearch: true };
  const runConfigured = (state, iterations, budgetMs = Infinity) =>
    chooseConfiguredOfflineBot(state, seat, experiments, { iterations, budgetMs, random: seededRandom(7) });
  const configured = runConfigured(deal, 16);
  const changedConfigured = runConfigured({ ...deal, hands }, 16);
  assert.equal(configured.diagnostics.engineVersion, 'ismcts-v4');
  assert.deepEqual(configured.decision, changedConfigured.decision);
  assert.deepEqual(configured.diagnostics.candidates, changedConfigured.diagnostics.candidates);
  const incomplete = runConfigured(deal, 1);
  assert.equal(incomplete.diagnostics.search.fallback, 'incomplete-shortlist');
  assert.equal(incomplete.diagnostics.search.iterations, 1);
  assert.deepEqual(incomplete.decision, chooseLiveOfflineBot(deal, seat, { phoenixLooseSinglesPenalty: 120 }).decision);
  assert.deepEqual(chooseConfiguredOfflineBot(deal, seat, { extraPhoenixProtection: false, endgameSearch: false }),
    chooseLiveOfflineBot(deal, seat));
  console.log('PASS hidden-hand invariance, exchange constraints, deck conservation, legal search and fallback');
}

function verifyShortlist() {
  const [seat, winner] = offlineSeats;
  const deck = createOfflineDeck();
  const cards = (...ids) => ids.map(id => deck.find(card => card.id === id));
  const deal = applyOfflinePassing(createOfflineDeal(seededRandom(1)));
  const view = {
    ...observeOfflineBot(deal, deal.turnState.currentSeat), seat, knownOutgoing: [],
    hand: cards('jade-6', 'jade-7', 'jade-8', 'jade-9', 'sword-9', 'jade-J'),
    handCounts: Object.fromEntries(offlineSeats.map(other => [other, 6])),
    plays: [{ seat: winner, trickNumber: 4, cards: cards('sword-5'), combo: validatePlay(cards('sword-5'), null), action: 'play' }],
    turnState: { currentSeat: seat, currentWinningSeat: winner, passCount: 0, trickNumber: 4, wishRank: null },
  };
  const rank = observation => shortlistOfflineBotActions(observation, liveOfflineSettingsForView(observation));
  const reply = rank(view);
  assert(legalOfflineBotActions(view).length > 4);
  assert.equal(reply.actions.length, 4);
  assert.equal(new Set(reply.actions.map(key)).size, 4);
  assert.equal(reply.actions.at(-1).action, 'pass');
  if (reply.preferred.decision.action === 'play') assert.deepEqual(reply.actions[0], reply.preferred.decision);

  const wish = rank({ ...view, turnState: { ...view.turnState, wishRank: '9' } });
  assert.equal(wish.actions.length, 2);
  assert(wish.actions.every(move => move.action === 'play' && move.cards.some(card => card.rank === '9')));

  const lead = rank({ ...view, hand: cards('mah-jong', 'jade-2', 'jade-3', 'jade-4', 'jade-5', 'jade-Q'),
    turnState: { ...view.turnState, currentWinningSeat: null } });
  assert.equal(lead.actions.length, 3);
  assert.equal(new Set(lead.actions.map(key)).size, 3);
  assert(lead.actions.some(move => move.cards.some(card => card.id === 'mah-jong') && move.wishRank));

  const end = { ...deal, plays: view.plays, turnState: view.turnState,
    hands: Object.fromEntries(offlineSeats.map((other, index) => [other, index ? cards('jade-3', 'jade-4') : cards('jade-6')])) };
  const finishing = chooseConfiguredOfflineBot(end, seat, { extraPhoenixProtection: false, endgameSearch: true });
  assert.equal(finishing.diagnostics.search.fallback, 'immediate-finish');
  assert.deepEqual(finishing.decision.cards, end.hands[seat]);
  console.log('PASS three distinct plays plus legal pass, single Mah Jong wish per play, mandatory wishes and immediate finish');
}

verifyMoveGenerator();
verifyInformationBoundary();
verifyShortlist();
