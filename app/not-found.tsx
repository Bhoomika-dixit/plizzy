import Link from "next/link";
import PlayArt from "./components/play-art";
import Icon from "./components/ui-icon";
export default function NotFound(){return <main className="lost-page"><div><PlayArt kind="planet"/><p className="eyebrow">A LITTLE OFF THE MAP</p><h1>This world is still a what-if.</h1><p>Let’s get you back to somewhere full of possibility.</p><Link href="/footer/home" className="button">Back to your playground <Icon name="arrow" size={17}/></Link></div></main>;}
