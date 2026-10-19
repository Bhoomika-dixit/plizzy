"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function AuthCallback() {
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function complete() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError("Supabase is not configured.");
        return;
      }
      const url = new URL(window.location.href);
      const oauthError = url.searchParams.get("error_description");
      if (oauthError) {
        setError(oauthError);
        return;
      }
      const code = url.searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }
      }
      const { data, error: sessionError } = await supabase.auth.getUser();
      if (!active) return;
      if (sessionError || !data.user) {
        setError(sessionError?.message ?? "Google sign-in did not complete. Please try again.");
        return;
      }
      window.location.replace("/footer/home");
    }
    void complete();
    return () => { active = false; };
  }, []);

  return <main className="auth-stage"><section className="phone" aria-live="polite">
    <div className="account-screen"><div className="account-content">
      <h1>{error ? "Couldn't sign you in" : "Welcome to Plizzy!"}</h1>
      <p className="subtitle">{error || "Finishing your Google sign-in..."}</p>
      {error && <a href="/">Back to sign in</a>}
    </div></div>
  </section></main>;
}
