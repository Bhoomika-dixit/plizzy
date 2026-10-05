import Link from "next/link";

const items = [
  { name: "Home", href: "/footer/home", icon: "home" },
  { name: "Discover", href: "/footer/discover", icon: "search" },
  { name: "Create", href: "/footer/create", icon: "plus" },
  { name: "Rooms", href: "/footer/rooms", icon: "rooms" },
  { name: "Library", href: "/footer/library", icon: "library" },
] as const;

function Icon({ name }: { name: (typeof items)[number]["icon"] }) {
  if (name === "home") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z" /></svg>;
  if (name === "search") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.8" /><path d="m15 15 4.5 4.5" /></svg>;
  if (name === "plus") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16" /></svg>;
  if (name === "rooms") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9" r="3" /><circle cx="16.5" cy="10.5" r="2.3" /><path d="M3.5 20c.6-3.4 2.6-5.2 5.5-5.2s4.9 1.8 5.5 5.2M14 15.2c3 0 4.8 1.6 5.2 4.8" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14v15H5z" /><path d="M8 7h8M8 10h8M8 13h5" /></svg>;
}

export default function FooterNav({ active }: { active?: string }) {
  return <nav className="footer-nav" aria-label="Main navigation">
    {items.map((item) => <Link href={item.href} className={active === item.name.toLowerCase() ? "footer-item active" : "footer-item"} key={item.name}>
      <Icon name={item.icon} /><span>{item.name}</span>
    </Link>)}
  </nav>;
}
