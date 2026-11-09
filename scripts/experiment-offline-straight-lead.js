const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseArgs } = require('node:util');
const { seededRandom } = require('./run-offline-self-play');
const {
  applyOfflineMove,
  applyOfflinePassing,
  chooseLiveOfflineBot,
  createOfflineDeal,
  legalOfflineBotActions,
  observeOfflineBot,
  teamForSeat,
  visibleCardList,
} = require('../src/features/offline/offline-game');

const straightExperimentOptions = {
  finishWithDragonLead: false,
  preserveLateControl: false,
  delayDogLead: false,
};

function finishHand(deal, weight, candidateTeam) {
  for (let turn = 0; deal.status === 'playing' && turn < 224; turn += 1) {
    const seat = deal.turnState.currentSeat;
    const { decision } = chooseLiveOfflineBot(deal, seat, {
      ...straightExperimentOptions,
      strandedStraightCardPenalty: teamForSeat(seat) === candidateTeam ? weight : 0,
    });
    const next = applyOfflineMove(deal, seat, decision);
    assert.equal(next.plays.length, deal.plays.length + 1, 'Bot turn must make a legal play or pass.');
    deal = next;
  }
  assert(deal.scoreSummary, 'Hand must finish.');
  return deal.scoreSummary;
}

function summarize(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  const error = 1.96 * Math.sqrt(variance / values.length);
  return { mean, confidence95: [mean - error, mean + error] };
}

function compare(weight, firstSeed, pairs) {
  const margins = [];
  const firstOutGains = [];
  for (let seed = firstSeed; seed < firstSeed + pairs; seed += 1) {
    const deal = applyOfflinePassing(createOfflineDeal(seededRandom(seed)));
    const one = finishHand(deal, weight, 'team_one');
    const two = finishHand(deal, weight, 'team_two');
    margins.push((one.teamOneScore - one.teamTwoScore + two.teamTwoScore - two.teamOneScore) / 2);
    // A deterministic bot playing itself gets exactly one first-out seat across the two team assignments.
    const firsts = Number(teamForSeat(one.firstOutSeat) === 'team_one') +
      Number(teamForSeat(two.firstOutSeat) === 'team_two');
    firstOutGains.push((firsts - 1) * 50);
  }
  const result = {
    weight, firstSeed, pairs,
    teamMarginPerHand: summarize(margins),
    firstOutPercentagePointGain: summarize(firstOutGains),
  };
  console.log(JSON.stringify(result));
  return result;
}

function replayReport(filename, weight) {
  const [report] = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  const snapshot = report.beforeLastBotMove;
  const lead = snapshot.plays.at(-1);
  assert(lead?.action === 'play' && lead.trickNumber === snapshot.turnState.trickNumber &&
    snapshot.plays.at(-2)?.trickNumber < lead.trickNumber, 'Expected the snapshot immediately after a lead.');
  const hands = { ...snapshot.hands, [lead.seat]: [...snapshot.hands[lead.seat], ...lead.cards] };
  const cards = [...Object.values(hands).flat(), ...snapshot.plays.slice(0, -1).flatMap(play => play.cards)];
  assert.equal(cards.length, 56);
  assert.equal(new Set(cards.map(card => card.id)).size, 56);
  const position = {
    ...snapshot, hands, humanHand: hands[snapshot.humanSeat], plays: snapshot.plays.slice(0, -1),
    turnState: { ...snapshot.turnState, currentSeat: lead.seat, currentWinningSeat: null, passCount: 0 },
  };
  const original = chooseLiveOfflineBot(position, lead.seat, {
    ...straightExperimentOptions, strandedStraightCardPenalty: 0,
  });
  const revised = chooseLiveOfflineBot(position, lead.seat, {
    ...straightExperimentOptions, strandedStraightCardPenalty: weight,
  });
  const actions = legalOfflineBotActions(observeOfflineBot(position, lead.seat));
  assert(actions.some(action => action.action === 'play' && action.combo.type === 'straight'));
  assert.deepEqual(original.decision.cards.map(card => card.id).sort(), lead.cards.map(card => card.id).sort());
  // Keep the continuation identical so this isolates the choice of lead.
  for (const [label, { decision, diagnostics }] of [['original', original], ['revised', revised]]) {
    const scores = finishHand(applyOfflineMove(position, lead.seat, decision), 0, null);
    console.log(JSON.stringify({
      label, lead: visibleCardList(decision.cards), score: diagnostics.candidates[0]?.score,
      firstOutSeat: scores.firstOutSeat, teamOneScore: scores.teamOneScore, teamTwoScore: scores.teamTwoScore,
    }));
  }
}

const { values } = parseArgs({
  options: { report: { type: 'string' }, weight: { type: 'string' } },
});
const weights = [6, 8, 12, 16];
if (values.weight !== undefined) assert(weights.includes(Number(values.weight)), 'Use a trial weight of 6, 8, 12, or 16.');
const candidates = values.weight === undefined ? weights.map(weight => compare(weight, 120001, 600)) : [];
const best = candidates.filter(result => result.teamMarginPerHand.mean >= 0)
  .sort((a, b) => b.firstOutPercentagePointGain.mean - a.firstOutPercentagePointGain.mean ||
    b.teamMarginPerHand.mean - a.teamMarginPerHand.mean || a.weight - b.weight)[0];
if (values.weight === undefined) assert(best, 'No trial weight maintained team margin on the initial deals.');
const weight = values.weight === undefined ? best.weight : Number(values.weight);
console.log(`Checking weight ${weight} on fresh deals.`);
if (values.report) replayReport(values.report, weight);
compare(weight, 130001, 2400);
