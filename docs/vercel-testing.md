# Vercel Testing Deploy

Use this checklist for a low-risk web deploy on a Vercel Hobby account.

## Safety Rules

- Use a staging Supabase project for the first Vercel deploy.
- Never add service-role keys, OpenAI keys, Stripe secrets, or other private credentials to `EXPO_PUBLIC_*` variables.
- Treat `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_SENTRY_DSN` as public browser values.
- Keep `.env` local only. It is ignored by git.
- Keep Vercel Deployment Protection enabled for preview deployments while testing.

## Local Checks

Run these before pushing a deployment commit:

```bash
npm run typecheck
npm run lint
npm run test:offline-bots
npm run build:web
```

## Vercel Project Settings

When importing the GitHub repository in Vercel:

- Framework Preset: Other
- Install Command: `npm ci`
- Build Command: `npm run build:web`
- Output Directory: `dist`

The same values are also pinned in `vercel.json`.

## Environment Variables

Add these in Vercel Project Settings > Environment Variables:

```txt
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_STAGING_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_STAGING_SUPABASE_ANON_KEY
EXPO_PUBLIC_SENTRY_DSN=
```

Apply them to Preview. Apply them to Production only if you intentionally deploy the app from the production branch.

## Supabase Redirect URLs

After Vercel creates the deployment URL, add it in Supabase:

- Authentication > URL Configuration > Site URL
- Authentication > URL Configuration > Redirect URLs

Add the deployed origin and auth paths, for example:

```txt
https://your-vercel-url.vercel.app
https://your-vercel-url.vercel.app/auth/sign-in
https://your-vercel-url.vercel.app/auth/forgot-password
```

For safer testing, temporarily disable email confirmation in the staging Supabase project.

## Testing Flow

1. Open the Vercel preview deployment.
2. Confirm `/offline/game` works without signing in.
3. Create a staging Supabase test account.
4. Sign in, create a match, add a round, and delete the test data.
5. Join/create a shared room only with staging accounts.
6. On iPhone Safari, open the Vercel URL and use Share > Add to Home Screen.

The production build includes the PWA manifest, icons, and a versioned service worker. For offline-first testing, Supabase variables are optional. Open the HTTPS deployment once online and allow the cache to install before testing airplane-mode launch. See offline-pwa.md for the offline test checklist.
