"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useState} from "react";
import {getSupabaseClient} from "@/lib/supabase/client";
import Icon from "./ui-icon";
import styles from "./app-header.module.css";
type Profile={display_name:string|null;avatar_url:string|null};
export default function AppHeader({backHref}:{backHref?:string}){
const path=usePathname();const [profile,setProfile]=useState<Profile|null>(null);
useEffect(()=>{let alive=true;async function load(){const supabase=getSupabaseClient();if(!supabase)return;const {data:{user}}=await supabase.auth.getUser();if(!user)return;const fallback=typeof user.user_metadata.display_name==="string"?user.user_metadata.display_name:null;const {data}=await supabase.from("profiles").select("display_name, avatar_url").eq("id",user.id).maybeSingle();if(alive)setProfile({display_name:data?.display_name??fallback,avatar_url:data?.avatar_url??null});}void load();return()=>{alive=false;};},[]);
const name=profile?.display_name?.trim()||"Player";const section=path.startsWith("/create-game")?"Creation studio":path.startsWith("/play/")?"Your playground":path==="/profile"?"Your corner":path.startsWith("/footer/rooms/")?"Game room":path.includes("/create")?"Creation studio":path.includes("/discover")?"A little inspiration":path.includes("/library")?"Your collection":path.includes("/rooms")?"Better together":"Your daily playground";
return <header className={styles.header}><div className={styles.left}>{backHref&&<Link href={backHref} className="icon-button" aria-label="Go back"><Icon name="back"/></Link>}<Link href="/footer/home" className={styles.mobileBrand}>plizzy<span>.</span></Link><span className={styles.breadcrumb}><span className={styles.statusDot}/>{section}</span></div><div className={styles.right}><span className={styles.greeting}>Hey, {name.split(" ")[0]} <span>✦</span></span><Link href="/profile" className={styles.avatar} style={profile?.avatar_url?{backgroundImage:"url("+profile.avatar_url+")"}:undefined} aria-label="Open profile">{profile?.avatar_url?null:name.charAt(0).toUpperCase()}</Link></div></header>;
}
