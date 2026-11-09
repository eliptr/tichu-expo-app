# Offline-first development

The root route is Offline Home. Offline play needs no Supabase environment variables. Auth initializes only when entering the online prototype; existing online routes remain available.

The latest match (including hands, score, play history and latest bot diagnostics), bot pace and diagnostics visibility are saved with AsyncStorage under `tichu.offline.v1`. Web uses browser storage. Starting a new match replaces this single save. Clearing site data removes it. Storage errors are shown in the game.

Run `npm run build:web` to export the app and generate its versioned service worker. Vercel uses that command. Serve `dist` over HTTPS (or localhost), open once online and wait for the worker installation before disconnecting. Development Metro does not install a service worker.

On iPhone, open Safari, Share, Add to Home Screen. Manifest icons and Apple metadata are included. Cache updates activate when all existing app tabs close; reopen online to pick up a new build. Only offline pages and build assets are cached; online navigation and Supabase requests are not cached.

Verification: `npm run typecheck`, `npm run lint`, `npm run test:offline-bots`, `node scripts/test-offline-storage.js`, `npm run build:web`.

Device acceptance: start a match, play, exit and resume, refresh during play, finish a hand and verify it scores once. Change bot pace and diagnostics visibility, refresh and verify settings. With the production worker installed, disconnect the network and reload both `/` and `/offline/game`. Verify Safari home-screen launch on an iPhone.

## Position reports

During a match, Report this position freezes a snapshot and pauses bot turns until Save or Cancel. Add an optional note, then save locally. Offline Home > Saved position reports lists reports independently of the resumable match; starting a new match does not remove reports. Copy report exports JSON for pasting into chat. Show report provides selectable text if clipboard access is unavailable. Nothing is uploaded automatically.

Reports include a schema and engine version, timestamp, all hands, play history, scores, bot settings and diagnostics. beforeLastBotMove captures the input to the latest bot action in this screen session; it is null before the first bot move or after restoring a game until a bot acts. The position.deal field always describes the captured current position. Reports are intended for developer reproduction, not automatic import into the current match.

Storage holds up to 50 reports and refuses new reports when full rather than silently deleting existing ones. Copy and remove an older report to make room. Clearing browser data removes local reports. Run node scripts/test-position-reports.js for capture and storage regression checks.

Run `npm run test:offline-bots` to replay the reported pair-of-fives decision. The scenario checks what playing a 5, playing a 6, or passing leaves in hand, and verifies that the bot's choice preserves both the pair and the 5-10 straight. For routine single-card replies, the bot prefers to keep pairs, triples, and straights that do not need the Phoenix. Mandatory wishes and pressure against a nearly-out opponent bypass the preference. Reports record the latest decision's engine version. Saved `heuristic-v1` and `heuristic-v2` reports still work.

## Offline bot experiments

Both switches beside Bot pace start off and save locally. **Extra Phoenix protection** lowers a Phoenix reply's heuristic score by 120 when it leaves at least three loose low singles and passing is legal. **Endgame search** compares up to three ranked plays and legal pass when at most 32 cards remain and every seat has at most ten. Search uses each seat's own cards and public information. The bot goes out immediately when it can and uses the normal heuristic if search can't finish a simulation for every candidate within its 100 ms budget. Bot diagnostics and position reports capture the result.

## Self-play

```text
npm run self-play -- --pairs 8 --seed 1
npm run self-play -- --pairs 20 --seed 1 --seats search,fair,search,fair
npm run self-play -- --pairs 1000 --seed 10001 --seats search,fair,search,fair
node scripts/run-offline-bot-scenarios.js --compare-report
```

`--seats` takes four bot names in play order, with partners opposite. Use `live` for the production baseline and `phoenix`, `endgame`, or `both` for the switches. For example, `npm run self-play -- --pairs 48 --seed 60001 --seats both,live,both,live` swaps the teams for every seed and reports scores, one-twos, failures, and search timings. The runner uses up to 128 iterations and 100 ms for the new endgame modes; the historical `search` mode has no time limit. Use `--iterations` for a smaller iteration limit and `--json` for individual hands. The historical `legacy` and `fair` modes remain available. The report replay compares King and pass on the same 128 sampled hands using fair heuristic play after each choice.

Run `npm.cmd run experiment:phoenix` to compare three Phoenix penalties against `fair-v2`. The command replays the reported position, screens the penalties on 400 paired deals, and confirms any positive screening winner on 1,000 fresh pairs. It saves the scores and any qualifying candidate in `experiment-results/phoenix.json`.

Run `npm.cmd run train:heuristic` to train from fixed deals. When Phoenix settings recommend different moves, the trainer finishes both branches from the same four hands. Each player decides from its own observation. The trainer tests its best qualifying setting on 1,000 fresh paired deals and saves the results in `experiment-results/heuristic-training.json`. Add `-- --report "path-to-position-report.json"` to include a separate replay of a saved position using its actual hands.
