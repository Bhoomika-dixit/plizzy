"use client";

import Link from "next/link";
import AppHeader from "@/app/components/app-header";
import FooterNav from "@/app/components/footer-nav";
import styles from "./home.module.css";

export default function SignedInHome() {
  return <main className="footer-demo"><section className={`footer-phone ${styles.phone}`}><AppHeader /><div className={styles.content}><p className={styles.eyebrow}>MAKE A LITTLE MAGIC</p><h1>What shall we play today?</h1><p className={styles.intro}>Create a game from a tiny idea, then bring your favourite people along.</p><Link href="/footer/create" className={styles.create}><span>+</span><div><strong>Create a game</strong><small>Turn your idea into play</small></div><b>→</b></Link><div className={styles.tiles}><Link href="/footer/rooms"><span>♟</span><strong>Game night</strong><small>Meet in a room</small></Link><Link href="/footer/library"><span>✦</span><strong>Your library</strong><small>Play your creations</small></Link></div><div className={styles.tip}><span>💡</span><p><strong>Try a tiny twist</strong> “A detective game, but everyone is a suspect.”</p></div></div><FooterNav active="home" /></section></main>;
}
