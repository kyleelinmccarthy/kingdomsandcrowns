import { describe, it, expect } from "vitest";
import * as schema from "./schema";
import { convertRow } from "./turso-rows";

/** A deed run as the old Turso database holds it: no column this round added. */
const oldRun = {
  id: "r1", child_id: "c1", deed_id: "well-stones", skill_ids: "[]", band: "3-5", questions: "[]", responses: "[]",
  mastery_start: "{}", correct_count: 3, flawless: 1, started_at: 1700000000, completed_at: null,
  created_at: 1700000000, updated_at: 1700000000,
};

describe("convertRow", () => {
  it("leaves out a column the source does not have, so the destination's default applies", () => {
    const out = convertRow(schema.deedRun, oldRun);
    for (const key of ["secondTries", "stars", "kind", "secondChances"]) expect(out).not.toHaveProperty(key);
    const settings = convertRow(schema.realmSettings, { id: "s1", child_id: "c1" });
    expect(settings).not.toHaveProperty("sideQuestLength");
    expect(settings).not.toHaveProperty("secondChances");
  });

  it("keeps a source null as null, and converts SQLite booleans and timestamps", () => {
    const out = convertRow(schema.deedRun, oldRun);
    expect(out.completedAt).toBeNull();
    expect(out.flawless).toBe(true);
    expect(out.startedAt).toEqual(new Date(1700000000 * 1000));
    expect(out.correctCount).toBe(3);
  });
});
