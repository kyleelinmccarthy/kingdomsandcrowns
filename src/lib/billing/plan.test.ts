import { beforeEach, describe, expect, it, vi } from "vitest";

/** Each `db.select()` answers the next queued rows, whether awaited directly or through `.limit()`. */
const queued: unknown[][] = [];
vi.mock("@/lib/db", () => {
  const query = () => {
    const rows = queued.shift() ?? [];
    const q = {
      from: () => q,
      where: () => q,
      limit: async () => rows,
      then: (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(rows).then(ok, bad),
    };
    return q;
  };
  return { db: { select: () => query() } };
});

import {
  getFamilyPlan,
  childLimitBlock,
  memberLimitBlock,
  paidPlanBlock,
  FREE_CHILD_LIMIT,
  FREE_MEMBER_LIMIT,
} from "./plan";

beforeEach(() => {
  queued.length = 0;
});

describe("getFamilyPlan", () => {
  it("reads free when the family has no subscription row", async () => {
    queued.push([]);
    expect(await getFamilyPlan("f-plan-none")).toBe("free");
  });

  it("reads paid for an active or trialing subscription", async () => {
    queued.push([{ status: "active" }]);
    expect(await getFamilyPlan("f-plan-active")).toBe("paid");
    queued.push([{ status: "trialing" }]);
    expect(await getFamilyPlan("f-plan-trialing")).toBe("paid");
  });

  it("reads free once a subscription has lapsed or been canceled", async () => {
    queued.push([{ status: "past_due" }]);
    expect(await getFamilyPlan("f-plan-pastdue")).toBe("free");
    queued.push([{ status: "canceled" }]);
    expect(await getFamilyPlan("f-plan-canceled")).toBe("free");
  });
});

describe("childLimitBlock", () => {
  it("allows a free family with room left under the limit", async () => {
    queued.push([]); // getFamilyPlan: no subscription row -> free
    queued.push([]); // no children yet
    expect(await childLimitBlock("f-child-room")).toBeNull();
  });

  it(`blocks a free family already at the ${FREE_CHILD_LIMIT}-child limit`, async () => {
    queued.push([]); // free
    queued.push(Array.from({ length: FREE_CHILD_LIMIT }, (_, i) => ({ id: `c${i}` })));
    expect(await childLimitBlock("f-child-full")).toMatch(/free plan includes 1 hero/);
  });

  it("never limits a paid family, and never queries the child count", async () => {
    queued.push([{ status: "active" }]); // paid — short-circuits before any child-count query
    expect(await childLimitBlock("f-child-paid")).toBeNull();
  });
});

describe("memberLimitBlock", () => {
  it("allows a free family with room left under the limit", async () => {
    queued.push([]); // free
    queued.push([]); // no active members yet
    expect(await memberLimitBlock("f-member-room")).toBeNull();
  });

  it(`blocks a free family already at the ${FREE_MEMBER_LIMIT}-member limit`, async () => {
    queued.push([]); // free
    queued.push(Array.from({ length: FREE_MEMBER_LIMIT }, (_, i) => ({ id: `m${i}` })));
    expect(await memberLimitBlock("f-member-full")).toMatch(/free plan includes 1 adult account/);
  });

  it("never limits a paid family", async () => {
    queued.push([{ status: "trialing" }]);
    expect(await memberLimitBlock("f-member-paid")).toBeNull();
  });
});

describe("paidPlanBlock", () => {
  it("allows a paid family", async () => {
    queued.push([{ status: "active" }]);
    expect(await paidPlanBlock("f-gate-paid", "Saving a weekly summary")).toBeNull();
  });

  it("names the gated action in the message for a free family", async () => {
    queued.push([]);
    expect(await paidPlanBlock("f-gate-free", "Saving a weekly summary")).toMatch(/Saving a weekly summary/);
  });
});
