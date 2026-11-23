/**
 * Sign-ups are invite-only. The account-creation hook in src/lib/auth/index.ts rejects with this
 * code; email sign-up returns it as the error message, and Google sign-in redirects back with
 * `?error=invite_only`. Kept as a bare code (no spaces) because Better Auth turns spaces into
 * underscores on the Google redirect.
 */
export const INVITE_ONLY = "invite_only";

export const INVITE_ONLY_MESSAGE =
  "Kingdoms & Crowns is invite-only while it's in beta, and this email hasn't been invited yet. " +
  "You can request access instead.";

/** A message for the auth forms, translating our own codes and passing anything else through. */
export function authErrorMessage(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  return raw === INVITE_ONLY ? INVITE_ONLY_MESSAGE : raw;
}
