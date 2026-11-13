/** Shape for SEO “best sites” guide pages. Add one module per product later. */

export type ListingSite = {
  name: string;
  url: string;
  whyListed: string;
  notes: string;
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
};
