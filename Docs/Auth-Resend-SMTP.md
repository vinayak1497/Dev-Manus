# Auth Email Delivery — Supabase Auth + Resend SMTP

**Status:** Application code is complete and verified. Two **dashboard-only**
items remain before the 6-digit code can be delivered; neither is fixable
from code. Steps and exact values are below.

## 1. Architecture

```text
Login / Sign Up UI (email + password)
            │
            ▼
   Supabase Auth (code generation, verification, sessions)
            │
            ▼  custom SMTP
          Resend
            │
            ▼
       User's email inbox
```

- Supabase owns code generation/verification, sessions, and tokens.
- Resend only delivers the emails Supabase sends.
- The browser never calls Resend directly and never sees SMTP credentials.
- There is no `NEXT_PUBLIC_RESEND_*` variable by design.

## 2. Verified diagnosis (checked against your live project)

Commands were run against the project's public Auth API using the anon key:

```text
POST /auth/v1/signup        -> HTTP 429  error_code: over_email_send_rate_limit
GET  /auth/v1/settings       -> mailer_autoconfirm: false   (Confirm email ON)
                                disable_signup: false       (signups allowed)
```

| Symptom | Real cause |
| ------- | ---------- |
| "Too many requests" after one attempt | Supabase's **built-in mailer** is rate-limited project-wide. Emails you sent from `noreply@mail.app.supabase.io` confirm Resend is not connected yet. The limit is not caused by the app. |
| Email contains a link, not a 6-digit code | The default **Confirm signup** email template contains only `{{ .ConfirmationURL }}`. Supabase's built-in templates do not include `{{ .Token }}`. |
| Link lands on the landing page | Emailed links used the project's Site URL. The app now sends `emailRedirectTo = <origin>/auth/callback` on signup and resend, so links route through the callback handler. |

## 3. Remaining work — item 1: connect Resend SMTP (fixes the rate limit)

1. Create/log in at [resend.com](https://resend.com).
2. **API Keys → Create API Key** (sending access). Store it safely.
3. **Domains → Add Domain**, add the DNS records Resend shows, wait for
   verification. For local testing only, Resend's `onboarding@resend.dev`
   sender works and delivers solely to your own account email.
4. Supabase dashboard → **Project Settings → Auth → SMTP Settings**:

| Field | Value |
| ----- | ----- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | `YOUR_RESEND_API_KEY` |
| Sender email | `auth@YOUR_VERIFIED_DOMAIN` |
| Sender name | `DevOps Safeguard` |

5. **Save**, then use **Send test email** on the same screen to confirm.

Credentials live only in the Supabase dashboard. Never add them to `.env`,
`.env.local`, or any `NEXT_PUBLIC_*` variable.

## 4. Remaining work — item 2: make the email contain the 6-digit code

1. Supabase dashboard → **Auth → Email Templates → Confirm signup**.
2. Insert the token into the body (keep the link as a fallback):

```html
<p>Your DevOps Safeguard code is:</p>
<p style="font-size:24px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
<p><a href="{{ .ConfirmationURL }}">Or confirm directly</a></p>
```

3. Click **Save**. New signups now receive a 6-digit code alongside the
   link. Most mail clients also show a one-tap code suggestion.

`mailer_autoconfirm` is currently `false` and must stay that way — the app's
code step calls `verifyOtp({ type: "signup" })`, which requires confirmations
to be enabled.

## 5. Redirect URLs (for the emailed link)

**Auth → URL Configuration → Redirect URLs** must include:

- `http://localhost:3000/auth/callback`
- `https://YOUR_DOMAIN/auth/callback`

The app already passes `emailRedirectTo` pointing at this route. The route
(`app/auth/callback/route.ts`) exchanges `?code=` (PKCE) or verifies
`?token_hash=&type=`, then redirects to `?next=` (default `/projects`);
invalid links fall back to `/login`.

## 6. Push database migrations

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

This creates the `on_auth_user_created` trigger so every new user
automatically gets a `public.profiles` row (id + display name from signup).

## 7. Test the full flow

1. `npm run dev`, open `/` → **Log in** → **Create an account**.
2. Enter name, email, password + confirm → **Create account** → code step.
3. Confirm the 6-digit code arrives (item 2 in §4).
4. Enter it → **Verify code** → you land on `/projects`.
5. Check Dashboard → Table Editor → `public.profiles` for the new row.
6. Refresh → still signed in. **Sign out** → back to `/login`.
7. Sign in with the same credentials → straight to `/projects` (login
   sends no email, so it cannot hit a rate limit).
8. Visit `/projects` while signed out → redirected to `/login?next=/projects`.

## 8. Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| "Email sending is temporarily rate-limited" | Built-in mailer quota. Connect Resend SMTP (§3). |
| "Too many requests. Please wait a minute" | Client-side cooldown is active, or the project throttle was hit. Wait, then retry. |
| Link arrives, no code | Confirm-signup template missing `{{ .Token }}` (§4). |
| "Invalid or expired code" | Typo, expired code, or a newer code superseded it. Request a new one. |
| "An account with this email already exists" | Switch to `/login` and sign in. |
| Config notice on `/login` | `NEXT_PUBLIC_*` keys missing from `.env.local`; restart `next dev`. |
