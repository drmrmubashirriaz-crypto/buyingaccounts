/** Shape for SEO “best sites” guide pages. Add one module per product later. */

export type ListingSite = {
  name: string;
  url: string;
  whyListed: string;
  notes: string;
};

export type ListingFaq = {
  question: string;
  answer: string;
};

export type ListingPriceBand = {
  /** Short tier label, e.g. "Shared seat / month" */
  tier: string;
  /** Human range, e.g. "$8–$25" */
  range: string;
  note?: string;
};

export type ListingRelatedGuide = {
  slug: string;
  label: string;
};

/**
 * Optional enrichment blocks. Semrush / Snapchat-style pages fill these;
 * thinner guides can omit and the template skips the section.
 */
export type ListingGuideExtras = {
  /** ISO date string YYYY-MM-DD */
  lastUpdated: string;
  whoItsFor: string[];
  buyerChecklist: string[];
  scamRedFlags: string[];
  priceSnapshot: {
    summary: string;
    bands: ListingPriceBand[];
  };
  howChatCompares: {
    headline: string;
    body: string;
    points: string[];
  };
  faqs: ListingFaq[];
  relatedGuides: ListingRelatedGuide[];
};

export type ListingGuide = {
  /** URL path without leading slash, e.g. best-sites-to-buy-semrush-accounts */
  slug: string;
  product: string;
  title: string;
  metaDescription: string;
  h1: string;
  intro: string[];
  disclaimer: string;
  sites: ListingSite[];
  cta: {
    headline: string;
    body: string;
    buttonLabel: string;
    href: string;
  };
} & Partial<ListingGuideExtras>;
