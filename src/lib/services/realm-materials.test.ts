import { describe, it, expect, vi, beforeEach } from "vitest";

// The database refuses every read: whatever the grant does first throws.
vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      throw new Error("the database is down");
    },
    transaction: () => {
      throw new Error("the database is down");
    },
  },
}));

import { grantMaterialsForCompletion, grantMaterialsSafely } from "@/lib/services/realm-materials";

describe("grantMaterialsSafely", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("the grant itself fails when the database does", async () => {
    await expect(grantMaterialsForCompletion("c1", "a1")).rejects.toThrow("the database is down");
  });

  it("logs a failed grant and never throws, so a quest still completes", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(grantMaterialsSafely("c1", "a1")).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledOnce();
  });
});
