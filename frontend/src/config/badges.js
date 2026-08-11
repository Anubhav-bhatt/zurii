/**
 * Badge → gradient mapping.
 *
 * Badge text is data (migrated into packages.metadata); its colour is
 * presentation and lives here. Carried over from the original static
 * `badgeColors`, plus the two carousel tags that had their colours inline.
 */
export const BADGE_COLORS = {
  'Best Seller': 'from-rose-500 to-pink-600',
  'Hot Deal': 'from-orange-500 to-red-500',
  'Budget Pick': 'from-emerald-600 to-teal-700',
  Premium: 'from-amber-600 to-orange-700',
  Recommended: 'from-violet-500 to-purple-600',
  'Top Rated': 'from-sky-600 to-blue-700',
  Adventure: 'from-emerald-500 to-cyan-600',
  Spiritual: 'from-amber-600 to-orange-600',
  Cultural: 'from-rose-600 to-orange-700',
  Trending: 'from-emerald-600 to-teal-700',
  Popular: 'from-rose-600 to-pink-700',
};

export const DEFAULT_BADGE_COLOR = 'from-violet-500 to-indigo-600';

export const badgeColor = (badge) => BADGE_COLORS[badge] || DEFAULT_BADGE_COLOR;
