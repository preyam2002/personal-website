import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Fraunces,
  Newsreader,
  JetBrains_Mono,
} from "next/font/google";
import Keybindings from "@/components/Keybindings";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-observatory",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Preyam Rao",
  description:
    "Engineer for markets, protocols, and intelligent systems.",
  keywords: [
    "preyam rao",
    "software engineer",
    "prediction markets",
    "sui move",
    "protocol security",
    "low latency systems",
    "ai tools",
  ],
  authors: [{ name: "Preyam Rao" }],
  creator: "Preyam Rao",
  openGraph: {
    title: "Preyam Rao",
    description: "Engineer for markets, protocols, and intelligent systems.",
    type: "website",
    locale: "en_US",
    siteName: "Preyam Rao",
  },
  twitter: {
    card: "summary_large_image",
    title: "Preyam Rao",
    description: "Engineer for markets, protocols, and intelligent systems.",
    creator: "@preyam2002",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${newsreader.variable} ${jetbrains.variable} ${bricolage.variable}`}
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#1544ff" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Preyam Rao — Dispatches"
          href="/feed.xml"
        />
      </head>
      <body className="min-h-screen">
        {children}
        <Keybindings />
      </body>
    </html>
  );
}
