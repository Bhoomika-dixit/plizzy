# Plizzy email OTP authentication

Plizzy has one sign-in flow: enter an email, receive a one-time code, and verify it. The same flow handles new and returning players, including players with an existing password account. The app uses Supabase `signInWithOtp` with `shouldCreateUser: true`, then `verifyOtp` with `type: "email"`. Requesting a code never grants access; a successful verification must return a session before the app navigates home or to a sanitized room invite.

The existing database trigger creates new profiles. Players can edit their name in Profile after signing in. Browser sessions persist and refresh through the shared Supabase client. URL-based session detection is disabled; users enter their code directly in the app. There is no auth callback route. Protected APIs still validate bearer tokens with Supabase. Only publishable keys belong in browser configuration; service role keys remain server-only.

## Hosted Supabase setup

Project: `kblhawfldsnjeswsytjl`.

1. Enable the **Email** provider and allow new signups.
2. Configure **Custom SMTP** with a verified sender to deliver codes to regular players. Supabase's default email service only delivers to project team addresses and has restrictive rate limits. New Free projects using the default sender may also be unable to customize templates.
3. In **Authentication → Email Templates**, use `supabase/templates/email-code.html` for **Magic Link** and `supabase/templates/confirm-signup.html` for **Confirm signup**. Both must include `{{ .Token }}` so first-time and returning players receive a code. Neither template should contain a sign-in link. Keep unrelated templates unchanged.
4. Set Email OTP expiration to **600 seconds**, length to **6 digits**, and a minimum resend interval of **60 seconds**. Keep Supabase's verification and email rate limits enabled. Server expiry/rate limits remain authoritative; the UI also prevents duplicate submissions and shows a 60-second resend cooldown. The input accepts 6–10 digits for compatible existing configurations.
5. Keep email confirmation enabled. Do not disable it to bypass delivery problems. Set Site URL to the production app origin; this flow needs no callback allowlist.

The connected database tools cannot update hosted Auth settings. SMTP delivery and template installation need an authenticated Supabase dashboard session; app code does not configure these settings automatically.

References: [email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless), [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

## Verification

Run `node --test tests/auth.test.cjs` for redirect attacks, OTP validation, safe errors, and the delivery contract. `node --env-file=.env tests/auth-smoke.cjs` runs an opt-in check against real Supabase Auth using a disposable fixture. It generates a code without sending mail, verifies it, reads the authenticated user/profile through a publishable client, rejects code reuse, signs out and removes its fixture. It prints no codes or credentials. This verifies Auth integration; inbox delivery requires SMTP and the templates above.

Manual acceptance after hosted setup:

1. Open a room invite in a signed-out browser. Enter an inbox you control, send a code, and verify it. Confirm you return to that room invitation.
2. Repeat from the root page for a new email and an existing account. Both should reach home after verification, with a profile.
3. Try an incorrect code, then the correct code. Reusing a consumed code must fail. Wait past configured expiry and confirm a new code is required.
4. Confirm resend is disabled during cooldown, then sends a new email. Verify the newest code. Choose **Use a different email** and confirm the previous challenge is cleared.
5. Reload after successful sign-in, then sign out from Profile. Protected actions must require authentication again.

Never commit inbox credentials, OTPs, session tokens, or SMTP secrets.
