/**
 * How one Turso (libSQL) row becomes the values a Postgres insert takes, apart from the importer
 * (which connects on load) so it can be tested.
 */
import { getTableColumns } from "drizzle-orm";
import type * as schema from "./schema";

/** Raw SQLite values -> the JS values the destination Postgres column expects. */
export function convertRow(table: (typeof schema)[keyof typeof schema], row: Record<string, unknown>) {
  const columns = getTableColumns(table as never);
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns)) {
    const raw = row[(column as { name: string }).name];
    const columnType = (column as { columnType: string }).columnType;
    // A column the old database never had is left out, so the insert takes its default rather
    // than an explicit NULL a NOT NULL column refuses.
    if (raw === undefined) continue;
    if (raw === null) {
      out[key] = null;
    } else if (columnType === "PgBoolean") {
      out[key] = Boolean(raw);
    } else if (columnType === "PgTimestamp") {
      out[key] = new Date(Number(raw) * 1000);
    } else {
      out[key] = raw;
    }
  }
  return out;
}
