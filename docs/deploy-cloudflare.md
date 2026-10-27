# Deploying Kingdoms & Crowns to Cloudflare

The app runs on **Cloudflare Workers** via the [OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare), with **Postgres 18** as the database, reached through **Cloudflare Hyperdrive**. Production before this move was Vercel + Turso; section 3 copies that data across.

What runs where:

| Piece | Where | Configured in |
|---|---|---|
| Next.js app (SSR, server actions, API routes) | Cloudflare Worker `kingdomsandcrowns` | `wrangler.jsonc`, `open-next.config.ts` |
| All app data | **Neon** (Postgres 18) | — |
| Connection pooling between the Worker and Postgres | **Hyperdrive** (binding `HYPERDRIVE`) | `wrangler.jsonc` → `hyperdrive` |
| Revalidation queue + tag cache (back every `revalidatePath`) | Two **Durable Objects**: `DOQueueHandler`, `DOShardedTagCache` | `wrangler.jsonc` → `durable_objects` |
| Next's page cache | **R2** bucket `kingdomsandcrowns-next-cache` | `wrangler.jsonc` → `r2_buckets` |
| `next/image` (marketing pages) | Cloudflare **Images** binding | `wrangler.jsonc` → `images` |
| Paid plans | Built, **switched off** ("coming soon") | `src/lib/billing/config.ts`; see [stripe-setup.md](./stripe-setup.md) |

Two connection strings exist, on purpose:
- **Direct** (`DATABASE_URL`): Neon's **non-pooled** connection string. Used only by migrations, scripts and backups, from your machine or CI.
- **Hyperdrive**: what the Worker uses at runtime. The app opens a fresh pool per request through it (`src/lib/db/index.ts`); Workers can't share sockets across requests.

---

## 0. Prerequisites

- **Cloudflare Workers Paid plan ($5/mo).** The built Worker is ~3.1 MiB gzipped; the Free plan's limit is 3 MiB. R2 needs a payment method on file even inside its free allowance.
- **The domain's DNS on Cloudflare** (custom domains attach to a Worker only on a Cloudflare zone).
- **A Neon project on Postgres 18.** Pick a region close to where most of your family is; Smart Placement (on in `wrangler.jsonc`) runs the Worker next to the database.
- Resend with a verified domain and a published Google OAuth client ([oauth-setup.md](./oauth-setup.md)).
- **Node 22** and **Docker** locally (wrangler needs Node 22; backups use the `postgres:18` image so `pg_dump` matches the server).

---

## 1. Pre-flight

### Rotate the old Turso credential
`.env.prod` (and older copies of `.env.example`) contained a real `TURSO_AUTH_TOKEN`. Keep it until the data copy in step 3 is done, then revoke it: `turso db tokens invalidate herodex`.

### Generate fresh production secrets

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET  (reuse the CURRENT production value instead if you
                          #                      want existing sign-ins to survive the move)
openssl rand -base64 32   # CHILD_SESSION_SECRET
```

### Know what a local deploy bakes in
`opennextjs-cloudflare build` compiles any local `.env`, `.env.production`, `.env.local` and `.env.production.local` **into the Worker** as fallbacks. `npm run deploy` / `npm run upload` run [scripts/check-cloudflare-env.mjs](../scripts/check-cloudflare-env.mjs) first, which refuses to build if those files set `DEMO_MODE=true` (demo mode skips sign-in) and lists everything else that would be baked in. Deploying from CI (step 6) avoids this entirely.

---

## 2. Create the Neon database and apply the schema

1. In Neon, create a project with **Postgres version 18**, in the region nearest your family.
2. **Roles → New role** named `hyperdrive-user`. Copy its password right away (Neon shows it once).
3. **Connect →** choose the `hyperdrive-user` role, and **turn off "Connection pooling"**. Copy that **direct** string. Hyperdrive does the pooling, so it must not point at Neon's `-pooler` host. Use the same direct string for migrations, scripts and backups.

The app talks to Neon with the standard `pg` driver (>= 8.16.3, which Hyperdrive requires), not Neon's serverless driver. Then, from the repo:

```bash
export DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DB?sslmode=require'
npm run db:migrate          # creates every table (src/lib/db/migrations)
```

## 3. Copy production data from Turso (one time)

Do this right before the DNS switch in step 7, so nothing written to the old site in between is lost. For a family app, a short "don't use the app for 10 minutes" window is simplest.

```bash
npm run db:backup     # a verified backup of Turso first — see database-backups.md
export TURSO_DATABASE_URL='<from .env.prod>' TURSO_AUTH_TOKEN='<from .env.prod>'
npm run db:migrate-data-from-turso -- --dry-run    # row counts per table, writes nothing
npm run db:migrate-data-from-turso                 # the copy
```

The copy runs table by table in foreign-key order, converts SQLite's integer timestamps and booleans to real Postgres types, and refuses to run twice (primary-key conflicts) rather than duplicate anything. It needs an empty, freshly migrated database.

**Give yourself a password.** Production accounts so far are Google-only. To sign in with email + password as well (Google keeps working):

```bash
DATABASE_URL="$DATABASE_URL" npm run db:set-password -- you@example.com   # prompts, hidden, twice
```

(Before the move, the same script fixes the *current* Turso production: `node --env-file=.env.prod scripts/set-password.mjs you@example.com`.) Family members can also use **Forgot passphrase?** on the sign-in page once the new site is live; it now really sends the email.

---

## 4. Create the Cloudflare resources

```bash
npx wrangler login
npx wrangler r2 bucket create kingdomsandcrowns-next-cache
npx wrangler hyperdrive create kingdomsandcrowns-db --connection-string="$DATABASE_URL"
```

Paste the Hyperdrive **id** it prints into `wrangler.jsonc` (`hyperdrive[0].id`). Durable Objects are created on first deploy from the `migrations` block. Enable Cloudflare Images (Images → Transformations).

---

## 5. Variables and secrets

Runtime values live on the Worker: **Workers & Pages → kingdomsandcrowns → Settings → Variables and Secrets** (use *Secret* for anything sensitive) or `npx wrangler secret put NAME`. The database needs no variable here: the Worker uses the Hyperdrive binding.

| Variable | Secret? | Notes |
|---|---|---|
| `BETTER_AUTH_SECRET`, `CHILD_SESSION_SECRET` | ✔ | step 1 |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` | – | `https://www.kingdomsandcrowns.com` (no trailing slash); `NEXT_PUBLIC_*` also at **build** time |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | ✔ | production OAuth client |
| `RESEND_API_KEY` | ✔ | sends password resets, invites, ravens and access requests |
| `EMAIL_FROM`, `FEEDBACK_FROM_EMAIL` | – | addresses on the verified Resend domain |
| `FEEDBACK_NOTIFY_EMAIL` | – | **you** — receives ravens and access requests |
| `ADMIN_USER_IDS` | – | your user id, for `/admin/feedback` |
| `NEXT_PUBLIC_APP_VERSION` | – | bump per release |

**Never set `DEMO_MODE`.** Stripe variables aren't needed while paid plans are "coming soon". Deploys pass `--keep-vars`, so dashboard values survive deploys.

---

## 6. Connect the repo (Workers Builds)

**Workers & Pages → Create → Import a repository**, then:

| Setting | Value |
|---|---|
| Build command | `npx opennextjs-cloudflare build` |
| Deploy command (production branch) | `npm run db:migrate && npx opennextjs-cloudflare deploy -- --keep-vars` |
| Non-production branch deploy command | `npx opennextjs-cloudflare upload -- --keep-vars` |

**Build variables and secrets:** `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_VERSION`, `DATABASE_URL` (direct, for the migration step) and `NODE_VERSION=22` if `.nvmrc` isn't picked up. Migrations run only on production deploys, after a successful build and before the new version goes live.

By hand instead: `npm run deploy` (env check → migrate → build → deploy; reads `DATABASE_URL` from your shell).

---

## 7. Custom domain

**Worker → Settings → Domains & Routes → Add → Custom domain** for both `www.kingdomsandcrowns.com` and `kingdomsandcrowns.com`; `next.config.ts` redirects the apex to `www`. Then confirm `https://www.kingdomsandcrowns.com/api/auth/callback/google` is an authorized redirect URI on the Google OAuth client, and remove the domain from Vercel.

---

## 8. Smoke test

- [ ] `/` shows the **beta banner**; every call to action says **Request access**.
- [ ] Submitting **Request access** emails `FEEDBACK_NOTIFY_EMAIL` (and the row lands in `access_request`).
- [ ] Signing in with **Google** and with **email + password** both work for your account.
- [ ] A Google account that isn't in a family is turned away with the invite-only message (not an error page).
- [ ] **Forgot passphrase?** sends an email whose link sets a new passphrase.
- [ ] Add a second hero, invite a grown-up, save a weekly summary — all allowed (no paid plan yet); Settings shows "Kingdom plan — coming soon".
- [ ] `/privacy` and `/terms` load; sign out clears the session.

---

## 9. Who can get in

Sign-ups are **invite-only** ([src/lib/auth/signup-allowlist.ts](../src/lib/auth/signup-allowlist.ts)). A new account can be created only for an email with a pending, unexpired family invite, or a hero email with email/Google login turned on. Everyone else uses **Request access** (`/request-access`), which stores the request and emails you their opt-ins (beta tester now, or notify when free / paid accounts open). Existing accounts are unaffected.

To let someone in: invite them as a guardian from **The Hearth**, or reply to their request once open sign-ups exist.

---

## 10. Backups

Weekly, verified, local: see [database-backups.md](./database-backups.md). Turn it on with `npm run db:backup-install`.

---

## 11. Local development

- **Everyday:** `docker compose up -d` (Postgres 18; `POSTGRES_PORT=5433` if 5432 is taken), `npm run db:migrate`, then `npm run dev` with `DATABASE_URL` in `.env.local`.
- **In the Workers runtime:** `npm run preview` runs the built Worker under `wrangler dev` on `:8787`, connecting to `hyperdrive[0].localConnectionString` (override with `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://…` for another port). Runtime vars go in a gitignored `.dev.vars`.

---

## 12. Release flow

1. Bump `NEXT_PUBLIC_APP_VERSION` (runtime and build variables).
2. Schema change? `npm run db:generate`, then commit the new `.sql` and `meta/` files.
3. Merge to `main`. Workers Builds builds, migrates production, then deploys; a failed migration stops the deploy.
4. Breaking changes (renames, drops) still need two releases: add + dual-write, then switch reads and drop.

Rollback: **Worker → Deployments → Rollback** restores the previous version instantly. It does not undo migrations.
