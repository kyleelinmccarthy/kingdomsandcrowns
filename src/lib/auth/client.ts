import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // Omit baseURL so the client uses the current page origin in the browser.
  // Falls back to localhost only during SSR/build where window is unavailable.
  baseURL:
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
} = authClient;
