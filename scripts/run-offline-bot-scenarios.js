require('./load-offline-engine');

const {
  advanceOfflineBotTurn,
  applyOfflineMove,
  chooseFairOfflineBot,
  liveOfflineBotSettings,
  generateOfflineLegalMoves,
  observeOfflineBot,
  simulateOfflineMove,
  submitOfflinePlay,
  visibleCardList,
} = require('../src/features/offline/offline-game');
const { validatePlay } = require('../src/features/game/combination');
const { chooseSearchOfflineBot, createOfflineSampler, rollOutOfflineHand } = require('../src/features/offline/offline-search');
const { seededRandom } = require('./run-offline-self-play');
const { phoenixReportView } = require('./run-phoenix-experiment');

const seats = ['team_one_player_one', 'team_two_player_one', 'team_one_player_two', 'team_two_player_two'];
const suits = ['jade', 'sword', 'pagoda', 'star'];
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function cardPoints(rank) {
  if (rank === '5') {
    return 5;
  }

  if (rank === '10' || rank === 'K') {
    return 10;
  }

  return 0;
}

function standardCard(suit, rank) {
  return {
    id: `${suit}-${rank}`,
    kind: 'standard',
    label: `${rank} of ${suit}`,
    points: cardPoints(rank),
    rank,
    sort_value: (suits.indexOf(suit) + 1) * 100 + ranks.indexOf(rank) + 1,
    suit,
  };
}

function specialCard(id) {
  const specialCards = {
    dog: { id: 'dog', kind: 'special', label: 'Dog', points: 0, rank: null, sort_value: 2, suit: null },
    dragon: { id: 'dragon', kind: 'special', label: 'Dragon', points: 25, rank: null, sort_value: 4, suit: null },
    'mah-jong': { id: 'mah-jong', kind: 'special', label: 'Mah Jong', points: 0, rank: null, sort_value: 1, suit: null },
    phoenix: { id: 'phoenix', kind: 'special', label: 'Phoenix', points: -25, rank: null, sort_value: 3, suit: null },
  };

  return specialCards[id];
}

function emptySeatCards() {
  return {
    team_one_player_one: [],
    team_one_player_two: [],
    team_two_player_one: [],
    team_two_player_two: [],
  };
}

function botPlayers(hands) {
  return [
    { cardCount: hands.team_two_player_one.length, isHuman: false, name: 'Bot Left', seat: 'team_two_player_one' },
    { cardCount: hands.team_one_player_two.length, isHuman: false, name: 'Bot Partner', seat: 'team_one_player_two' },
    { cardCount: hands.team_two_player_two.length, isHuman: false, name: 'Bot Right', seat: 'team_two_player_two' },
  ];
}

function playFor(seat, cards, trickNumber = 1) {
  const combo = validatePlay(cards, null);

  if (!combo.valid) {
    throw new Error(`Bad scenario play for ${seat}: ${combo.reason}`);
  }

  return {
    action: 'play',
    cards,
    combo,
    id: `${seat}-${trickNumber}`,
    seat,
    trickNumber,
  };
}

function makeDeal({ currentSeat, currentWinningSeat = null, finishOrder = [], hands, plays = [], trickNumber = 1, wishRank = null }) {
  return {
    botDiagnostics: null,
    botPlayers: botPlayers(hands),
    finishOrder,
    hands,
    humanHand: hands.team_one_player_one,
    humanSeat: 'team_one_player_one',
    plays,
    scoreSummary: null,
    status: 'playing',
    turnState: {
      currentSeat,
      currentWinningSeat,
      passCount: 0,
      trickNumber,
      wishRank,
    },
    wonCards: emptySeatCards(),
    wonTricks: {
      team_one_player_one: 0,
      team_one_player_two: 0,
      team_two_player_one: 0,
      team_two_player_two: 0,
    },
  };
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cardIds(cards) {
  return cards.map((card) => card.id).sort();
}

const scenarios = [
  {
    name: 'bot card displays descend by rank across suits and special cards',
    run() {
      const cards = [
        standardCard('star', '2'),
        specialCard('phoenix'),
        standardCard('jade', 'A'),
        specialCard('mah-jong'),
        standardCard('sword', 'K'),
        specialCard('dragon'),
        specialCard('dog'),
      ];
      const originalIds = cards.map((card) => card.id).join(' ');

      expect(visibleCardList(cards) === 'Dragon Phoenix A\u2663 K\u2660 2\u2665 Dog Mah Jong', 'Expected highest cards first across suits.');
      expect(cards.map((card) => card.id).join(' ') === originalIds, 'Expected the original hand order to stay intact.');
    },
  },
  {
    name: 'passes when partner is already winning',
    run() {
      const partnerPlay = playFor('team_two_player_two', [standardCard('star', '7')]);
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [standardCard('jade', '9'), standardCard('sword', '10')],
        team_two_player_two: [standardCard('jade', '5')],
      };
      const result = advanceOfflineBotTurn(
        makeDeal({
          currentSeat: 'team_two_player_one',
          currentWinningSeat: 'team_two_player_two',
          hands,
          plays: [partnerPlay],
        })
      );

      expect(result.botDiagnostics.decision === 'pass', 'Expected bot to pass behind a winning partner.');
      expect(result.botDiagnostics.reason.includes('Partner is winning'), 'Expected partner-winning reason.');
    },
  },
  {
    name: 'plays through partner winner when it can go out',
    run() {
      const partnerPlay = playFor('team_two_player_two', [standardCard('star', '7')]);
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [standardCard('jade', '9')],
        team_two_player_two: [standardCard('jade', '5')],
      };
      const result = advanceOfflineBotTurn(
        makeDeal({
          currentSeat: 'team_two_player_one',
          currentWinningSeat: 'team_two_player_two',
          hands,
          plays: [partnerPlay],
        })
      );

      expect(result.botDiagnostics.decision === 'play', 'Expected bot to play when it can empty its hand.');
      expect(cardIds(result.botDiagnostics.decisionCards).join(',') === 'jade-9', 'Expected bot to play 9 of jade.');
      expect(result.hands.team_two_player_one.length === 0, 'Expected bot hand to be empty.');
    },
  },
  {
    name: 'preserves a four-card bomb when leading',
    run() {
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [
          standardCard('jade', '8'),
          standardCard('sword', '8'),
          standardCard('pagoda', '8'),
          standardCard('star', '8'),
          standardCard('jade', '3'),
          standardCard('sword', '4'),
        ],
        team_two_player_two: [standardCard('jade', '5')],
      };
      const result = advanceOfflineBotTurn(makeDeal({ currentSeat: 'team_two_player_one', hands }));

      expect(result.botDiagnostics.decision === 'play', 'Expected bot to lead a card.');
      expect(!result.botDiagnostics.decisionLabel.includes('Bomb'), 'Expected bot not to spend the bomb as an opening lead.');
      expect(!cardIds(result.botDiagnostics.decisionCards).some((id) => id.endsWith('-8')), 'Expected bot not to break the four 8s.');
    },
  },
  {
    name: 'uses Dog to pass lead to partner',
    run() {
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [specialCard('dog'), standardCard('jade', '2'), standardCard('sword', '3')],
        team_two_player_two: [standardCard('jade', '5')],
      };
      const result = advanceOfflineBotTurn(makeDeal({ currentSeat: 'team_two_player_one', hands }));

      expect(result.botDiagnostics.decision === 'play', 'Expected bot to play.');
      expect(cardIds(result.botDiagnostics.decisionCards).join(',') === 'dog', 'Expected bot to choose Dog.');
      expect(result.turnState.currentSeat === 'team_two_player_two', 'Expected Dog to pass lead to partner.');
    },
  },
  {
    name: 'leads a shape that lets partner finish',
    run() {
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [standardCard('jade', '2'), standardCard('sword', '2'), standardCard('jade', '3')],
        team_two_player_two: [standardCard('pagoda', 'A'), standardCard('star', 'A')],
      };
      const result = advanceOfflineBotTurn(makeDeal({ currentSeat: 'team_two_player_one', hands }));

      expect(result.botDiagnostics.decision === 'play', 'Expected bot to lead.');
      expect(cardIds(result.botDiagnostics.decisionCards).join(',') === 'jade-2,sword-2', 'Expected bot to lead the pair partner can beat.');
      expect(result.botDiagnostics.reason.includes('partner'), 'Expected partner setup reason.');
    },
  },
  {
    name: 'does not waste Dragon on a low-value ace trick',
    run() {
      const opponentPlay = playFor('team_one_player_two', [standardCard('star', 'A')]);
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [specialCard('dragon'), standardCard('jade', '3')],
        team_one_player_two: [standardCard('jade', '5')],
      };
      const result = advanceOfflineBotTurn(
        makeDeal({
          currentSeat: 'team_two_player_one',
          currentWinningSeat: 'team_one_player_two',
          hands,
          plays: [opponentPlay],
        })
      );

      expect(result.botDiagnostics.decision === 'pass', 'Expected bot to pass instead of spending Dragon.');
      expect(result.botDiagnostics.candidates.some((candidate) => candidate.label.includes('Dragon')), 'Expected Dragon to be scored as a candidate.');
    },
  },
  {
    name: 'does not waste Phoenix as a single too early',
    run() {
      const opponentPlay = playFor('team_one_player_two', [standardCard('star', 'A')]);
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [specialCard('phoenix'), standardCard('jade', '3'), standardCard('sword', '4')],
        team_one_player_two: [standardCard('jade', '5')],
      };
      const result = advanceOfflineBotTurn(
        makeDeal({
          currentSeat: 'team_two_player_one',
          currentWinningSeat: 'team_one_player_two',
          hands,
          plays: [opponentPlay],
        })
      );

      expect(result.botDiagnostics.decision === 'pass', 'Expected bot to pass instead of spending Phoenix as a single.');
      expect(result.botDiagnostics.candidates.some((candidate) => candidate.label.includes('Phoenix')), 'Expected Phoenix to be scored as a candidate.');
    },
  },
  {
    name: 'uses Phoenix to complete a finishing pair',
    run() {
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [specialCard('phoenix'), standardCard('jade', '8')],
        team_two_player_two: [standardCard('jade', '5')],
      };
      const result = advanceOfflineBotTurn(makeDeal({ currentSeat: 'team_two_player_one', hands }));

      expect(result.botDiagnostics.decision === 'play', 'Expected bot to play the finishing Phoenix pair.');
      expect(result.botDiagnostics.decisionLabel.includes('Pair 8'), 'Expected Phoenix to complete a pair of 8s.');
      expect(cardIds(result.botDiagnostics.decisionCards).join(',') === 'jade-8,phoenix', 'Expected bot to play 8 plus Phoenix.');
      expect(result.hands.team_two_player_one.length === 0, 'Expected bot hand to be empty.');
    },
  },
  {
    name: 'Phoenix experiment can pass on the reported pair while preserving tactical exceptions',
    run() {
      const view = phoenixReportView();
      const choose = (position, penalty) =>
        chooseFairOfflineBot(position, undefined, { phoenixLooseSinglesPenalty: penalty });
      const baseline = chooseFairOfflineBot(view);
      expect(JSON.stringify(choose(view, 0)) === JSON.stringify(baseline), 'Zero penalty must reproduce fair-v2.');
      expect(baseline.decision.action === 'play' && baseline.diagnostics.candidates[0].score === 87,
        'Expected the recorded Phoenix pair with its original score.');
      expect(choose(view, 40).decision.action === 'play', 'Expected the 40-point penalty to keep the Phoenix reply.');
      expect(choose(view, 80).decision.action === 'play', 'Expected the 80-point penalty to keep the Phoenix reply.');
      expect(choose(view, 120).decision.action === 'pass', 'Expected the 120-point penalty to pass.');
      const chooseAgainstWinner = maxCards => chooseFairOfflineBot(view, undefined, {
        phoenixLooseSinglesPenalty: 120,
        phoenixLooseSinglesMaxWinnerCards: maxCards,
      });
      expect(chooseAgainstWinner(3).decision.action === 'play', 'The winning opponent has too many cards for this setting.');
      expect(chooseAgainstWinner(4).decision.action === 'pass', 'The four-card opponent qualifies for the penalty.');

      const finishing = {
        ...view,
        hand: view.hand.filter(card => card.id === 'phoenix' || card.id === 'sword-Q'),
        handCounts: { ...view.handCounts, [view.seat]: 2 },
      };
      const mandatoryWish = { ...view, turnState: { ...view.turnState, wishRank: 'Q' } };
      const urgent = { ...view, handCounts: { ...view.handCounts, [view.turnState.currentWinningSeat]: 1 } };
      const straight = {
        ...view,
        hand: [
          ...finishing.hand,
          standardCard('jade', '5'),
          standardCard('sword', '6'),
          standardCard('jade', '7'),
          standardCard('star', '8'),
          standardCard('sword', '9'),
        ],
      };
      for (const [name, position] of Object.entries({ finishing, mandatoryWish, urgent, straight })) {
        const original = choose(position, 0);
        expect(original.decision.action === 'play' && original.decision.cards.some(card => card.id === 'phoenix'),
          `Expected a Phoenix reply in the ${name} scenario.`);
        expect(JSON.stringify(choose(position, 120)) === JSON.stringify(original),
          `The penalty must preserve the ${name} reply.`);
      }
    },
  },
  {
    name: 'live bot passes to keep a strong play for weak singles',
    run() {
      const view = phoenixReportView();
      const choose = position => chooseFairOfflineBot(position, undefined, liveOfflineBotSettings);
      const guarded = choose(view);
      expect(guarded.decision.action === 'pass', 'Expected the live heuristic to pass on the reported pair.');
      expect(guarded.diagnostics.reason.includes('remaining weak singles'), 'Expected the bot to explain why it saved Phoenix.');
      const searched = chooseSearchOfflineBot(view, { heuristicSettings: liveOfflineBotSettings });
      expect(searched.decision.action === 'pass', 'Expected the experimental bot to pass on its early-turn fallback.');

      const hasWinner = { ...view, hand: [...view.hand, standardCard('jade', 'A')] };
      const urgent = { ...view, handCounts: { ...view.handCounts, [view.turnState.currentWinningSeat]: 1 } };
      const wish = { ...view, turnState: { ...view.turnState, wishRank: 'Q' } };
      const finishing = { ...view, hand: view.hand.filter(card => card.id === 'phoenix' || card.id === 'sword-Q') };
      for (const position of [hasWinner, urgent, wish, finishing]) {
        expect(choose(position).decision.action === 'play', 'Expected a strong reserve, urgent play, wish or finish to allow the reply.');
      }

      const winner = view.turnState.currentWinningSeat;
      const single = {
        ...view,
        plays: [playFor(winner, [standardCard('sword', 'Q')], view.turnState.trickNumber)],
        hand: [standardCard('jade', 'A'), standardCard('star', '3'), standardCard('jade', '5'), standardCard('pagoda', '8')],
      };
      expect(choose(single).decision.action === 'pass', 'Expected the bot to keep its last Ace when three weak singles would remain.');
      const withPair = { ...single, hand: [...single.hand, standardCard('star', 'J'), standardCard('jade', 'J')] };
      expect(choose(withPair).decision.action === 'play', 'Expected the Ace reply when a strong pair remains.');
    },
  },
  {
    name: 'avoids Phoenix when partner is already winning',
    run() {
      const partnerPlay = playFor('team_two_player_two', [standardCard('star', 'A')]);
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [specialCard('phoenix'), standardCard('jade', '3')],
        team_two_player_two: [standardCard('jade', '5')],
      };
      const result = advanceOfflineBotTurn(
        makeDeal({
          currentSeat: 'team_two_player_one',
          currentWinningSeat: 'team_two_player_two',
          hands,
          plays: [partnerPlay],
        })
      );

      expect(result.botDiagnostics.decision === 'pass', 'Expected bot to pass instead of spending Phoenix over partner.');
      expect(result.botDiagnostics.reason.includes('Partner is winning'), 'Expected partner-winning reason.');
    },
  },
  {
    name: 'leads high single to pressure a one-card opponent',
    run() {
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [standardCard('jade', '3'), standardCard('sword', 'A')],
        team_one_player_two: [standardCard('jade', '9')],
      };
      const result = advanceOfflineBotTurn(makeDeal({ currentSeat: 'team_two_player_one', hands }));

      expect(result.botDiagnostics.decision === 'play', 'Expected bot to lead.');
      expect(cardIds(result.botDiagnostics.decisionCards).join(',') === 'sword-A', 'Expected bot to lead high against a one-card opponent.');
      expect(result.botDiagnostics.reason.includes('nearly out'), 'Expected near-out opponent reason.');
    },
  },
  {
    name: 'spends Dragon to stop a one-card opponent',
    run() {
      const opponentPlay = playFor('team_one_player_two', [standardCard('star', 'K')]);
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [specialCard('dragon'), standardCard('jade', '3')],
        team_one_player_two: [standardCard('jade', '9')],
      };
      const result = advanceOfflineBotTurn(
        makeDeal({
          currentSeat: 'team_two_player_one',
          currentWinningSeat: 'team_one_player_two',
          hands,
          plays: [opponentPlay],
        })
      );

      expect(result.botDiagnostics.decision === 'play', 'Expected bot to challenge the nearly-out opponent.');
      expect(cardIds(result.botDiagnostics.decisionCards).join(',') === 'dragon', 'Expected bot to spend Dragon to stop the opponent.');
      expect(result.botDiagnostics.reason.includes('nearly out'), 'Expected near-out opponent reason.');
    },
  },
  {
    name: 'leads low loose single before stranding singles with a full house',
    run() {
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [
          standardCard('jade', 'K'),
          standardCard('sword', 'K'),
          standardCard('pagoda', 'K'),
          standardCard('jade', '10'),
          standardCard('sword', '10'),
          standardCard('jade', '4'),
          standardCard('sword', '6'),
        ],
      };
      const result = advanceOfflineBotTurn(makeDeal({ currentSeat: 'team_two_player_one', hands }));

      expect(result.botDiagnostics.decision === 'play', 'Expected bot to lead.');
      expect(cardIds(result.botDiagnostics.decisionCards).join(',') === 'jade-4', 'Expected bot to clear the lowest loose single first.');
      expect(result.botDiagnostics.reason.includes('weak single'), 'Expected weak-single cleanup reason.');
    },
  },
  {
    name: 'leads lowest loose single before spending premium pairs and triples',
    run() {
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [
          standardCard('jade', 'A'),
          standardCard('sword', 'A'),
          standardCard('jade', 'Q'),
          standardCard('sword', 'Q'),
          standardCard('pagoda', 'Q'),
          standardCard('jade', '3'),
          standardCard('sword', '7'),
        ],
      };
      const result = advanceOfflineBotTurn(makeDeal({ currentSeat: 'team_two_player_one', hands }));

      expect(result.botDiagnostics.decision === 'play', 'Expected bot to lead.');
      expect(cardIds(result.botDiagnostics.decisionCards).join(',') === 'jade-3', 'Expected bot to lead the lowest loose single first.');
      expect(result.botDiagnostics.reason.includes('weak single'), 'Expected weak-single cleanup reason.');
    },
  },
  {
    name: 'leads the weak pair of threes ahead of a loose six',
    run() {
      const seat = 'team_two_player_two';
      const hands = {
        ...emptySeatCards(),
        [seat]: [
          standardCard('jade', '5'), standardCard('jade', '7'), standardCard('sword', '5'),
          standardCard('sword', 'K'), standardCard('pagoda', '3'), standardCard('pagoda', '5'),
          standardCard('pagoda', '6'), standardCard('star', '3'), standardCard('star', '8'),
          standardCard('star', 'Q'), standardCard('star', 'K'),
        ],
      };
      const deal = makeDeal({ currentSeat: seat, hands, trickNumber: 4 });
      const { decision } = chooseFairOfflineBot(observeOfflineBot(deal, seat));
      expect(decision.combo?.type === 'pair' && decision.combo.rank === 3, 'Expected the pair of threes first.');
    },
  },
  {
    name: 'leads a loose two while keeping tens and jacks together',
    run() {
      const seat = 'team_one_player_two';
      const hands = {
        ...emptySeatCards(),
        [seat]: [
          standardCard('sword', '2'), standardCard('sword', '5'), standardCard('sword', '10'),
          standardCard('pagoda', '5'), standardCard('pagoda', '10'), standardCard('jade', 'J'),
          standardCard('pagoda', 'J'), standardCard('star', 'K'),
        ],
      };
      const deal = makeDeal({ currentSeat: seat, hands, trickNumber: 9 });
      const { decision } = chooseFairOfflineBot(observeOfflineBot(deal, seat));
      expect(cardIds(decision.cards ?? []).join(',') === 'sword-2', 'Expected to clear the two and keep the steps.');
    },
  },
  {
    name: 'leads pair first when it leaves a clean straight finish',
    run() {
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [
          standardCard('jade', '3'),
          standardCard('sword', '3'),
          standardCard('jade', '5'),
          standardCard('sword', '6'),
          standardCard('pagoda', '7'),
          standardCard('star', '8'),
          standardCard('jade', '9'),
        ],
      };
      const result = advanceOfflineBotTurn(makeDeal({ currentSeat: 'team_two_player_one', hands }));

      expect(result.botDiagnostics.decision === 'play', 'Expected bot to lead.');
      expect(cardIds(result.botDiagnostics.decisionCards).join(',') === 'jade-3,sword-3', 'Expected bot to lead the pair and leave the straight.');
      expect(result.botDiagnostics.reason.includes('two-play exit'), 'Expected two-play exit reason.');
    },
  },
  {
    name: 'leads single first when it leaves a clean full house finish',
    run() {
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [
          standardCard('jade', '4'),
          standardCard('jade', 'Q'),
          standardCard('sword', 'Q'),
          standardCard('pagoda', 'Q'),
          standardCard('jade', 'K'),
          standardCard('sword', 'K'),
        ],
      };
      const result = advanceOfflineBotTurn(makeDeal({ currentSeat: 'team_two_player_one', hands }));

      expect(result.botDiagnostics.decision === 'play', 'Expected bot to lead.');
      expect(cardIds(result.botDiagnostics.decisionCards).join(',') === 'jade-4', 'Expected bot to lead the single and leave the full house.');
      expect(result.botDiagnostics.reason.includes('two-play exit'), 'Expected two-play exit reason.');
    },
  },
  {
    name: 'simulates a play without mutating source deal',
    run() {
      const opponentPlay = playFor('team_one_player_two', [standardCard('star', '7')]);
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [standardCard('jade', '9'), standardCard('sword', '10')],
        team_one_player_two: [standardCard('jade', '5')],
      };
      const deal = makeDeal({
        currentSeat: 'team_two_player_one',
        currentWinningSeat: 'team_one_player_two',
        hands,
        plays: [opponentPlay],
      });
      const move = generateOfflineLegalMoves(hands.team_two_player_one, opponentPlay.combo).find((candidate) =>
        cardIds(candidate.cards).includes('jade-9')
      );
      const simulated = simulateOfflineMove(deal, 'team_two_player_one', move);

      expect(deal.hands.team_two_player_one.length === 2, 'Expected source hand to remain unchanged.');
      expect(deal.plays.length === 1, 'Expected source plays to remain unchanged.');
      expect(deal.turnState.currentWinningSeat === 'team_one_player_two', 'Expected source winner to remain unchanged.');
      expect(simulated.hands.team_two_player_one.length === 1, 'Expected simulated hand to remove played card.');
      expect(simulated.plays.length === 2, 'Expected simulated deal to add a play.');
      expect(simulated.turnState.currentWinningSeat === 'team_two_player_one', 'Expected simulated winner to update.');
    },
  },
  {
    name: 'simulates a pass without mutating source deal',
    run() {
      const opponentPlay = playFor('team_one_player_two', [standardCard('star', 'A')]);
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [specialCard('phoenix'), standardCard('jade', '3')],
        team_one_player_two: [standardCard('jade', '5')],
      };
      const deal = makeDeal({
        currentSeat: 'team_two_player_one',
        currentWinningSeat: 'team_one_player_two',
        hands,
        plays: [opponentPlay],
      });
      const simulated = simulateOfflineMove(deal, 'team_two_player_one', { action: 'pass' });

      expect(deal.plays.length === 1, 'Expected source pass simulation not to mutate plays.');
      expect(deal.turnState.trickNumber === 1, 'Expected source trick number to remain unchanged.');
      expect(simulated.plays.length === 2, 'Expected simulated pass to append a pass play.');
      expect(simulated.plays[1].action === 'pass', 'Expected simulated second play to be a pass.');
      expect(simulated.turnState.trickNumber === 2, 'Expected simulated pass to close the trick in this two-active-player setup.');
    },
  },
  {
    name: 'replays the reported pair-of-fives decision against a single 3',
    run() {
      const [human, left, partner, right] = seats;
      const replayHand = (ids) => ids.split(' ').map((id) => {
        const [suit, rank] = id.split('-');
        return suits.includes(suit) ? standardCard(suit, rank) : specialCard(id);
      });

      // Rebuild the post-exchange hands and replay the two opening plays from the report.
      const hands = {
        [human]: replayHand('mah-jong jade-3 jade-4 jade-8 jade-J sword-2 sword-3 sword-K pagoda-3 pagoda-9 pagoda-K pagoda-A star-4 star-J'),
        [left]: replayHand('jade-6 jade-7 jade-10 jade-Q jade-A sword-4 sword-9 sword-A pagoda-7 pagoda-J pagoda-Q star-3 star-6 star-9'),
        [partner]: replayHand('jade-2 jade-5 jade-9 sword-5 sword-10 sword-Q pagoda-2 pagoda-6 pagoda-10 star-2 star-7 star-8 star-10 star-K'),
        [right]: replayHand('dog phoenix dragon jade-K sword-6 sword-7 sword-8 sword-J pagoda-4 pagoda-5 pagoda-8 star-5 star-Q star-A'),
      };
      const start = makeDeal({ currentSeat: human, hands });
      const afterLead = submitOfflinePlay(start, human, [hands[human][0]], '2');
      const beforeChoice = submitOfflinePlay(afterLead, left, [standardCard('star', '3')]);
      expect(beforeChoice.turnState.currentSeat === partner, 'Expected the reported decision to belong to Bot Partner.');

      const handShapes = (deal) => {
        const leads = generateOfflineLegalMoves(deal.hands[partner], null);
        return {
          hasPair: leads.some(({ combo }) => combo.type === 'pair' && combo.rank === 5),
          hasStraight: leads.some(({ combo }) => combo.type === 'straight' && combo.count === 6 && combo.rank === 10),
        };
      };
      const current = advanceOfflineBotTurn(beforeChoice);
      expect(current.plays.length === 3 && current.plays[2].seat === partner, 'Expected the current bot to make a legal response.');
      const preserved = handShapes(current);
      expect(preserved.hasPair && preserved.hasStraight, 'Expected the bot to preserve both the pair of fives and the 5-10 straight.');
      const { decisionLabel, candidates } = current.botDiagnostics;
      console.log(`  Recorded: jade-5 (94); current: ${decisionLabel}`);
      console.log(`  Current candidates: ${candidates.map(({ label, score }) => `${label} (${score})`).join(', ')}`);

      const responses = generateOfflineLegalMoves(beforeChoice.hands[partner], beforeChoice.plays[1].combo, '2');
      const alternatives = [
        { cardId: 'jade-5', pair: false, straight: true },
        { cardId: 'pagoda-6', pair: true, straight: false },
        { cardId: null, pair: true, straight: true },
      ];

      for (const { cardId, pair, straight } of alternatives) {
        const label = cardId ?? 'pass';
        const move = cardId
          ? responses.find(({ cards }) => cards.length === 1 && cards[0].id === cardId)
          : { action: 'pass' };
        expect(move, `Expected ${label} to be a legal response.`);
        const result = simulateOfflineMove(beforeChoice, partner, move);
        expect(result.plays.length === 3 && result.plays[2].action === move.action, `Expected ${label} to advance the replay.`);
        expect(result.turnState.currentWinningSeat === (cardId ? partner : left), `Unexpected trick leader after ${label}.`);
        expect(result.turnState.wishRank === '2', `Expected the wish to remain active after ${label}.`);

        const { hasPair, hasStraight } = handShapes(result);
        expect(hasPair === pair, `Unexpected pair of fives availability after ${label}.`);
        expect(hasStraight === straight, `Unexpected 5-10 straight availability after ${label}.`);
        console.log(`  ${label}: pair of 5s ${hasPair ? 'kept' : 'lost'}, 5-10 straight ${hasStraight ? 'kept' : 'lost'}`);
      }

      if (process.argv.includes('--compare-report')) {
        const king = responses.find(move => move.cards.length === 1 && move.cards[0].id === 'star-K');
        expect(king, 'Expected the King to be legal in the report.');
        const sample = createOfflineSampler(observeOfflineBot(beforeChoice, partner));
        const random = seededRandom(4242);
        const totals = { king: 0, pass: 0 };
        const differences = [];
        for (let index = 0; index < 128; index += 1) {
          const deal = sample(random);
          expect(deal, 'Expected a sample consistent with the public wish and plays.');
          const margin = (move) => {
            const end = rollOutOfflineHand(applyOfflineMove(deal, partner, move));
            expect(end?.scoreSummary, 'Expected the sampled hand to finish.');
            return end.scoreSummary.teamOneScore - end.scoreSummary.teamTwoScore;
          };
          const kingPoints = margin(king);
          const passPoints = margin({ action: 'pass' });
          totals.king += kingPoints;
          totals.pass += passPoints;
          differences.push(kingPoints - passPoints);
        }
        const mean = (totals.king - totals.pass) / differences.length;
        const halfWidth = 1.96 * Math.sqrt(differences.reduce((sum, points) => sum + (points - mean) ** 2, 0)
          / ((differences.length - 1) * differences.length));
        console.log(`  Same 128 sampled hands, estimated team margin: King ${(totals.king / 128).toFixed(1)}, pass ${(totals.pass / 128).toFixed(1)}.`);
        console.log(`  King minus pass: ${mean.toFixed(1)} points (95% CI ${(mean - halfWidth).toFixed(1)} to ${(mean + halfWidth).toFixed(1)}).`);
      }
    },
  },
  {
    name: 'preserves a triple on a routine reply but can split it under one-card pressure',
    run() {
      const [, bot, opponent] = seats;
      const opponentPlay = playFor(opponent, [standardCard('star', '3')]);
      const hands = {
        ...emptySeatCards(),
        [bot]: [standardCard('jade', '4'), standardCard('sword', '4'), standardCard('pagoda', '4'), standardCard('jade', '6')],
        [opponent]: [standardCard('star', '7'), standardCard('star', '8')],
      };
      const setup = { currentSeat: bot, currentWinningSeat: opponent, plays: [opponentPlay] };
      const routine = advanceOfflineBotTurn(makeDeal({ ...setup, hands }));
      const urgent = advanceOfflineBotTurn(makeDeal({
        ...setup,
        hands: { ...hands, [opponent]: hands[opponent].slice(0, 1) },
      }));

      expect(cardIds(routine.botDiagnostics.decisionCards).join(',') === 'jade-6', 'Expected a loose 6 over splitting the triple on a routine reply.');
      expect(urgent.botDiagnostics.decisionCards[0]?.rank === '4', 'Expected the split penalty to be waived against a one-card opponent.');
    },
  },
  {
    name: 'allows Mah Jong as the low card in a straight',
    run() {
      const cards = [
        specialCard('mah-jong'),
        standardCard('jade', '2'),
        standardCard('sword', '3'),
        standardCard('pagoda', '4'),
        standardCard('star', '5'),
      ];
      const result = validatePlay(cards, null);

      expect(result.valid, 'Expected Mah Jong, 2, 3, 4, 5 to validate as a straight.');
      expect(result.valid && result.type === 'straight', 'Expected Mah Jong low run to be a straight.');
      expect(result.valid && result.rank === 5, 'Expected Mah Jong low straight to rank as 5-high.');
    },
  },
  {
    name: 'Mah Jong straight can set a requested rank wish',
    run() {
      const cards = [
        specialCard('mah-jong'),
        standardCard('jade', '2'),
        standardCard('sword', '3'),
        standardCard('pagoda', '4'),
        standardCard('star', '5'),
      ];
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: cards,
        team_one_player_two: [standardCard('jade', '8')],
      };
      const deal = makeDeal({ currentSeat: 'team_two_player_one', hands });
      const result = submitOfflinePlay(deal, 'team_two_player_one', cards, '8');

      expect(result.turnState.wishRank === '8', 'Expected Mah Jong play to set an 8 wish.');
      expect(result.plays[0].wishRank === '8', 'Expected public play record to show requested rank.');
      expect(result.turnState.currentWinningSeat === 'team_two_player_one', 'Expected Mah Jong straight to lead the trick.');
    },
  },
  {
    name: 'Mah Jong and Phoenix can complete a low straight with a wish',
    run() {
      const cards = [
        specialCard('mah-jong'),
        standardCard('jade', '2'),
        standardCard('sword', '3'),
        standardCard('pagoda', '4'),
        specialCard('phoenix'),
      ];
      const combo = validatePlay(cards, null);
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: cards,
        team_one_player_two: [standardCard('jade', '8')],
      };
      const deal = makeDeal({ currentSeat: 'team_two_player_one', hands });
      const result = submitOfflinePlay(deal, 'team_two_player_one', cards, '8');

      expect(combo.valid, 'Expected Mah Jong, 2, 3, 4, Phoenix to validate as a straight.');
      expect(combo.valid && combo.type === 'straight', 'Expected Mah Jong/Phoenix low run to be a straight.');
      expect(combo.valid && combo.rank === 5, 'Expected Phoenix to fill the 5 in a Mah Jong low straight.');
      expect(result.turnState.wishRank === '8', 'Expected Mah Jong/Phoenix straight to keep the selected wish.');
    },
  },
  {
    name: 'Mah Jong wish forces a satisfiable rank play',
    run() {
      const leadCards = [
        specialCard('mah-jong'),
        standardCard('jade', '2'),
        standardCard('sword', '3'),
        standardCard('pagoda', '4'),
        standardCard('star', '5'),
      ];
      const leadPlay = playFor('team_two_player_one', leadCards);
      const forcedCards = [
        standardCard('jade', '4'),
        standardCard('sword', '5'),
        standardCard('pagoda', '6'),
        standardCard('star', '7'),
        standardCard('jade', '8'),
      ];
      const hands = {
        ...emptySeatCards(),
        team_one_player_two: forcedCards,
        team_two_player_one: [standardCard('jade', '9')],
      };
      const deal = makeDeal({
        currentSeat: 'team_one_player_two',
        currentWinningSeat: 'team_two_player_one',
        hands,
        plays: [leadPlay],
        wishRank: '8',
      });
      const passResult = simulateOfflineMove(deal, 'team_one_player_two', { action: 'pass' });
      const playResult = submitOfflinePlay(deal, 'team_one_player_two', forcedCards);

      expect(passResult.plays.length === 1, 'Expected pass to be blocked while wish can be satisfied.');
      expect(playResult.turnState.wishRank === null, 'Expected wished rank play to clear the wish.');
      expect(playResult.turnState.currentWinningSeat === 'team_one_player_two', 'Expected wished straight to become the winning play.');
    },
  },
  {
    name: 'Mah Jong wish does not force an impossible response',
    run() {
      const leadCards = [
        specialCard('mah-jong'),
        standardCard('jade', '2'),
        standardCard('sword', '3'),
        standardCard('pagoda', '4'),
        standardCard('star', '5'),
      ];
      const leadPlay = playFor('team_two_player_one', leadCards);
      const hands = {
        ...emptySeatCards(),
        team_one_player_two: [standardCard('jade', '8'), standardCard('sword', 'K')],
        team_two_player_one: [standardCard('jade', '9')],
      };
      const deal = makeDeal({
        currentSeat: 'team_one_player_two',
        currentWinningSeat: 'team_two_player_one',
        hands,
        plays: [leadPlay],
        wishRank: '8',
      });
      const result = simulateOfflineMove(deal, 'team_one_player_two', { action: 'pass' });

      expect(result.plays.length === 2, 'Expected pass to be allowed when no legal response can include the wished rank.');
      expect(result.plays[1].action === 'pass', 'Expected simulated response to be a pass.');
      expect(result.turnState.wishRank === '8', 'Expected unsatisfied wish to remain active.');
    },
  },
  {
    name: 'bot chooses a Mah Jong wish rank its partner holds',
    run() {
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [specialCard('mah-jong'), standardCard('jade', '3')],
        team_two_player_two: [standardCard('jade', '8'), standardCard('sword', '8')],
        team_one_player_one: [standardCard('pagoda', 'A')],
        team_one_player_two: [standardCard('star', 'K')],
      };
      const result = advanceOfflineBotTurn(makeDeal({ currentSeat: 'team_two_player_one', hands }));

      expect(result.botDiagnostics.decision === 'play', 'Expected bot to lead with Mah Jong.');
      expect(cardIds(result.botDiagnostics.decisionCards).join(',') === 'mah-jong', 'Expected bot to play Mah Jong as the lead.');
      expect(result.plays[0].wishRank === '8', 'Expected bot to wish for partner-held 8s.');
      expect(result.turnState.wishRank === '8', 'Expected active wish to be 8.');
      expect(result.botDiagnostics.decisionLabel.includes('wish 8'), 'Expected diagnostics to show the wished rank.');
    },
  },
  {
    name: 'bot opens with Mah Jong instead of dumping a big full house',
    run() {
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [
          specialCard('mah-jong'),
          standardCard('jade', 'Q'),
          standardCard('sword', 'Q'),
          standardCard('pagoda', 'Q'),
          standardCard('jade', 'K'),
          standardCard('sword', 'K'),
        ],
        team_two_player_two: [standardCard('jade', '8')],
        team_one_player_one: [standardCard('pagoda', 'A')],
        team_one_player_two: [standardCard('star', '9')],
      };
      const result = advanceOfflineBotTurn(makeDeal({ currentSeat: 'team_two_player_one', hands }));

      expect(result.botDiagnostics.decision === 'play', 'Expected bot to open with a play.');
      expect(cardIds(result.botDiagnostics.decisionCards).join(',') === 'mah-jong', 'Expected bot to play Mah Jong before the full house.');
      expect(result.botDiagnostics.reason.includes('Mah Jong should open'), 'Expected opening Mah Jong reason.');
    },
  },
  {
    name: 'bot satisfies a wish with the least damaging legal move',
    run() {
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [standardCard('jade', '8'), standardCard('sword', '8'), specialCard('phoenix'), standardCard('jade', 'K')],
        team_two_player_two: [standardCard('jade', '5')],
      };
      const result = advanceOfflineBotTurn(
        makeDeal({
          currentSeat: 'team_two_player_one',
          hands,
          wishRank: '8',
        })
      );

      expect(result.botDiagnostics.decision === 'play', 'Expected bot to satisfy the active wish.');
      expect(result.botDiagnostics.decisionLabel.includes('Single 8'), 'Expected bot to use a single 8.');
      expect(cardIds(result.botDiagnostics.decisionCards).length === 1, 'Expected bot not to spend extra cards satisfying the wish.');
      expect(result.turnState.wishRank === null, 'Expected satisfied wish to clear.');
    },
  },
  {
    name: 'bot plays a wished-rank bomb instead of freezing on pass',
    run() {
      const opponentPlay = playFor('team_one_player_two', [standardCard('star', 'A')]);
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [
          standardCard('jade', '2'),
          standardCard('sword', '2'),
          standardCard('pagoda', '2'),
          standardCard('star', '2'),
          standardCard('jade', 'K'),
        ],
        team_one_player_two: [standardCard('jade', '9')],
      };
      const result = advanceOfflineBotTurn(
        makeDeal({
          currentSeat: 'team_two_player_one',
          currentWinningSeat: 'team_one_player_two',
          hands,
          plays: [opponentPlay],
          wishRank: '2',
        })
      );

      expect(result.botDiagnostics.decision === 'play', 'Expected bot to play instead of pass.');
      expect(result.botDiagnostics.decisionLabel.includes('Bomb'), 'Expected wished 2s bomb to be played.');
      expect(cardIds(result.botDiagnostics.decisionCards).join(',') === 'jade-2,pagoda-2,star-2,sword-2', 'Expected all four 2s to be played.');
      expect(result.turnState.currentSeat !== 'team_two_player_one', 'Expected bot turn to advance after satisfying the wish.');
      expect(result.turnState.wishRank === null, 'Expected wished-rank bomb to clear the wish.');
    },
  },
  {
    name: 'bot satisfies a wish even when partner is winning',
    run() {
      const partnerPlay = playFor('team_two_player_two', [standardCard('star', '7')]);
      const hands = {
        ...emptySeatCards(),
        team_two_player_one: [standardCard('jade', '8'), standardCard('sword', 'K')],
        team_two_player_two: [standardCard('jade', '5')],
      };
      const result = advanceOfflineBotTurn(
        makeDeal({
          currentSeat: 'team_two_player_one',
          currentWinningSeat: 'team_two_player_two',
          hands,
          plays: [partnerPlay],
          wishRank: '8',
        })
      );

      expect(result.botDiagnostics.decision === 'play', 'Expected wish to override partner-protection pass.');
      expect(result.botDiagnostics.decisionLabel.includes('Single 8'), 'Expected bot to satisfy the wished 8.');
      expect(result.turnState.wishRank === null, 'Expected wished rank to clear.');
    },
  },
];

let failedCount = 0;

scenarios.forEach((scenario) => {
  try {
    scenario.run();
    console.log(`PASS ${scenario.name}`);
  } catch (error) {
    failedCount += 1;
    console.error(`FAIL ${scenario.name}`);
    console.error(error.message);
  }
});

if (failedCount > 0) {
  console.error(`${failedCount}/${scenarios.length} offline bot scenarios failed.`);
  process.exitCode = 1;
} else {
  console.log(`${scenarios.length} offline bot scenarios passed.`);
  console.log('Latest candidate labels stay readable:');
  console.log(`  ${visibleCardList([standardCard('jade', '3'), specialCard('dragon')])}`);
}
