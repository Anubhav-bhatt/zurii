#!/usr/bin/env node
/**
 * Brand logo renditions:  node logo.mjs
 *
 * The master (frontend/public/zurii-logo.png — a 1024×1024 JPEG despite its
 * name) is resampled to the 36 px it is displayed at, for 1–4× pixel density,
 * and encoded LOSSLESSLY (WebP + PNG fallback) so nothing about its appearance
 * changes. The master itself is left in place, untouched.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from './lib/sources.mjs';
import { sha256 } from './lib/fetch.mjs';
import { writeImmutable } from './lib/render.mjs';

const PUBLIC_DIR = path.join(ROOT, 'frontend/public');
const MASTER = '/zurii-logo.png';
const BASE = '/assets/brand/v1';
const SIZES = [36, 72, 108, 144];
const ENCODERS = { webp: { lossless: true, effort: 6 }, png: { compressionLevel: 9, palette: false } };

const master = fs.readFileSync(path.join(PUBLIC_DIR, MASTER));
const meta = await sharp(master).metadata();
fs.mkdirSync(path.join(PUBLIC_DIR, BASE), { recursive: true });

const files = [];
for (const size of SIZES) {
  for (const [format, options] of Object.entries(ENCODERS)) {
    const { data, info } = await sharp(master).resize(size, size, { kernel: 'lanczos3' }).toFormat(format, options).toBuffer({ resolveWithObject: true });
    const publicPath = `${BASE}/zurii-logo-${size}.${format}`;
    // Same rule as the travel renditions: never new bytes at a published URL.
    writeImmutable(path.join(PUBLIC_DIR, publicPath), data);
    files.push({ path: publicPath, format, width: info.width, height: info.height, bytes: data.length, sha256: sha256(data) });
  }
}

fs.writeFileSync(path.join(import.meta.dirname, 'manifest/brand-manifest.v1.json'), `${JSON.stringify({
  name: 'zurii-brand-assets', version: 1, publicBase: BASE, publicDir: 'frontend/public',
  master: { path: MASTER, actualFormat: meta.format, width: meta.width, height: meta.height, bytes: master.length, sha256: sha256(master), note: 'Kept in place and unmodified; no page loads it any more.' },
  displayedAt: '32–36 CSS px square (header, footer, mobile drawer)',
  encoding: { resample: 'lanczos3', ...ENCODERS },
  files,
}, null, 2)}\n`);
console.log(`master ${meta.format} ${meta.width}x${meta.height} ${master.length} B → ${files.map((f) => `${path.basename(f.path)} ${f.bytes} B`).join(' · ')}`);
