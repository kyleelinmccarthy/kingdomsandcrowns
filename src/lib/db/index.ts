import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import { queueLocalWrites } from "./local-write-queue";

const url = process.env.TURSO_DATABASE_URL || "file:./local.db";
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

// Turso makes a write wait for another connection's transaction; a local file can't, so it queues.
export const db = drizzle(url.startsWith("file:") ? queueLocalWrites(client) : client, { schema });
