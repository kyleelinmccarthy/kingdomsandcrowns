import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Local dev keeps DATABASE_URL in .env.local (Next loads it for the app; drizzle-kit doesn't).
// A value already in the environment always wins, so `DATABASE_URL=<neon> npm run db:migrate`
// still targets Neon even with .env.local present.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// Migrations always use a direct connection (DATABASE_URL), never Hyperdrive.
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./src/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/kingdomsandcrowns",
  },
});
