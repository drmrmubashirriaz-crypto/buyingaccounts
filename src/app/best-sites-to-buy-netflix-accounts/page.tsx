import type { Metadata } from "next";
import ListingGuidePage from "@/components/ListingGuidePage";
import { netflixListing } from "@/content/listings/netflix";

export const metadata: Metadata = {
  title: netflixListing.title,
  description: netflixListing.metaDescription,
  alternates: {
    canonical: `/${netflixListing.slug}`,
  },
  openGraph: {
    title: netflixListing.title,
    description: netflixListing.metaDescription,
    type: "article",
  },
};

export default function Page() {
  return <ListingGuidePage guide={netflixListing} />;
}
