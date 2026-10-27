import { defineConfig } from "drizzle-kit";

// Migrations always use a direct connection (DATABASE_URL), never Hyperdrive.
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./src/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/kingdomsandcrowns",
  },
});
