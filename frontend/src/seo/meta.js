/**
 * Page metadata for search engines and link previews (ZT-17) — one source for
 * both places it is used:
 *
 *   scripts/prerender.mjs   writes it into the static HTML of every public
 *                           page at build time, for crawlers and link-preview
 *                           bots that do not run JavaScript
 *   seo/useSeo.js           keeps it current as the app navigates
 *
 * Pure JavaScript (no JSX, no browser or Vite globals) so Node can import it.
 *
 * Every title and description restates what the page itself says. Structured
 * data carries only fields the site already publishes: no ratings, reviews,
 * prices, availability, awards or invented address details.
 */

export const SITE_NAME = 'Zurii Travels';
export const DEFAULT_DESCRIPTION =
  'Curated holidays and unforgettable experiences, designed around the way you want to travel — trips across India and abroad, planned by people.';
export const DEFAULT_IMAGE = '/zurii-logo.png';

const MAX_DESCRIPTION = 158;

/** Collapse whitespace and cut at a word boundary. */
export function clip(text, max = MAX_DESCRIPTION) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 60 ? cut.lastIndexOf(' ') : cut.length).replace(/[,;:\s—–-]+$/, '')}…`;
}

const withSite = (title) => `${title} | ${SITE_NAME}`;

/**
 * Static public routes. `noindex` pages are reachable but personal or
 * transactional (the wishlist lives in the visitor's own browser).
 */
export const STATIC_PAGES = Object.freeze({
  '/': {
    title: `${SITE_NAME} | Curated holidays in India and abroad`,
    description: DEFAULT_DESCRIPTION,
  },
  '/packages': {
    title: withSite('All trips and holiday packages'),
    description: 'Browse every Zurii trip — domestic and international holidays with day-by-day itineraries. Filter by destination, duration and budget.',
  },
  '/about': {
    title: withSite('Trips planned by people, not algorithms'),
    description: 'Zurii is a travel company built around a simple idea: a good holiday is designed, not booked. Every itinerary we publish is put together by hand.',
  },
  '/blogs': {
    title: withSite('Travel guides and stories'),
    description: 'Real stories, honest tips, and insider guides from our travels around India and the world.',
  },
  '/contact-us': {
    title: withSite('Contact us'),
    description: "Tell us roughly where you want to go and we'll come back with an itinerary and a price. No obligation.",
  },
  '/corporate-tours': {
    title: withSite('Corporate tours'),
    description: 'Tailored tours for teams and organizations — boost morale, foster teamwork and create lasting memories with corporate travel planned by Zurii.',
  },
  '/weekend-trips': {
    title: withSite('Weekend trips'),
    description: 'Short escapes of three days or less — easy to plan, quick to reach, and back before Monday.',
  },
  '/plan-my-trip': {
    title: withSite('Plan my trip'),
    description: "Rough dates and a rough idea are enough to start. We'll come back with an itinerary and a price — nothing to pay and nothing to commit to.",
  },
  '/wishlist': {
    title: withSite('Saved trips'),
    description: 'The trips you have saved on this device.',
    noindex: true,
  },
  '/no-cost-emi': {
    title: withSite('EMI options'),
    description: 'Want to pay for your trip in instalments? Ask our team before you book — we confirm the exact EMI options and any conditions in writing.',
  },
  '/payment-policy': {
    title: withSite('Payment details'),
    description: 'How payments for a Zurii trip are scheduled. Our team confirms the payment details for your booking directly.',
  },
  '/cancellation-policy': {
    title: withSite('Cancellation policy'),
    description: 'Understand our cancellation policy, refund process, and important timelines before you book.',
  },
  '/privacy-policy': {
    title: withSite('Privacy policy'),
    description: 'How Zurii Travels collects, uses and protects your information, including enquiries, analytics and marketing cookies.',
  },
  '/terms-conditions': {
    title: withSite('Terms & conditions'),
    description: 'The terms and conditions that apply to trips booked with Zurii Travels.',
  },
});

/** Routes that are never indexed: private, personal or not real pages. */
export const NOINDEX_PREFIXES = Object.freeze(['/admin', '/dashboard']);

/** Query parameters that never change which page is canonical. */
export function canonicalPath(pathname) {
  const path = String(pathname || '/').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return path;
}

export function absoluteUrl(origin, pathOrUrl) {
  if (!origin || !pathOrUrl) return null;
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return `${origin.replace(/\/+$/, '')}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

// ── page builders ─────────────────────────────────────────────────────
// Each takes plain fields so the build (catalogue artifact) and the app
// (API responses) can both call it.

export function staticPageMeta(pathname) {
  const path = canonicalPath(pathname);
  const page = STATIC_PAGES[path];
  if (!page) return null;
  return { path, type: 'website', image: DEFAULT_IMAGE, ...page };
}

/** { slug, name, country, summary, description, image } */
export function destinationMeta(d) {
  const path = `/destination/${d.slug}`;
  const where = d.country && d.country !== d.name ? `${d.name}, ${d.country}` : d.name;
  return {
    path,
    type: 'website',
    title: withSite(`${d.name} trips and holidays`),
    description: clip(d.description || d.summary || `Trips and holidays in ${where}, planned by Zurii.`),
    image: d.image || DEFAULT_IMAGE,
    imageAlt: `Travel to ${d.name}`,
    breadcrumbs: [{ name: 'Home', path: '/' }, { name: d.name, path }],
    structured: 'destination',
    data: { name: d.name, description: d.summary || d.description, image: d.image },
  };
}

/** { slug, title, summary, description, image, durationText, destinationName, destinationSlug } */
/** A fragment as a sentence: trimmed, ending in punctuation. */
const sentence = (text) => {
  const t = String(text ?? '').trim();
  return t && !/[.!?…]$/.test(t) ? `${t}.` : t;
};

export function packageMeta(p) {
  const path = `/trip/${p.slug}`;
  const lead = [p.durationText, p.destinationName].filter(Boolean).join(' in ');
  return {
    path,
    type: 'website',
    title: withSite(p.title),
    description: clip([sentence(lead), sentence(p.summary), p.description || ''].filter(Boolean).join(' ')),
    image: p.image || DEFAULT_IMAGE,
    imageAlt: p.title,
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Trips', path: '/packages' },
      { name: p.title, path },
    ],
    structured: 'trip',
    data: { name: p.title, description: p.summary || p.description, image: p.image },
  };
}

/** { slug, title, subtitle, image, date ('Apr 15, 2026'), author } */
export function guideMeta(g) {
  const path = `/blog/${g.slug}`;
  return {
    path,
    type: 'article',
    title: withSite(g.title),
    description: clip(g.subtitle || g.title),
    image: g.image || DEFAULT_IMAGE,
    imageAlt: g.title,
    published: isoDate(g.date),
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Travel guides', path: '/blogs' },
      { name: g.title, path },
    ],
    structured: 'article',
    data: { headline: g.title, description: g.subtitle, image: g.image, author: g.author },
  };
}

/** A page that does not exist (or no longer does). Never indexed. */
export function notFoundMeta(pathname, title = 'Page not found') {
  return { path: canonicalPath(pathname), type: 'website', title: withSite(title), description: DEFAULT_DESCRIPTION, image: DEFAULT_IMAGE, noindex: true, canonical: false };
}

/** Admin and other private routes. */
export function privateMeta(pathname) {
  return { path: canonicalPath(pathname), type: 'website', title: withSite('Admin'), description: '', noindex: true, canonical: false, private: true };
}

/** 'Apr 15, 2026' → '2026-04-15'; null when the text is not a date. */
export function isoDate(text) {
  const m = /^([A-Z][a-z]{2})\w* (\d{1,2}), (\d{4})$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m[1]);
  if (month < 0) return null;
  const date = new Date(Date.UTC(Number(m[3]), month, Number(m[2])));
  return date.getUTCDate() === Number(m[2]) ? date.toISOString().slice(0, 10) : null;
}

// ── structured data (JSON-LD) ─────────────────────────────────────────

/**
 * The business, from config/site.js only. The address is the one the site
 * already prints; nothing is added to it.
 */
export function organizationLd(origin, site) {
  const sameAs = (site.socials ?? []).map((s) => s.href.split('?')[0]).filter(Boolean);
  const address = site.address?.length
    ? {
        '@type': 'PostalAddress',
        streetAddress: site.address.join(' ').replace(/,?\s*\d{6}\s*$/, '').replace(/\s+/g, ' ').replace(/,\s*$/, '').trim(),
        ...(/(\d{6})\s*$/.test(site.address.join(' ')) ? { postalCode: /(\d{6})\s*$/.exec(site.address.join(' '))[1] } : {}),
      }
    : undefined;
  return {
    '@type': 'TravelAgency',
    '@id': `${origin}/#organization`,
    name: site.legalName,
    url: `${origin}/`,
    logo: absoluteUrl(origin, '/zurii-logo.png'),
    email: site.email?.label,
    telephone: site.phones?.[0]?.label,
    ...(address ? { address } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

function breadcrumbLd(origin, crumbs) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absoluteUrl(origin, c.path) })),
  };
}

/** The JSON-LD graph for a page, or null when there is no origin to anchor it. */
export function structuredData(meta, { origin, site }) {
  if (!origin || meta.noindex) return null;
  const graph = [];
  const url = absoluteUrl(origin, meta.path);
  if (meta.path === '/') {
    graph.push(organizationLd(origin, site), { '@type': 'WebSite', '@id': `${origin}/#website`, name: SITE_NAME, url: `${origin}/` });
  }
  if (meta.breadcrumbs) graph.push(breadcrumbLd(origin, meta.breadcrumbs));
  const image = meta.data?.image ? absoluteUrl(origin, meta.data.image) : undefined;
  if (meta.structured === 'destination') {
    graph.push({ '@type': 'TouristDestination', name: meta.data.name, url, ...(meta.data.description ? { description: clip(meta.data.description, 300) } : {}), ...(image ? { image } : {}) });
  }
  if (meta.structured === 'trip') {
    graph.push({
      '@type': 'TouristTrip', name: meta.data.name, url,
      ...(meta.data.description ? { description: clip(meta.data.description, 300) } : {}),
      ...(image ? { image } : {}),
      provider: { '@id': `${origin}/#organization` },
    });
  }
  if (meta.structured === 'article') {
    graph.push({
      '@type': 'BlogPosting', headline: meta.data.headline, url, mainEntityOfPage: url,
      ...(meta.data.description ? { description: clip(meta.data.description, 300) } : {}),
      ...(image ? { image } : {}),
      ...(meta.published ? { datePublished: meta.published } : {}),
      ...(meta.data.author ? { author: { '@type': 'Organization', name: meta.data.author } } : {}),
      publisher: { '@id': `${origin}/#organization` },
    });
  }
  return graph.length ? { '@context': 'https://schema.org', '@graph': graph } : null;
}

// ── tags ──────────────────────────────────────────────────────────────

/**
 * The head tags for a page as data — [tag, attributes] pairs — so the build
 * can print them and the app can apply them to the live document.
 * `indexable` false (preview/staging builds) forces noindex everywhere.
 */
export function headTags(meta, { origin, indexable = true }) {
  const noindex = meta.noindex || !indexable;
  const canonical = origin && meta.canonical !== false && !noindex ? absoluteUrl(origin, meta.path) : null;
  const image = meta.image ? absoluteUrl(origin, meta.image) : null;
  const tags = [
    ['meta', { name: 'description', content: meta.description || DEFAULT_DESCRIPTION }],
    ['meta', { name: 'robots', content: noindex ? 'noindex, nofollow' : 'index, follow' }],
    ['meta', { property: 'og:site_name', content: SITE_NAME }],
    ['meta', { property: 'og:type', content: meta.type || 'website' }],
    ['meta', { property: 'og:title', content: meta.title }],
    ['meta', { property: 'og:description', content: meta.description || DEFAULT_DESCRIPTION }],
    ['meta', { name: 'twitter:card', content: image && meta.image !== DEFAULT_IMAGE ? 'summary_large_image' : 'summary' }],
    ['meta', { name: 'twitter:title', content: meta.title }],
    ['meta', { name: 'twitter:description', content: meta.description || DEFAULT_DESCRIPTION }],
  ];
  if (canonical) {
    tags.push(['link', { rel: 'canonical', href: canonical }], ['meta', { property: 'og:url', content: canonical }]);
  }
  if (image) {
    tags.push(['meta', { property: 'og:image', content: image }], ['meta', { name: 'twitter:image', content: image }]);
    if (meta.imageAlt) tags.push(['meta', { property: 'og:image:alt', content: meta.imageAlt }]);
  }
  if (meta.published) tags.push(['meta', { property: 'article:published_time', content: meta.published }]);
  return tags;
}

/** The attribute that identifies a tag for replacement (name, property or rel). */
export const tagKey = ([tag, attrs]) => (tag === 'link' ? `link[rel="${attrs.rel}"]` : attrs.name ? `meta[name="${attrs.name}"]` : `meta[property="${attrs.property}"]`);
