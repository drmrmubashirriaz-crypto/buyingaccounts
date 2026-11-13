import { codmListing } from "./codm";
import { discordListing } from "./discord";
import { fortniteListing } from "./fortnite";
import { netflixListing } from "./netflix";
import { semrushListing } from "./semrush";
import { snapchatListing } from "./snapchat";
import { steamListing } from "./steam";
import type { ListingGuide } from "./types";

export type {
  ListingFaq,
  ListingGuide,
  ListingGuideExtras,
  ListingPriceBand,
  ListingRelatedGuide,
  ListingSite,
} from "./types";

/**
 * Registry for data-driven guide roll-out.
 * Add a module + append here; each guide also needs an app route
 * (or a future dynamic [slug] page).
 */
export const listingGuides: ListingGuide[] = [
  discordListing,
  codmListing,
  fortniteListing,
  netflixListing,
  snapchatListing,
  steamListing,
  semrushListing,
];

export function getListingBySlug(slug: string): ListingGuide | undefined {
  return listingGuides.find((g) => g.slug === slug);
}
