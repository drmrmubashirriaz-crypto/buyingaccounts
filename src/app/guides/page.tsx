import type { Metadata } from "next";
import Link from "next/link";
import { listingGuides } from "@/content/listings";

export const metadata: Metadata = {
  title: "Guides — Best sites to buy accounts | BuyingAccounts",
  description:
    "Editorial best-sites guides for Discord, CODM, Fortnite, Netflix, Steam, Semrush, and more — with marketplace comparison tables and chat quotes.",
};

export default function GuidesIndexPage() {
  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <div className="ba-atmosphere absolute inset-0" />
      <div className="ba-noise absolute inset-0" />

      <header className="relative z-10 mx-auto flex w-full max-w-3xl items-center justify-between px-5 pb-2 pt-6 sm:pt-10">
        <Link href="/" className="group">
          <div className="font-display text-2xl tracking-tight text-ink-950 sm:text-3xl">
            BuyingAccounts
          </div>
          <div className="mt-0.5 text-xs tracking-[0.18em] text-ink-700/45 uppercase">
            buyingaccounts.com
          </div>
        </Link>
        <Link
          href="/"
          className="text-xs text-ink-700/50 transition hover:text-ink-900"
        >
          Chat
        </Link>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-4 pb-16 sm:px-5">
        <div className="animate-fade-up pt-6 sm:pt-8">
          <p className="text-[11px] uppercase tracking-[0.16em] text-signal-dim">
            Editorial guides
          </p>
          <h1 className="mt-2 font-display text-[1.65rem] text-ink-950 sm:text-4xl">
            Best sites to buy accounts
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-700/70 sm:text-base">
            Short comparison pages with deep links into marketplace seller
            catalogs — plus a chat quote if you want BuyingAccounts to source
            for you.
          </p>

          <ul className="mt-8 divide-y divide-ink-900/8 overflow-hidden rounded-3xl bg-white/55 shadow-chat ring-1 ring-ink-900/10 backdrop-blur-md">
            {listingGuides.map((g) => (
              <li key={g.slug}>
                <Link
                  href={`/${g.slug}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-white/70"
                >
                  <span>
                    <span className="block font-display text-lg text-ink-950">
                      {g.product}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-700/60">
                      {g.h1}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-signal-dim">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
