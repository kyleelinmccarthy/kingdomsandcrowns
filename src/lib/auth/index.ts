import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { tryLinkChildForUser, tryLinkChildByUserId } from "@/lib/auth/child-link";

export const auth = betterAuth({
  appName: "Kingdoms & Crowns",
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
