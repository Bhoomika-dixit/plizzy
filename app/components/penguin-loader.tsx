"use client";

import styles from "./penguin-loader.module.css";

type Stage = "planning" | "building" | "testing" | "publishing";
const steps: { key: Stage; title: string; description: string }[] = [
  { key: "planning", title: "Dreaming up the rules", description: "Plizzy is shaping your idea into a game." },
  { key: "building", title: "Building your game", description: "Putting the pieces together." },
  { key: "testing", title: "Checking the fun", description: "Making sure the game can be played." },
  { key: "publishing", title: "Wrapping it up", description: "Getting your game ready to share." },
];

/**
 * Visual waiting state, NOT a fabricated progress indicator.
 * Only supply stage when the backend actually reports it.
 */
export default function PenguinLoader({ stage, label }: { stage?: Stage; label?: string }) {
  const selected = steps.find(item => item.key === stage);
  return (
    <div className={styles.wrap} role="status" aria-live="polite" aria-label={label ?? selected?.title ?? "Plizzy is creating your game"}>
      <div className={styles.bubbles} aria-hidden="true"><i /><i /><i /></div>
      <div className={styles.penguin} aria-hidden="true">
        <span className={styles.flipperLeft} /><span className={styles.flipperRight} />
        <span className={styles.face}><span className={styles.eyes}><i /><i /></span><span className={styles.beak} /></span>
        <span className={styles.feet}><i /><i /></span>
      </div>
      <p className={styles.title}>{label ?? selected?.title ?? "Plizzy is cooking your game…"}</p>
      <p className={styles.description}>{selected?.description ?? "This can take a little while. Your penguin is on it!"}</p>
      <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
}
