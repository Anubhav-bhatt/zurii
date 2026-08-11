import { useState } from 'react';

/**
 * Image with a fixed aspect ratio, lazy loading and a graceful failure.
 *
 * Every travel image on the site goes through this, which gets three things
 * right in one place: the box is reserved before the image arrives (no layout
 * shift), off-screen images are not fetched, and a dead URL renders a neutral
 * placeholder instead of a broken-image icon.
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
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className={`relative overflow-hidden bg-zinc-100 dark:bg-zinc-800 ${ratio} ${className}`}>
      {showImage ? (
        <img
          src={src}
          alt={alt}
          sizes={sizes}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding={priority ? 'sync' : 'async'}
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover ${imgClassName}`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900">
          <span aria-hidden="true" className="text-3xl opacity-30">
            🏔️
          </span>
          <span className="sr-only">{alt || 'Image unavailable'}</span>
        </div>
      )}
      {children}
    </div>
  );
}
