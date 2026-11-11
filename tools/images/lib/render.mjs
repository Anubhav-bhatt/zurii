/**
 * Responsive renditions. One directory per asset:
 *   /assets/travel/v1/<asset-id>/<width>.avif|webp   the responsive set
 *   /assets/travel/v1/<asset-id>/<width>.jpg         one universal fallback
 *
 * `v1` is the RECIPE version and the asset id ends in the master's content
 * hash, so a file's bytes never change under a given URL — which is what lets
 * nginx serve /assets/ as `immutable` for a year. Change the recipe → bump v1.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { sha256 } from './fetch.mjs';

export const PUBLIC_BASE = '/assets/travel/v1';

/**
 * Write a rendition, refusing to change the bytes of a file that already
 * exists. Published URLs are served `immutable` for a year (nginx.conf,
 * vercel.json), so new bytes at an old URL would leave returning visitors on
 * the old image indefinitely. Identical bytes are fine (a rebuild); different
 * bytes mean the recipe or encoder changed, which needs a new PUBLIC_BASE
 * version (v2), never an overwrite.
 */
export function writeImmutable(file, data) {
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file);
    if (existing.equals(data)) return;
    throw new Error(
      `refusing to change a published file: ${file}. Its bytes would differ (recipe or encoder change?). ` +
        'Bump PUBLIC_BASE to a new version instead of overwriting an immutable URL.'
    );
  }
  fs.writeFileSync(file, data);
}

export const RECIPE = {
  ladder: [320, 640, 960, 1280, 1920], // thumbnail · card · large card · gallery/detail · hero
  heroMaxWidth: 1920,
  standardMaxWidth: 1280,
  fallbackMaxWidth: 1280,
  avif: { quality: 50, effort: 5, chromaSubsampling: '4:2:0' },
  webp: { quality: 76, effort: 5 },
  jpeg: { quality: 80, mozjpeg: true, progressive: true },
};

const EXT = { avif: 'avif', webp: 'webp', jpeg: 'jpg' };

/** Widths an asset gets: the ladder, capped by its role and never upscaled. */
export function widthsFor(group, master) {
  const cap = Math.min(group.hero ? RECIPE.heroMaxWidth : RECIPE.standardMaxWidth, master.width);
  const widths = RECIPE.ladder.filter((w) => w <= cap);
  return widths.length ? widths : [Math.min(master.width, RECIPE.ladder[0])];
}

function record(publicPath, format, info, buffer) {
  return { path: publicPath, format, width: info.width, height: info.height, bytes: buffer.length, sha256: sha256(buffer) };
}

/** Writes every rendition for one asset → the manifest fields for it. */
export async function renderAsset({ id, group, master, publicDir }) {
  const dir = path.join(publicDir, PUBLIC_BASE, id);
  fs.mkdirSync(dir, { recursive: true });

  if (group.kind === 'avatar') {
    const buffer = fs.readFileSync(master.file);
    const publicPath = `${PUBLIC_BASE}/${id}/avatar.svg`;
    writeImmutable(path.join(publicDir, publicPath), buffer);
    return { src: publicPath, width: master.width, height: master.height, widths: [], files: [record(publicPath, 'svg', master, buffer)] };
  }

  const widths = widthsFor(group, master);
  const fallbackWidth = Math.max(...widths.filter((w) => w <= RECIPE.fallbackMaxWidth));
  const source = fs.readFileSync(master.file);
  const files = [];
  const emit = async (width, format) => {
    const { data, info } = await sharp(source, { failOn: 'error' })
      .rotate()
      .resize({ width, withoutEnlargement: true, kernel: 'lanczos3' })
      .toFormat(format, RECIPE[format])
      .toBuffer({ resolveWithObject: true });
    const publicPath = `${PUBLIC_BASE}/${id}/${width}.${EXT[format]}`;
    writeImmutable(path.join(publicDir, publicPath), data);
    files.push(record(publicPath, format, info, data));
    return info;
  };

  let largest;
  for (const width of widths) {
    largest = await emit(width, 'avif');
    await emit(width, 'webp');
  }
  await emit(fallbackWidth, 'jpeg');
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { src: `${PUBLIC_BASE}/${id}/${fallbackWidth}.jpg`, width: largest.width, height: largest.height, widths, files };
}

/** True when a previous manifest entry is still exactly what is on disk. */
export function isCurrent(previous, master, widths, publicDir) {
  if (!previous || previous.source.masterSha256 !== master.sha256) return false;
  if (JSON.stringify(previous.widths) !== JSON.stringify(widths)) return false;
  return previous.files.every((f) => {
    const file = path.join(publicDir, f.path);
    return fs.existsSync(file) && fs.statSync(file).size === f.bytes;
  });
}
