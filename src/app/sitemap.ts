import type { MetadataRoute } from "next";
import { listingGuides } from "@/content/listings";

const SITE =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://buyingaccounts.apps.grok.bot";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: `${SITE}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE}/guides`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    ...listingGuides.map((guide) => ({
      url: `${SITE}/${guide.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
