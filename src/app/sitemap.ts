import type { MetadataRoute } from "next";
import { getAllDispatches } from "@/lib/dispatches";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const dispatches = getAllDispatches();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/dispatches`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...dispatches.map((d) => ({
      url: `${SITE_URL}/dispatches/${d.slug}`,
      lastModified: new Date(d.date),
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
  ];
}
