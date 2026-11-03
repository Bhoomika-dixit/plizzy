"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import Icon from "./components/ui-icon";
import PlayArt from "./components/play-art";
import styles from "./auth.module.css";
import { getSupabaseClient } from "@/lib/supabase/client";
import { authErrorMessage, isEmailCode, RESEND_SECONDS, sendEmailCode, signedInDestination, verifyEmailCode } from "@/lib/auth/flow";

function destination() {
  return signedInDestination(new URLSearchParams(window.location.search).get("next"));
}

export default function Home() {
  const [challengeEmail, setChallengeEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const busy = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) window.location.replace(destination());
    }).catch(() => { /* The form can retry a transient connection failure. */ });
  }, []);

  useEffect(() => {
    if (!retryAt) return;
    const update = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  useEffect(() => {
    if (challengeEmail) codeInput.current?.focus();
    else emailInput.current?.focus();
  }, [challengeEmail]);

  function clearMessages() { setError(""); setNotice(""); }
  function cooldown() { setRetryAt(Date.now() + RESEND_SECONDS * 1000); setSeconds(RESEND_SECONDS); }

  async function perform(task: (auth: NonNullable<ReturnType<typeof getSupabaseClient>>["auth"]) => Promise<void>) {
    if (busy.current) return;
    const client = getSupabaseClient();
    if (!client) { setError("We couldn’t connect to Plizzy. Please try again shortly."); return; }
    busy.current = true;
    clearMessages();
    setPending(true);
    try { await task(client.auth); }
    catch { setError("We couldn’t connect. Check your connection and try again."); }
    finally { busy.current = false; setPending(false); }
  }

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Date.now() < retryAt) { setError(`Please wait ${seconds} seconds before requesting another code.`); return; }
    await perform(async auth => {
      const address = email.trim();
      const { error: failure } = await sendEmailCode(auth, address);
      if (failure) { if (failure.status === 429) cooldown(); setError(authErrorMessage(failure, "send")); return; }
      cooldown(); setToken(""); setChallengeEmail(address);
      setNotice("Check your inbox for your sign-in code. It may take a moment to arrive.");
    });
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challengeEmail) return;
    if (!isEmailCode(token)) { setError("Enter the complete code from your email."); return; }
    await perform(async auth => {
      const { data, error: failure } = await verifyEmailCode(auth, challengeEmail, token);
      if (failure || !data.session) { setError(authErrorMessage(failure, "verify")); return; }
      setToken(""); window.location.assign(destination());
    });
  }

  async function resend() {
    if (!challengeEmail || Date.now() < retryAt) return;
    await perform(async auth => {
      const { error: failure } = await sendEmailCode(auth, challengeEmail);
      if (failure) { if (failure.status === 429) cooldown(); setError(authErrorMessage(failure, "send")); return; }
      cooldown(); setToken(""); setNotice("A new code is on its way. Use the latest email and check your spam folder too.");
    });
  }

  return <main className={styles.stage}>
    <section className={styles.story}>
      <Link className="brand-lockup" href="/"><span className="brand-symbol"><Icon name="spark" size={25}/></span><span>plizzy<span className="brand-dot">.</span></span></Link>
      <div className={styles.storyCopy}><span className={styles.pill}>A LITTLE PLAY, EVERY DAY</span><h1>Make something.<br/>Make someone&apos;s day.</h1><p>Turn your what-ifs into games.<br/>And your people into a fun bunch.</p><div className={styles.art}><span/><PlayArt/></div><div className={styles.note}><Icon name="spark" size={18}/><span>One small idea. A whole lot of possibility.</span></div></div>
      <footer>Your imagination looks good on you.</footer>
    </section>
    <section className={styles.account} aria-label="Plizzy authentication">
      <Link className={styles.mobileBrand} href="/">plizzy<span>.</span></Link>
      <div className={styles.accountInner}>
        <div aria-labelledby="auth-title">
          <span className={styles.welcomeIcon}><Icon name={challengeEmail ? "check" : "spark"} size={25}/></span>
          <p className="eyebrow">{challengeEmail ? "ONE LAST LITTLE STEP" : "YOUR DAILY DOSE OF PLAY"}</p>
          <h2 id="auth-title">{challengeEmail ? "Check your inbox." : "Your next adventure awaits."}</h2>
          <p className={styles.subtitle}>{challengeEmail ? <>Enter the code sent to <strong className={styles.email}>{challengeEmail}</strong></> : "One email. One little code. All your ideas, games, and favourite people."}</p>
          <form className={styles.form} onSubmit={challengeEmail ? verify : requestCode} aria-busy={pending}>
            <fieldset className={styles.fields} disabled={pending}>
              {challengeEmail ? <label className="field">Verification code<input ref={codeInput} className={styles.codeInput} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="Enter your code" value={token} onChange={event => setToken(event.target.value.replace(/\s/g, ""))} pattern="[0-9]{6,10}" minLength={6} maxLength={10} aria-describedby="code-help" required/><span id="code-help" className={styles.help}>Codes are single use. If yours has expired, request a new one below.</span></label> : <>
                <label className="field">Email address<input ref={emailInput} name="email" type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required/></label>
                <p className={styles.help}>We’ll email you a one-time code. New here? Your account is created when you verify your email.</p>
              </>}
            </fieldset>
            {error && <p className="form-error" role="alert">{error}</p>}
            {notice && <p className="form-success" role="status">{notice}</p>}
            <button className="button" type="submit" disabled={pending}>{pending ? "One little moment…" : challengeEmail ? "Verify & let’s play" : "Send me a code"}{!pending && <Icon name="arrow" size={18}/>}</button>
          </form>
          {challengeEmail && <div className={styles.recovery}>
            <button disabled={pending || seconds > 0} onClick={resend}>{seconds > 0 ? `Resend code in ${seconds}s` : "Resend code"}</button>
            <button disabled={pending} onClick={() => { setChallengeEmail(null); setToken(""); clearMessages(); }}>Use a different email</button>
          </div>}
        </div>
        <div className={styles.promise}><Icon name="check" size={14}/>Your own ideas. Your favourite people. Your kind of fun.</div>
      </div>
    </section>
  </main>;
}
