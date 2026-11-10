# Cloudflare Workers (not in use)

**Production runs on Vercel + Turso: see [vercel.md](./vercel.md).** This page records how the app *could* run on Cloudflare Workers, in case it ever needs to move (for example, if paid plans are switched on, since Vercel's free Hobby plan is non-commercial only).

The setup is kept in the repo and was verified working with Turso in October 2026 (sign-up, family, hero, quests, weekly log and billing, under `wrangler dev`). It isn't deployed, and nothing in the Vercel setup depends on it.

## What it would use

| Piece | Where | Configured in |
|---|---|---|
| Next.js app | Cloudflare Worker `kingdomsandcrowns`, built by [OpenNext](https://opennext.js.org/cloudflare) | `wrangler.jsonc`, `open-next.config.ts` |
| All app data | **The same Turso database**, reached over HTTPS (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` as Worker secrets) | `src/lib/db/index.ts` |
| Revalidation queue + tag cache (back every `revalidatePath`) | Two Durable Objects | `wrangler.jsonc` → `durable_objects` |
| Next's page cache | R2 bucket `kingdomsandcrowns-next-cache` | `wrangler.jsonc` → `r2_buckets` |
| `next/image` | Cloudflare Images binding | `wrangler.jsonc` → `images` |

No database move is involved: the Worker talks to Turso the same way Vercel does.

## Before choosing it

- **Cost: Workers Paid, $5/month.** The built Worker is about 3.1 MiB gzipped, over the Free plan's 3 MiB limit. R2 needs a payment method on file even within its free allowance.
- **The domain's DNS must be on Cloudflare** (custom domains attach to a Worker only on a Cloudflare zone).
- **Node 22** locally (wrangler needs it; `.nvmrc` pins it).
- **Local `.env` files get baked in.** `opennextjs-cloudflare build` compiles local `.env*` files into the Worker as fallbacks. `npm run deploy` / `npm run upload` run [scripts/check-cloudflare-env.mjs](../../scripts/check-cloudflare-env.mjs) first, which refuses to build if they set `DEMO_MODE=true`, lists everything else that would be baked in, and (for `deploy`) refuses to migrate unless production's `TURSO_DATABASE_URL` is set. Deploying from Workers Builds (CI) avoids the baking entirely.

## Moving, in outline

1. `npx wrangler login`, then `npx wrangler r2 bucket create kingdomsandcrowns-next-cache`. Durable Objects are created on first deploy from the `migrations` block. Turn on Cloudflare Images (Images → Transformations).
2. Set the Worker's variables (**Settings → Variables and Secrets**, or `npx wrangler secret put NAME`): the same list as in [vercel.md](./vercel.md#environment-variables).
3. **Workers & Pages → Create → Import a repository**: build command `npx opennextjs-cloudflare build`; production deploy command `npm run db:migrate && npx opennextjs-cloudflare deploy -- --keep-vars`; non-production `npx opennextjs-cloudflare upload -- --keep-vars`. Build variables: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_VERSION`, and the `TURSO_*` pair for the migration step.
4. Try it on the `*.workers.dev` URL first, then add `www.kingdomsandcrowns.com` and `kingdomsandcrowns.com` as custom domains on the Worker (`next.config.ts` already redirects the apex to `www`), and remove them from Vercel.
5. Walk the smoke test in [vercel.md](./vercel.md#smoke-test).

To try the Worker locally: `npm run preview` builds it and runs it under `wrangler dev` on `:8787`; runtime variables go in a gitignored `.dev.vars`.

## History

On 2026-10-27 the plan was to move to Workers with Postgres 18 on Neon (through Hyperdrive). That move was never deployed, and on 2026-11-10 it was dropped in favour of staying on Vercel + Turso. The Postgres version of the code is in git history (`a5a2ef5` and the commits after it on `dev`).
