import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Preyam Rao | Backend Engineer",
  description:
    "Backend Engineer at Lumora Social. Ex-Oracle. Patent filed. $140K grant recipient. Building distributed systems at scale.",
  keywords: [
    "software engineer",
    "backend engineer",
    "distributed systems",
    "preyam rao",
    "oracle",
    "iit kharagpur",
    "kubernetes",
    "microservices",
    "postgresql",
    "java",
    "typescript",
  ],
  authors: [{ name: "Preyam Rao" }],
  creator: "Preyam Rao",
  openGraph: {
    title: "Preyam Rao | Backend Engineer",
    description: "Backend Engineer. Ex-Oracle. Patent filed. $140K grant recipient.",
    type: "website",
    locale: "en_US",
    siteName: "Preyam Rao",
  },
  twitter: {
    card: "summary_large_image",
    title: "Preyam Rao | Backend Engineer",
    description: "Backend Engineer. Ex-Oracle. Patent filed.",
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
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <meta name="theme-color" content="#0a0a0a" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="flex flex-col min-h-screen font-[family-name:var(--font-inter)]">
        {children}
      </body>
    </html>
  );
}
