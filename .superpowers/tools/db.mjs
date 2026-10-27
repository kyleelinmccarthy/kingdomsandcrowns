// .superpowers/tools/db.mjs — run ONE SQL statement against the local Postgres (docker-compose), from the repo root.
// Usage: DATABASE_URL='postgres://postgres:postgres@localhost:5432/kingdomsandcrowns' node .superpowers/tools/db.mjs "SELECT 1"
import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const r = await client.query(process.argv[2]);
console.log(JSON.stringify(r.rows, null, 1));
await client.end();
