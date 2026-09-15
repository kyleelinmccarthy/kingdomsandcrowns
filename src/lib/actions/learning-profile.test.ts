import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The same seam `access-child.test.ts` uses: mock the actor, run the real access gate.
 * Nothing is stubbed between the action and its refusal, so this test fails if the check
 * is deleted, weakened, or moved below the write.
 */
const getActor = vi.fn();
vi.mock("@/lib/auth/actor", () => ({ getActor: () => getActor() }));

import { setSubjectOffset, updateLearningProfile } from "./learning-profile";

beforeEach(() => {
  getActor.mockReset();
});

describe("setSubjectOffset — only a grown-up", () => {
  it("refuses a child setting their OWN subject level", async () => {
    // A child has edit rights over their own profile — that is how they play — so the
    // access gate alone lets this through. The action's own check is the only thing
    // standing between a hero and promoting themselves into work they were never given.
    getActor.mockResolvedValue({ kind: "child", childId: "c1", familyId: "f1" });
    await expect(setSubjectOffset("c1", "math", 2)).rejects.toThrow(/only a grown-up/i);
  });

  it("refuses a child setting another hero's subject level too", async () => {
    getActor.mockResolvedValue({ kind: "child", childId: "c1", familyId: "f1" });
    await expect(setSubjectOffset("c2", "math", 2)).rejects.toThrow();
  });

  it("refuses an unauthenticated caller", async () => {
    getActor.mockResolvedValue(null);
    await expect(setSubjectOffset("c1", "math", 2)).rejects.toThrow(/unauthorized/i);
  });

  it("guards the rest of the learning profile the same way", async () => {
    getActor.mockResolvedValue({ kind: "child", childId: "c1", familyId: "f1" });
    await expect(updateLearningProfile("c1", { readAloud: true })).rejects.toThrow(/only a grown-up/i);
  });
});
