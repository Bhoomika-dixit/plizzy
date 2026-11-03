"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import AppHeader from "./app-header";
import FooterNav from "./footer-nav";
import Icon from "./ui-icon";
import PlayArt from "./play-art";
export default function AppShell({children}:{children:React.ReactNode}){
const path=usePathname();const active=path.startsWith("/create-game")?"create":path.startsWith("/play/")?"library":path.split("/")[2]??"home";
return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a><aside className="app-sidebar"><Link href="/footer/home" className="brand-lockup" aria-label="Plizzy home"><span className="brand-symbol"><Icon name="spark" size={25}/></span><span>plizzy<span className="brand-dot">.</span></span></Link><p className="sidebar-caption">A LITTLE PLAY, EVERY DAY</p><FooterNav active={active} variant="side"/><div className="sidebar-spark"><PlayArt/><strong>Big fun starts small.</strong><p>One idea. A whole new world.</p><Link href="/footer/create">Make something <Icon name="arrow" size={16}/></Link></div><Link className={"sidebar-profile "+(path==="/profile"?"is-active":"")} href="/profile"><Icon name="settings" size={20}/>Profile & settings</Link><span className="sidebar-footnote">Made for your imagination ✦</span></aside><div className="app-body"><AppHeader/><main id="main-content" className="app-content">{children}</main><footer className="app-footnote">A little imagination goes a long way.<span>Made with Plizzy</span></footer></div><FooterNav active={active}/></div>;
}
