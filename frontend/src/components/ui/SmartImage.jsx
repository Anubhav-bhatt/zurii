import { useState } from 'react';

import ResponsiveImage from './ResponsiveImage';

/**
 * Image with a reserved aspect-ratio box, so nothing shifts while it loads.
 *
 * Locally hosted catalogue photographs are served responsively (AVIF/WebP
 * `srcSet` + `sizes`, intrinsic dimensions) by ResponsiveImage; any other
 * source renders as a plain image. Without a `src`, or once every source has
 * failed, a neutral placeholder is shown instead of a broken-image icon or a
 * collapsed box — an empty box reads as "the page is broken".
 *
 *   ratio     any Tailwind aspect class, e.g. "aspect-[4/3]"
 *   sizes     the rendered width (defaults to the full viewport — pass the
 *             real slot width for cards and thumbnails)
 *   priority  true only for the LCP image; everything else loads lazily
 */
export default function SmartImage({
  src,
  alt,
  ratio = 'aspect-[4/3]',
  className = '',
  imgClassName = '',
  priority = false,
  sizes,
  children,
}) {
  // Keyed by `src`: a card reused for a different image must try again.
  const [failedSrc, setFailedSrc] = useState(null);
  const showImage = Boolean(src) && failedSrc !== src;

  return (
    <div className={`relative overflow-hidden bg-zinc-100 dark:bg-zinc-800 ${ratio} ${className}`}>
      {showImage ? (
        <ResponsiveImage
          src={src}
          alt={alt}
          sizes={sizes}
          priority={priority}
          onError={() => setFailedSrc(src)}
          className={`absolute inset-0 h-full w-full object-cover ${imgClassName}`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900">
          <span aria-hidden="true" className="text-3xl opacity-30">🏔️</span>
          <span className="sr-only">{alt || 'Image unavailable'}</span>
        </div>
      )}
      {children}
    </div>
  );
}
