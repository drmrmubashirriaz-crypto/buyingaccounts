import Link from "next/link";
import type { ListingGuide } from "@/content/listings/types";

export default function ListingGuidePage({ guide }: { guide: ListingGuide }) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <div className="ba-atmosphere absolute inset-0" />
      <div className="ba-noise absolute inset-0" />
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 animate-drift rounded-full bg-signal/25 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-40 h-80 w-80 animate-drift rounded-full bg-ember/15 blur-3xl [animation-delay:4s]" />

      <header className="relative z-10 mx-auto flex w-full max-w-3xl items-center justify-between px-5 pb-2 pt-6 sm:pt-10">
        <Link href="/" className="group">
          <div className="font-display text-2xl tracking-tight text-ink-950 sm:text-3xl">
            BuyingAccounts
          </div>
          <div className="mt-0.5 text-xs tracking-[0.18em] text-ink-700/45 uppercase">
            buyingaccounts.com
          </div>
        </Link>
        <nav className="flex items-center gap-4 text-xs text-ink-700/50">
          <Link href="/" className="transition hover:text-ink-900">
            Chat
          </Link>
          <span className="text-ink-700/30" aria-hidden>
            /
          </span>
          <span className="text-ink-900">Guides</span>
        </nav>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-4 pb-16 sm:px-5">
        <article className="animate-fade-up pt-6 sm:pt-8">
          <p className="text-[11px] uppercase tracking-[0.16em] text-signal-dim">
            Editorial guide · {guide.product}
          </p>
          <h1 className="mt-2 max-w-2xl font-display text-[1.65rem] leading-[1.15] text-ink-950 sm:text-4xl">
            {guide.h1}
          </h1>

          <div className="mt-4 max-w-2xl space-y-3 text-sm leading-relaxed text-ink-700/75 sm:text-base">
            {guide.intro.map((p) => (
              <p key={p.slice(0, 48)}>{p}</p>
            ))}
          </div>

          <p className="mt-4 max-w-2xl rounded-2xl bg-white/45 px-4 py-3 text-xs leading-relaxed text-ink-700/60 ring-1 ring-ink-900/8 sm:text-[13px]">
            {guide.disclaimer}
          </p>

          <div className="mt-8 overflow-hidden rounded-3xl bg-white/55 shadow-chat ring-1 ring-ink-900/10 backdrop-blur-md">
            <div className="border-b border-ink-900/8 px-4 py-3 sm:px-5">
              <h2 className="font-display text-lg text-ink-950 sm:text-xl">
                Comparison
              </h2>
              <p className="mt-0.5 text-xs text-ink-700/50">
                Not paid ads — editorial shortlist for {guide.product}-type
                listings.
              </p>
            </div>

            {/* Mobile: stacked rows */}
            <ul className="divide-y divide-ink-900/8 sm:hidden">
              {guide.sites.map((site) => (
                <li key={site.name} className="px-4 py-4">
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-display text-base text-ink-950 underline-offset-2 hover:underline"
                  >
                    {site.name}
                  </a>
                  <p className="mt-2 text-sm text-ink-800">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-ink-700/40">
                      Why listed
                    </span>
                    <br />
                    {site.whyListed}
                  </p>
                  <p className="mt-2 text-sm text-ink-700/70">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-ink-700/40">
                      Notes
                    </span>
                    <br />
                    {site.notes}
                  </p>
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-900/8 text-[11px] uppercase tracking-[0.12em] text-ink-700/45">
                    <th className="px-5 py-3 font-medium">Site</th>
                    <th className="px-5 py-3 font-medium">Why listed</th>
                    <th className="px-5 py-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-900/8">
                  {guide.sites.map((site) => (
                    <tr key={site.name} className="align-top">
                      <td className="px-5 py-4">
                        <a
                          href={site.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-display text-base text-ink-950 underline-offset-2 hover:underline"
                        >
                          {site.name}
                        </a>
                      </td>
                      <td className="max-w-[14rem] px-5 py-4 text-ink-800">
                        {site.whyListed}
                      </td>
                      <td className="max-w-[16rem] px-5 py-4 text-ink-700/70">
                        {site.notes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="mt-8 animate-fade-up rounded-3xl bg-ink-900 px-5 py-6 text-mist-50 shadow-chat sm:px-7 sm:py-8 [animation-delay:120ms]">
            <h2 className="font-display text-xl sm:text-2xl">
              {guide.cta.headline}
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-mist-100/70 sm:text-base">
              {guide.cta.body}
            </p>
            <Link
              href={guide.cta.href}
              className="mt-5 inline-flex items-center justify-center rounded-xl bg-signal px-5 py-3 text-sm font-medium text-ink-950 transition hover:bg-signal-glow"
            >
              {guide.cta.buttonLabel}
            </Link>
          </aside>
        </article>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-8 text-xs text-ink-700/40">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-900/8 pt-4">
          <Link href="/" className="transition hover:text-ink-900">
            Home / chat
          </Link>
          <Link
            href={`/${guide.slug}`}
            className="transition hover:text-ink-900"
          >
            This guide
          </Link>
          <span className="ml-auto">BuyingAccounts · editorial guides</span>
        </div>
      </footer>
    </div>
  );
}
