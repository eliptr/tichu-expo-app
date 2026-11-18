const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runPairedSelfPlay } = require('./run-offline-self-play');
const g = require('../src/features/offline/offline-game');
const { chooseReserveBot, moveKey, options, reserveRisk } = require('./control-reserve-policy');

const styles = [{ name: 'standard', threshold: 1 }, { name: 'aggressive', threshold: -30 },
  { name: 'conservative', threshold: 40 }];
const plans = ['single-reserve', 'adaptive-reserve', 'adaptive-penalty'];
const output = path.join(__dirname, '..', 'experiment-results', 'fresh-control-reserves.json');
const screeningPairs = Number(process.env.CONTROL_SCREEN_PAIRS ?? 400);
const holdoutPairs = Number(process.env.CONTROL_HOLDOUT_PAIRS ?? 1000);
assert(Number.isInteger(screeningPairs) && screeningPairs > 1 && screeningPairs <= 1000);
assert(Number.isInteger(holdoutPairs) && holdoutPairs > 1);
const report = {
  method: 'Paired full deals; candidate team and opponent team swap seats on each seed. Compare to baseline on identical seeds and styles.',
  settings: { ...options, endgameSearch: false },
  information: 'All choices use observeOfflineBot and the fair heuristic. No actual hidden cards are policy inputs.',
  weakGroupDefinition: 'Disjoint minimum-play cover of cards below Q (plus Dog/Mah Jong); singles below Q and non-bomb combinations below J count as weak. Dog does not count as weak. This is a rank proxy, not calibrated win probability.',
  adaptiveRule: 'Preserve min(3, weak groups minus one, current reserve count); Q/K/A rank groups, Phoenix and Dragon count as reserves. Immediate finishes, wishes and one-card pressure bypass protection.',
  softPenalty: 120,
  screening: [], holdout: [], completed: false,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
function save() { fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); }
function interval(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const half = 1.96 * Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length * (values.length - 1)));
  return { mean, confidence95: [mean - half, mean + half] };
}
function measure(plan, style, startSeed, pairs, baseOptions = options) {
  const changes = { decisions: 0, changed: 0, changedToPass: 0, changedLeads: 0, preservedMultiple: 0 };
  const examples = [];
  const bot = { version: plan, choose(view) {
    const result = chooseReserveBot(view, plan, baseOptions);
    if (plan !== 'current') {
      changes.decisions++;
      const baseline = chooseReserveBot(view, 'current', baseOptions);
      if (moveKey(result.decision) !== moveKey(baseline.decision)) {
        changes.changed++;
        if (result.decision.action === 'pass') changes.changedToPass++;
        if (!view.turnState.currentWinningSeat) changes.changedLeads++;
        const risk = reserveRisk(view, baseline.decision, true);
        if (risk.needed > 1 && risk.shortfall > 0) changes.preservedMultiple++;
        if (examples.length < 12) examples.push({ hand: g.visibleCardList(view.hand),
          counts: view.handCounts, baseline: moveKey(baseline.decision), candidate: moveKey(result.decision), risk });
      }
    }
    return result;
  } };
  const opponent = { version: style.name, choose(view) {
    return g.chooseFairOfflineBot(view, undefined, {
      ...g.liveOfflineSettingsForView(view, baseOptions), opponentReplyThreshold: style.threshold,
    });
  } };
  const { summary, hands } = runPairedSelfPlay({ pairs, startSeed, lineup: [bot, opponent, bot, opponent] });
  const pairMargins = [];
  const finishOutcomes = { firsts: 0, lasts: 0 };
  for (const hand of hands) {
    if (!hand.finishOrder) continue;
    const candidateTeam = hand.swapped ? 'team_two' : 'team_one';
    if (g.teamForSeat(hand.finishOrder[0]) === candidateTeam) finishOutcomes.firsts++;
    if (g.teamForSeat(hand.finishOrder[3]) === candidateTeam) finishOutcomes.lasts++;
  }
  // The shared runner already validates every turn and records finish scores.
  for (let i = 0; i < hands.length; i += 2) {
    const a = hands[i].scores, b = hands[i + 1].scores;
    if (a && b) pairMargins.push((a[0] - a[1] + b[1] - b[0]) / 2);
  }
  const result = { plan, style: style.name, startSeed, pairs,
    teamScores: summary.teamScores, averageScores: summary.teamScores.map(score => score / (2 * pairs)),
    wins: summary.wins, ties: summary.ties, oneTwos: summary.oneTwo, failures: summary.failures,
    margin: summary.teamOnePointGainPerHand, confidence95: summary.confidence95,
    timings: summary.decisionTimeMs, finishOutcomes, changes, examples,
    failedHands: hands.filter(hand => hand.failure).map(({ seed, swapped, failure }) => ({ seed, swapped, failure })),
    pairMargins,
  };
  console.log(JSON.stringify({ plan, style: style.name, startSeed, pairs, margin: result.margin,
    confidence95: result.confidence95, changes, failures: result.failures }));
  return result;
}
function phase(startSeed, pairs, candidates, results) {
  for (const style of styles) {
    const baseline = measure('current', style, startSeed, pairs);
    results.push(baseline);
    save();
    for (const plan of candidates) {
      const result = measure(plan, style, startSeed, pairs);
      assert.equal(result.pairMargins.length, baseline.pairMargins.length);
      const gains = result.pairMargins.map((value, i) => value - baseline.pairMargins[i]);
      result.gainVsBaseline = interval(gains);
      result.pairedGains = gains;
      results.push(result);
      save();
      console.log(JSON.stringify({ plan, style: style.name, gainVsBaseline: result.gainVsBaseline }));
    }
    save();
  }
  return results;
}
function aggregate(results, plan) {
  const runs = results.filter(result => result.plan === plan);
  // Styles on one seed are correlated: average by seed before computing the CI.
  const gains = runs[0].pairedGains.map((_, i) => runs.reduce((sum, run) => sum + run.pairedGains[i], 0) / runs.length);
  return { plan, ...interval(gains), styleGains: Object.fromEntries(runs.map(run => [run.style, run.gainVsBaseline])),
    legal: runs.every(run => !run.failures.illegal && !run.failures.stuck) };
}
save();
phase(260001, screeningPairs, plans, report.screening);
report.screeningSummary = plans.map(plan => aggregate(report.screening, plan));
report.selected = [...report.screeningSummary].filter(run => run.legal).sort((a, b) => b.mean - a.mean)[0].plan;
save();
// Always check the best reserve policy on untouched seeds, even if screening is negative.
phase(270001, holdoutPairs, [report.selected], report.holdout);
report.holdoutSummary = aggregate(report.holdout, report.selected);
report.recommended = report.holdoutSummary.legal && report.holdoutSummary.confidence95[0] > 0 &&
  Object.values(report.holdoutSummary.styleGains).every(run => run.mean >= 0);
report.completed = true;
save();
console.log(JSON.stringify({ selected: report.selected, holdout: report.holdoutSummary, recommended: report.recommended }));
if ([...report.screening, ...report.holdout].some(run => run.failures.illegal || run.failures.stuck)) process.exitCode = 1;
