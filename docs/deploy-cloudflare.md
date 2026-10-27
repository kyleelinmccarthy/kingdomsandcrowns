# Deploying Kingdoms & Crowns to Cloudflare

The app runs on **Cloudflare Workers** via the [OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare), with **Turso** (libSQL) as the database. Estimated time for a first deploy: 45–90 minutes if the domain is already on Cloudflare DNS.

What runs where:

| Piece | Where | Configured in |
|---|---|---|
| Next.js app (SSR, server actions, API routes) | Cloudflare Worker `kingdomsandcrowns` | `wrangler.jsonc`, `open-next.config.ts` |
| Revalidation queue + tag cache (backs every `revalidatePath`) | Two **Durable Objects**: `DOQueueHandler`, `DOShardedTagCache` | `wrangler.jsonc` → `durable_objects` |
| Next's page cache (incremental cache) | **R2** bucket `kingdomsandcrowns-next-cache` | `wrangler.jsonc` → `r2_buckets` |
| `next/image` optimization (marketing pages) | Cloudflare **Images** binding | `wrangler.jsonc` → `images` |
| All app data | **Turso** | `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` |
| Billing | **Stripe** | see [stripe-setup.md](./stripe-setup.md) |

---

## 0. Prerequisites

- **Cloudflare account on the Workers Paid plan ($5/mo).** The built Worker is ~3.1 MiB gzipped, just over the Free plan's 3 MiB limit (Paid allows 10 MiB). R2 needs a payment method on file even within its free allowance.
- **The domain's DNS on Cloudflare** (custom domains attach to a Worker only on a Cloudflare zone). Add the site in the dashboard and switch your registrar's nameservers if it isn't already.
- A Turso account, a verified Resend domain and a published Google OAuth client (see [oauth-setup.md](./oauth-setup.md)), and Stripe (see [stripe-setup.md](./stripe-setup.md)).
- **Node 22** for any local `wrangler` / `opennextjs-cloudflare` command (wrangler requires it; `.nvmrc` pins it).

---

## 1. Pre-flight cleanup (do this BEFORE deploying)

### Rotate the leaked Turso credential
`.env.prod` (and older copies of `.env.example`) contained a real `TURSO_AUTH_TOKEN`. Before going to production:

1. In Turso, revoke the token on the existing `herodex` database (`turso db tokens invalidate herodex`, or via the dashboard).
2. Replace the value anywhere it still appears with a placeholder.

### Generate fresh production secrets

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # CHILD_SESSION_SECRET
```

Don't reuse the dev values.

### Know what a local deploy bakes in

`opennextjs-cloudflare build` compiles any `.env`, `.env.production`, `.env.local` and `.env.production.local` present at build time **into the Worker**, and uses them as fallbacks for every variable the Worker doesn't define itself. `npm run deploy` and `npm run upload` run [scripts/check-cloudflare-env.mjs](../scripts/check-cloudflare-env.mjs) first: it **refuses to build if those files set `DEMO_MODE=true`** (demo mode bypasses sign-in) and lists every other key that would be baked in. Deploying from CI (step 5) avoids the issue entirely, since `.env*` files are gitignored and never exist there. `.env.prod` is not one of the files the adapter reads.

---

## 2. Create the production Turso database

```bash
turso db create kingdoms-and-crowns-prod --location iad   # pick the region nearest most users
turso db show kingdoms-and-crowns-prod --url             # → TURSO_DATABASE_URL
turso db tokens create kingdoms-and-crowns-prod          # → TURSO_AUTH_TOKEN
```

Apply the schema and seed badges (the deploy also migrates, but this lets you seed first):

```bash
TURSO_DATABASE_URL='<prod-url>' TURSO_AUTH_TOKEN='<prod-token>' npm run db:migrate
TURSO_DATABASE_URL='<prod-url>' TURSO_AUTH_TOKEN='<prod-token>' npm run db:seed-badges
```

`db:migrate` runs `src/lib/db/migrate.mjs`, which applies the committed files in `src/lib/db/migrations` and is idempotent. **Do not** run `db:seed-demo` against production.

> Moving an existing production database? Nothing to migrate — this is the same Turso database the Vercel deploy used. Point the Worker at it and the next deploy applies only `0036_subscription`.

---

## 3. Create the Cloudflare resources

```bash
npx wrangler login
npx wrangler r2 bucket create kingdomsandcrowns-next-cache
```

That's the only resource to create by hand:

- **Durable Objects** are created on the first deploy from the `migrations` block in `wrangler.jsonc` (SQLite-backed, tag `v1`). Never edit or remove an applied migration tag; add a new one if the DO classes ever change.
- **Images**: enable Cloudflare Images on the account (Images → Transformations). The free allowance covers the marketing pages comfortably.

---

## 4. Configure variables and secrets

Runtime values live on the Worker: **Workers & Pages → kingdomsandcrowns → Settings → Variables and Secrets** (choose *Secret* for anything sensitive), or from the CLI:

```bash
npx wrangler secret put TURSO_AUTH_TOKEN
```

| Variable | Secret? | Notes |
|---|---|---|
| `TURSO_DATABASE_URL` | – | `libsql://…turso.io` from step 2 |
| `TURSO_AUTH_TOKEN` | ✔ | from step 2 |
| `BETTER_AUTH_SECRET` | ✔ | from step 1 |
| `CHILD_SESSION_SECRET` | ✔ | from step 1 |
| `BETTER_AUTH_URL` | – | `https://www.kingdomsandcrowns.com` — no trailing slash; use the `*.workers.dev` URL until step 6 |
| `NEXT_PUBLIC_APP_URL` | – | same as `BETTER_AUTH_URL` (also needed at **build** time, see below) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✔ secret | production OAuth client |
| `RESEND_API_KEY` | ✔ | |
| `EMAIL_FROM`, `FEEDBACK_FROM_EMAIL` | – | addresses on the verified Resend domain |
| `FEEDBACK_NOTIFY_EMAIL` | – | receives "Send a Raven" |
| `ADMIN_USER_IDS` | – | fill in after first sign-in (step 7) |
| `NEXT_PUBLIC_APP_VERSION` | – | bump per release (also build time) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | ✔ | see [stripe-setup.md](./stripe-setup.md) |
| `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` | – | |

**Never set `DEMO_MODE`.** Deploys pass `--keep-vars`, so values set in the dashboard survive every deploy.

`NEXT_PUBLIC_*` values are inlined into the JavaScript **at build time**, so they must also be present wherever the build runs (step 5's build variables, or your shell for a local deploy).

---

## 5. Connect the repo (Workers Builds)

**Workers & Pages → Create → Import a repository →** pick this repo, then:

| Setting | Value |
|---|---|
| Build command | `npx opennextjs-cloudflare build` |
| Deploy command (production branch `main`) | `npm run db:migrate && npx opennextjs-cloudflare deploy -- --keep-vars` |
| Non-production branch deploy command | `npx opennextjs-cloudflare upload -- --keep-vars` |

**Build variables and secrets** (separate from the Worker's runtime variables): `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_VERSION`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (the migration step needs the last two), and `NODE_VERSION=22` if the build image doesn't pick up `.nvmrc`.

Migrations run only on production deploys, after the build succeeds and before the new version goes live — the same production-only rule the Vercel setup enforced. Preview branches upload a version without touching the database.

Prefer deploying by hand? `npm run deploy` does the env check, migration, build and deploy in one step (it reads `TURSO_*` from your shell for the migration).

---

## 6. Wire up the custom domain

**Worker → Settings → Domains & Routes → Add → Custom domain**, once for `www.kingdomsandcrowns.com` and once for `kingdomsandcrowns.com`. Cloudflare creates the DNS records and certificates itself. Both hostnames reach the Worker, and [next.config.ts](../next.config.ts) redirects the apex to `www` (matching the apex host only, so it can't loop).

Then:
1. Google Cloud Console → production OAuth client → confirm `https://www.kingdomsandcrowns.com/api/auth/callback/google` is an authorized redirect URI.
2. Set `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to `https://www.kingdomsandcrowns.com` (runtime **and** build variables) and redeploy.
3. Point the Stripe webhook endpoint at `https://www.kingdomsandcrowns.com/api/webhooks/stripe`.

---

## 7. Smoke test in production

- [ ] `/` and `/login` load over HTTPS, no console errors.
- [ ] Sign up with email/password works and lands on `/tavern`; sign in with Google works.
- [ ] Create a family in **The Hearth** → add a hero → add a quest → complete it.
- [ ] A second hero is refused with "The free plan includes 1 hero…" (not a generic error).
- [ ] Upgrade with Stripe's test card in test mode; the Settings billing panel then reads "Kingdom plan", and a second hero is allowed.
- [ ] **Send a Raven** → email arrives at `FEEDBACK_NOTIFY_EMAIL` and the row lands in `feedback`.
- [ ] `/privacy` and `/terms` load; sign out clears the session cookie.

### Enable the admin Rookery

1. `turso db shell kingdoms-and-crowns-prod "select id, email from user where email = 'you@example.com';"`
2. Set `ADMIN_USER_IDS=<your-id>` on the Worker (takes effect immediately; no redeploy needed).
3. Visit `/admin/feedback`.

---

## 8. Hardening before broad launch

- **Error tracking:** add Sentry (`@sentry/nextjs`) or turn on Workers Logs / Logpush. `observability` is already enabled in `wrangler.jsonc`, so logs appear under the Worker's **Observability** tab.
- **Rate limiting:** enable Better Auth's limiter, `betterAuth({ rateLimit: { enabled: true } })`. Cloudflare WAF rate-limit rules on `/api/auth/*` are a second layer.
- **Backups:** Turso point-in-time recovery depends on your plan; schedule `turso db shell … .dump` otherwise.
- **Health check:** `GET /api/health` returning `{ ok: true, version }`, watched by an uptime monitor.
- **CSP header:** [next.config.ts](../next.config.ts) sets X-Frame-Options etc. but no Content-Security-Policy yet.
- **Worker size:** at ~3.1 MiB gzipped there's plenty of room under Paid's 10 MiB; to see what's large, analyze `.open-next/server-functions/default/handler.mjs.meta.json` with the esbuild bundle analyzer.

---

## 9. Local development

- **Everyday:** `npm run dev` (Node, `.env.local`, `file:./local.db`), unchanged.
- **In the Workers runtime:** `npm run preview` builds the Worker and runs it under `wrangler dev` on `:8787` with local Durable Objects and R2. The Workers runtime can't open a `file:` database, so serve one over HTTP first and point a `.dev.vars` file at it:

  ```bash
  turso dev --db-file local.db        # serves local.db on http://127.0.0.1:8080
  ```

  ```env
  # .dev.vars (gitignored) — runtime vars for `wrangler dev`
  NEXTJS_ENV=development
  TURSO_DATABASE_URL=http://127.0.0.1:8080
  BETTER_AUTH_SECRET=any-local-value
  BETTER_AUTH_URL=http://localhost:8787
  NEXT_PUBLIC_APP_URL=http://localhost:8787
  ```

---

## 10. Release flow

1. Bump `NEXT_PUBLIC_APP_VERSION` (runtime and build variables).
2. Schema change? `npm run db:generate`, then commit the new `.sql` **and** `meta/` files.
3. Merge to `main`. Workers Builds builds, runs `db:migrate` against production, then deploys. A failed migration stops the deploy and the old version stays up.
4. Walk the relevant part of the smoke test.

Breaking schema changes (renames, drops) still need two releases: add + dual-write first, then switch reads and drop. Migrations run before the new code is live, so the running version must tolerate the post-migration schema.

Rollback: **Worker → Deployments → Rollback** restores the previous version instantly (it does not undo migrations, which is why the two-step rule matters).
