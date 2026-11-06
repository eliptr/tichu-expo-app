# Offline-first development

The root route is Offline Home. Offline play needs no Supabase environment variables. Auth initializes only when entering the online prototype; existing online routes remain available.

The latest match (including hands, score, play history and latest bot diagnostics), bot pace and diagnostics visibility are saved with AsyncStorage under `tichu.offline.v1`. Web uses browser storage. Starting a new match replaces this single save. Clearing site data removes it. Storage errors are shown in the game. ISMCTS and a multi-match experiment archive are future work.

Run `npm run build:web` to export the app and generate its versioned service worker. Vercel uses that command. Serve `dist` over HTTPS (or localhost), open once online and wait for the worker installation before disconnecting. Development Metro does not install a service worker.

On iPhone, open Safari, Share, Add to Home Screen. Manifest icons and Apple metadata are included. Cache updates activate when all existing app tabs close; reopen online to pick up a new build. Only offline pages and build assets are cached; online navigation and Supabase requests are not cached.

Verification: `npm run typecheck`, `npm run lint`, `npm run test:offline-bots`, `node scripts/test-offline-storage.js`, `npm run build:web`.

Device acceptance: start a match, play, exit and resume, refresh during play, finish a hand and verify it scores once. Change bot pace and diagnostics visibility, refresh and verify settings. With the production worker installed, disconnect the network and reload both `/` and `/offline/game`. Verify Safari home-screen launch on an iPhone.

## Position reports

During a match, Report this position freezes a snapshot and pauses bot turns until Save or Cancel. Add an optional note, then save locally. Offline Home > Saved position reports lists reports independently of the resumable match; starting a new match does not remove reports. Copy report exports JSON for pasting into chat. Show report provides selectable text if clipboard access is unavailable. Nothing is uploaded automatically.

Reports include a schema and engine version, timestamp, all hands, play history, scores, bot settings and diagnostics. beforeLastBotMove captures the input to the latest bot action in this screen session; it is null before the first bot move or after restoring a game until a bot acts. The position.deal field always describes the captured current position. Reports are intended for developer reproduction, not automatic import into the current match.

Storage holds up to 50 reports and refuses new reports when full rather than silently deleting existing ones. Copy and remove an older report to make room. Clearing browser data removes local reports. Run node scripts/test-position-reports.js for capture and storage regression checks.
