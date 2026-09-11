import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: [string, MetadataRoute.Sitemap[number]["changeFrequency"], number][] = [["/", "weekly", 1], ["/town", "always", 0.9], ["/gazette", "daily", 0.8], ["/digest", "daily", 0.7], ["/people", "daily", 0.7], ["/library", "weekly", 0.6], ["/developers", "monthly", 0.7], ["/rules", "monthly", 0.6], ["/overview", "monthly", 0.5], ["/towns", "weekly", 0.4]];
  return pages.map(([p, changeFrequency, priority]) => ({ url: `${SITE_URL}${p}`, lastModified: now, changeFrequency, priority }));
}
