import { TRAVEL_IMAGE_BASE, TRAVEL_IMAGES } from '../data/travelImages.generated';

// A catalogue image is stored as the path of its universal JPEG, e.g.
//   /assets/travel/v1/dest-bali-592e3f05/1280.jpg
// Its AVIF/WebP renditions sit beside it, one file per width.
const LOCAL_ASSET = new RegExp(`^${TRAVEL_IMAGE_BASE}/([a-z0-9-]+)/\\d+\\.jpg$`);
const FORMATS = [
  ['image/avif', 'avif'],
  ['image/webp', 'webp'],
];

/**
 * What an <img> needs to render `src` responsively.
 *
 * Only assets listed in the generated manifest get `sources` — a rendition is
 * never guessed at, because a missing file on the static host answers with the
 * SPA's index.html rather than a 404. Anything else (a remote URL an admin
 * pasted, an SVG, an asset from a newer pipeline run) comes back as a plain
 * `src`, which still renders.
 */
export function resolveImage(src) {
  if (!src) return null;
  const id = LOCAL_ASSET.exec(src)?.[1];
  const entry = id ? TRAVEL_IMAGES[id] : undefined;
  if (!entry) return { src, sources: [] };

  const [width, height, ...widths] = entry;
  const sources = FORMATS.map(([type, ext]) => ({
    type,
    srcSet: widths.map((w) => `${TRAVEL_IMAGE_BASE}/${id}/${w}.${ext} ${w}w`).join(', '),
  }));
  return { src, width, height, sources };
}
