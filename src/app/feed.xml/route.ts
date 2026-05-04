import { NextResponse } from "next/server";
import { getAllDispatches } from "@/lib/dispatches";
import { SITE_URL, SITE_TITLE, SITE_DESCRIPTION, AUTHOR_EMAIL } from "@/lib/site";

export const dynamic = "force-static";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const dispatches = getAllDispatches();
  const buildDate = new Date().toUTCString();

  const items = dispatches
    .map((d) => {
      const url = `${SITE_URL}/dispatches/${d.slug}`;
      const pubDate = new Date(d.date).toUTCString();
      return `    <item>
      <title>${escapeXml(d.title)}</title>
      <description>${escapeXml(d.dek)}</description>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate}</pubDate>
      ${(d.tags ?? [])
        .map((t) => `<category>${escapeXml(t)}</category>`)
        .join("\n      ")}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_TITLE)} — Dispatches</title>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <link>${SITE_URL}/dispatches</link>
    <language>en-us</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <managingEditor>${AUTHOR_EMAIL} (Preyam Rao)</managingEditor>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=3600",
    },
  });
}
