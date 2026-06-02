# OAuth Setup — Google Sign-In

Kingdoms & Crowns supports signing in with Google in addition to email/password. This guide walks through configuring the provider.

## Environment Variables

Add the following to your `.env.local`:

```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

---

## Google OAuth

### 1. Create a Google Cloud project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).

### 2. Configure the OAuth consent screen

1. Go to **APIs & Services > OAuth consent screen**.
2. Choose **External** user type (unless you only need internal/org access).
3. Fill in the required fields:
   - **App name**: Kingdoms & Crowns
   - **User support email**: your email
   - **Authorized domains**: your production domain (e.g. `kingdomsandcrowns.com`)
4. Add scopes: `email`, `profile`, `openid`.
5. Save and continue.

### 3. Create OAuth credentials

1. Go to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth client ID**.
3. Application type: **Web application**.
4. Add **Authorized redirect URIs**:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://yourdomain.com/api/auth/callback/google`
5. Copy the **Client ID** and **Client Secret** into your `.env.local`.

---

## Verifying the Setup

1. Start the dev server: `npm run dev`
2. Navigate to `/signup` or `/login`.
3. Click **Continue with Google**.
4. You should be redirected to the provider's consent screen, then back to `/tavern` on success.

## Troubleshooting

| Problem | Solution |
|---|---|
| "redirect_uri_mismatch" from Google | Ensure the redirect URI in Google Cloud Console exactly matches `{APP_URL}/api/auth/callback/google` |
| OAuth button doesn't appear | Verify the app builds without errors (`npx tsc --noEmit`) |
| User created but missing name | Google may not always return a name. The app handles this gracefully with Better Auth defaults |

---

## Publishing Google OAuth for production

While the OAuth consent screen is in **Testing** mode, only test users you add by email can sign in (capped at 100). For real users, you must publish:

### 1. Add required links to the consent screen
On **APIs & Services → OAuth consent screen → Edit app**:
- **App home page**: `https://kingdomsandcrowns.com`
- **App privacy policy link**: `https://kingdomsandcrowns.com/privacy`
- **App terms of service link**: `https://kingdomsandcrowns.com/terms`
- **Authorized domains**: `kingdomsandcrowns.com` (just the apex)
- **Developer contact email**: your email

Google requires these links to be live, publicly reachable, and on the same domain as the authorized domain. The `(legal)` route group in this app serves them at `/privacy` and `/terms`.

### 2. Confirm scopes are minimal
Only request `openid`, `email`, `profile`. With just these three (all "non-sensitive"), publishing does **not** require Google verification or a security assessment — you can publish immediately and there's no 7-day user cap.

### 3. Publish
**OAuth consent screen → Publishing status → Publish app → Confirm**.

Status should switch from "Testing" to "In production". Real Google users can now sign in.

### 4. Create production OAuth client
Back in **Credentials**, either:
- Add the production redirect URI (`https://kingdomsandcrowns.com/api/auth/callback/google`) to the existing client, **or**
- Create a separate "Production" Web application client so dev and prod credentials are isolated (recommended).

Set the resulting client ID/secret in Vercel as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

---

## Resend setup (transactional email)

Resend powers password-reset email, quest reminders, and the "Send a Raven" admin notification.

### 1. Create a Resend account
1. Sign up at [resend.com](https://resend.com).
2. Free tier (100 emails/day, 3,000/month) is enough to start.

### 2. Verify your sending domain
You can't send from `kingdomsandcrowns.com` until Resend has verified you control it.

1. In Resend, go to **Domains → Add Domain → `kingdomsandcrowns.com`**.
2. Resend gives you 3–4 DNS records (SPF `TXT`, DKIM `CNAME`, and optionally DMARC `TXT`).
3. Add each record at your DNS host (where you registered the domain — Cloudflare, Namecheap, Vercel DNS, etc.). Match name and value exactly. Keep TTL low (300s) while iterating.
4. Click **Verify** in Resend. Verification typically completes within a few minutes.

### 3. Create an API key
1. **API Keys → Create API Key**. Name it `kingdoms-and-crowns-prod`.
2. Scope: **Sending access** is enough.
3. Copy the key (starts with `re_`) — you can't view it again.

### 4. Set env vars
In Vercel (Settings → Environment Variables) for the **Production** environment:

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
FEEDBACK_NOTIFY_EMAIL=you@example.com         # where "Send a Raven" goes
FEEDBACK_FROM_EMAIL=raven@kingdomsandcrowns.com  # must be on a verified domain
```

### 5. (Optional) Wire Better Auth password reset to Resend
Email/password sign-in is enabled but no password-reset transport is configured. To finish that path, add a `sendResetPassword` callback to `betterAuth()` in [src/lib/auth/index.ts](../src/lib/auth/index.ts) that posts to `https://api.resend.com/emails`. The pattern is identical to the one used in [src/lib/actions/feedback.ts](../src/lib/actions/feedback.ts).

### 6. Test
Send yourself a test "Send a Raven" from the user menu — the email should arrive at `FEEDBACK_NOTIFY_EMAIL` within seconds.

---

## Admin access to `/admin/feedback`

The Rookery (admin feedback inbox) is gated by user ID, not by role. After you create your account in production:

1. Sign in as yourself.
2. Look up your user ID in the Turso `user` table (or temporarily log it from `getSession()`).
3. Set `ADMIN_USER_IDS=<your-user-id>` in Vercel env vars (comma-separated for multiple admins).
4. Redeploy. You can now visit `/admin/feedback`.

Non-admins hitting the route get a 404, not a 403, so the route isn't discoverable.
