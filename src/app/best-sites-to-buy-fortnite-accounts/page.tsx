import type { Metadata } from "next";
import ListingGuidePage from "@/components/ListingGuidePage";
import { fortniteListing } from "@/content/listings/fortnite";

export const metadata: Metadata = {
  title: fortniteListing.title,
  description: fortniteListing.metaDescription,
  alternates: {
    canonical: `/${fortniteListing.slug}`,
  },
  openGraph: {
    title: fortniteListing.title,
    description: fortniteListing.metaDescription,
    type: "article",
  },
};

export default function Page() {
  return <ListingGuidePage guide={fortniteListing} />;
}
