import type { Metadata } from "next";
import Icon from "../components/ui-icon";
import PlayArt from "../components/play-art";
import IphoneGuide from "./iphone-guide";
import { APP_ORIGIN, MARKETING_ORIGIN } from "@/lib/site";
import styles from "./welcome.module.css";

export const metadata: Metadata = {
  title: "Plizzy — A little idea. A whole lot of play.",
  description: "Turn your ideas into games with Plizzy. Create with AI, play solo or with friends, and keep your favourite little worlds in one place.",
  alternates: { canonical: MARKETING_ORIGIN },
  openGraph: { title: "Plizzy — A little idea. A whole lot of play.", description: "Your imagination, now playable. Make a game and bring your people.", url: MARKETING_ORIGIN, siteName: "Plizzy", type: "website" },
  robots: { index: true, follow: true },
  manifest: null,
  appleWebApp: false,
};

const ideas = [
  { kind: "cards" as const, tag: "A LITTLE BRAIN TICKLE", title: "An ocean of matching pairs.", text: "Turn a memory game into a tiny underwater adventure.", color: styles.mint },
  { kind: "planet" as const, tag: "SOME FRIENDLY COMPETITION", title: "Big questions. Little orbit.", text: "Bring your people for a space quiz and a little friendly rivalry.", color: styles.lavender },
  { kind: "puzzle" as const, tag: "ONE CURIOUS LITTLE MYSTERY", title: "Your very own clue club.", text: "Make a scene, follow the clues, and work it out together.", color: styles.peach },
];

export default function WelcomePage() {
  return <div className={styles.page} id="top">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className={styles.header}>
      <a href="#top" className={styles.logo} aria-label="Plizzy home"><span className={styles.logoIcon}><Icon name="spark" size={23}/></span>plizzy<span>.</span></a>
      <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#get-plizzy">Get Plizzy</a></nav>
      <a href={APP_ORIGIN} className={styles.headerCta}>Open the app <Icon name="arrow" size={17}/></a>
    </header>

    <main id="main-content">
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <div className={styles.heroPill}><span/> A LITTLE PLAY, EVERY DAY <span className={styles.beta}>BETA</span></div>
          <h1 id="hero-title">A little idea.<br/>A whole lot<br/>of <span>play.</span><svg viewBox="0 0 170 18" aria-hidden="true"><path d="M4 12Q80-3 165 9M22 17q72-10 122-4"/></svg></h1>
          <p>Your what-ifs deserve a world of their own. Turn an idea into a game with a little AI magic, then play solo or bring your people.</p>
          <a className={styles.primary} href={APP_ORIGIN}>Let’s make a little fun <Icon name="arrow" size={21}/></a>
          <div className={styles.heroNote}><Icon name="check" size={16}/> No code. Just your imagination.</div>
        </div>
        <div className={styles.heroArt} aria-hidden="true">
          <div className={styles.artOrbit}/><div className={styles.artGlow}/>
          <div className={styles.ideaBubble}><span>✦</span> “What if we played…”<i/></div>
          <PlayArt className={styles.heroSpark}/>
          <div className={styles.miniCard}><div><span>YOUR NEXT LITTLE WORLD</span><strong>Ocean pairs</strong><small>Made from a little imagination.</small></div><div className={styles.miniTiles}><span>🐠</span><span>🐙</span><span>🐙</span><span>🐠</span></div><div className={styles.miniFooter}><span><i/> READY WHEN YOU ARE</span><b><Icon name="play" size={14}/> Let’s play</b></div></div>
          <span className={styles.floatingNote}><Icon name="people" size={18}/> Better with your people</span>
          <span className={styles.sparkleOne}>✦</span><span className={styles.sparkleTwo}>✧</span>
        </div>
      </section>

      <section id="how-it-works" className={styles.how} aria-labelledby="how-title">
        <div className={styles.sectionIntro}><span className={styles.eyebrow}>FROM “WHAT IF” TO “ONE MORE ROUND”</span><h2 id="how-title">You bring the spark.<br/>We’ll bring it to life.</h2><p>A small break from the everyday. Made a little more you.</p></div>
        <ol className={styles.steps}>
          <li><span className={styles.stepNumber}>01</span><div className={styles.stepIcon}><Icon name="spark" size={25}/></div><h3>Dream something up.</h3><p>A space quiz? An ocean of pairs? Tell Plizzy the idea and who’s coming to play.</p></li>
          <li><span className={styles.stepNumber}>02</span><div className={styles.stepIcon}><Icon name="cards" size={25}/></div><h3>Make it a little world.</h3><p>Plizzy turns your prompt into a playable game. Your creation finds a home in your library.</p></li>
          <li><span className={styles.stepNumber}>03</span><div className={styles.stepIcon}><Icon name="people" size={25}/></div><h3>Play your way.</h3><p>Enjoy your own little escape, or open a multiplayer room and share an invite with friends.</p></li>
        </ol>
      </section>

      <section className={styles.worlds} aria-labelledby="worlds-title">
        <div className={styles.worldsHeading}><div><span className={styles.eyebrow}>A FEW PLACES YOUR IMAGINATION COULD GO</span><h2 id="worlds-title">Small ideas. Big possibilities.</h2></div><span>What will you dream up?</span></div>
        <div className={styles.ideaGrid}>{ideas.map(idea => <article className={`${styles.ideaCard} ${idea.color}`} key={idea.kind}><PlayArt kind={idea.kind}/><div><span className={styles.eyebrow}>{idea.tag}</span><h3>{idea.title}</h3><p>{idea.text}</p></div></article>)}</div>
      </section>

      <section id="get-plizzy" className={styles.get} aria-labelledby="get-title">
        <div className={styles.sectionIntro}><span className={styles.eyebrow}>MAKE A LITTLE ROOM FOR PLAY</span><h2 id="get-title">Your next little adventure.<br/>One tap away.</h2><p>Start in your browser today. Keep us close on your phone, too.</p></div>
        <div className={styles.accessGrid}>
          <article className={`${styles.accessCard} ${styles.webCard}`}><div className={styles.accessIcon}><Icon name="compass" size={29}/></div><span className={styles.accessLabel}>THE WEB APP</span><h3>Jump right in.</h3><p>All your ideas, games, and favourite people. Ready in your browser.</p><a href={APP_ORIGIN}>Open Plizzy <Icon name="arrow" size={19}/></a><small>app.plizzy.in</small></article>
          <article className={styles.accessCard}><div className={`${styles.accessIcon} ${styles.androidIcon}`}><Icon name="play" size={29}/></div><span className={styles.accessLabel}>GOOGLE PLAY</span><h3>A little more pocket-sized.</h3><p>Our Android app is on the way. You can play in your browser while you wait.</p><button type="button" disabled aria-label="Google Play download coming soon">Play Store <span>Coming soon</span></button><small>Good things take a little time.</small></article>
          <IphoneGuide/>
        </div>
      </section>
      <section className={styles.closing}><Icon name="spark" size={28}/><h2>Some of the best things<br/>start with a little play.</h2><a href={APP_ORIGIN} className={styles.primary}>Find your kind of fun <Icon name="arrow" size={20}/></a></section>
    </main>
    <footer className={styles.footer}><a href="#top" className={styles.logo}>plizzy<span>.</span></a><p>A little play, every day.</p><a href={APP_ORIGIN}>See you in the app <Icon name="arrow" size={17}/></a></footer>
  </div>;
}
