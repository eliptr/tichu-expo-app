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

## Experimental offline bot

Set `EXPO_PUBLIC_TICHU_EXPERIMENTAL_BOT=1` before starting Expo in development mode. In PowerShell:

```powershell
$env:EXPO_PUBLIC_TICHU_EXPERIMENTAL_BOT = '1'
npm.cmd run web
```

Use `npm.cmd start` for Expo Go. Restart Metro after changing the flag. All three bot seats use the same engine. It uses the fair heuristic throughout the hand and runs ISMCTS when 16 or fewer cards remain and every seat has at most eight. The fair heuristic handles single-choice turns and any search that runs out of time before returning a move. The app checks its 100 ms search budget during sampling and simulated turns. Bot diagnostics show why search was skipped and keep the most recent completed search visible through the rest of the hand.

## Self-play

```text
npm run self-play -- --pairs 8 --seed 1
npm run self-play -- --pairs 20 --seed 1 --seats search,fair,search,fair
npm run self-play -- --pairs 1000 --seed 10001 --seats search,fair,search,fair
node scripts/run-offline-bot-scenarios.js --compare-report
```

`--seats` takes four bot names in play order, with partners opposite. Choose `legacy`, `fair`, or `search`. Each seed plays twice with the team lineups swapped. Win counts and the paired point margin are relative to the original lineups, and decision timings use wall-clock measurements. Add `--json` for individual hand records. The runner defaults to 128 iterations per search with no time limit, and `--iterations` lets you compare smaller budgets. The report replay compares King and pass on the same 128 sampled hands using fair heuristic play after each choice.

Run `npm.cmd run experiment:phoenix` to compare three Phoenix penalties against `fair-v2`. The command replays the reported position, screens the penalties on 400 paired deals, and confirms any positive screening winner on 1,000 fresh pairs. It saves the scores and any qualifying candidate in `experiment-results/phoenix.json`.

Run `npm.cmd run train:heuristic` to train from fixed deals. When Phoenix settings recommend different moves, the trainer finishes both branches from the same four hands. Each player decides from its own observation. The trainer tests its best qualifying setting on 1,000 fresh paired deals and saves the results in `experiment-results/heuristic-training.json`. Add `-- --report "path-to-position-report.json"` to include a separate replay of a saved position using its actual hands.
