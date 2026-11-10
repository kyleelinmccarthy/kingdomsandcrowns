# Deploying Kingdoms & Crowns (Vercel + Turso)

Production runs on **Vercel's free Hobby plan** with a **Turso** (libSQL, i.e. SQLite) database on Turso's free plan. Both stay well inside their free limits for a family app: the whole database is a few hundred KB.

The app is an **invite-only beta**: sign-ups are closed, and paid plans are built but switched off ("coming soon").

| Piece | Where | Configured in |
|---|---|---|
| Next.js app (pages, server actions, API routes) | Vercel project, deployed from `main` | `vercel.json`, `next.config.ts` |
| All app data | Turso database (`TURSO_DATABASE_URL`) | `src/lib/db/index.ts`, `src/lib/db/schema.ts` |
| Schema changes | Committed SQL migrations, applied on production deploys | `src/lib/db/migrations`, `src/lib/db/migrate.mjs` |
| Email (password resets, invites, ravens, access requests) | Resend | `RESEND_API_KEY` |
| Weekly backups | Your own computer | [database-backups.md](./database-backups.md) |
| Paid plans | Built, **switched off** | `src/lib/billing/config.ts`; see [stripe.md](../setup/stripe.md) |

> **Vercel Hobby is for non-commercial use only.** That's fine while the app is a free family beta. Before switching paid plans on, move to Vercel Pro or another host; [cloudflare.md](./cloudflare.md) notes how the Cloudflare option would work.

---

## Environment variables

**Vercel → Project → Settings → Environment Variables**, Production environment:

| Variable | Notes |
|---|---|
| `TURSO_DATABASE_URL` | `libsql://…turso.io` (`turso db show <db> --url`) |
| `TURSO_AUTH_TOKEN` | `turso db tokens create <db>` |
| `BETTER_AUTH_SECRET` | 32+ random characters (`openssl rand -base64 32`). Changing it signs everyone out |
| `CHILD_SESSION_SECRET` | optional; heroes' sign-ins fall back to `BETTER_AUTH_SECRET` |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` | `https://www.kingdomsandcrowns.com` (no trailing slash) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | production OAuth client ([oauth.md](../setup/oauth.md)) |
| `RESEND_API_KEY` | sends password resets, invites, ravens and access requests |
| `EMAIL_FROM`, `FEEDBACK_FROM_EMAIL` | addresses on the verified Resend domain |
| `FEEDBACK_NOTIFY_EMAIL` | **you**: receives ravens and access requests |
| `ADMIN_USER_IDS` | your user id, for `/admin/feedback` |
| `NEXT_PUBLIC_APP_VERSION` | bump per release; stamped onto feedback |

**Never set `DEMO_MODE`** (it skips sign-in). Stripe variables aren't needed while paid plans are off.

For **Preview** deployments, point `TURSO_*` at a separate Turso database, never production's. Previews don't run migrations, so migrate that database by hand when the schema changes (`TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… npm run db:migrate`).

---

## Migrations

`vercel.json` runs `npm run db:migrate` before `npm run build`, **on production deploys only**. [`src/lib/db/migrate.mjs`](../../src/lib/db/migrate.mjs) applies every committed migration not yet recorded in `__drizzle_migrations`, in one batch, so a failed migration changes nothing and fails the build, and the old version stays up. It is safe to re-run.

Run it by hand against production (for example, to check a migration before merging):

```bash
node --env-file=.env.prod src/lib/db/migrate.mjs
```

---

## Release flow

1. Schema change? Edit `src/lib/db/schema.ts`, run `npm run db:generate`, and commit the new `.sql` file and `meta/` changes. A schema change without a committed migration deploys code against an unmigrated database.
2. Bump `NEXT_PUBLIC_APP_VERSION` in Vercel.
3. Merge to `main`. Vercel builds, migrates production, then deploys.
4. Walk the smoke test below for anything the release touched.

Breaking schema changes (renames, drops) need two releases: add the new column and write both, then switch reads and drop the old one. Migrations run *before* the new code is live, so the running version must cope with the migrated schema for a moment.

Rollback: **Vercel → Deployments → (previous) → Promote to Production** restores the old code instantly. It does not undo migrations.

---

## Who can get in

Sign-ups are **invite-only** ([src/lib/auth/signup-allowlist.ts](../../src/lib/auth/signup-allowlist.ts)). A new account can be created only for an email with a pending, unexpired family invite, or a hero email with email/Google login turned on. Everyone else uses **Request access** (`/request-access`), which stores the request and emails `FEEDBACK_NOTIFY_EMAIL` their opt-ins (beta tester now, or notify when free or paid accounts open). Existing accounts are unaffected.

To let someone in, invite them as a guardian from **The Hearth**.

**Passwords.** **Forgot passphrase?** on the sign-in page emails a reset link; completing it also adds a password to a Google-only account. To set one by hand:

```bash
node --env-file=.env.prod scripts/set-password.mjs you@example.com   # prompts, hidden, twice
```

---

## Smoke test

- [ ] `/` shows the beta banner; every call to action says **Request access**.
- [ ] Submitting **Request access** emails `FEEDBACK_NOTIFY_EMAIL`, and the row lands in `access_request`.
- [ ] Signing in with **Google** and with **email + password** both work.
- [ ] A Google account that isn't in a family is turned away with the invite-only message (not an error page).
- [ ] **Forgot passphrase?** sends an email whose link sets a new passphrase.
- [ ] A hero can enter the Realm, finish a side quest, and see its stars and minutes.
- [ ] `/privacy` and `/terms` load; signing out clears the session.

---

## Local development

`npm run dev` uses `file:./local.db` unless `TURSO_DATABASE_URL` is set. Run `npm run db:migrate` after pulling a schema change. `npm run db:seed-demo` fills it with test data (never run that against production).

---

## Setting up from scratch

Only needed for a new environment; production already exists.

1. **Turso:** `turso db create <name> --location <nearest>`, then `turso db show <name> --url` and `turso db tokens create <name>` for the two `TURSO_*` values.
2. **Vercel:** import the GitHub repo (framework preset Next.js; `vercel.json` supplies the build command). Set the variables above **before** the first deploy, since the build migrates the database.
3. **Badges:** `TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… npm run db:seed-badges`.
4. **Domain:** **Project → Settings → Domains**, add `www.kingdomsandcrowns.com` and `kingdomsandcrowns.com` (redirecting to `www`), and add the DNS records Vercel shows. Confirm `https://www.kingdomsandcrowns.com/api/auth/callback/google` is an authorized redirect URI on the Google OAuth client.
5. **Admin:** sign in, find your user id (`turso db shell <name> "select id, email from user"`), set `ADMIN_USER_IDS`, and redeploy.
6. **Backups:** `npm run db:backup-install` ([database-backups.md](./database-backups.md)).
