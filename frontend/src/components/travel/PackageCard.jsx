import { Link } from 'react-router-dom';

import SmartImage from '../ui/SmartImage';
import WishlistButton from './WishlistButton';
import { badgeColor } from '../../config/badges';
import { titleCase } from '../../utils/format';

export default function PackageCard({ pkg, priority = false, className = '' }) {
  if (!pkg) return null;

  const destinationLabel = pkg.destination?.name ?? pkg.location;
  const tags = (pkg.tags || []).filter((t) => t !== 'domestic' && t !== 'international').slice(0, 2);

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 transition-[box-shadow,transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)] dark:hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] focus-within:border-zinc-400 dark:focus-within:border-zinc-600 ${className}`}
    >
      <SmartImage
        src={pkg.heroImage}
        alt={pkg.title}
        ratio="aspect-[4/3]"
        priority={priority}
        sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
        imgClassName="transition-transform duration-500 ease-out group-hover:scale-[1.04]"
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />

        {pkg.badge && (
          <span
            className={`absolute left-3 top-3 rounded-full bg-gradient-to-r px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white ${badgeColor(pkg.badge)}`}
          >
            {pkg.badge}
          </span>
        )}

        <WishlistButton
          slug={pkg.slug}
          title={pkg.title}
          variant="overlay"
          className="absolute right-3 top-3 z-20"
        />

        {pkg.duration && (
          <span className="absolute bottom-3 left-3 rounded-full border border-white/20 dark:border-zinc-700/60 bg-white/90 dark:bg-zinc-900/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 backdrop-blur-md">
            {pkg.duration}
          </span>
        )}
      </SmartImage>

      <div className="flex flex-1 flex-col p-5">
        {destinationLabel && (
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">{destinationLabel}</p>
        )}

        <h3 className="text-[17px] font-bold leading-snug tracking-tight text-zinc-950 dark:text-zinc-100">
          <Link
            to={`/trip/${pkg.slug}`}
            className="rounded after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100"
          >
            {pkg.title}
          </Link>
        </h3>

        {tags.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li
                key={tag}
                className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300"
              >
                {titleCase(tag)}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div>
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">From</span>
            <span className="text-lg font-bold tracking-tight text-zinc-950 dark:text-zinc-100">{pkg.price ?? 'On request'}</span>
            {pkg.originalPrice && (
              <span className="ml-1.5 text-xs text-zinc-400 line-through">{pkg.originalPrice}</span>
            )}
          </div>

          <span className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            View Trip
            <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5">
              →
            </span>
          </span>
        </div>
      </div>
    </article>
  );
}
