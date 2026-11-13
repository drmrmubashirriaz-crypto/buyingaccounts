import type { Metadata } from "next";
import ListingGuidePage from "@/components/ListingGuidePage";
import { steamListing } from "@/content/listings/steam";

export const metadata: Metadata = {
  title: steamListing.title,
  description: steamListing.metaDescription,
  alternates: {
    canonical: `/${steamListing.slug}`,
  },
  openGraph: {
    title: steamListing.title,
    description: steamListing.metaDescription,
    type: "article",
  },
};

export default function Page() {
  return <ListingGuidePage guide={steamListing} />;
}
