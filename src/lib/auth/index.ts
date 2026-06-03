import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { tryLinkChildForUser, tryLinkChildByUserId } from "@/lib/auth/child-link";

// better-auth only trusts the single host in BETTER_AUTH_URL by default, which
// rejects requests whose Origin is a different host (e.g. www vs apex) with
// "Invalid origin". Trust both the apex and www variants of the configured URL,
// plus localhost for dev.
function buildTrustedOrigins(): string[] {
  const origins = new Set<string>(["http://localhost:3000"]);
  const baseUrl = process.env.BETTER_AUTH_URL;
  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      const host = url.host.replace(/^www\./, "");
      origins.add(`${url.protocol}//${host}`);
      origins.add(`${url.protocol}//www.${host}`);
    } catch {
      origins.add(baseUrl);
    }
  }
  return [...origins];
}

export const auth = betterAuth({
  appName: "Kingdoms & Crowns",
  trustedOrigins: buildTrustedOrigins(),
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  // Link parent-provisioned email/Google accounts to their child profile at the
  // auth event (account creation, and again at each sign-in as a safety net).
  // Hooks must never throw or they'd break auth, hence the guards.
  databaseHooks: {
    user: {
      create: {
        after: async (user: { id: string; email?: string | null }) => {
          try {
            await tryLinkChildForUser(user);
          } catch (err) {
            console.error("[child-link] user.create hook failed:", err);
          }
        },
      },
    },
    session: {
      create: {
        after: async (session: { userId: string }) => {
          try {
            await tryLinkChildByUserId(session.userId);
          } catch (err) {
            console.error("[child-link] session.create hook failed:", err);
          }
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
