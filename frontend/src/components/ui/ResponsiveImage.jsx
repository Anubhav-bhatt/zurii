import { useState } from 'react';

import { resolveImage } from '../../utils/travelImages';
import { capDensity } from '../../utils/imageSizes';

/**
 * An <img> that serves locally hosted travel photographs as AVIF or WebP at
 * the width the layout actually needs, with a JPEG every browser can read.
 *
 *   sizes      the rendered width, as for <img sizes> — pass it wherever the
 *              image is not full-bleed, or the browser assumes 100vw and
 *              downloads a file far larger than the slot.
 *   priority   true only for an image visible on first paint (the LCP
 *              candidate): eager, high fetch priority. Everything else is lazy.
 *   intrinsic  false to omit width/height — for the rare image sized by
 *              max-width/max-height alone, where fixed attributes would stop
 *              the browser preserving its aspect ratio.
 *
 * Failure falls back in two steps: a rendition that will not load is retried
 * as the plain JPEG, and only if that fails too is `onError` called.
 */
export default function ResponsiveImage({
  src,
  alt = '',
  sizes = '100vw',
  priority = false,
  intrinsic = true,
  loading,
  fetchPriority,
  className,
  onError,
  ...rest
}) {
  // Keyed by `src` so a component reused for another image starts clean.
  const [plainFor, setPlainFor] = useState(null);

  const image = resolveImage(src);
  if (!image) return null;

  const sources = plainFor === src ? [] : image.sources;
  const size = intrinsic && image.width ? { width: image.width, height: image.height } : {};

  const handleError = (event) => {
    if (sources.length > 0) {
      setPlainFor(src);
      return;
    }
    onError?.(event);
  };

  const img = (
    <img
      {...rest}
      {...size}
      src={image.src}
      alt={alt}
      loading={loading ?? (priority ? 'eager' : 'lazy')}
      fetchPriority={fetchPriority ?? (priority ? 'high' : undefined)}
      decoding={priority ? 'sync' : 'async'}
      onError={handleError}
      className={className}
    />
  );

  if (sources.length === 0) return img;

  // `contents` keeps <picture> out of the layout, so the <img> is positioned
  // and sized exactly as a bare <img> would be.
  return (
    <picture className="contents">
      {/* Dense (≥2.5×) screens choose renditions as a 2× screen would — see utils/imageSizes.js. */}
      {sources.map((source) => (
        <source key={source.type} type={source.type} srcSet={source.srcSet} sizes={capDensity(sizes)} />
      ))}
      {img}
    </picture>
  );
}
