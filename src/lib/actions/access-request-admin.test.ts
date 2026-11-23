// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";

/**
 * Deciding access requests, against a real libsql database: only an admin may, approving opens a
 * sign-up window for that email and sends the link, and declining closes it again.
 */
const client = testDatabase("access-request-admin");
const testDb = client.db;

type Mail = { to: string; subject: string; text: string };
const sendEmail = vi.fn<(mail: Mail) => Promise<boolean>>(async () => true);
let admin = true;
vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("@/lib/email", () => ({
  sendEmail: (a: Mail) => sendEmail(a),
  appBaseUrl: () => "https://k.example",
}));
vi.mock("@/lib/admin", () => ({
  requireAdmin: async () => {
    if (!admin) throw new Error("Unauthorized");
    return { user: { id: "admin-1" } };
  },
}));

const { listAccessRequests, approveAccessRequest, declineAccessRequest } = await import("./access-request-admin");
const { mayCreateAccount } = await import("@/lib/auth/signup-allowlist");

const DAY = 86_400_000;

beforeAll(async () => {
  await client.query(`CREATE TABLE user (id text PRIMARY KEY, email text NOT NULL UNIQUE)`);
  await client.query(`CREATE TABLE access_request (
    id text PRIMARY KEY, name text NOT NULL, email text NOT NULL, message text,
    wants_beta integer NOT NULL DEFAULT false, notify_free integer NOT NULL DEFAULT false,
    notify_paid integer NOT NULL DEFAULT false, ip_hash text, status text NOT NULL DEFAULT 'new',
    admit_until integer, decided_at integer, decided_by_user_id text, created_at integer NOT NULL)`);
  // mayCreateAccount's other rules read these; empty here.
  await client.query(`CREATE TABLE family_invite (id text PRIMARY KEY, email text, status text, expires_at integer)`);
  await client.query(`CREATE TABLE child (
    id text PRIMARY KEY, email text, auth_user_id text, banished_at integer,
    email_login_enabled integer, google_login_enabled integer)`);
});
beforeEach(async () => {
  await client.query("DELETE FROM access_request");
  await client.query("DELETE FROM user");
  sendEmail.mockClear();
  admin = true;
});
afterAll(async () => {
  client.close();
});

const request = (id: string, email: string, createdAgo = 0) =>
  client.query("INSERT INTO access_request (id, name, email, created_at) VALUES (?1, 'Pat Parent', ?2, ?3)", [
    id, email, new Date(Date.now() - createdAgo),
  ]);
const row = async (id: string) => (await client.query("SELECT * FROM access_request WHERE id = ?1", [id])).rows[0];

describe("approveAccessRequest", () => {
  it("lets the email sign up for 14 days, records who decided, and emails the sign-up link", async () => {
    await request("r1", "pat@example.com");
    expect(await mayCreateAccount("pat@example.com")).toBe(false);

    const result = await approveAccessRequest("r1");
    expect(result).toMatchObject({ ok: true, emailSent: true, link: "https://k.example/signup?email=pat%40example.com" });

    const r = await row("r1");
    expect(r).toMatchObject({ status: "invited", decided_by_user_id: "admin-1" });
    expect(r.admit_until * 1000 - Date.now()).toBeGreaterThan(13.9 * DAY);
    expect(r.admit_until * 1000 - Date.now()).toBeLessThanOrEqual(14 * DAY);
    expect(await mayCreateAccount("pat@example.com")).toBe(true);

    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe("pat@example.com");
    expect(mail.text).toContain("https://k.example/signup?email=pat%40example.com");
    expect(mail.text).toContain("14 days");
  });

  it("still approves when the email fails, and hands back the link to send by hand", async () => {
    await request("r1", "pat@example.com");
    sendEmail.mockRejectedValueOnce(new Error("resend down"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    expect(await approveAccessRequest("r1")).toMatchObject({ ok: true, emailSent: false });
    expect(await mayCreateAccount("pat@example.com")).toBe(true);
  });

  it("refuses an email that already has an account, and a request that doesn't exist", async () => {
    await request("r1", "pat@example.com");
    await client.query("INSERT INTO user VALUES ('u1', 'pat@example.com')");
    expect(await approveAccessRequest("r1")).toEqual({ error: "pat@example.com already has an account." });
    expect(await approveAccessRequest("nope")).toEqual({ error: "That request no longer exists." });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("declineAccessRequest", () => {
  it("closes an approval that was already sent", async () => {
    await request("r1", "pat@example.com");
    await approveAccessRequest("r1");
    expect(await declineAccessRequest("r1")).toEqual({ ok: true });
    expect(await row("r1")).toMatchObject({ status: "declined", admit_until: null, decided_by_user_id: "admin-1" });
    expect(await mayCreateAccount("pat@example.com")).toBe(false);
  });
});

describe("listAccessRequests", () => {
  it("lists newest first and says which requesters already have an account", async () => {
    await request("old", "old@example.com", DAY);
    await request("new", "new@example.com");
    await client.query("INSERT INTO user VALUES ('u1', 'old@example.com')");
    await approveAccessRequest("new");
    const list = await listAccessRequests();
    expect(list.map((r) => [r.id, r.accountUserId, r.approvalLive])).toEqual([["new", null, true], ["old", "u1", false]]);
  });
});

describe("only an admin", () => {
  it("may list, approve or decline", async () => {
    await request("r1", "pat@example.com");
    admin = false;
    await expect(listAccessRequests()).rejects.toThrow("Unauthorized");
    await expect(approveAccessRequest("r1")).rejects.toThrow("Unauthorized");
    await expect(declineAccessRequest("r1")).rejects.toThrow("Unauthorized");
    expect(await row("r1")).toMatchObject({ status: "new", admit_until: null });
  });
});
