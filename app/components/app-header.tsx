"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import styles from "./app-header.module.css";

type Profile = { display_name: string | null; avatar_url: string | null };

export default function AppHeader({ backHref }: { backHref?: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => { async function load() { const supabase = getSupabaseClient(); if (!supabase) return; const { data: { user } } = await supabase.auth.getUser(); if (!user) return; const fallback = typeof user.user_metadata.display_name === "string" ? user.user_metadata.display_name : null; const { data } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle(); setProfile({ display_name: data?.display_name ?? fallback, avatar_url: data?.avatar_url ?? null }); } void load(); }, []);
  const name = profile?.display_name?.trim() || "Player";
  return <header className={styles.header}><div className={styles.brandGroup}>{backHref && <Link href={backHref} className={styles.back} aria-label="Go back">‹</Link>}<Link href="/footer/home" className={styles.brand}>plizzy</Link></div><Link href="/profile" className={styles.avatar} style={profile?.avatar_url ? { backgroundImage: `url(${profile.avatar_url})` } : undefined} aria-label="Open profile">{profile?.avatar_url ? null : name.charAt(0).toUpperCase()}</Link></header>;
}
