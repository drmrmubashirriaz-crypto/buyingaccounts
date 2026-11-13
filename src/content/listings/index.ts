import { semrushListing } from "./semrush";
import type { ListingGuide } from "./types";

export type { ListingGuide, ListingSite } from "./types";

/**
 * Registry for data-driven guide roll-out.
 * Ship one product now; add modules and append here later
 * (or generate routes from this list).
 */
export const listingGuides: ListingGuide[] = [semrushListing];

export function getListingBySlug(slug: string): ListingGuide | undefined {
  return listingGuides.find((g) => g.slug === slug);
}
