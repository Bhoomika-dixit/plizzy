"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FooterNav from "@/app/components/footer-nav";
import { getSupabaseClient } from "@/lib/supabase/client";
import styles from "./rooms.module.css";

type Room = { id: string; name: string; invite_code: string; host_id: string; created_at: string };
type Count = { room_id: string };

export default function RoomsHome() {
  const [rooms, setRooms] = useState<Room[]>([]); const [counts, setCounts] = useState<Record<string, number>>({}); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { async function load() { const supabase = getSupabaseClient(); if (!supabase) { setError("Supabase is not connected yet."); setLoading(false); return; } const { data: { user } } = await supabase.auth.getUser(); if (!user) { setError("Sign in to see your rooms."); setLoading(false); return; } const { data: memberships, error: memberError } = await supabase.from("room_members").select("room_id").eq("user_id", user.id); if (memberError) { setError(memberError.message); setLoading(false); return; } const ids = (memberships as Count[] ?? []).map((row) => row.room_id); if (!ids.length) { setLoading(false); return; } const [{ data: roomRows, error: roomsError }, { data: allMembers }] = await Promise.all([supabase.from("rooms").select("id, name, invite_code, host_id, created_at").in("id", ids).order("created_at", { ascending: false }), supabase.from("room_members").select("room_id").in("room_id", ids)]); if (roomsError) setError(roomsError.message); else { setRooms(roomRows as Room[] ?? []); const next: Record<string, number> = {}; (allMembers as Count[] ?? []).forEach((row) => { next[row.room_id] = (next[row.room_id] ?? 0) + 1; }); setCounts(next); } setLoading(false); } void load(); }, []);
  return <main className="footer-demo"><section className={`footer-phone ${styles.phone}`}><div className={styles.content}><div className={styles.topline}><p className="small-wordmark">plizzy</p><Link href="/footer/create" className={styles.create}>+ Create</Link></div><p className={styles.eyebrow}>PLAY TOGETHER</p><h1>Your rooms</h1><p className={styles.intro}>A home for your game nights, big ideas, and favourite people.</p>{loading && <p className={styles.loading}>Loading your rooms…</p>}{error && <p className="form-error">{error}</p>}{!loading && !error && rooms.length === 0 && <div className={styles.empty}><span>♟</span><h2>No rooms yet</h2><p>Create a multiplayer game and its room will appear here automatically.</p><Link href="/footer/create">Create multiplayer game</Link></div>}<div className={styles.list}>{rooms.map((room, index) => <Link href={`/footer/rooms/${room.id}`} className={`${styles.room} ${index % 2 ? styles.pink : ""}`} key={room.id}><div className={styles.roomIcon}>{index % 2 ? "🎉" : "🎲"}</div><div><h2>{room.name}</h2><p>{counts[room.id] ?? 0} {counts[room.id] === 1 ? "member" : "members"} · invite only</p></div><span>→</span></Link>)}</div></div><FooterNav active="rooms" /></section></main>;
}
