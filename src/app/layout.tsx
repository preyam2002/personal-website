import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Preyam Rao",
  description:
    "Software Engineer. Ex-Oracle. Patent filed. $140K grant recipient. Building distributed systems at scale.",
  keywords: [
    "software engineer",
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
    title: "Preyam Rao",
    description: "Software Engineer. Ex-Oracle. Patent filed. $140K grant recipient.",
    type: "website",
    locale: "en_US",
    siteName: "Preyam Rao",
  },
  twitter: {
    card: "summary_large_image",
    title: "Preyam Rao",
    description: "Software Engineer. Ex-Oracle. Patent filed.",
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
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#ffffff" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="min-h-screen bg-white text-neutral-900">
        {children}
      </body>
    </html>
  );
}
