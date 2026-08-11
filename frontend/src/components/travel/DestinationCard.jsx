import { Link } from 'react-router-dom';

import SmartImage from '../ui/SmartImage';

/**
 * Image-first destination card. `size="lg"` is the same component at a taller
 * aspect ratio, which is how the destinations grid gets its large/small mix
 * without a second component or a masonry library.
 *
 * The text sits on a gradient scrim rather than a translucent panel, so the
 * photograph stays the dominant element while contrast stays readable.
 */
// `railItem` is consumed by CardRail (li classes); accepted here only so it
// never leaks onto the <article> as an unknown DOM attribute.
// eslint-disable-next-line no-unused-vars
export default function DestinationCard({ destination, size = 'md', priority = false, className = '', railItem }) {
  if (!destination) return null;

  const { slug, name, country, region, kind, packageCount } = destination;

  // For domestic destinations `country` is always 'India', so the region (when
  // known) is the more informative label; international cards show the region.
  const context = kind === 'domestic' ? region || country : region || country;

  // Uniform 4/3 below sm so rail slides align; the taller editorial crop
  // only applies once the grid (and its col/row spans) exists.
  const ratio = size === 'lg' ? 'aspect-[4/3] sm:aspect-[3/4]' : 'aspect-[4/3]';

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl bg-zinc-900 transition-transform duration-300 hover:-translate-y-0.5 focus-within:ring-2 focus-within:ring-zinc-100 focus-within:ring-offset-2 dark:ring-offset-zinc-950 ${className}`}
    >
      <SmartImage
        src={destination.thumbnail}
        alt={`Travel to ${name}`}
        ratio={`${ratio} h-full`}
        priority={priority}
        sizes={size === 'lg' ? '(min-width: 1024px) 50vw, 100vw' : '(min-width: 1024px) 25vw, 50vw'}
        imgClassName="transition-transform duration-[600ms] ease-out group-hover:scale-105"
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent transition-opacity duration-300 group-hover:from-black/85" />

        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          {context && (
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">{context}</p>
          )}

          <h3 className={`font-bold tracking-tight text-white ${size === 'lg' ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>
            <Link
              to={`/destination/${slug}`}
              className="rounded after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {name}
            </Link>
          </h3>

          <div className="mt-2 flex items-center gap-2.5">
            {packageCount > 0 && (
              <span className="text-xs font-medium text-white/80">
                {packageCount} {packageCount === 1 ? 'trip' : 'trips'}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-white">
              Explore Trips
              <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
                →
              </span>
            </span>
          </div>
        </div>
      </SmartImage>
    </article>
  );
}
