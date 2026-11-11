/**
 * Cap the pixel density images are chosen for on very dense screens.
 *
 * With `w` descriptors the browser picks the first rendition at least
 * `slot × devicePixelRatio` wide, so a 3× phone asks for 3× the pixels of the
 * slot — on a 330 px card, the 1280 px file, where 960 px already gives about
 * 3 device pixels per CSS pixel. This adds, in front of every `sizes` entry, a
 * copy for screens of 2.5 dppx and above whose slot is two thirds as wide:
 * those screens then choose as a 2× screen would. 1× and 2× screens, and any
 * browser that does not understand the media query, are unaffected. No image
 * file changes — only which existing rendition is chosen.
 */
export const DENSE_SCREEN = '(min-resolution: 2.5dppx)';
export const DENSE_FACTOR = 0.6667;

/** Split on `separator` outside parentheses. */
function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** "(cond) length" → [cond, length]; a bare length has no condition. */
function splitEntry(entry) {
  if (!entry.startsWith('(')) return [null, entry];
  let depth = 0;
  let lastSpace = -1;
  for (let i = 0; i < entry.length; i += 1) {
    const ch = entry[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (/\s/.test(ch) && depth === 0) lastSpace = i;
  }
  return lastSpace === -1 ? [null, entry] : [entry.slice(0, lastSpace).trim(), entry.slice(lastSpace + 1).trim()];
}

export function capDensity(sizes) {
  if (typeof sizes !== 'string' || !sizes.trim()) return sizes;
  const entries = splitTopLevel(sizes, ',');
  if (entries.some((entry) => /\bauto\b/.test(entry))) return sizes;
  const dense = entries.map((entry) => {
    const [condition, length] = splitEntry(entry);
    if (!condition) return `${DENSE_SCREEN} calc(${length} * ${DENSE_FACTOR})`;
    const simple = /^\([^()]*\)$/.test(condition);
    return `${DENSE_SCREEN} and ${simple ? condition : `(${condition})`} calc(${length} * ${DENSE_FACTOR})`;
  });
  return [...dense, ...entries].join(', ');
}
