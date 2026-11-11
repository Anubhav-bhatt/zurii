/**
 * First-party marketing attribution for leads (ZT-16).
 *
 * The visitor's own browser records where its session came from (UTM tags,
 * the referring site's host, the landing page — frontend/src/services/
 * attribution.js) and sends that with the enquiry it submits. Nothing is
 * looked up from other visitors' analytics, so one person's campaign can
 * never be attached to another person's lead.
 *
 * parseAttribution(body) never fails a lead: anything malformed, over-long or
 * carrying personal data (an email or phone-like number in a UTM value) is
 * dropped field by field. Click identifiers are never stored — only WHICH kind
 * was present (`gclid` or `fbclid`), so Google Ads auto-tagged clicks are not
 * counted as organic search. The identifier values themselves have no use here
 * (there is no conversion upload), so they are not kept.
 */

/** Which form produced the lead. Keys are stored; labels are for reports. */
const SUBMISSION_SOURCES = Object.freeze({
  contact_page: 'Contact page',
  trip_enquiry: 'Trip enquiry',
  plan_my_trip: 'Plan My Trip',
});

const CLICK_ID_TYPES = new Set(['gclid', 'fbclid']);
const UTM_KEYS = Object.freeze(['utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm']);
const UTM_MAX = 100; // utm_* VARCHAR(100)
const HOST_MAX = 253; // referrer_host VARCHAR(253)
const PATH_MAX = 255; // landing_page VARCHAR(255)
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
// Ten or more digits in one run (separators allowed): a phone number. Shorter
// runs are kept — campaign names are often date-stamped (sale_20261110).
const PHONE_LIKE = /\d(?:[\s().-]?\d){9,}/;

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Trimmed single-line text, capped, or null. Values that look personal are dropped. */
function utmValue(value) {
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, UTM_MAX);
  if (!text || EMAIL.test(text) || PHONE_LIKE.test(text)) return null;
  return text;
}

function hostValue(value) {
  if (typeof value !== 'string') return null;
  const host = value.trim().toLowerCase().replace(/\.$/, '');
  return host.length <= HOST_MAX && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) ? host : null;
}

function pathValue(value) {
  if (typeof value !== 'string') return null;
  const path = value.split(/[?#]/)[0].trim();
  return path.startsWith('/') && path.length <= PATH_MAX && /^\/[A-Za-z0-9/_.~%-]*$/.test(path) ? path : null;
}

/**
 * Normalised attribution from a lead body, or null when none was sent.
 * Reads body.attribution, body.submissionSource and body.destinationSlug.
 */
function parseAttribution(body) {
  const input = isPlainObject(body) ? body : {};
  const raw = isPlainObject(input.attribution) ? input.attribution : null;
  const submissionSource = typeof input.submissionSource === 'string' && Object.hasOwn(SUBMISSION_SOURCES, input.submissionSource)
    ? input.submissionSource
    : null;
  const destinationSlug = typeof input.destinationSlug === 'string' && SLUG_PATTERN.test(input.destinationSlug.trim())
    ? input.destinationSlug.trim()
    : null;

  if (!raw) return { captured: false, submissionSource, destinationSlug };

  const value = {
    captured: true,
    submissionSource,
    destinationSlug,
    referrerHost: hostValue(raw.referrerHost),
    landingPage: pathValue(raw.landingPage),
    clickIdType: typeof raw.clickIdType === 'string' && CLICK_ID_TYPES.has(raw.clickIdType) ? raw.clickIdType : null,
  };
  for (const key of UTM_KEYS) value[key] = utmValue(raw[key]);
  value.channel = classifyChannel(value);
  return value;
}

const SEARCH_ENGINE = /(^|\.)(google|bing|yahoo|duckduckgo|yandex|baidu|ecosia|startpage|search\.brave)\.[a-z.]+$/;
const SOCIAL_SITE = /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|t\.co|twitter\.com|x\.com|linkedin\.com|lnkd\.in|youtube\.com|youtu\.be|pinterest\.[a-z.]+|reddit\.com|threads\.net|whatsapp\.com|wa\.me|snapchat\.com|quora\.com|telegram\.org|t\.me)$/;

/**
 * The marketing channel, from the strongest signal down:
 * explicit UTM medium → click-id type → any other UTM tag → referring site → direct.
 */
function classifyChannel(a) {
  const medium = (a.utmMedium || '').toLowerCase();
  if (a.clickIdType === 'gclid' || /^(cpc|ppc|paid[-_ ]?search|sem)$/.test(medium)) return 'paid_search';
  if (/^(paid[-_ ]?social|social[-_ ]?paid|paidsocial)$/.test(medium)) return 'paid_social';
  if (/^(display|cpm|banner)$/.test(medium)) return 'display';
  if (/^e-?mail$|^newsletter$/.test(medium)) return 'email';
  if (/^(social|social[-_ ]?media|organic[-_ ]?social)$/.test(medium)) return 'social';
  if (/^(referral|affiliate|partner)$/.test(medium)) return 'referral';
  if (a.utmSource || a.utmMedium || a.utmCampaign) return 'other_campaign';
  // fbclid rides on organic and paid Facebook/Instagram links alike.
  if (a.clickIdType === 'fbclid') return 'social';
  if (a.referrerHost) {
    if (SEARCH_ENGINE.test(a.referrerHost)) return 'organic_search';
    if (SOCIAL_SITE.test(a.referrerHost)) return 'social';
    return 'referral';
  }
  return 'direct';
}

/** Column values for an INSERT, in ATTRIBUTION_COLUMNS order. */
const ATTRIBUTION_COLUMNS = Object.freeze(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'referrer_host', 'landing_page', 'click_id_type', 'attribution_channel', 'submission_source']);

function attributionValues(a) {
  return [
    a.utmSource ?? null, a.utmMedium ?? null, a.utmCampaign ?? null, a.utmContent ?? null, a.utmTerm ?? null,
    a.referrerHost ?? null, a.landingPage ?? null, a.clickIdType ?? null,
    a.captured ? a.channel : null, a.submissionSource ?? null,
  ];
}

/** What the admin sees on a lead; null when nothing was captured (older leads). */
function attributionOf(row) {
  if (!row || (!row.attribution_channel && !row.submission_source)) return null;
  return {
    channel: row.attribution_channel ?? null,
    utmSource: row.utm_source ?? null,
    utmMedium: row.utm_medium ?? null,
    utmCampaign: row.utm_campaign ?? null,
    utmContent: row.utm_content ?? null,
    utmTerm: row.utm_term ?? null,
    referrerHost: row.referrer_host ?? null,
    landingPage: row.landing_page ?? null,
    clickIdType: row.click_id_type ?? null,
    submissionSource: row.submission_source ?? null,
  };
}

module.exports = {
  SUBMISSION_SOURCES,
  ATTRIBUTION_COLUMNS,
  parseAttribution,
  classifyChannel,
  attributionValues,
  attributionOf,
};
