"use client";

import Link from "next/link";
import Icon from "./components/ui-icon";
import PlayArt from "./components/play-art";
import styles from "./auth.module.css";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";


type Screen = "sign-in" | "sign-up";

function signedInDestination() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next?.startsWith("/footer/rooms?invite=") ? next : "/footer/home";
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("sign-in");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => { if (data.session?.user) window.location.replace(signedInDestination()); });
  }, []);

  function goTo(next: Screen) { setError(""); setNotice(""); setScreen(next); }
  function requireSupabase() { const supabase = getSupabaseClient(); if (!supabase) setError("We couldn’t connect to Plizzy. Please try again shortly."); return supabase; }
  async function finishSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const supabase = requireSupabase(); if (!supabase) return;
    const form = new FormData(event.currentTarget); setError(""); setIsSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") });
    setIsSubmitting(false); if (signInError) { setError("No account found with that email and password."); return; }
    window.location.assign(signedInDestination());
  }
  async function finishSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirmPassword")) { setError("Those passwords don't match yet."); return; }
    const supabase = requireSupabase(); if (!supabase) return;
    setError(""); setIsSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? ""), options: { data: { display_name: String(form.get("name") ?? "").trim() } } });
    setIsSubmitting(false); if (signUpError) { setError(signUpError.message); return; }
    if (!data.session?.user) { setNotice("Check your inbox to confirm your email, then come back to sign in."); return; }
    window.location.assign(signedInDestination());
  }

  return <main className={styles.stage}><section className={styles.story}><Link className="brand-lockup" href="/"><span className="brand-symbol"><Icon name="spark" size={25}/></span><span>plizzy<span className="brand-dot">.</span></span></Link><div className={styles.storyCopy}><span className={styles.pill}>A LITTLE PLAY, EVERY DAY</span><h1>Make something.<br/>Make someone&apos;s day.</h1><p>Turn your what-ifs into games.<br/>And your people into a fun bunch.</p><div className={styles.art}><span/><PlayArt/></div><div className={styles.note}><Icon name="spark" size={18}/><span>One small idea. A whole lot of possibility.</span></div></div><footer>Your imagination looks good on you.</footer></section><section className={styles.account} aria-label="Plizzy authentication"><Link className={styles.mobileBrand} href="/">plizzy<span>.</span></Link><div className={styles.accountInner}><div className={styles.tabs} role="tablist" aria-label="Account access" onKeyDown={event=>{if(!isSubmitting&&["ArrowLeft","ArrowRight"].includes(event.key)){event.preventDefault();const next=screen==="sign-in"?"sign-up":"sign-in";goTo(next);event.currentTarget.querySelector<HTMLButtonElement>("#"+next+"-tab")?.focus();}}}><button role="tab" disabled={isSubmitting} tabIndex={screen==="sign-in"?0:-1} aria-selected={screen==="sign-in"} aria-controls="account-panel" id="sign-in-tab" className={screen==="sign-in"?styles.active:""} onClick={()=>goTo("sign-in")}>Sign in</button><button role="tab" disabled={isSubmitting} tabIndex={screen==="sign-up"?0:-1} aria-selected={screen==="sign-up"} aria-controls="account-panel" id="sign-up-tab" className={screen==="sign-up"?styles.active:""} onClick={()=>goTo("sign-up")}>Create account</button></div><div id="account-panel" role="tabpanel" aria-labelledby={screen==="sign-up"?"sign-up-tab":"sign-in-tab"}><span className={styles.welcomeIcon}><Icon name="spark" size={25}/></span><p className="eyebrow">{screen==="sign-up"?"YOUR STORY STARTS HERE":"YOUR DAILY DOSE OF PLAY"}</p><h2>{screen==="sign-up"?"Room for one more?":"Good to have you back."}</h2><p className={styles.subtitle}>{screen==="sign-up"?"Always. Your next little adventure starts with an account.":"Your ideas, your games, your favourite people. All here."}</p><form className={styles.form} onSubmit={screen==="sign-up"?finishSignUp:finishSignIn}>{screen==="sign-up"&&<label className="field">What should we call you?<input name="name" placeholder="Your name" autoComplete="name" maxLength={80} required/></label>}<label className="field">Email address<input name="email" type="email" placeholder="you@example.com" autoComplete="email" required/></label><label className="field">Password<input name="password" type="password" placeholder={screen==="sign-up"?"At least 8 characters":"Your password"} autoComplete={screen==="sign-up"?"new-password":"current-password"} minLength={screen==="sign-up"?8:undefined} required/></label>{screen==="sign-up"&&<label className="field">Confirm password<input name="confirmPassword" type="password" placeholder="One more time" autoComplete="new-password" minLength={8} required/></label>}{error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p className="form-success" role="status">{notice}</p>}<button className="button" type="submit" disabled={isSubmitting}>{isSubmitting?"One little moment…":screen==="sign-up"?"Create my account":"Let’s play"}{!isSubmitting&&<Icon name="arrow" size={18}/>}</button></form><p className={styles.switchText}>{screen==="sign-up"?"Already part of the fun?":"New to this little corner of the internet?"}<button onClick={()=>goTo(screen==="sign-up"?"sign-in":"sign-up")}>{screen==="sign-up"?"Sign in":"Come on in"}</button></p></div><div className={styles.promise}><Icon name="check" size={14}/>Your own ideas. Your favourite people. Your kind of fun.</div></div></section></main>;
}
