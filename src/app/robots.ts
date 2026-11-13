import type { MetadataRoute } from "next";

const SITE =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://buyingaccounts.apps.grok.bot";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/pay/"],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
