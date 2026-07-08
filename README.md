# Tichu App

A fresh Expo React Native walking skeleton for the Tichu mobile app. Phase 1 proves the beginner-critical path: open the app on an iPhone with Expo Go, connect to hosted Supabase, sign up/sign in, persist the session, and read/write a profile row.

Phase 2 adds the first Tichu-specific feature: a simple authenticated score tracker with matches, rounds, totals, and match history.

Phase 3 adds shared rooms: friends can join by code, claim seats, and use the same scorer together with live Supabase Realtime updates.

Phase 4 starts the card engine prototype: a room host can deal a real 56-card Tichu deck to four claimed seats, each player can view only their own private hand, players can submit the first multiplayer card-passing action, and the table can advance through a basic live trick loop with v1 combination validation.

Phase 5 starts offline bot play: a local-only bot table can deal a Tichu deck, pass cards with automatic bot passes, play simple bot turns, detect hand completion, and avoid Supabase gameplay state so rules and bot behavior can be iterated quickly before porting back online.

## Tech stack

- Expo React Native with TypeScript
- Expo Router for file-based navigation
- Supabase for hosted auth and database
- AsyncStorage-backed Supabase sessions
- Sentry for crash/error monitoring hooks
- EAS Build and Submit config for future iOS/Android releases

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment placeholders:

   ```bash
   copy .env.example .env
   ```

3. Fill in `.env` with your hosted Supabase values:

   ```txt
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   EXPO_PUBLIC_SENTRY_DSN=
   ```

Do not commit `.env` or any secret values.

## Supabase setup

1. Create a hosted Supabase project.
2. In Supabase, go to **SQL Editor**.
3. Run the SQL from `supabase/migrations/20260602180000_create_profiles.sql`.
4. Run the SQL from `supabase/migrations/20260602193000_create_score_tracker.sql`.
5. Run the SQL from `supabase/migrations/20260602200000_prevent_completed_match_rounds.sql`.
6. Run the SQL from `supabase/migrations/20260602210000_create_shared_rooms.sql`.
7. Run the SQL from `supabase/migrations/20260602213000_tighten_room_delete_permissions.sql`.
8. Run the SQL from `supabase/migrations/20260603090000_create_card_engine.sql`.
9. Run the SQL from `supabase/migrations/20260603100000_create_passing_prototype.sql`.
10. Run the SQL from `supabase/migrations/20260603110000_create_trick_play_prototype.sql`.
11. Run the SQL from `supabase/migrations/20260603120000_validate_trick_combinations.sql`.
12. Run the SQL from `supabase/migrations/20260603123000_fix_combination_rank_ambiguity.sql`.
13. Go to **Authentication > Providers > Email** and make sure email/password auth is enabled.
14. For the easiest first test, you can temporarily disable email confirmation. If you keep confirmation enabled, sign-up will ask you to confirm by email before signing in.
15. If email confirmation is enabled, go to **Authentication > URL Configuration** and add redirect URLs for development:

   ```txt
   exp://*
   tichuapp://*
   http://localhost:8081/*
   http://172.20.10.10:8081/*
   ```

   Replace `172.20.10.10` with your computer's current Wi-Fi IP if it changes.

The migrations create `public.profiles`, `public.matches`, `public.rounds`, `public.rooms`, and `public.room_members`; link rows to `auth.users`; enable Row Level Security; and add policies so users can access solo matches they own or shared matches for rooms they have joined.
The card engine migrations also create `public.game_states`, `public.game_hands`, `public.game_passes`, `public.game_turn_states`, and `public.game_plays`. Hands and submitted pass choices are private through RLS; public table plays are visible to room members.

## Running locally

Start Expo:

```bash
npm run start
```

To test on iPhone:

1. Install **Expo Go** from the App Store.
2. Make sure the iPhone and computer are on the same network.
3. Scan the QR code shown by Expo.
4. Sign up, sign in, edit the profile, log out, and sign back in.

Useful scripts:

```bash
npm run start
npm run ios
npm run android
npm run lint
npm run typecheck
```

On Windows, `npm run ios` opens Expo's iOS workflow but cannot build a local iOS native app. Use Expo Go for development, then EAS Build for iOS binaries.

## App routes

- `/onboarding` - signed-out landing screen
- `/auth/sign-in` - email/password sign in
- `/auth/sign-up` - account creation
- `/auth/forgot-password` - reset email trigger
- `/tabs/home` - protected Supabase connection check
- `/offline/game` - local offline bot table prototype
- `/matches/new` - create a Tichu match
- `/matches/[matchId]` - scoreboard and round history
- `/matches/[matchId]/add-round` - add round scores and Tichu bonuses
- `/rooms/new` - create a shared scorer room
- `/rooms/join` - join a room with a 6-character code
- `/rooms/[roomId]` - room lobby, seats, and shared scorer entry
- `/rooms/[roomId]/hand` - private dealt hand for the signed-in seated player
- `/tabs/profile` - protected profile read/write form
- `/settings/delete-account` - production deletion notes

## Score tracker

The current Tichu feature is intentionally simple:

- Create a match with two team names and a target score.
- Add normal rounds by stepping one team's card points in 5-point increments from `-25` to `125`; the other team's card points are calculated automatically from 100. This supports Phoenix/Dragon outcomes.
- Add one-two finishes with a single tap for a 200-0 round.
- Add optional Tichu or Grand Tichu bonus/penalty values with buttons such as `+100`, `-100`, `+200`, or `-200`.
- View match totals and round history.
- Mark a match complete or reopen it.
- Completed matches lock round entry until reopened.
- Delete a match and all of its rounds.

This is not online gameplay yet. The database shape keeps matches and rounds separate so later milestones can add shared rooms, invited players, live updates, and card/game state.

## Shared rooms

Shared rooms wrap the existing scorer UI:

- Create a room to generate a 6-character code.
- Share the code with friends so they can join from their own signed-in account.
- Copy the room code from the lobby.
- Claim one of four seats in the room lobby.
- Guests can leave a room; hosts keep ownership.
- Open the shared scorer; all room members can add rounds, mark the match complete/reopen it, and see score updates.
- Only solo match owners or shared room hosts can delete the match.
- Supabase Realtime subscriptions refresh room seats and shared score changes.

This is still shared scoring, not full card play. The room model is the foundation for later hands, passing, turn state, tricks, and card validation.

## Card engine prototype

The first card-play milestone is deliberately small:

- Claim all four room seats.
- The host taps **Start game and deal** from the room lobby.
- Supabase shuffles a 56-card Tichu deck server-side and deals 14 cards to each claimed seat.
- Each player can open **View my hand** and see only their own cards.
- During the passing phase, each player chooses one card for teammate, left, and right.
- When all four players submit, Supabase swaps the cards server-side and moves the game to `playing`.
- Once play starts, the player with Mah Jong leads the first prototype trick.
- The current player can play selected cards or pass after a table has been led.
- Supabase validates v1 combinations: singles, pairs, triples, full houses, straights, consecutive pairs, four-card bombs, and straight flush bombs.
- Supabase rejects plays that do not match or beat the current table, except bombs can beat non-bombs.
- After three passes, the current winning seat leads the next trick.
- Realtime subscriptions refresh lobby/game state, passing progress, dealt hands, current turn, and public table plays.

This is not fully playable Tichu yet. The current validator treats Mah Jong and Dragon as singles, supports bombs, and leaves Dog/Phoenix behavior, Tichu calls during play, end-of-hand scoring, and ranking finish order for later focused milestones.

## Offline bot game

The first offline milestone is local-only:

- Open **Offline bot game** from the dashboard.
- Deal a 56-card Tichu deck locally.
- View your 14-card hand and three bot seats.
- Choose one card for teammate, left, and right.
- Bots automatically pass three low cards.
- Apply the pass swap locally and move to the next offline phase.
- The player with Mah Jong leads the first trick.
- Bots play the lowest legal move they can find, or pass.
- Players who run out of cards are added to a finish order.
- The hand stops once three players are out and shows the final order.
- Bot cards are temporarily shown in tiny text for debugging and will be hidden later.
- Card suits use text suit symbols for easier scanning.

This mode intentionally avoids Supabase for gameplay state so bot behavior and rule handling can be developed quickly. Later slices can improve bot choices and add local end-of-hand scoring.

## EAS build

Install and log in to EAS CLI:

```bash
npm install --global eas-cli
eas login
```

Update these placeholders before real builds:

- `expo.ios.bundleIdentifier` in `app.json`
- `expo.android.package` in `app.json`
- app icon and splash assets
- privacy policy URL
- terms URL
- support/contact details in the store consoles

Build commands:

```bash
eas build --platform ios --profile production
eas build --platform android --profile production
```

## Store submission

Prepare accounts manually:

- Apple Developer Program
- App Store Connect app record
- Google Play Console app record
- EAS credentials
- Privacy policy and terms pages
- App screenshots, description, categories, age rating, and support email

Submission commands once store setup is ready:

```bash
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

## Account deletion

The mobile client does not delete `auth.users` directly because that requires privileged Supabase admin access. For Phase 1, delete test users from the Supabase dashboard. For production, add a Supabase Edge Function that verifies the signed-in user and calls the admin delete-user API with the service-role key stored server-side.

## Troubleshooting

- **Missing Supabase values**: copy `.env.example` to `.env`, fill in the hosted project URL and anon key, then restart Expo.
- **Sign-up says to check email**: your Supabase project has email confirmation enabled. Confirm the email or disable confirmation during early testing.
- **Email confirmation link does not return to the app**: add the Expo redirect URLs in Supabase **Authentication > URL Configuration**, then use **Resend confirmation email** on the sign-in screen.
- **Profile fails to load**: confirm the SQL migration ran and RLS policies exist.
- **iPhone cannot connect**: make sure phone and computer share a network, then restart Expo with `npm run start`.
- **Password reset link is awkward in development**: configure Supabase redirect URLs once production domains/deep links are final.

## Next milestone ideas

- Score tracker with teams and match history
- Tichu player profiles and saved groups
- Match rooms
- Passing cards between seated players
- Legal trick combination validation
- End-of-hand scoring
- Stronger offline trick AI
