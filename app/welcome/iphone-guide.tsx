"use client";

import { useRef } from "react";
import Icon from "../components/ui-icon";
import { APP_ORIGIN } from "@/lib/site";
import styles from "./welcome.module.css";

function PhoneIcon() {
  return <svg width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4m-3 14h2"/></svg>;
}

export default function IphoneGuide() {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <article className={styles.accessCard}>
      <div className={`${styles.accessIcon} ${styles.iphoneIcon}`}><PhoneIcon/></div><span className={styles.accessLabel}>FOR YOUR IPHONE</span><h3>Keep a little fun close.</h3><p>We’re not in the App Store yet. Add Plizzy from Safari for a handy Home Screen shortcut.</p>
      <button type="button" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">Add to iPhone <Icon name="plus" size={18}/></button><small>No App Store download needed.</small>
    </article>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="iphone-title" aria-describedby="iphone-description" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <button type="button" className={styles.dialogClose} aria-label="Close iPhone instructions" onClick={() => dialog.current?.close()}><Icon name="close" size={21}/></button>
      <div className={`${styles.accessIcon} ${styles.iphoneIcon}`}><PhoneIcon/></div>
      <span className={styles.eyebrow}>A LITTLE SHORTCUT TO PLAY</span><h2 id="iphone-title">Make room for Plizzy<br/>on your iPhone.</h2><p id="iphone-description">Add the web app to your Home Screen. You’ll get a Plizzy icon that opens the app.</p>
      <ol className={styles.iphoneSteps}>
        <li><span>1</span><div><strong>Open Plizzy in Safari.</strong><p>On your iPhone, visit <a href={APP_ORIGIN}>app.plizzy.in</a> in Safari.</p></div></li>
        <li><span>2</span><div><strong>Find Share.</strong><p>Tap Safari’s Share button, or open its menu and choose Share.</p></div></li>
        <li><span>3</span><div><strong>Add it to your Home Screen.</strong><p>Choose Add to Home Screen. If it’s missing, look under Edit Actions.</p></div></li>
        <li><span>4</span><div><strong>Give it a home.</strong><p>Keep Open as Web App on if shown, then tap Add. Your shortcut is ready.</p></div></li>
      </ol>
      <a href={APP_ORIGIN} className={styles.primary}>Open Plizzy <Icon name="arrow" size={19}/></a>
      <a className={styles.appleHelp} href="https://support.apple.com/guide/iphone/iphea86e5236/ios" target="_blank" rel="noopener noreferrer">Safari instructions from Apple ↗</a>
    </dialog>
  </>;
}
