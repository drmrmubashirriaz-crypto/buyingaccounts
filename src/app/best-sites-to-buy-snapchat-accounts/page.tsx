import type { Metadata } from "next";
import ListingGuidePage from "@/components/ListingGuidePage";
import { snapchatListing } from "@/content/listings/snapchat";

export const metadata: Metadata = {
  title: snapchatListing.title,
  description: snapchatListing.metaDescription,
  alternates: {
    canonical: `/${snapchatListing.slug}`,
  },
  openGraph: {
    title: snapchatListing.title,
    description: snapchatListing.metaDescription,
    type: "article",
  },
};

export default function BestSitesToBuySnapchatAccountsPage() {
  return <ListingGuidePage guide={snapchatListing} />;
}
