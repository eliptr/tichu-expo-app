require('./load-offline-engine');

const { parseArgs } = require('node:util');
const {
  advanceOfflineBotTurn,
  applyOfflinePassing,
  chooseFairOfflineBot,
  chooseLiveOfflineBot,
  createOfflineDeal,
  observeOfflineBot,
  offlineSeats,
  teamForSeat,
} = require('../src/features/offline/offline-game');
const { chooseConfiguredOfflineBot, chooseSearchOfflineBot } = require('../src/features/offline/offline-search');

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32;
  };
}

function playHand(seed, lineup, swapped, iterations) {
  let deal = applyOfflinePassing(createOfflineDeal(seededRandom(seed)));
  const decisionTimes = {};
  const searchTimes = [];
  const searchResults = {};
  const random = seededRandom(seed ^ 0x9e3779b9);
  let failure = null;
  let turns = 0;

  while (deal.status === 'playing' && turns < 224) {
    const seat = deal.turnState.currentSeat;
    const bot = lineup[offlineSeats.indexOf(seat)];
    const start = performance.now();
    try {
      const next = advanceOfflineBotTurn(deal, bot.chooseDeal ? ((state, actingSeat) =>
        bot.chooseDeal(state, actingSeat, { random, iterations })
      ) : bot.choose && ((state, actingSeat) =>
        bot.choose(observeOfflineBot(state, actingSeat), { random, iterations })
      ), true);
      if (next.plays.length !== deal.plays.length + 1 || next.plays.at(-1).seat !== seat) {
        failure = { kind: 'stuck', seat, turns };
        break;
      }
      deal = next;
      const search = deal.botDiagnostics?.search;
      if (search) {
        const outcome = search.fallback ?? 'completed';
        searchResults[outcome] = (searchResults[outcome] ?? 0) + 1;
        if (!['outside-endgame', 'forced-move', 'immediate-finish'].includes(outcome)) {
          searchTimes.push(search.elapsedMs);
        }
      }
    } catch (error) {
      failure = { kind: 'illegal', seat, turns, message: error.message };
      break;
    } finally {
      (decisionTimes[bot.version] ??= []).push(performance.now() - start);
    }
    turns += 1;
  }

  if (!deal.scoreSummary && !failure) failure = { kind: 'stuck', turns };
  const scores = deal.scoreSummary && [deal.scoreSummary.teamOneScore, deal.scoreSummary.teamTwoScore];
  const oneTwoTeam = deal.scoreSummary?.oneTwoTeam ?? null;
  return { seed, swapped, bots: lineup.map(bot => bot.version), scores, oneTwoTeam, turns, failure,
    decisionTimes, searchTimes, searchResults };
}

function main() {
  const { values } = parseArgs({
    options: {
      pairs: { type: 'string', default: '20' },
      seed: { type: 'string', default: '1' },
      iterations: { type: 'string', default: '128' },
      seats: { type: 'string', default: 'legacy,legacy,legacy,legacy' },
      json: { type: 'boolean' },
    },
  });
  const pairs = Number(values.pairs);
  const startSeed = Number(values.seed);
  const iterations = Number(values.iterations);
  if (!Number.isSafeInteger(pairs) || pairs < 1 || !Number.isInteger(startSeed)
      || startSeed < 0 || startSeed + pairs > 2 ** 32) {
    throw new Error('Use a positive --pairs count and a 32-bit unsigned --seed.');
  }
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 128) {
    throw new Error('Use an --iterations count between 1 and 128.');
  }
  const lineup = values.seats.split(',').map(name => {
    if (name === 'legacy') return { version: 'heuristic-v3' };
    if (name === 'fair') return { version: 'fair-v2', choose: view => chooseFairOfflineBot(view) };
    if (name === 'search') return { version: 'ismcts-v2', choose: chooseSearchOfflineBot };
    if (name === 'live') return { version: 'heuristic-v8', chooseDeal: chooseLiveOfflineBot };
    if (['phoenix', 'endgame', 'both'].includes(name)) return {
      version: name,
      chooseDeal: (deal, seat, options) => chooseConfiguredOfflineBot(deal, seat, {
        extraPhoenixProtection: name !== 'endgame',
        endgameSearch: name !== 'phoenix',
      }, options),
    };
    throw new Error(`Unknown bot: ${name}`);
  });
  if (lineup.length !== offlineSeats.length) throw new Error('Use four comma-separated bots in seat order.');

  const { summary, hands } = runPairedSelfPlay({ pairs, startSeed, iterations, lineup });
  console.log(JSON.stringify(values.json ? { ...summary, hands } : {
    ...summary,
    failedHands: hands.filter(hand => hand.failure),
  }, null, 2));
  if (summary.failures.illegal || summary.failures.stuck) process.exitCode = 1;
}

function runPairedSelfPlay({ pairs, startSeed, iterations = 128, lineup }) {
  const hands = [];
  for (let offset = 0; offset < pairs; offset += 1) {
    const seed = startSeed + offset;
    hands.push(
      playHand(seed, lineup, false, iterations),
      playHand(seed, [lineup[1], lineup[0], lineup[3], lineup[2]], true, iterations),
    );
  }
  const wins = [0, 0];
  let ties = 0;
  const pairMargins = [];
  const failureCounts = { illegal: 0, stuck: 0 };
  const timings = {};
  const teamScores = [0, 0];
  const oneTwo = [0, 0];
  const searchTimes = [];
  const searchResults = {};
  for (const hand of hands) {
    if (hand.failure) failureCounts[hand.failure.kind] += 1;
    for (const [version, times] of Object.entries(hand.decisionTimes)) {
      (timings[version] ??= []).push(...times);
    }
    searchTimes.push(...hand.searchTimes);
    for (const [outcome, count] of Object.entries(hand.searchResults)) {
      searchResults[outcome] = (searchResults[outcome] ?? 0) + count;
    }
    if (!hand.scores) continue;
    const [first, second] = hand.swapped ? [...hand.scores].reverse() : hand.scores;
    teamScores[0] += first;
    teamScores[1] += second;
    if (hand.oneTwoTeam) {
      const firstTeam = teamForSeat(offlineSeats[hand.swapped ? 1 : 0]);
      oneTwo[hand.oneTwoTeam === firstTeam ? 0 : 1] += 1;
    }
    if (first === second) ties += 1;
    else wins[first > second ? 0 : 1] += 1;
  }
  for (let index = 0; index < hands.length; index += 2) {
    const a = hands[index].scores;
    const b = hands[index + 1].scores;
    if (a && b) pairMargins.push((a[0] - a[1] + b[1] - b[0]) / 2);
  }
  const n = pairMargins.length;
  const mean = n ? pairMargins.reduce((sum, margin) => sum + margin, 0) / n : null;
  const margin95 = n > 1
    ? 1.96 * Math.sqrt(pairMargins.reduce((sum, margin) => sum + (margin - mean) ** 2, 0) / ((n - 1) * n))
    : null;
  const timingStats = times => {
    if (!times.length) return null;
    times.sort((a, b) => a - b);
    return { count: times.length, p50: times[Math.ceil(times.length * 0.5) - 1],
      p95: times[Math.ceil(times.length * 0.95) - 1], max: times.at(-1) };
  };
  const decisionTimeMs = Object.fromEntries(Object.entries(timings).map(([bot, times]) => [bot, timingStats(times)]));
  const summary = {
    startSeed, pairs, iterations, lineup: lineup.map(bot => bot.version), wins, ties, failures: failureCounts,
    teamOnePointGainPerHand: mean, confidence95: margin95 === null ? null : [mean - margin95, mean + margin95],
    teamScores, oneTwo, decisionTimeMs, searchResults, searchTimeMs: timingStats(searchTimes),
  };
  return { summary, hands };
}

if (require.main === module) main();
module.exports = { runPairedSelfPlay, seededRandom };
