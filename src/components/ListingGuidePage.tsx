import Link from "next/link";
import type { ListingGuide } from "@/content/listings/types";

function formatUpdated(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function ListingGuidePage({ guide }: { guide: ListingGuide }) {
  const hasRich =
    Boolean(guide.whoItsFor?.length) ||
    Boolean(guide.buyerChecklist?.length) ||
    Boolean(guide.scamRedFlags?.length) ||
    Boolean(guide.priceSnapshot) ||
    Boolean(guide.howChatCompares) ||
    Boolean(guide.faqs?.length);

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
          <Link href="/guides" className="text-ink-900 transition hover:underline">
            Guides
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-4 pb-16 sm:px-5">
        <article className="animate-fade-up pt-6 sm:pt-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-[11px] uppercase tracking-[0.16em] text-signal-dim">
              Editorial guide · {guide.product}
            </p>
            {guide.lastUpdated ? (
              <p className="text-[11px] text-ink-700/40">
                Updated {formatUpdated(guide.lastUpdated)}
              </p>
            ) : null}
          </div>
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

          {guide.whoItsFor && guide.whoItsFor.length > 0 ? (
            <section className="mt-8">
              <h2 className="font-display text-lg text-ink-950 sm:text-xl">
                Who this guide is for
              </h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-700/75 sm:text-[15px]">
                {guide.whoItsFor.map((item) => (
                  <li key={item.slice(0, 40)} className="flex gap-2.5">
                    <span
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-signal"
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="mt-8 overflow-hidden rounded-3xl bg-white/55 shadow-chat ring-1 ring-ink-900/10 backdrop-blur-md">
            <div className="border-b border-ink-900/8 px-4 py-3 sm:px-5">
              <h2 className="font-display text-lg text-ink-950 sm:text-xl">
                Comparison
              </h2>
              <p className="mt-0.5 text-xs text-ink-700/50">
                Standalone niche shops only — not marketplace aggregators.
                Order is editorial, not paid placement.
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

          {guide.priceSnapshot ? (
            <section className="mt-8">
              <h2 className="font-display text-lg text-ink-950 sm:text-xl">
                Price-range snapshot
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-700/70 sm:text-[15px]">
                {guide.priceSnapshot.summary}
              </p>
              <ul className="mt-4 divide-y divide-ink-900/8 overflow-hidden rounded-2xl bg-white/50 ring-1 ring-ink-900/8">
                {guide.priceSnapshot.bands.map((band) => (
                  <li
                    key={band.tier}
                    className="flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink-900">
                        {band.tier}
                      </p>
                      {band.note ? (
                        <p className="mt-0.5 text-xs text-ink-700/55">
                          {band.note}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 font-display text-base text-ink-950 sm:text-lg">
                      {band.range}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {guide.buyerChecklist && guide.buyerChecklist.length > 0 ? (
            <section className="mt-8">
              <h2 className="font-display text-lg text-ink-950 sm:text-xl">
                Buyer checklist
              </h2>
              <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-ink-700/75 sm:text-[15px]">
                {guide.buyerChecklist.map((item) => (
                  <li key={item.slice(0, 40)} className="pl-1">
                    {item}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {guide.scamRedFlags && guide.scamRedFlags.length > 0 ? (
            <section className="mt-8">
              <h2 className="font-display text-lg text-ink-950 sm:text-xl">
                Scam red flags
              </h2>
              <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-700/75 sm:text-[15px]">
                {guide.scamRedFlags.map((item) => (
                  <li key={item.slice(0, 40)} className="flex gap-2.5">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ember"
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {guide.howChatCompares ? (
            <section className="mt-8 rounded-3xl bg-white/50 px-4 py-5 ring-1 ring-ink-900/8 sm:px-6 sm:py-6">
              <h2 className="font-display text-lg text-ink-950 sm:text-xl">
                {guide.howChatCompares.headline}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-700/70 sm:text-[15px]">
                {guide.howChatCompares.body}
              </p>
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-ink-800 sm:text-[15px]">
                {guide.howChatCompares.points.map((point) => (
                  <li key={point.slice(0, 40)} className="flex gap-2.5">
                    <span
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-signal"
                      aria-hidden
                    />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {guide.faqs && guide.faqs.length > 0 ? (
            <section className="mt-8">
              <h2 className="font-display text-lg text-ink-950 sm:text-xl">
                FAQ
              </h2>
              <div className="mt-3 divide-y divide-ink-900/8 border-t border-ink-900/8">
                {guide.faqs.map((faq) => (
                  <details
                    key={faq.question}
                    className="group py-3.5 open:pb-4"
                  >
                    <summary className="cursor-pointer list-none text-sm font-medium text-ink-900 marker:content-none sm:text-[15px] [&::-webkit-details-marker]:hidden">
                      <span className="flex items-start justify-between gap-3">
                        {faq.question}
                        <span
                          className="mt-0.5 shrink-0 text-ink-700/35 transition group-open:rotate-45"
                          aria-hidden
                        >
                          +
                        </span>
                      </span>
                    </summary>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-700/70">
                      {faq.answer}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          ) : null}

          {guide.relatedGuides && guide.relatedGuides.length > 0 ? (
            <section className="mt-8">
              <h2 className="font-display text-lg text-ink-950 sm:text-xl">
                Related guides
              </h2>
              <ul className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {guide.relatedGuides.map((rel) => (
                  <li key={rel.slug}>
                    <Link
                      href={`/${rel.slug}`}
                      className="inline-flex rounded-xl bg-white/55 px-3.5 py-2 text-sm text-ink-900 ring-1 ring-ink-900/8 transition hover:bg-white/80 hover:ring-ink-900/15"
                    >
                      {rel.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

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

          {hasRich && guide.lastUpdated ? (
            <p className="mt-6 text-[11px] text-ink-700/40">
              Editorial shortlist last reviewed {formatUpdated(guide.lastUpdated)}.
              Links and pricing on third-party shops change without notice.
            </p>
          ) : null}
        </article>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-8 text-xs text-ink-700/40">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-900/8 pt-4">
          <Link href="/" className="transition hover:text-ink-900">
            Home / chat
          </Link>
          <Link href="/guides" className="transition hover:text-ink-900">
            All guides
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
