import type { SupabaseClient } from "@supabase/supabase-js";

type Auth = SupabaseClient["auth"];
type AuthFailure = { code?: string; status?: number } | null;

export const RESEND_SECONDS = 60;

// Destinations are deliberately limited to app screens. Never send auth data
// or visitors to a URL supplied by an untrusted query parameter.
export function signedInDestination(next: string | null): string {
  if (!next || /[\\\x00-\x20\x7f]/.test(next)) return "/footer/home";
  try {
    const url = new URL(next, "https://plizzy.invalid");
    if (url.origin !== "https://plizzy.invalid") return "/footer/home";
    if (url.pathname === "/footer/rooms" && url.searchParams.get("invite")) {
      return `/footer/rooms?${new URLSearchParams({ invite: url.searchParams.get("invite")! })}`;
    }
  } catch { /* Fall back to the app home. */ }
  return "/footer/home";
}

export function authErrorMessage(error: AuthFailure, action: "send" | "verify"): string {
  if (error?.status === 429 || ["over_email_send_rate_limit", "over_request_rate_limit"].includes(error?.code ?? "")) {
    return "Too many attempts. Please wait a little before trying again.";
  }
  if (action === "verify") return "That code is invalid or has expired. Check the latest email or request a new code.";
  return "We couldn’t send a code. Please try again shortly.";
}

export function isEmailCode(token: string): boolean {
  // Supabase supports configurable code lengths. Do not coerce to a number:
  // leading zeroes are significant.
  return /^\d{6,10}$/.test(token);
}

export function sendEmailCode(auth: Auth, email: string) {
  return auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  });
}

export async function verifyEmailCode(auth: Auth, email: string, token: string) {
  if (!isEmailCode(token)) throw new Error("Enter the complete code from your email.");
  return auth.verifyOtp({ email: email.trim(), token, type: "email" });
}

