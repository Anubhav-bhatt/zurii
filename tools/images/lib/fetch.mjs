/**
 * Guarded downloader. Only exact, allow-listed HTTPS hosts; redirects are
 * refused rather than followed; the body is size-capped while streaming and
 * must be the expected type by header AND by content before it is kept.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ALLOWED_HOSTS = new Set(['images.unsplash.com', 'api.dicebear.com']);
const USER_AGENT = 'zurii-image-pipeline/1.0';
const LIMITS = {
  photo: { maxBytes: 12 * 1024 * 1024, minWidth: 600, maxSide: 8000, type: /^image\/jpeg\b/ },
  avatar: { maxBytes: 200 * 1024, type: /^image\/svg\+xml\b/ },
};

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** The exact URL fetched for a source: a high-quality JPEG master, never upscaled. */
export function masterUrl(group) {
  if (group.kind === 'avatar') return `https://${group.identifier}`;
  return `https://${group.identifier}?fm=jpg&q=90&w=2000&fit=max`;
}

async function readCapped(response, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes) throw new Error(`body exceeds ${maxBytes} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function fetchOnce(url, { accept, maxBytes }) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) throw new Error(`host not allow-listed: ${target.hostname}`);
  const response = await fetch(target, {
    redirect: 'manual',
    headers: { 'user-agent': USER_AGENT, accept },
    signal: AbortSignal.timeout(45_000),
  });
  if (response.status >= 300 && response.status < 400) throw new Error(`refused redirect (HTTP ${response.status})`);
  if (response.status !== 200) {
    const error = new Error(`HTTP ${response.status}`);
    error.retryable = response.status >= 500 || response.status === 429;
    throw error;
  }
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error(`declared size ${declared} exceeds ${maxBytes} bytes`);
  return { type: response.headers.get('content-type') || '', body: await readCapped(response, maxBytes) };
}

async function fetchWithRetry(url, options, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    try { return await fetchOnce(url, options); } catch (error) {
      const retryable = error.retryable || error.name === 'TimeoutError' || error.cause?.code;
      if (!retryable || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }
}

function assertSafeSvg(text) {
  if (!/^\s*<svg[\s>]/.test(text) || !/<\/svg>\s*$/.test(text)) throw new Error('not a standalone SVG document');
  if (/<script|<foreignObject|\son[a-z]+\s*=|javascript:|<!ENTITY|<iframe/i.test(text)) throw new Error('SVG contains active content');
  if (/(?:href|src)\s*=\s*["'](?!#)/i.test(text)) throw new Error('SVG references an external resource');
}

/**
 * → { file, bytes, sha256, width, height, type, url }. Cached by URL, so a
 * re-run never downloads the same master twice.
 */
export async function fetchMaster(group, cacheDir) {
  const url = masterUrl(group);
  const key = crypto.createHash('sha1').update(url).digest('hex');
  const ext = group.kind === 'avatar' ? 'svg' : 'jpg';
  const file = path.join(cacheDir, `${key}.${ext}`);
  const metaFile = path.join(cacheDir, `${key}.json`);
  if (fs.existsSync(file) && fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (meta.url === url && sha256(fs.readFileSync(file)) === meta.sha256) return { ...meta, file, cached: true };
  }

  const limits = LIMITS[group.kind];
  const { type, body } = await fetchWithRetry(url, { accept: group.kind === 'avatar' ? 'image/svg+xml' : 'image/jpeg', maxBytes: limits.maxBytes });
  if (!limits.type.test(type)) throw new Error(`unexpected content-type "${type}"`);

  let width; let height;
  if (group.kind === 'avatar') {
    assertSafeSvg(body.toString('utf8'));
    ({ width, height } = await sharp(body).metadata());
  } else {
    if (!(body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff)) throw new Error('body is not a JPEG');
    const image = sharp(body, { failOn: 'error' }).rotate();
    await image.clone().stats(); // full decode — catches truncated or corrupt files
    const { info } = await image.toBuffer({ resolveWithObject: true });
    ({ width, height } = info);
    if (width < limits.minWidth) throw new Error(`master only ${width}px wide`);
    if (Math.max(width, height) > limits.maxSide) throw new Error(`master ${width}x${height} exceeds limits`);
  }

  const meta = { url, type: type.split(';')[0], bytes: body.length, sha256: sha256(body), width, height };
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, body);
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
  return { ...meta, file, cached: false };
}

/**
 * What a browser was being sent for the URL exactly as the site referenced it
 * (same Accept header Chrome uses), for an honest before/after comparison.
 */
export async function measureReferenced(original) {
  try {
    const { type, body } = await fetchWithRetry(original, { accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8', maxBytes: 12 * 1024 * 1024 });
    return { bytes: body.length, type: type.split(';')[0] };
  } catch (error) {
    return { bytes: null, type: null, error: error.message };
  }
}

export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const index = next; next += 1; results[index] = await worker(items[index], index); }
  }));
  return results;
}
