// Resolve the canonical base URL for the site.
// In production, set NEXT_PUBLIC_SITE_URL=https://preyam-rao.vercel.app.

function resolveSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://preyam-rao.vercel.app";
}

export const SITE_URL = resolveSiteUrl();
export const SITE_TITLE = "The Preyam Broadsheet";
export const SITE_DESCRIPTION =
  "Software engineer working on prediction markets, AI tools, and low-latency systems.";
export const AUTHOR = "Preyam Rao";
export const AUTHOR_EMAIL = "preyam2002@gmail.com";
