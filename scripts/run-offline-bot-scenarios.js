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

const { advanceOfflineBotTurn, visibleCardList } = require('../src/features/offline/offline-game');
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

function makeDeal({ currentSeat, currentWinningSeat = null, finishOrder = [], hands, plays = [], trickNumber = 1 }) {
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
