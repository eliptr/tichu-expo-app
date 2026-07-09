const fs = require('fs');
const Module = require('module');
const path = require('path');
const babel = require('@babel/core');

const projectRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(projectRoot, 'src');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    return originalResolveFilename.call(this, path.join(srcRoot, request.slice(2)), parent, isMain, options);
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions['.ts'] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const result = babel.transformSync(source, {
    filename,
    plugins: ['@babel/plugin-transform-typescript', '@babel/plugin-transform-modules-commonjs'],
    sourceMaps: 'inline',
  });

  module._compile(result.code, filename);
};

const {
  advanceOfflineBotTurn,
  generateOfflineLegalMoves,
  simulateOfflineMove,
  submitOfflinePlay,
  visibleCardList,
} = require('../src/features/offline/offline-game');
const { validatePlay } = require('../src/features/game/combination');

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
