# Kingdoms & Crowns

A homeschool quest tracker. Parents set quests; kids earn crowns and play the Realm, a 3D game. Built with Next.js, Drizzle, and a Turso (libSQL) database. Currently an invite-only beta.

## Getting started

```bash
nvm use                  # Node 22
npm install
cp .env.example .env.local
npm run db:migrate       # creates local.db
npm run dev              # http://localhost:3000
```

Checks: `npm run lint`, `npm run typecheck`, `npm test`. CI runs the same.

## Where things are

See [CLAUDE.md](./CLAUDE.md) for the repo layout and the rules for where new files go, and [docs/README.md](./docs/README.md) for the docs index.

## Deploying

The app runs on Vercel with a Turso database, both on free plans. See [docs/deploy/vercel.md](./docs/deploy/vercel.md) for how production runs and releases, [docs/deploy/database-backups.md](./docs/deploy/database-backups.md) for the weekly backups, and [docs/setup/stripe.md](./docs/setup/stripe.md) for paid plans (built, not yet switched on). [docs/deploy/cloudflare.md](./docs/deploy/cloudflare.md) notes an optional move to Cloudflare Workers, which isn't in use.
