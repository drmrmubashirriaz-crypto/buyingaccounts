import type { Metadata } from "next";
import ListingGuidePage from "@/components/ListingGuidePage";
import { codmListing } from "@/content/listings/codm";

export const metadata: Metadata = {
  title: codmListing.title,
  description: codmListing.metaDescription,
  alternates: {
    canonical: `/${codmListing.slug}`,
  },
  openGraph: {
    title: codmListing.title,
    description: codmListing.metaDescription,
    type: "article",
  },
};

export default function Page() {
  return <ListingGuidePage guide={codmListing} />;
}
