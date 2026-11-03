"use client";
import PlayArt from "./play-art";
import styles from "./penguin-loader.module.css";
type Stage="planning"|"building"|"testing"|"publishing";
const labels:Record<Stage,{title:string;description:string}>={planning:{title:"Finding the fun in your idea",description:"Giving your little world a plan."},building:{title:"Bringing it all together",description:"A few little pieces, a whole lot of possibility."},testing:{title:"A little play check",description:"Checking the rules before you jump in."},publishing:{title:"Saving your little world",description:"Nearly time to play."}};
/** A waiting state. Stages are shown only when explicitly reported by the caller. */
export default function PenguinLoader({stage,label}:{stage?:Stage;label?:string}){return <div className={styles.wrap} role="status" aria-live="polite"><PlayArt/><div><strong>{label??(stage?labels[stage].title:"A little idea is becoming a game…")}</strong><p>{stage?labels[stage].description:"This can take a minute. Good things are coming together."}</p><span className={styles.dots} aria-hidden="true"><i/><i/><i/></span></div></div>;}
