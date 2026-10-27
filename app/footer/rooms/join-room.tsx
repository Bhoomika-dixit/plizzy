"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { multiplayerRequest } from "@/lib/multiplayer/client";
import styles from "./rooms.module.css";

export default function JoinRoom({ invite = "" }: { invite?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(invite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function join(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await multiplayerRequest({ action: "join", code: code.trim() }); router.push(`/footer/rooms/${result.roomId}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not join room."); setBusy(false); }
  }
  return <form className={styles.join} onSubmit={join}><label htmlFor="invite-code">Have an invite?</label><div><input id="invite-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Enter invite code" maxLength={100} required /><button disabled={busy || !code.trim()}>{busy ? "Joining…" : "Join room"}</button></div>{error && <p role="alert">{error} <Link href={`/?next=${encodeURIComponent(`/footer/rooms?invite=${encodeURIComponent(code)}`)}`}>Sign in</Link></p>}</form>;
}
