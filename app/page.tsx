"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import googleIcon from "../resources/google-provider-icon.png";

type Screen = "sign-in" | "sign-up";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("sign-in");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => { if (data.session?.user) window.location.replace("/footer/home"); });
  }, []);

  function goTo(next: Screen) { setError(""); setNotice(""); setScreen(next); }
  function requireSupabase() { const supabase = getSupabaseClient(); if (!supabase) setError("Supabase is not connected yet. Add the project URL and key to .env.local."); return supabase; }
  async function finishSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const supabase = requireSupabase(); if (!supabase) return;
    const form = new FormData(event.currentTarget); setError(""); setIsSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") });
    setIsSubmitting(false); if (signInError) { setError("No account found with that email and password."); return; }
    window.location.assign("/footer/home");
  }
  async function finishSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirmPassword")) { setError("Those passwords don't match yet."); return; }
    const supabase = requireSupabase(); if (!supabase) return;
    setError(""); setIsSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? ""), options: { data: { display_name: String(form.get("name") ?? "").trim() } } });
    setIsSubmitting(false); if (signUpError) { setError(signUpError.message); return; }
    if (!data.session?.user) { setError("Sign-up could not start a session. Disable Confirm email in your Supabase Auth settings."); return; }
    window.location.assign("/footer/home");
  }

  return <main className="auth-stage"><section className="phone" aria-label="Plizzy authentication"><div className="account-screen"><header className="account-header"><span /><p className="small-wordmark">plizzy</p></header><div className="account-content"><h1>{screen === "sign-up" ? <>Join the<br />fun bunch!</> : <>Hi again,<br />friend!</>}</h1><p className="subtitle">{screen === "sign-up" ? "A whole playground is waiting for you." : "Your next little adventure is waiting."}</p><div className="social-stack"><button type="button" className="social-button" onClick={() => setNotice("Google sign-in is coming soon.")}><Image unoptimized src={googleIcon} alt="" className="provider-icon" /><span>Continue with Google</span></button></div><div className="divider"><span>or use your email</span></div>{screen === "sign-up" ? <form className="account-form" onSubmit={finishSignUp}><label>Your name<input name="name" placeholder="Your fun name" autoComplete="name" required /></label><label>Email<input name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></label><label>Password<input name="password" type="password" placeholder="Make it super secret" autoComplete="new-password" minLength={8} required /></label><label>One more time<input name="confirmPassword" type="password" placeholder="Type it again" autoComplete="new-password" minLength={8} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-action" type="submit" disabled={isSubmitting}>{isSubmitting ? "Making your playground..." : "Make my playground"}</button></form> : <form className="account-form" onSubmit={finishSignIn}><label>Email<input name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></label><label>Password<input name="password" type="password" placeholder="Your secret password" autoComplete="current-password" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-action" type="submit" disabled={isSubmitting}>{isSubmitting ? "Opening the door..." : "Let me in!"}</button></form>}<p className="switch-text">{screen === "sign-up" ? "Already part of the fun?" : "New around here?"} <button onClick={() => goTo(screen === "sign-up" ? "sign-in" : "sign-up")}>{screen === "sign-up" ? "Come on in" : "Join us"}</button></p></div></div>{notice && <p className="notice" role="status">{notice}</p>}</section></main>;
}
