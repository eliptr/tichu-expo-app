const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { runPairedSelfPlay } = require('./run-offline-self-play');
const {
  applyOfflineMove, chooseLiveOfflineBot, exitProtectionPenalty, lowCardProtectionPenalty,
} = require('../src/features/offline/offline-game');

const settings = {
  strandedSinglesPenalty: exitProtectionPenalty,
  strandedLowCardPenalty: lowCardProtectionPenalty,
  phoenixLooseSinglesPenalty: 120,
};
const choose = (deal, seat, enabled) => chooseLiveOfflineBot(deal, seat, { ...settings, partnerFinishPlanning: enabled });
const key = move => move.action === 'pass' ? 'pass' : move.cards.map(card => card.id).sort().join(',');
const reportPath = process.argv[2];
if (!reportPath) throw new Error('Pass the November 18 report JSON path.');
const raw = JSON.parse(fs.readFileSync(reportPath, 'utf8').replace(/^\uFEFF/, ''));
const reports = Array.isArray(raw) ? raw : raw.reports ?? [raw];
const report = reports.find(item => item.id === '1794589780578-nxefln9e');
assert(report?.beforeLastBotMove, 'The saved partner-lead position is missing.');
const after = report.beforeLastBotMove;
const lead = after.plays.at(-1);
assert.equal(lead.seat, 'team_one_player_two');
assert.deepEqual(lead.cards.map(card => card.id), ['sword-5']);
const seat = lead.seat;
const before = {
  ...after,
  hands: { ...after.hands, [seat]: [...after.hands[seat], ...lead.cards] },
  plays: after.plays.slice(0, -1),
  turnState: { ...after.turnState, currentSeat: seat, currentWinningSeat: null, passCount: 0 },
};
function replay(enabled) {
  const first = choose(before, seat, enabled);
  let state = applyOfflineMove(before, seat, first.decision);
  for (let turn = 1; state.turnState && turn < 224; turn += 1) {
    const actor = state.turnState.currentSeat;
    // Compare both opening choices under the same pre-change continuation.
    const next = applyOfflineMove(state, actor, choose(state, actor, false).decision);
    assert.notStrictEqual(next, state);
    state = next;
  }
  assert(state.scoreSummary);
  return {
    move: first.diagnostics.decisionLabel,
    finishOrder: state.finishOrder,
    scores: [state.scoreSummary.teamOneScore, state.scoreSummary.teamTwoScore],
  };
}
const replayResult = { baseline: replay(false), candidate: replay(true) };
assert.equal(replayResult.candidate.move, 'Single 8 - 8♠');
console.log(JSON.stringify(replayResult));

let changed = 0;
let changedLeads = 0;
const baseline = { version: 'previous-live', chooseDeal: (deal, actor) => choose(deal, actor, false) };
const candidate = {
  version: 'partner-finish-planning',
  chooseDeal(deal, actor) {
    const result = choose(deal, actor, true);
    if (!deal.turnState.currentWinningSeat) {
      changedLeads += 1;
      if (key(result.decision) !== key(choose(deal, actor, false).decision)) changed += 1;
    }
    return result;
  },
};
const { summary, hands } = runPairedSelfPlay({
  startSeed: 200001, pairs: 2000, lineup: [candidate, baseline, candidate, baseline],
});
const failures = hands.filter(hand => hand.failure);
const result = { settings, replay: replayResult, comparison: { ...summary, leadDecisions: changedLeads, changed }, failures };
const output = path.join(__dirname, '..', 'experiment-results', 'partner-finish-planning.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.comparison, null, 2));
if (failures.length) process.exitCode = 1;
