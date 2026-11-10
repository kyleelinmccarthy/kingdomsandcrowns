# Docs

| Folder | What goes here |
|--------|----------------|
| [deploy/](./deploy/) | How production runs and releases: [vercel.md](./deploy/vercel.md) (the live setup), [cloudflare.md](./deploy/cloudflare.md) (optional, unused), [database-backups.md](./deploy/database-backups.md). |
| [setup/](./setup/) | One-time third-party setup: [oauth.md](./setup/oauth.md) (Google sign-in), [stripe.md](./setup/stripe.md) (paid plans, switched off). |
| [content/](./content/) | Skill maps that decide which skill belongs to which grade. Tests parse these files, so their names and table layout are load-bearing. |
| [superpowers/specs/](./superpowers/specs/) | Design docs, one per piece of work: `YYYY-MM-DD-<topic>-design.md`. |
| [superpowers/plans/](./superpowers/plans/) | Implementation plans that carry out a spec: `YYYY-MM-DD-<topic>.md`. |
