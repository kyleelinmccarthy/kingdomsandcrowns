import { describe, it, expect, beforeEach } from "vitest";
import {
  signChildSession,
  verifyChildSession,
  CHILD_SESSION_MAX_AGE_MS,
} from "./child-session";

beforeEach(() => {
  process.env.CHILD_SESSION_SECRET = "test-secret-please-ignore";
});

const payload = { childId: "child_1", familyId: "fam_1", iat: 1_700_000_000_000 };

describe("child-session", () => {
  it("round-trips a valid signed session", () => {
    process.env.CHILD_SESSION_SECRET = "test-secret-please-ignore";
    const fresh = { ...payload, iat: Date.now() };
    const token = signChildSession(fresh);
    const out = verifyChildSession(token);
    expect(out).toEqual(fresh);
  });

  it("rejects a tampered payload", () => {
    const token = signChildSession({ ...payload, iat: Date.now() });
    const [body, sig] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ childId: "child_HACK", familyId: "fam_1", iat: Date.now() })
    ).toString("base64url");
    expect(verifyChildSession(`${forgedBody}.${sig}`)).toBeNull();
    // sanity: original body still verifies
    expect(verifyChildSession(`${body}.${sig}`)).not.toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = signChildSession({ ...payload, iat: Date.now() });
    const [body] = token.split(".");
    expect(verifyChildSession(`${body}.AAAA`)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signChildSession({ ...payload, iat: Date.now() });
    process.env.CHILD_SESSION_SECRET = "a-different-secret";
    expect(verifyChildSession(token)).toBeNull();
  });

  it("rejects an expired session", () => {
    const stale = { ...payload, iat: Date.now() - CHILD_SESSION_MAX_AGE_MS - 1000 };
    const token = signChildSession(stale);
    expect(verifyChildSession(token)).toBeNull();
  });

  it("rejects malformed / empty input", () => {
    expect(verifyChildSession(undefined)).toBeNull();
    expect(verifyChildSession("")).toBeNull();
    expect(verifyChildSession("noseparator")).toBeNull();
    expect(verifyChildSession(".onlysig")).toBeNull();
  });
});
