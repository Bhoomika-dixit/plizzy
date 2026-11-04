"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "../components/ui-icon";
import { getAdminClient } from "@/lib/admin/client";
import { SUPERUSER_EMAIL, type AdminGame, type AdminSnapshot } from "@/lib/admin/types";
import { authErrorMessage, isEmailCode, verifyEmailCode } from "@/lib/auth/flow";
import { APP_ORIGIN, MARKETING_ORIGIN } from "@/lib/site";
import styles from "./dashboard.module.css";

const number = (value: number) => value.toLocaleString("en-IN");
function date(value: string | null, time = false) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) });
}

function GameList({ games }: { games: AdminGame[] }) {
  if (!games.length) return <p className={styles.empty}>No games created yet. The next little world starts with an idea.</p>;
  return <ul className={styles.gameList}>{games.map(game => <li key={game.id}><span className={styles.gameIcon}><Icon name={game.mode === "multiplayer" ? "people" : "cards"} size={20}/></span><div><strong>{game.title}</strong><span>{game.creator_email ?? "Deleted account"}</span><small>{date(game.created_at, true)} UTC</small></div><div className={styles.gameMeta}><span>{game.mode === "multiplayer" ? "Multiplayer" : game.mode === "single_player" ? "Solo" : "No version"}</span><small>{game.visibility}{game.archived ? " · Archived" : ""}</small></div></li>)}</ul>;
}

export default function AdminDashboard() {
  const [auth, setAuth] = useState<"checking" | "out" | "in">("checking");
  const [challenge, setChallenge] = useState(false);
  const [code, setCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [selected, setSelected] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const busy = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const detail = useRef<HTMLElement>(null);

  useEffect(() => {
    const client = getAdminClient();
    if (!client) { Promise.resolve().then(() => { setAuth("out"); setAuthError("Sign-in is temporarily unavailable."); }); return; }
    let current = true;
    void client.auth.getSession().then(({ data }) => { if (current) setAuth(data.session ? "in" : "out"); }).catch(() => { if (current) setAuth("out"); });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (!current) return;
      setAuth(session ? "in" : "out");
      if (!session) { setSnapshot(null); setSelected(null); }
    });
    return () => { current = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!retryAt) return;
    const update = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update(); const timer = setInterval(update, 1000); return () => clearInterval(timer);
  }, [retryAt]);
  useEffect(() => { if (challenge) codeInput.current?.focus(); }, [challenge]);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (auth !== "in") return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") setRefresh(value => value + 1); }, 60000);
    return () => clearInterval(timer);
  }, [auth]);
  useEffect(() => {
    if (auth !== "in") return;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const client = getAdminClient();
        const session = await client?.auth.getSession();
        if (controller.signal.aborted) return;
        if (!session?.data.session) { setAuth("out"); setSnapshot(null); return; }
        const params = new URLSearchParams({ days: String(days), page: String(page), q: query, sort, ...(selected ? { user: selected } : {}) });
        const response = await fetch(`/api/admin?${params}`, { headers: { Authorization: `Bearer ${session.data.session.access_token}` }, cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) { setSnapshot(null); setDenied(response.status === 403); }
          if (response.status === 401) { await client?.auth.signOut({ scope: "local" }); setAuthError("Your session expired. Please request a new email code."); }
          throw new Error(body.error || "Could not load this report.");
        }
        setSnapshot(body); setDenied(false);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load this report.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [auth, days, page, query, sort, selected, refresh]);
  useEffect(() => { if (snapshot?.selected?.user.id === selected && selected) detail.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [snapshot?.selected?.user.id, selected]);

  async function sendCode() {
    if (busy.current || Date.now() < retryAt) return;
    busy.current = true; setPending(true); setAuthError(""); setAuthNotice("");
    try {
      const client = getAdminClient();
      if (!client) throw new Error("unavailable");
      const result = await client.auth.signInWithOtp({ email: SUPERUSER_EMAIL, options: { shouldCreateUser: false } });
      if (result.error) { setAuthError(authErrorMessage(result.error, "send")); return; }
      setChallenge(true); setCode(""); setRetryAt(Date.now() + 60000); setAuthNotice("A sign-in code is on its way. Check your inbox and spam folder.");
    } catch { setAuthError("Couldn’t send a code. Please try again shortly."); }
    finally { busy.current = false; setPending(false); }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) { await sendCode(); return; }
    if (busy.current) return;
    if (!isEmailCode(code)) { setAuthError("Enter the complete code from your email."); return; }
    busy.current = true; setPending(true); setAuthError(""); setAuthNotice("");
    try {
      const client = getAdminClient();
      if (!client) throw new Error("unavailable");
      const result = await verifyEmailCode(client.auth, SUPERUSER_EMAIL, code);
      if (result.error || !result.data.session) { setAuthError(authErrorMessage(result.error, "verify")); return; }
      setCode(""); setChallenge(false); setDenied(false); setAuth("in");
    } catch { setAuthError("Couldn’t verify your code. Please try again."); }
    finally { busy.current = false; setPending(false); }
  }
  async function signOut() {
    setSnapshot(null); setSelected(null); setDenied(false); setAuthError(""); setAuthNotice(""); setChallenge(false); setCode("");
    const result = await getAdminClient()?.auth.signOut({ scope: "local" });
    if (result?.error) { setError("Could not sign out. Please try again."); setRefresh(value => value + 1); return; }
    setAuth("out");
  }

  if (auth !== "in") return <main className={styles.login}>
    <a href={MARKETING_ORIGIN} className={styles.brand}>plizzy<span>.</span><b>ADMIN</b></a>
    <div className={styles.loginCard}><span className={styles.lock}><Icon name="spark" size={30}/></span><span className={styles.eyebrow}>A LITTLE LOOK BEHIND THE PLAY</span><h1>Your playground.<br/>At a glance.</h1><p>Sign in to keep an eye on the people and little worlds that make Plizzy.</p>
      {auth === "checking" ? <p role="status">Checking your session…</p> : <form onSubmit={verify}>
        <label className="field">Superuser email<input type="email" autoComplete="email" value={SUPERUSER_EMAIL} readOnly/></label>
        {challenge && <label className="field">Verification code<input ref={codeInput} type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\s/g, ""))} maxLength={10} minLength={6} pattern="[0-9]{6,10}" required disabled={pending}/></label>}
        {authError && <p className="form-error" role="alert">{authError}</p>}{authNotice && <p className="form-success" role="status">{authNotice}</p>}
        <button className={styles.primary} disabled={pending || !challenge && seconds > 0}>{pending ? "One little moment…" : challenge ? "Verify & open dashboard" : seconds > 0 ? `Send a new code in ${seconds}s` : "Email me a sign-in code"}<Icon name="arrow" size={18}/></button>
        {challenge && <button className={styles.textButton} type="button" onClick={sendCode} disabled={pending || seconds > 0}>{seconds > 0 ? `Resend code in ${seconds}s` : "Resend code"}</button>}
      </form>}
      <small>Restricted to the designated superuser. Sign-in codes are single use.</small>
    </div><a className={styles.backLink} href={APP_ORIGIN}>Back to the Plizzy app <Icon name="arrow" size={16}/></a>
  </main>;

  const totals = snapshot?.totals;
  const maxTrend = Math.max(1, ...snapshot?.trend.flatMap(day => [day.users, day.games]) ?? []);
  const pages = Math.max(1, Math.ceil((snapshot?.matched_users ?? 0) / 20));
  return <div className={styles.shell}>
    <a href="#admin-main" className="skip-link">Skip to dashboard</a>
    <aside className={styles.sidebar}><Link href="/" className={styles.brand}>plizzy<span>.</span><b>ADMIN</b></Link><span className={styles.sideCaption}>YOUR PLAYGROUND PULSE</span><nav aria-label="Admin navigation"><a href="#overview"><Icon name="home" size={19}/>Overview</a><a href="#users"><Icon name="people" size={19}/>People</a><a href="#recent-games"><Icon name="cards" size={19}/>Latest creations</a></nav><div className={styles.sideBottom}><span className={styles.production}><i/> Production</span><p>One playground.<br/>A whole lot of possibility.</p><a href={APP_ORIGIN} target="_blank" rel="noopener noreferrer">Open Plizzy <Icon name="arrow" size={15}/></a></div><div className={styles.account}><span>B</span><div><strong>Superuser</strong><small>{SUPERUSER_EMAIL}</small></div></div><button className={styles.signOut} onClick={signOut}>Sign out</button></aside>
    <main id="admin-main" className={styles.main}>
      <header className={styles.topbar}><span>Plizzy Admin <span>/</span> Overview</span><span className={styles.readonly}>Read-only access</span><button className={styles.mobileSignOut} onClick={signOut}>Sign out</button></header>
      <section className={styles.heading} id="overview"><div><span className={styles.eyebrow}>A LITTLE PLAY. A GROWING WORLD.</span><h1>Good things are growing<span>.</span></h1><p>Your people, their creations, and the pulse of Plizzy.</p></div><div className={styles.controls}><label><span className="sr-only">Trend period</span><select value={days} onChange={event => setDays(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label><button onClick={() => setRefresh(value => value + 1)} disabled={loading} aria-label="Refresh dashboard"><Icon name="spark" size={16}/>{loading ? "Refreshing…" : "Refresh"}</button></div></section>
      <div className={styles.freshness} role="status"><span><i/>{snapshot ? `Updated ${date(snapshot.generated_at, true)} UTC` : "Connecting to production…"}</span><span>Refreshes every minute · Dates in UTC</span></div>
      {error && <div className={styles.error} role="alert">{error}{snapshot && " Showing the last successful report."}<button onClick={() => setRefresh(value => value + 1)} disabled={loading}>Try again</button></div>}
      {denied ? <section className={styles.denied}><h2>This account doesn’t have admin access.</h2><p>Sign in with the designated superuser’s email code to view production reports.</p><button className={styles.primary} onClick={signOut}>Return to sign-in</button></section> : !totals || !snapshot ? <div className={styles.loading} role="status">{loading ? "Gathering your playground’s numbers…" : "Your report will appear here."}</div> : <>
        <div className={styles.stats}>
          {[{ icon: "people" as const, label: "Registered users", value: totals.users, note: `${number(totals.new_users)} joined in ${days} days`, color: styles.purple }, { icon: "cards" as const, label: "Games created", value: totals.games, note: `${number(totals.new_games)} created in ${days} days`, color: styles.mint }, { icon: "spark" as const, label: "People creating", value: totals.creators, note: `${totals.users ? Math.round(totals.creators / totals.users * 100) : 0}% have made a game`, color: styles.peach }, { icon: "compass" as const, label: "Signed in recently", value: totals.signed_in, note: `At least one sign-in in ${days} days`, color: styles.blue }].map(stat => <article key={stat.label} className={styles.stat}><span className={stat.color}><Icon name={stat.icon} size={22}/></span><p>{stat.label}</p><strong>{number(stat.value)}</strong><small>{stat.note}</small></article>)}
        </div>
        <div className={styles.overviewGrid}>
          <section className={styles.panel}><div className={styles.panelTitle}><div><span className={styles.eyebrow}>LITTLE STEPS, EVERY DAY</span><h2>A growing playground</h2></div><span className={styles.legend}><i/>Users <b/>Games</span></div>
            <div className={styles.chart} role="img" aria-label={`Daily new users and games over ${days} days. ${totals.new_users} new users and ${totals.new_games} new games in total.`}>{snapshot.trend.map(day => <div className={styles.chartDay} key={day.day} title={`${day.day} UTC: ${day.users} users, ${day.games} games, ${day.attempts} generation attempts`}><span style={{ height: `${day.users / maxTrend * 100}%` }}/><b style={{ height: `${day.games / maxTrend * 100}%` }}/></div>)}</div><div className={styles.chartAxis}><span>{date(snapshot.trend[0]?.day)}</span><span>{date(snapshot.trend.at(-1)?.day ?? null)}</span></div>
            <details className={styles.chartData}><summary>View daily numbers</summary><div className={styles.tableScroll}><table><caption className="sr-only">Daily activity in UTC</caption><thead><tr><th>Date</th><th>New users</th><th>Games</th><th>Attempts</th></tr></thead><tbody>{snapshot.trend.map(day => <tr key={day.day}><td>{day.day}</td><td>{number(day.users)}</td><td>{number(day.games)}</td><td>{number(day.attempts)}</td></tr>)}</tbody></table></div></details>
          </section>
          <section className={`${styles.panel} ${styles.health}`}><span className={styles.eyebrow}>THE PLAYGROUND CHECK-IN</span><h2>A few useful little numbers</h2><dl><div><dt>Verified emails</dt><dd>{number(totals.verified)}<small> / {number(totals.users)}</small></dd></div><div><dt>Awaiting verification</dt><dd>{number(totals.users - totals.verified)}</dd></div><div><dt>Multiplayer rooms</dt><dd>{number(totals.rooms)}</dd></div><div><dt>Today’s generation attempts</dt><dd>{number(totals.attempts_today)}</dd></div><div><dt>At today’s 3-attempt limit</dt><dd>{number(totals.quota_reached)}<small> users</small></dd></div></dl><p>Generation attempts include unsuccessful requests admitted by the quota. They are not a count of successful games.</p></section>
        </div>
        <section className={styles.panel} id="users"><div className={styles.panelTitle}><div><span className={styles.eyebrow}>THE PEOPLE BEHIND THE PLAY</span><h2>Every creator starts somewhere <span>{number(snapshot.matched_users)}</span></h2></div></div><div className={styles.userControls}><label><Icon name="search" size={18}/><span className="sr-only">Search users by email, name or ID</span><input value={search} maxLength={100} onChange={event => setSearch(event.target.value)} placeholder="Search by email, name or ID" type="search"/></label><label><span className="sr-only">Sort users</span><select value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="newest">Newest first</option><option value="games">Most games</option><option value="signins">Latest sign-in</option></select></label></div>
          <div className={styles.tableScroll}><table className={styles.usersTable} aria-busy={loading}><caption className="sr-only">Production users and all-time creation counts. Select a user for details.</caption><thead><tr><th>Person</th><th>Joined</th><th>Games</th><th>Solo / Multi</th><th>Attempts today</th><th>Last sign-in</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>{snapshot.users.map(user => <tr key={user.id}><td><div className={styles.person}><span>{(user.name || user.email || "?")[0].toUpperCase()}</span><div><strong>{user.name || user.username || "New player"}{user.is_admin && <b>Admin</b>}</strong><small>{user.email ?? "No email"}</small><em className={user.verified ? styles.verified : styles.unverified}>{user.verified ? "Verified" : "Unverified"}</em></div></div></td><td>{date(user.created_at)}</td><td><strong>{number(user.games)}</strong></td><td>{number(user.solo)} / {number(user.multiplayer)}</td><td>{number(user.attempts_today)} <small>/ 3</small></td><td>{date(user.last_sign_in_at)}</td><td><button className={styles.detailButton} aria-label={`View details for ${user.email ?? user.id}`} onClick={() => setSelected(user.id)}>View <Icon name="arrow" size={15}/></button></td></tr>)}</tbody></table>{!snapshot.users.length && <p className={styles.empty}>No people match this search.</p>}</div>
          <div className={styles.pagination}><span>{snapshot.matched_users ? `${(snapshot.page - 1) * 20 + 1}–${Math.min(snapshot.page * 20, snapshot.matched_users)} of ${number(snapshot.matched_users)} people` : "0 people"}</span><div><button disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages || loading} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
        </section>
        {snapshot.selected && <section ref={detail} className={`${styles.panel} ${styles.detail}`} aria-labelledby="person-title"><div className={styles.panelTitle}><div><span className={styles.eyebrow}>A CLOSER LOOK</span><h2 id="person-title">{snapshot.selected.user.name || snapshot.selected.user.username || "Player details"}</h2><p>{snapshot.selected.user.email}</p></div><button className={styles.detailButton} onClick={() => setSelected(null)}>Close <Icon name="close" size={16}/></button></div><code className={styles.userId}>{snapshot.selected.user.id}</code><div className={styles.detailStats}>{[{ label: "Games", value: snapshot.selected.user.games }, { label: "Solo", value: snapshot.selected.user.solo }, { label: "Multiplayer", value: snapshot.selected.user.multiplayer }, { label: "Generation attempts", value: snapshot.selected.user.attempts }, { label: "Rooms hosted", value: snapshot.selected.user.rooms }, { label: "Saved games", value: snapshot.selected.user.saved }].map(item => <div key={item.label}><strong>{number(item.value)}</strong><span>{item.label}</span></div>)}</div><p className={styles.detailDates}>Joined {date(snapshot.selected.user.created_at, true)} UTC · Latest creation: {date(snapshot.selected.user.last_game_at, true)}{snapshot.selected.user.last_game_at ? " UTC" : ""}</p><h3>Latest creations <small>Up to 20, newest first</small></h3><GameList games={snapshot.selected.games}/></section>}
        <div className={styles.bottomGrid}><section className={styles.panel} id="recent-games"><div className={styles.panelTitle}><div><span className={styles.eyebrow}>FRESH FROM THE IMAGINATION</span><h2>Latest creations</h2></div><span className={styles.subtle}>Latest 10 · All time</span></div><GameList games={snapshot.recent_games}/></section><section className={`${styles.panel} ${styles.mix}`}><span className={styles.eyebrow}>ALL KINDS OF PLAY</span><h2>What’s being made?</h2><dl><div><dt><i/>Solo games</dt><dd>{number(totals.solo)}</dd></div><div><dt><i/>Multiplayer games</dt><dd>{number(totals.multiplayer)}</dd></div><div><dt>Public games</dt><dd>{number(totals.public_games)}</dd></div><div><dt>Archived games</dt><dd>{number(totals.archived)}</dd></div><div><dt>Attempts in {days} days</dt><dd>{number(totals.attempts)}</dd></div></dl><p>Game counts include archived games. Sign-in activity measures authentication, not every visit or completed play session.</p></section></div>
      </>}
      <footer className={styles.footer}>Made for a little clarity. <span>Plizzy Admin · Production</span></footer>
    </main>
  </div>;
}
