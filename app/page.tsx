"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import appleIcon from "../resources/apple-provider-icon.png";
import googleIcon from "../resources/google-provider-icon.png";
import penguinHero from "../resources/plizzy-penguin-auth.png";

type Screen = "welcome" | "sign-in" | "sign-up" | "hello";

function nameFromEmail(email: string) {
  return email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Player";
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function goTo(next: Screen) { setError(""); setNotice(""); setScreen(next); }
  function finishSignIn(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setName(nameFromEmail(String(new FormData(event.currentTarget).get("email") ?? ""))); goTo("hello"); }
  function finishSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirmPassword")) { setError("Passwords do not match."); return; }
    setName(String(form.get("name") ?? "").trim());
    setScreen("hello");
  }

  function socialButton(icon: typeof googleIcon, label: string) {
    return <button type="button" className="social-button" onClick={() => setNotice(`${label.replace("Continue with ", "")} sign-in is coming soon.`)}><Image unoptimized src={icon} alt="" className="provider-icon" /><span>{label}</span></button>;
  }

  return <main className="auth-stage"><section className="phone" aria-label="Plizzy authentication">
    {screen === "welcome" && <div className="welcome-screen">
      <p className="wordmark">plizzy</p>
      <Image unoptimized src={penguinHero} alt="Plizzy, a friendly penguin blob" className="hero-penguin" priority />
      <p className="welcome-copy">Turn your ideas<br />into games.<br /><strong>Play together.</strong></p>
      <div className="pager" aria-label="Onboarding step 1 of 3"><span className="active" /><span /><span /></div>
      <div className="welcome-actions"><button className="primary-action" onClick={() => goTo("sign-up")}>Get started</button><button className="outline-action" onClick={() => goTo("sign-in")}>Sign in</button></div>
    </div>}

    {(screen === "sign-up" || screen === "sign-in") && <div className="account-screen">
      <header className="account-header"><button className="back-control" onClick={() => goTo("welcome")} aria-label="Back">‹</button><p className="small-wordmark">plizzy</p></header>
      <div className="account-content">
        <h1>{screen === "sign-up" ? <>Create your<br />account</> : <>Welcome<br />back</>}</h1>
        <p className="subtitle">{screen === "sign-up" ? "Join a playground of limitless games." : "Pick up right where the fun left off."}</p>
        <div className="social-stack">{socialButton(googleIcon, "Continue with Google")}{socialButton(appleIcon, "Continue with Apple")}</div>
        <div className="divider"><span>or</span></div>
        {screen === "sign-up" ? <form className="account-form" onSubmit={finishSignUp}>
          <label>Name<input name="name" placeholder="Bhoomi" autoComplete="name" required /></label>
          <label>Email<input name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" placeholder="At least 8 characters" autoComplete="new-password" minLength={8} required /></label>
          <label>Confirm password<input name="confirmPassword" type="password" placeholder="Type it again" autoComplete="new-password" minLength={8} required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-action" type="submit">Create account</button>
        </form> : <form className="account-form" onSubmit={finishSignIn}>
          <label>Email<input name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" placeholder="Your password" autoComplete="current-password" required /></label>
          <button className="primary-action" type="submit">Sign in</button>
        </form>}
        <p className="switch-text">{screen === "sign-up" ? "Already have an account?" : "New to Plizzy?"} <button onClick={() => goTo(screen === "sign-up" ? "sign-in" : "sign-up")}>{screen === "sign-up" ? "Sign in" : "Create one"}</button></p>
      </div>
    </div>}

    {screen === "hello" && <div className="hello-screen"><Image unoptimized src={penguinHero} alt="Plizzy, a friendly penguin blob" className="hello-penguin" priority /><p className="small-wordmark">plizzy</p><p className="overline">YOU&apos;RE IN</p><h1>Hello, {name || "Player"}!</h1><p>Let&apos;s make your first game.</p><button className="outline-action" onClick={() => goTo("welcome")}>Use a different account</button></div>}
    {notice && <p className="notice" role="status">{notice}</p>}
  </section></main>;
}
