import FooterNav from "@/app/components/footer-nav";
import { notFound } from "next/navigation";

const pageNames = ["home", "discover", "create", "rooms", "library"] as const;

export function generateStaticParams() {
  return pageNames.map((pageName) => ({ pageName }));
}

export default async function FooterDestinationPage({ params }: PageProps<"/footer/[pageName]">) {
  const { pageName } = await params;
  if (!pageNames.includes(pageName as (typeof pageNames)[number])) notFound();
  const title = `${pageName.charAt(0).toUpperCase()}${pageName.slice(1)}`;

  return <main className="footer-demo"><section className="footer-phone"><div className="footer-page-copy"><p className="small-wordmark">plizzy</p><h1>This is {title}</h1><p>Welcome to the {title} page.</p></div><FooterNav active={pageName} /></section></main>;
}
