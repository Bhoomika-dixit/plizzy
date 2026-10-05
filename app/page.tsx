"use client";

import type { User } from "@supabase/supabase-js";
import Image from "next/image";
import { FormEvent, TouchEvent, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import googleIcon from "../resources/google-provider-icon.png";
import penguinHero from "../resources/plizzy-penguin-auth.png";

type Screen = "welcome" | "sign-in" | "sign-up" | "hello";
const onboarding = [
  { eyebrow: "one", copy: <>Dream it up.<br />Make it a game.<br /><strong>Play it together.</strong></> },
  { eyebrow: "two", copy: <>Tiny ideas become<br />little worlds.<br /><strong>Just like that.</strong></> },
  { eyebrow: "three", copy: <>Bring your favourite<br />people along.<br /><strong>More giggles, please.</strong></> },
  { eyebrow: "four", copy: <>Your next game night<br />starts right here.<br /><strong>Let&apos;s make magic.</strong></> },
];

function nameFromEmail(email: string) { return email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Player"; }
function nameFromUser(user: User) { const displayName = user.user_metadata.display_name; return typeof displayName === "string" && displayName.trim() ? displayName.trim() : nameFromEmail(user.email ?? ""); }

export default function Home() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [slide, setSlide] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeSlide = onboarding[slide];

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => { if (data.session?.user) { setName(nameFromUser(data.session.user)); setScreen("hello"); } });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => { if (session?.user) { setName(nameFromUser(session.user)); setScreen("hello"); } });
    return () => subscription.subscription.unsubscribe();
  }, []);

  function goTo(next: Screen) { setError(""); setNotice(""); setScreen(next); }
  function changeSlide(next: number) { setSlide((next + onboarding.length) % onboarding.length); }
  function requireSupabase() { const supabase = getSupabaseClient(); if (!supabase) setError("Supabase is not connected yet. Add the project URL and key to .env.local."); return supabase; }
  async function finishSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const supabase = requireSupabase(); if (!supabase) return;
    const form = new FormData(event.currentTarget); setError(""); setIsSubmitting(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") });
    setIsSubmitting(false);
    if (signInError) { setError("No account found with that email and password."); return; }
    if (data.user) { setName(nameFromUser(data.user)); goTo("hello"); }
  }
  async function finishSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirmPassword")) { setError("Those passwords don't match yet."); return; }
    const supabase = requireSupabase(); if (!supabase) return;
    setError(""); setIsSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? ""), options: { data: { display_name: String(form.get("name") ?? "").trim() } } });
    setIsSubmitting(false);
    if (signUpError) { setError(signUpError.message); return; }
    if (!data.session?.user) { setError("Sign-up could not start a session. Disable Confirm email in your Supabase Auth settings."); return; }
    setName(nameFromUser(data.session.user)); goTo("hello");
  }
  async function signOut() { const supabase = getSupabaseClient(); if (supabase) await supabase.auth.signOut(); setName(""); goTo("welcome"); }
  function onTouchStart(event: TouchEvent<HTMLDivElement>) { setTouchStart(event.changedTouches[0].clientX); }
  function onTouchEnd(event: TouchEvent<HTMLDivElement>) { if (touchStart === null) return; const distance = event.changedTouches[0].clientX - touchStart; if (Math.abs(distance) > 42) changeSlide(slide + (distance < 0 ? 1 : -1)); setTouchStart(null); }

  return <main className="auth-stage"><section className="phone" aria-label="Plizzy authentication">
    {screen === "welcome" && <div className="welcome-screen" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}><p className="wordmark" aria-label="Plizzy">plizzy</p><Image unoptimized src={penguinHero} alt="Plizzy, a friendly penguin blob" className="hero-penguin" priority /><p className="welcome-copy">{activeSlide.copy}</p><div className="onboarding-controls"><div className="pager" aria-label={`Onboarding page ${slide + 1} of ${onboarding.length}`}>{onboarding.map((item, index) => <button type="button" className={index === slide ? "active" : ""} onClick={() => setSlide(index)} aria-label={`Go to onboarding page ${index + 1}`} aria-current={index === slide ? "step" : undefined} key={item.eyebrow} />)}</div></div><div className="welcome-actions"><button className="primary-action" onClick={() => goTo("sign-up")}>Let&apos;s play!</button><button className="outline-action" onClick={() => goTo("sign-in")}>I&apos;m back</button></div></div>}
    {(screen === "sign-up" || screen === "sign-in") && <div className="account-screen"><header className="account-header"><button className="back-control" onClick={() => goTo("welcome")} aria-label="Back">‹</button><p className="small-wordmark">plizzy</p></header><div className="account-content"><h1>{screen === "sign-up" ? <>Join the<br />fun bunch!</> : <>Hi again,<br />friend!</>}</h1><p className="subtitle">{screen === "sign-up" ? "A whole playground is waiting for you." : "Your next little adventure is waiting."}</p><div className="social-stack"><button type="button" className="social-button" onClick={() => setNotice("Google sign-in is coming soon.")}><Image unoptimized src={googleIcon} alt="" className="provider-icon" /><span>Continue with Google</span></button></div><div className="divider"><span>or use your email</span></div>{screen === "sign-up" ? <form className="account-form" onSubmit={finishSignUp}><label>Your name<input name="name" placeholder="Your fun name" autoComplete="name" required /></label><label>Email<input name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></label><label>Password<input name="password" type="password" placeholder="Make it super secret" autoComplete="new-password" minLength={8} required /></label><label>One more time<input name="confirmPassword" type="password" placeholder="Type it again" autoComplete="new-password" minLength={8} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-action" type="submit" disabled={isSubmitting}>{isSubmitting ? "Making your playground..." : "Make my playground"}</button></form> : <form className="account-form" onSubmit={finishSignIn}><label>Email<input name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></label><label>Password<input name="password" type="password" placeholder="Your secret password" autoComplete="current-password" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-action" type="submit" disabled={isSubmitting}>{isSubmitting ? "Opening the door..." : "Let me in!"}</button></form>}<p className="switch-text">{screen === "sign-up" ? "Already part of the fun?" : "New around here?"} <button onClick={() => goTo(screen === "sign-up" ? "sign-in" : "sign-up")}>{screen === "sign-up" ? "Come on in" : "Join us"}</button></p></div></div>}
    {screen === "hello" && <div className="hello-screen"><Image unoptimized src={penguinHero} alt="Plizzy, a friendly penguin blob" className="hello-penguin" priority /><p className="small-wordmark">plizzy</p><p className="overline">YOU&apos;RE IN THE CLUB</p><h1>Hey, {name || "friend"}!</h1><p>Let&apos;s make something wonderfully silly.</p><button className="outline-action" onClick={() => void signOut()}>Log out</button></div>}
    {notice && <p className="notice" role="status">{notice}</p>}
  </section></main>;
}
