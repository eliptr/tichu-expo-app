const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { runPairedSelfPlay, seededRandom } = require('./run-offline-self-play');
const {
  applyOfflineMove,
  applyOfflinePassing,
  chooseFairOfflineBot,
  createOfflineDeal,
  legalOfflineBotActions,
  observeOfflineBot,
  teamForSeat,
  visibleCardList,
} = require('../src/features/offline/offline-game');
const { rollOutOfflineHand } = require('../src/features/offline/offline-search');

const baseline = { version: 'fair-v2', choose: view => chooseFairOfflineBot(view) };

function candidateGrid() {
  return [40, 80, 120, 160].flatMap(penalty => [4, 7, 14].map(maxCards => ({
    settings: { phoenixLooseSinglesPenalty: penalty, phoenixLooseSinglesMaxWinnerCards: maxCards },
    changedDecisions: 0,
    totalGain: 0,
    improved: 0,
    worsened: 0,
  })));
}

function moveKey(move) {
  if (move.action === 'pass') return 'pass';
  return `${move.cards.map(card => card.id).sort().join(',')}:${move.wishRank ?? ''}`;
}

function finishBranch(deal, seat, move) {
  // The simulator keeps the deal fixed. Each rollout decision sees only its own seat's observation.
  const finished = rollOutOfflineHand(applyOfflineMove(deal, seat, move));
  if (!finished?.scoreSummary) throw new Error('An alternate move failed to reach a final score.');
  const { teamOneScore, teamTwoScore } = finished.scoreSummary;
  return teamForSeat(seat) === 'team_one' ? teamOneScore - teamTwoScore : teamTwoScore - teamOneScore;
}

function trainOnHand(seed, candidates) {
  let deal = applyOfflinePassing(createOfflineDeal(seededRandom(seed)));
  let comparedDecisions = 0;
  for (let turn = 0; deal.turnState && turn < 224; turn += 1) {
    const seat = deal.turnState.currentSeat;
    const view = observeOfflineBot(deal, seat);
    const actions = legalOfflineBotActions(view);
    const { decision } = chooseFairOfflineBot(view, actions);
    if (actions.some(move => move.action === 'pass') &&
        actions.some(move => move.action === 'play' && move.cards.some(card => card.id === 'phoenix'))) {
      const originalKey = moveKey(decision);
      const margins = new Map();
      const marginFor = (move, key) => {
        if (!margins.has(key)) margins.set(key, finishBranch(deal, seat, move));
        return margins.get(key);
      };
      for (const candidate of candidates) {
        const { decision: alternative } = chooseFairOfflineBot(view, actions, candidate.settings);
        const key = moveKey(alternative);
        if (key === originalKey) continue;
        const gain = marginFor(alternative, key) - marginFor(decision, originalKey);
        candidate.changedDecisions += 1;
        candidate.totalGain += gain;
        candidate.improved += Number(gain > 0);
        candidate.worsened += Number(gain < 0);
      }
      if (margins.size > 1) comparedDecisions += 1;
    }
    const next = applyOfflineMove(deal, seat, decision);
    if (next === deal) throw new Error(`Training deal ${seed} stalled on turn ${turn + 1}.`);
    deal = next;
  }
  if (!deal.scoreSummary) throw new Error(`Training deal ${seed} did not finish.`);
  return comparedDecisions;
}

function replayReport(reportPath, selected) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8').replace(/^\uFEFF/, ''));
  const deal = report.beforeLastBotMove;
  if (!deal?.turnState) throw new Error('The report needs a beforeLastBotMove snapshot.');
  const cards = [...Object.values(deal.hands).flat(), ...deal.plays.flatMap(play => play.cards)];
  if (cards.length !== 56 || new Set(cards.map(card => card.id)).size !== 56) {
    throw new Error('The report needs a complete deal with 56 distinct cards.');
  }
  const seat = deal.turnState.currentSeat;
  const view = observeOfflineBot(deal, seat);
  const actions = legalOfflineBotActions(view);
  const baselineMove = moveKey(chooseFairOfflineBot(view, actions).decision);
  const selectedMove = selected && moveKey(chooseFairOfflineBot(view, actions, selected.settings).decision);
  return {
    baselineMove,
    selectedMove,
    alternatives: actions.map(move => ({
      key: moveKey(move),
      move: move.action === 'pass' ? 'Pass' : visibleCardList(move.cards),
      teamMargin: finishBranch(deal, seat, move),
    })),
  };
}

function main() {
  const { values } = parseArgs({
    options: {
      'training-seed': { type: 'string', default: '40001' },
      'training-hands': { type: 'string', default: '1500' },
      'validation-seed': { type: 'string', default: '50001' },
      'validation-pairs': { type: 'string', default: '1000' },
      report: { type: 'string' },
    },
  });
  const training = { startSeed: Number(values['training-seed']), hands: Number(values['training-hands']) };
  const holdout = { startSeed: Number(values['validation-seed']), pairs: Number(values['validation-pairs']) };
  const trainingEnd = training.startSeed + training.hands;
  const validationEnd = holdout.startSeed + holdout.pairs;
  if (![training.startSeed, training.hands, holdout.startSeed, holdout.pairs].every(Number.isSafeInteger) ||
      training.startSeed < 0 || holdout.startSeed < 0 || training.hands < 1 || holdout.pairs < 2 ||
      trainingEnd > 2 ** 32 || validationEnd > 2 ** 32 ||
      (training.startSeed < validationEnd && holdout.startSeed < trainingEnd)) {
    throw new Error('Use disjoint 32-bit seed ranges, at least one training hand, and at least two validation pairs.');
  }

  const candidates = candidateGrid();
  let comparedDecisions = 0;
  for (let seed = training.startSeed; seed < trainingEnd; seed += 1) {
    comparedDecisions += trainOnHand(seed, candidates);
  }
  console.log(`Compared ${comparedDecisions} decisions from ${training.hands} fixed deals.`);
  const selected = candidates.filter(candidate => candidate.totalGain > 0 && candidate.changedDecisions >= 20)
    .sort((a, b) => b.totalGain - a.totalGain ||
      a.settings.phoenixLooseSinglesPenalty - b.settings.phoenixLooseSinglesPenalty ||
      a.settings.phoenixLooseSinglesMaxWinnerCards - b.settings.phoenixLooseSinglesMaxWinnerCards)[0] ?? null;
  const replay = values.report ? replayReport(values.report, selected) : null;

  let validation = null;
  if (selected) {
    console.log(`Validating ${JSON.stringify(selected.settings)} on ${holdout.pairs} fresh paired deals.`);
    const challenger = { version: 'trained-phoenix', choose: view => chooseFairOfflineBot(view, undefined, selected.settings) };
    validation = runPairedSelfPlay({ ...holdout, lineup: [challenger, baseline, challenger, baseline] }).summary;
  }
  const passed = validation && validation.failures.illegal === 0 && validation.failures.stuck === 0 &&
    validation.wins[0] + validation.wins[1] + validation.ties === holdout.pairs * 2 && validation.confidence95?.[0] > 0;
  const result = {
    baseline: baseline.version,
    training: { ...training, comparedDecisions },
    candidates,
    selectedForValidation: selected?.settings ?? null,
    validation,
    reportReplay: replay,
    candidate: passed ? selected.settings : null,
    outcome: passed ? 'candidate-for-app-test' : 'retain-baseline',
  };
  const directory = path.join(__dirname, '..', 'experiment-results');
  const filename = path.join(directory, 'heuristic-training.json');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Saved ${result.outcome} to ${filename}`);
  if (validation?.failures.illegal || validation?.failures.stuck) process.exitCode = 1;
}

main();
