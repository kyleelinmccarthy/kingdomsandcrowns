// .superpowers/tools/db.mjs — run ONE SQL statement against local.db, from the repo root.
// Usage: node .superpowers/tools/db.mjs "SELECT 1"
import { createClient } from "@libsql/client";

const db = createClient({ url: "file:./local.db" });
const r = await db.execute(process.argv[2]);
console.log(JSON.stringify(r.rows, null, 1));
