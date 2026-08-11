import { Link } from 'react-router-dom';

import Container from '../ui/Container';
import SectionHeader from '../ui/SectionHeader';
import SmartImage from '../ui/SmartImage';
import Button from '../ui/Button';
import { DataBoundary } from '../ui/States';
import { Skeleton } from '../ui/Skeleton';
import { badgeColor } from '../../config/badges';

/**
 * Popular trips, presented differently from Featured on purpose: one large
 * editorial panel plus a compact ranked list, instead of a second card grid.
 * Same data source (`popular` in the database), different treatment.
 */
export default function TrendingTrips({ packages = [], loading, error, onRetry }) {
  const [lead, ...rest] = packages;
  const list = rest.slice(0, 4);

  return (
    <section aria-labelledby="trending-trips" className="bg-zinc-950">
      <Container className="section-gap">
        <SectionHeader
          id="trending-trips"
          eyebrow="Trending now"
          title="Special & Seasonal Trips"
          description="The departures filling up fastest this season."
          className="[&_h2]:text-white [&_p]:text-zinc-400"
          action={{ label: 'See all', to: '/packages?popular=true' }}
        />

        <DataBoundary
          loading={loading}
          error={error}
          onRetry={onRetry}
          isEmpty={!lead}
          empty={{ title: 'Nothing trending right now.', action: { label: 'Browse all trips', to: '/packages' } }}
          skeleton={
            <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]" role="status" aria-label="Loading trips">
              <Skeleton className="h-72 rounded-2xl lg:h-[26rem]" />
              <div className="space-y-3">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
              </div>
              <span className="sr-only">Loading trips…</span>
            </div>
          }
        >
          {/* Guarded, not merely gated by isEmpty: `children` is a prop, so
              JSX builds this subtree BEFORE DataBoundary decides whether to
              render it. Dereferencing `lead` here while packages are still
              loading threw and blanked the whole homepage. */}
          {lead && (
          <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
            {/* Lead trip */}
            {/* This section is bg-zinc-950 in BOTH themes, so the focus ring
                keeps the light-on-dark shade unconditionally — the neutral
                zinc-900/20 half would be invisible here. */}
            <article className="group relative overflow-hidden rounded-2xl focus-within:ring-2 focus-within:ring-zinc-100/20 focus-within:ring-offset-2 focus-within:ring-offset-zinc-950">
              <SmartImage
                src={lead.heroImage}
                alt={lead.title}
                ratio="aspect-[4/3] lg:aspect-[16/11]"
                imgClassName="transition-transform duration-[600ms] ease-out group-hover:scale-[1.03]"
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
                  {lead.badge && (
                    <span
                      className={`mb-3 inline-block rounded-full bg-gradient-to-r px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white ${badgeColor(lead.badge)}`}
                    >
                      {lead.badge}
                    </span>
                  )}

                  <h3 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    <Link
                      to={`/trip/${lead.slug}`}
                      className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                    >
                      {lead.title}
                    </Link>
                  </h3>

                  <p className="mt-2 max-w-lg text-sm text-white/75 line-clamp-2">{lead.tagline}</p>

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-white/85">
                    {lead.duration && <span>{lead.duration}</span>}
                    {lead.price && (
                      <span className="font-semibold text-white">
                        From {lead.price}
                        {lead.originalPrice && (
                          <span className="ml-1.5 text-xs font-normal text-white/50 line-through">
                            {lead.originalPrice}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </SmartImage>
            </article>

            {/* Ranked list */}
            <ul className="flex flex-col gap-2.5">
              {list.map((pkg, index) => (
                <li key={pkg.slug}>
                  <Link
                    to={`/trip/${pkg.slug}`}
                    className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 transition-colors duration-200 hover:border-white/25 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-100/20"
                  >
                    <span className="w-4 shrink-0 text-center text-sm font-bold text-white/35">{index + 2}</span>

                    <SmartImage
                      src={pkg.heroImage}
                      alt=""
                      ratio="aspect-square"
                      className="w-16 shrink-0 rounded-lg sm:w-20"
                      imgClassName="transition-transform duration-500 group-hover:scale-105"
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{pkg.title}</span>
                      <span className="mt-0.5 block text-xs text-white/55">
                        {[pkg.destination?.name, pkg.duration].filter(Boolean).join(' · ')}
                      </span>
                      {pkg.price && (
                        <span className="mt-1 block text-xs font-semibold text-white/90">From {pkg.price}</span>
                      )}
                    </span>

                    <span
                      aria-hidden="true"
                      className="shrink-0 text-white/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-white"
                    >
                      →
                    </span>
                  </Link>
                </li>
              ))}

              <li className="mt-1.5">
                <Button
                  to="/packages?popular=true"
                  variant="secondaryOnDark"
                  size="md"
                  className="w-full"
                >
                  View all trending trips
                </Button>
              </li>
            </ul>
          </div>
          )}
        </DataBoundary>
      </Container>
    </section>
  );
}
