import type { Metadata } from "next";
import ListingGuidePage from "@/components/ListingGuidePage";
import { semrushListing } from "@/content/listings/semrush";

export const metadata: Metadata = {
  title: semrushListing.title,
  description: semrushListing.metaDescription,
  alternates: {
    canonical: `/${semrushListing.slug}`,
  },
  openGraph: {
    title: semrushListing.title,
    description: semrushListing.metaDescription,
    type: "article",
  },
};

export default function BestSitesToBuySemrushAccountsPage() {
  return <ListingGuidePage guide={semrushListing} />;
}
