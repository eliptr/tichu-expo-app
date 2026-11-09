const fs = require('node:fs');
const path = require('node:path');
const { runPairedSelfPlay } = require('./run-offline-self-play');
const { chooseFairOfflineBot, createOfflineDeck, offlineSeats } = require('../src/features/offline/offline-game');
const { validatePlay } = require('../src/features/game/combination');

const penalties = [0, 40, 80, 120];
const screening = { startSeed: 20001, pairs: 400 };
const confirmation = { startSeed: 30001, pairs: 1000 };

function phoenixReportView() {
  const [human, left, partner, right] = offlineSeats;
  const deck = new Map(createOfflineDeck().map(card => [card.id, card]));
  const cards = (...ids) => ids.map(id => deck.get(id));
  const trick = [
    [partner, cards('sword-5', 'pagoda-5')],
    [right, cards('jade-9', 'pagoda-9')],
    [human, []],
    [left, []],
    [partner, cards('sword-10', 'star-10')],
  ];
  const plays = trick.map(([seat, played], index) => ({
    action: played.length ? 'play' : 'pass',
    cards: played,
    combo: played.length ? validatePlay(played, null) : null,
    id: `report-${index}`,
    seat,
    trickNumber: 4,
  }));

  // These are the acting seat's cards and public facts from the report.
  return {
    seat: right,
    hand: cards('phoenix', 'jade-5', 'jade-10', 'sword-8', 'sword-Q', 'pagoda-3', 'star-6'),
    handCounts: { [human]: 13, [left]: 12, [partner]: 4, [right]: 7 },
    knownOutgoing: [],
    finishOrder: [],
    plays,
    turnState: { currentSeat: right, currentWinningSeat: partner, passCount: 0, trickNumber: 4, wishRank: null },
    wonCards: { [human]: [], [left]: [], [partner]: [], [right]: [] },
    wonTricks: { [human]: 0, [left]: 0, [partner]: 0, [right]: 0 },
  };
}

function fairBot(penalty) {
  return {
    version: penalty === 0 ? 'fair-v2' : `fair-v2-phoenix-${penalty}`,
    choose: view => chooseFairOfflineBot(view, undefined, { phoenixLooseSinglesPenalty: penalty }),
  };
}

function compare(penalty, seeds) {
  const baseline = fairBot(0);
  const challenger = fairBot(penalty);
  const { summary } = runPairedSelfPlay({
    ...seeds,
    lineup: [challenger, baseline, challenger, baseline],
  });
  const { wins, ties, failures, teamOnePointGainPerHand, confidence95 } = summary;
  return {
    penalty,
    startSeed: seeds.startSeed,
    endSeed: seeds.startSeed + seeds.pairs - 1,
    pairs: seeds.pairs,
    wins: { challenger: wins[0], baseline: wins[1] },
    ties,
    failures,
    pointGainPerHand: teamOnePointGainPerHand,
    confidence95,
  };
}

function finishedLegally(result) {
  return result.failures.illegal === 0 && result.failures.stuck === 0 &&
    result.wins.challenger + result.wins.baseline + result.ties === result.pairs * 2;
}

function main() {
  const view = phoenixReportView();
  const replay = penalties.map(penalty => {
    const { decision, diagnostics } = fairBot(penalty).choose(view);
    return {
      penalty,
      action: decision.action,
      label: diagnostics.decisionLabel,
      phoenixPlayScore: diagnostics.candidates.find(candidate => candidate.cards.some(card => card.id === 'phoenix'))?.score,
    };
  });
  const comparisons = penalties.slice(1).map(penalty => {
    const result = compare(penalty, screening);
    console.log(`Screened Phoenix penalty ${penalty}: ${result.pointGainPerHand ?? 'unavailable'} points per hand.`);
    return result;
  });
  const selected = comparisons.filter(result => finishedLegally(result) && result.pointGainPerHand > 0)
    .sort((a, b) => b.pointGainPerHand - a.pointGainPerHand || a.penalty - b.penalty)[0];
  const heldOut = selected ? compare(selected.penalty, confirmation) : null;
  const candidate = heldOut && finishedLegally(heldOut) && heldOut.confidence95?.[0] > 0
    ? { phoenixLooseSinglesPenalty: heldOut.penalty }
    : null;
  const report = {
    baseline: 'fair-v2',
    testedPenalties: penalties,
    replay,
    screening: comparisons,
    selectedForConfirmation: selected?.penalty ?? null,
    confirmation: heldOut,
    candidate,
    outcome: candidate ? 'candidate-for-app-test' : 'retain-baseline',
  };
  const directory = path.join(__dirname, '..', 'experiment-results');
  const filename = path.join(directory, 'phoenix.json');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Saved ${report.outcome} to ${filename}`);
}

if (require.main === module) main();
module.exports = { phoenixReportView };
