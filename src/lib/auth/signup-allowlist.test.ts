// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";

/**
 * Who may get a NEW account, against a real libsql database. While sign-ups are invite-only: only
 * emails a family has provisioned (a pending invite, or a hero with email/Google login on), or
 * whose access request an admin approved. Once SIGNUP_MODE is "open": anyone.
 */
const client = testDatabase("signup-allowlist");
const testDb = client.db;
vi.mock("@/lib/db", () => ({ db: testDb }));

const { mayCreateAccount } = await import("./signup-allowlist");

const HOUR = 3_600_000;

beforeAll(async () => {
  await client.query(`CREATE TABLE family_invite (
    id text PRIMARY KEY, email text NOT NULL, status text NOT NULL, expires_at integer NOT NULL)`);
  await client.query(`CREATE TABLE child (
    id text PRIMARY KEY, email text, auth_user_id text, banished_at integer,
    email_login_enabled integer NOT NULL DEFAULT false, google_login_enabled integer NOT NULL DEFAULT false)`);
  await client.query(`CREATE TABLE access_request (
    id text PRIMARY KEY, email text NOT NULL, status text NOT NULL, admit_until integer)`);
});
beforeEach(async () => {
  vi.unstubAllEnvs();
  await client.query("DELETE FROM family_invite");
  await client.query("DELETE FROM child");
  await client.query("DELETE FROM access_request");
});
afterAll(async () => {
  client.close();
});

const invite = (id: string, email: string, status: string, expiresIn: number) =>
  client.query("INSERT INTO family_invite VALUES (?1, ?2, ?3, ?4)", [id, email, status, new Date(Date.now() + expiresIn)]);
const hero = (id: string, email: string, opts: { emailLogin?: boolean; google?: boolean; linked?: boolean; banished?: boolean }) =>
  client.query("INSERT INTO child VALUES (?1, ?2, ?3, ?4, ?5, ?6)", [
    id, email, opts.linked ? "user-1" : null, opts.banished ? new Date() : null, !!opts.emailLogin, !!opts.google,
  ]);
const request = (id: string, email: string, status: string, admitIn: number | null) =>
  client.query("INSERT INTO access_request VALUES (?1, ?2, ?3, ?4)", [
    id, email, status, admitIn === null ? null : new Date(Date.now() + admitIn),
  ]);

describe("mayCreateAccount", () => {
  it("refuses a stranger, and an empty email", async () => {
    expect(await mayCreateAccount("stranger@example.com")).toBe(false);
    expect(await mayCreateAccount("")).toBe(false);
    expect(await mayCreateAccount(null)).toBe(false);
  });

  it("admits a pending, unexpired guardian invite, whatever the case of the typed email", async () => {
    await invite("i1", "grandma@example.com", "pending", HOUR);
    expect(await mayCreateAccount("  Grandma@Example.com ")).toBe(true);
  });

  it("refuses an invite that has expired, been revoked, or already been accepted", async () => {
    await invite("i1", "late@example.com", "pending", -HOUR);
    await invite("i2", "revoked@example.com", "revoked", HOUR);
    await invite("i3", "done@example.com", "accepted", HOUR);
    for (const e of ["late@example.com", "revoked@example.com", "done@example.com"]) {
      expect(await mayCreateAccount(e), e).toBe(false);
    }
  });

  it("admits a hero's email once a grown-up turns on email or Google login", async () => {
    await hero("c1", "kid-email@example.com", { emailLogin: true });
    await hero("c2", "kid-google@example.com", { google: true });
    expect(await mayCreateAccount("kid-email@example.com")).toBe(true);
    expect(await mayCreateAccount("kid-google@example.com")).toBe(true);
  });

  it("refuses a hero email with no login method on, one already linked, or a banished hero", async () => {
    await hero("c1", "off@example.com", {});
    await hero("c2", "linked@example.com", { emailLogin: true, linked: true });
    await hero("c3", "banished@example.com", { google: true, banished: true });
    for (const e of ["off@example.com", "linked@example.com", "banished@example.com"]) {
      expect(await mayCreateAccount(e), e).toBe(false);
    }
  });

  it("admits an approved access request until its approval runs out", async () => {
    await request("r1", "approved@example.com", "invited", HOUR);
    expect(await mayCreateAccount("Approved@Example.com")).toBe(true);
  });

  it("refuses an access request that is new, declined, or approved but run out", async () => {
    await request("r1", "waiting@example.com", "new", null);
    await request("r2", "declined@example.com", "declined", null);
    await request("r3", "stale@example.com", "invited", -HOUR);
    for (const e of ["waiting@example.com", "declined@example.com", "stale@example.com"]) {
      expect(await mayCreateAccount(e), e).toBe(false);
    }
  });

  it("admits anyone once SIGNUP_MODE is open, and stays closed for any other value", async () => {
    vi.stubEnv("SIGNUP_MODE", "open");
    expect(await mayCreateAccount("stranger@example.com")).toBe(true);
    vi.stubEnv("SIGNUP_MODE", "opne");
    expect(await mayCreateAccount("stranger@example.com")).toBe(false);
  });
});
