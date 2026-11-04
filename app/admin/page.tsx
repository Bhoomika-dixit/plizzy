import type { Metadata } from "next";
import AdminDashboard from "./dashboard";

export const metadata: Metadata = {
  title: "Plizzy Admin — Your playground, at a glance",
  robots: { index: false, follow: false },
  manifest: null,
  appleWebApp: false,
  referrer: "no-referrer",
};

export default function AdminPage() {
  return <AdminDashboard/>;
}
