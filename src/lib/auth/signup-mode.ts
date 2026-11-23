/**
 * Who may create an account, set per deployment by the SIGNUP_MODE environment variable:
 *
 *   invite_only  (the default) the beta: only emails someone let in may sign up. See
 *                signup-allowlist.ts for who that is.
 *   open         full release: anyone may sign up.
 *
 * Fails closed: an unset, empty or misspelled value means invite_only, so a missing variable can
 * never open the site by accident.
 *
 * The account-creation hook reads this on every sign-up. Statically rendered pages (the marketing
 * site) read it at build time, so redeploy after changing it, which Vercel needs anyway to pick up
 * a changed variable.
 */
export const SIGNUP_MODES = ["invite_only", "open"] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

export function signupMode(raw: string | undefined = process.env.SIGNUP_MODE): SignupMode {
  return raw?.trim().toLowerCase() === "open" ? "open" : "invite_only";
}

/** Where the public "join" buttons point, and what they say, in each mode. */
export type JoinLink = { href: string; label: string };

export function joinLink(mode: SignupMode = signupMode()): JoinLink {
  return mode === "open"
    ? { href: "/signup", label: "Create account" }
    : { href: "/request-access", label: "Request access" };
}
