/**
 * The Zurii mark, pre-scaled for the size it is actually shown at.
 *
 * The original upload is a 1024×1024 image (257 KB) that every page scaled
 * down to 36 px. These renditions are that same image resampled to 36 px at
 * 1–4× pixel density, losslessly encoded — identical on screen at a fraction
 * of the bytes. Built by tools/images/logo.mjs; see docs/IMAGE_ASSETS.md.
 *
 * It is a coloured mark on an opaque white background, so it is never
 * inverted for dark mode: that produced a featureless white box.
 */
const BASE = '/assets/brand/v1/zurii-logo';
const DENSITIES = [36, 72, 108, 144];
const srcSet = (ext) => DENSITIES.map((px, index) => `${BASE}-${px}.${ext} ${index + 1}x`).join(', ');
const WEBP = srcSet('webp');
const PNG = srcSet('png');

export default function BrandLogo({ className = '', priority = false }) {
  return (
    <picture className="contents">
      <source type="image/webp" srcSet={WEBP} />
      <img
        src={`${BASE}-72.png`}
        srcSet={PNG}
        alt="Zurii"
        width="36"
        height="36"
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={className}
      />
    </picture>
  );
}
