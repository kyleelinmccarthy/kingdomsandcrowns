# Deploying Kingdoms & Crowns to Vercel

This guide walks through a first production deploy to Vercel with the Turso database and a custom domain. Estimated time: 30–60 minutes if domain DNS is already in place.

---

## 0. Prerequisites

Before you start:

- A GitHub repo with the latest `main` branch pushed.
- A registered domain (this guide assumes `kingdomsandcrowns.com`).
- A Turso account (production DB) — separate from your local dev DB.
- A Resend account with `kingdomsandcrowns.com` verified (see [oauth-setup.md](./oauth-setup.md)).
- A published Google OAuth client (see [oauth-setup.md](./oauth-setup.md)).

---

## 1. Pre-flight cleanup (do this BEFORE deploying)

### Rotate the leaked Turso credential
`.env.example` and `.env.prod` currently contain a real `TURSO_AUTH_TOKEN`. Before going to production:

1. In Turso, revoke the token on the existing `herodex` database (`turso db tokens revoke ...` or via dashboard).
2. Replace the value in `.env.example` and `.env.prod` with the literal placeholder `your-turso-auth-token`.
3. Commit and push.

### Generate fresh production secrets
```bash
# Better Auth secret (must be at least 32 chars)
openssl rand -base64 32
```

You'll paste this into Vercel as `BETTER_AUTH_SECRET`. Don't reuse the dev value.

### Confirm `DEMO_MODE` cannot leak into prod
[src/lib/auth/session.ts](../src/lib/auth/session.ts) honors `DEMO_MODE=true` regardless of `NODE_ENV`. Before launch, add a startup guard in `src/lib/auth/index.ts`:

```ts
if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE === "true") {
  throw new Error("DEMO_MODE must not be enabled in production");
}
```

This is small but it prevents a one-line env-var mistake from disabling auth on the live site.

---

## 2. Create the production Turso database

```bash
turso db create kingdoms-and-crowns-prod --location iad  # or your nearest region
turso db show kingdoms-and-crowns-prod --url             # → TURSO_DATABASE_URL
turso db tokens create kingdoms-and-crowns-prod          # → TURSO_AUTH_TOKEN
```

Save the URL and token for the Vercel step below.

### Run migrations against the prod DB

Migrations run **automatically** on every Vercel deploy — `vercel.json` sets the
build command to `npm run db:migrate && npm run build`, so the committed
migration files in `src/lib/db/migrations` are applied (via `drizzle-kit
migrate`) before the app builds. You do **not** need to run them by hand here;
the first deploy in step 5 will create the schema in the prod DB.

If you want the schema in place *before* the first deploy (e.g. to seed badges
first), you can run the same step manually:

```bash
TURSO_DATABASE_URL='<prod-url>' TURSO_AUTH_TOKEN='<prod-token>' npm run db:migrate
```

> Note: this uses `drizzle-kit migrate` (applies versioned migration files and
> records them in `__drizzle_migrations`), not the older interactive
> `drizzle-kit push`. `migrate` is idempotent and safe to re-run.

### Seed badges

```bash
TURSO_DATABASE_URL='<prod-url>' TURSO_AUTH_TOKEN='<prod-token>' npm run db:seed-badges
```

**Do not** run `db:seed-demo` against production — that's local-dev test data.

---

## 3. Import the project into Vercel

1. Go to [vercel.com/new](https://vercel.com/new).
2. Import the GitHub repo.
3. Framework preset: **Next.js** (auto-detected).
4. Root directory: leave as repo root.
5. Build command: leave as default — `vercel.json` overrides it with
   `npm run db:migrate && npm run build` so migrations apply on every deploy.
6. Output directory: `.next` (default).
7. Install command: `npm ci`.

**Don't deploy yet** — first set env vars. The build runs migrations against
whatever `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` the environment provides, so
those must be set (step 4) before the first deploy or the build will fail.

---

## 4. Configure environment variables

In **Project Settings → Environment Variables**, add the following for the **Production** environment:

| Variable | Value | Notes |
|---|---|---|
| `TURSO_DATABASE_URL` | `libsql://kingdoms-and-crowns-prod-...turso.io` | from step 2 |
| `TURSO_AUTH_TOKEN` | `eyJ...` | from step 2 |
| `BETTER_AUTH_SECRET` | `<32+ char random>` | from step 1 |
| `BETTER_AUTH_URL` | `https://kingdomsandcrowns.com` | no trailing slash |
| `NEXT_PUBLIC_APP_URL` | `https://kingdomsandcrowns.com` | client-side fallback |
| `GOOGLE_CLIENT_ID` | `...apps.googleusercontent.com` | production OAuth client |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | |
| `RESEND_API_KEY` | `re_...` | |
| `FEEDBACK_NOTIFY_EMAIL` | your email | receives "Send a Raven" |
| `FEEDBACK_FROM_EMAIL` | `raven@kingdomsandcrowns.com` | must be on the verified Resend domain |
| `ADMIN_USER_IDS` | _(leave empty for now)_ | fill in after first sign-in |
| `NEXT_PUBLIC_APP_VERSION` | `0.1.0` | bump per release; stamped onto feedback |

**Do not** set `DEMO_MODE` in production.

For **Preview** environments, use a separate Turso DB (e.g. `kingdoms-and-crowns-preview`) and the dev Google OAuth client (Testing mode is fine for previews since only you sign in).

---

## 5. First deploy

Click **Deploy**. Watch the build log. Expected:

- Lint, typecheck, build pass.
- Bundle size is reported.
- No env-var warnings (Next will warn if a `NEXT_PUBLIC_*` var is missing).

After deploy:

1. Visit the temporary `*.vercel.app` URL.
2. You should see the auth-portal sign-in page. The Google button should be visible.
3. Don't sign in yet — wait until the real domain is wired up so the auth cookie is set on the production hostname.

---

## 6. Wire up the custom domain

### In Vercel
**Project → Settings → Domains → Add → `kingdomsandcrowns.com`** (also add `www.kingdomsandcrowns.com` and redirect it to the apex).

Vercel shows the DNS records you need to add.

### At your DNS host
Add either:
- An `A` record on `@` pointing to `76.76.21.21`, plus a `CNAME` on `www` pointing to `cname.vercel-dns.com`, **or**
- A `CNAME` on `@` (if your host allows ANAME/ALIAS records) pointing to `cname.vercel-dns.com`.

Wait 5–30 minutes for DNS to propagate. Vercel will auto-provision a Let's Encrypt cert.

### Update Google OAuth + Better Auth
1. In Google Cloud Console **Credentials → Production OAuth client → Authorized redirect URIs**, confirm `https://kingdomsandcrowns.com/api/auth/callback/google` is listed.
2. `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` should already point at the apex; if you used the `vercel.app` URL temporarily, change them to `https://kingdomsandcrowns.com` and redeploy.

---

## 7. Smoke test in production

Run through this once with the real domain:

- [ ] `/` and `/login` load over HTTPS, no console errors.
- [ ] Sign up with email/password works and lands on `/tavern`.
- [ ] Sign in with Google works and lands on `/tavern`.
- [ ] Create a family in **The Hearth** → add a child → add a quest → log activity.
- [ ] Open the user menu → **Send a Raven** → submit a test message.
  - Confirm an email arrives at `FEEDBACK_NOTIFY_EMAIL`.
  - Confirm the row appears in the `feedback` table.
- [ ] `/privacy` and `/terms` load and link back to `/login`.
- [ ] Sign out and verify the session cookie is cleared.

### Enable the admin Rookery

1. Look up your user ID — easiest via Turso CLI:
   ```bash
   turso db shell kingdoms-and-crowns-prod \
     "select id, email from user where email = 'you@example.com';"
   ```
2. Add it to Vercel env: `ADMIN_USER_IDS=<your-id>`.
3. Redeploy (small change, or hit "Redeploy" in the Vercel UI).
4. Visit `/admin/feedback` — you should see your test raven.

---

## 8. Hardening to add before broad launch

The deploy is functional but these are worth doing before you invite users:

- **Error tracking:** Add Sentry via `@sentry/nextjs`. Set `SENTRY_DSN` in Vercel. Catches server-action crashes you'd otherwise never see.
- **Analytics:** Vercel Analytics (one-click in the dashboard) gives basic page views; PostHog or Plausible give richer behavior data.
- **Rate limiting:** Better Auth has a built-in rate limiter — enable it in `betterAuth({ rateLimit: { enabled: true } })` to prevent password-spray attacks.
- **Backups:** Schedule Turso backups (`turso db backup ...`) on a cron, or use Turso's built-in scheduled backups on a paid plan.
- **Status / health check:** Add `GET /api/health` returning `{ ok: true, version: process.env.NEXT_PUBLIC_APP_VERSION }` and wire it into a free uptime monitor (UptimeRobot, Better Stack).
- **CSP header:** [next.config.ts](../next.config.ts) sets X-Frame-Options/etc but no Content-Security-Policy. Add one once you know which third-party origins (Google, Resend, Sentry) need to be allow-listed.
- **`vercel.json` regions:** Pin the function region to match your Turso location (`{ "regions": ["iad1"] }` if Turso is in `iad`) to cut p99 latency.

---

## 9. Release flow going forward

For subsequent releases:

1. Bump `NEXT_PUBLIC_APP_VERSION` in Vercel env (so feedback rows get the new version tag).
2. If the change includes a schema change, generate the migration locally and **commit it**:
   ```bash
   npm run db:generate   # writes a new file to src/lib/db/migrations
   ```
   Commit the generated `.sql` file and the updated `meta/_journal.json`.
3. Merge to `main`. Vercel auto-deploys, and the build runs `npm run db:migrate`
   first — committed migrations are applied to the prod DB before the new code
   goes live. If a migration fails, the build fails and the old version stays up.
4. After deploy, walk the smoke test in step 7 for any affected feature.

> Migrations are only applied if their files are committed. A schema change with
> no committed migration file will deploy code against an un-migrated DB.

Schema changes that break the running build (renames, drops) need a two-step migration:
- Release N: add the new column/table, dual-write.
- Release N+1: switch reads, then drop the old column.

This ordering matters because migrations run *before* the new code is live: the
currently-running version must tolerate the post-migration schema for the brief
window between migration and cutover.
