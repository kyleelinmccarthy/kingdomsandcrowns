import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

const inWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

// ── On Cloudflare Workers ────────────────────────────────────
// A socket opened during one request can't be used by another, so each request gets its own
// pool, connected through Hyperdrive (which does the real pooling, near the database). Keyed on
// the request's ExecutionContext, so everything one request does shares one pool and the pool
// is dropped with the request. max 5: a Worker request may hold at most 6 open connections.
const requestDbs = new WeakMap<object, Db>();

function requestDb(): Db | null {
  let cf: { env: CloudflareEnv; ctx: object } | undefined;
  try {
    cf = getCloudflareContext() as unknown as { env: CloudflareEnv; ctx: object };
  } catch {
    return null;
  }
  const hyperdrive = cf.env.HYPERDRIVE;
  if (!hyperdrive) throw new Error("The HYPERDRIVE binding is missing; see docs/deploy-cloudflare.md.");
  let d = requestDbs.get(cf.ctx);
  if (!d) {
    d = drizzle(new Pool({ connectionString: hyperdrive.connectionString, max: 5 }), { schema });
    requestDbs.set(cf.ctx, d);
  }
  return d;
}

// ── Everywhere else (next dev, scripts, tests) ───────────────
let processPool: Pool | undefined;
let processDb: Db | undefined;

function localDb(): Db {
  if (inWorkers) throw new Error("No request context: the database can only be used while handling a request.");
  processPool ??= new Pool({
    connectionString:
      process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/kingdomsandcrowns",
  });
  processDb ??= drizzle(processPool, { schema });
  return processDb;
}

/** For one-off scripts, so the process can exit once they're done. */
export async function closeDb(): Promise<void> {
  await processPool?.end();
  processPool = undefined;
  processDb = undefined;
}

/**
 * The database for the current request. A stand-in object that resolves the right connection
 * on every use, so the rest of the app keeps writing `db.select(...)` / `db.transaction(...)`.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = requestDb() ?? localDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

interface CloudflareEnv {
  HYPERDRIVE?: { connectionString: string };
}
