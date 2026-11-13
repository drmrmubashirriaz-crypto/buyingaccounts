import type { Metadata } from "next";
import ListingGuidePage from "@/components/ListingGuidePage";
import { discordListing } from "@/content/listings/discord";

export const metadata: Metadata = {
  title: discordListing.title,
  description: discordListing.metaDescription,
  alternates: {
    canonical: `/${discordListing.slug}`,
  },
  openGraph: {
    title: discordListing.title,
    description: discordListing.metaDescription,
    type: "article",
  },
};

export default function Page() {
  return <ListingGuidePage guide={discordListing} />;
}
