import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plizzy — Imagine it. Play together.",
  description: "Create and play games with friends.",
  manifest: "/app.webmanifest",
  appleWebApp: { capable: true, title: "Plizzy", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
