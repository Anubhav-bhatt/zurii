import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { searchPackages, getPackageBySlug } from '../../services/packagesApi';
import { getDestinationsCached } from '../../services/destinationsApi';
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed';
import { useAsyncData } from '../../hooks/useAsyncData';
import { trackSearch } from '../../services/analytics';

const RECENT_KEY = 'zurii_recent_searches';
const MIN_QUERY = 2;
const DEBOUNCE_MS = 200;

const EXPERIENCES = [
  { tag: 'honeymoon', label: 'Honeymoon & Romantic', description: 'Curated romantic getaways for couples' },
  { tag: 'family', label: 'Family Vacation', description: 'Fun & relaxing holidays for all ages' },
  { tag: 'adventure', label: 'Adventure & Trekking', description: 'Thrilling mountain treks and river expeditions' },
  { tag: 'beach', label: 'Beach & Island Escape', description: 'Tropical sands, blue lagoons, and ocean breeze' },
  { tag: 'mountains', label: 'Mountain & Nature Retreat', description: 'Serene mountain air and scenic landscapes' },
];

const POPULAR_DESTINATIONS = [
  { name: 'Bali', slug: 'bali' },
  { name: 'Dubai', slug: 'dubai' },
  { name: 'Maldives', slug: 'maldives' },
  { name: 'Kashmir', slug: 'kashmir' },
  { name: 'Thailand', slug: 'thailand' },
];

function readRecent() {
  try {
    const saved = localStorage.getItem(RECENT_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function writeRecent(list) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Quota safety
  }
}

export default function SearchOverlay({ open, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const resultsContainerRef = useRef(null);

  const [query, setQuery] = useState('');
  const [state, setState] = useState({ query: null, packages: [], error: null });
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recent, setRecent] = useState(readRecent);

  const { slugs: recentSlugs } = useRecentlyViewed();

  // Load destinations for Spotlight matching
  const { data: allDestinations } = useAsyncData(
    () => (open ? getDestinationsCached() : Promise.resolve([])),
    ['spotlight-destinations', open]
  );
  // Memoised for identity, not for cost: `allDestinations ?? []` built a fresh
  // array on every render while the fetch was pending, so the useMemo below
  // that depends on it re-ran every render and memoised nothing.
  const destinationList = useMemo(() => allDestinations ?? [], [allDestinations]);

  // Load recently viewed package details
  const { data: recentlyViewedPkgs } = useAsyncData(
    async ({ signal }) => {
      if (!open || recentSlugs.length === 0) return [];
      const promises = recentSlugs.slice(0, 3).map((slug) =>
        getPackageBySlug(slug, { signal }).catch(() => null)
      );
      const res = await Promise.all(promises);
      return res.filter(Boolean);
    },
    ['spotlight-recently-viewed', open, recentSlugs.join(',')]
  );

  const trimmed = query.trim();
  const shouldSearch = trimmed.length >= MIN_QUERY;
  const loading = shouldSearch && state.query !== trimmed;
  // Same reason as destinationList: the `: []` branch returned a new array
  // each render, which flowed into flatItems' dependency list.
  const packageResults = useMemo(
    () => (state.query === trimmed ? state.packages : []),
    [state.query, state.packages, trimmed]
  );

  // ── Match Destinations ──
  const destinationResults = useMemo(() => {
    if (!shouldSearch) return [];
    const q = trimmed.toLowerCase();
    return destinationList
      .filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.country?.toLowerCase().includes(q) ||
          d.region?.toLowerCase().includes(q)
      )
      .slice(0, 4);
  }, [shouldSearch, trimmed, destinationList]);

  // ── Match Experiences ──
  const experienceResults = useMemo(() => {
    if (!shouldSearch) return [];
    const q = trimmed.toLowerCase();
    return EXPERIENCES.filter(
      (e) => e.label.toLowerCase().includes(q) || e.tag.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)
    ).slice(0, 3);
  }, [shouldSearch, trimmed]);

  // ── Flatten Results for Unified Arrow Key Navigation ──
  const flatItems = useMemo(() => {
    if (!shouldSearch) return [];
    const items = [];

    destinationResults.forEach((d) => {
      items.push({ type: 'destination', id: `dest-${d.slug}`, data: d });
    });

    packageResults.forEach((p) => {
      items.push({ type: 'package', id: `pkg-${p.slug}`, data: p });
    });

    experienceResults.forEach((e) => {
      items.push({ type: 'experience', id: `exp-${e.tag}`, data: e });
    });

    return items;
  }, [shouldSearch, destinationResults, packageResults, experienceResults]);

  // Focus input and lock scroll on open
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // aria-modal promises the page behind is unreachable — make Tab honour it,
    // or focus walks out of the palette onto content under the backdrop.
    const onKeyDown = (event) => {
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll(
        'a[href], button, input, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Debounced package search against API
  useEffect(() => {
    if (!open || !shouldSearch) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchPackages(trimmed, 6, { signal: controller.signal })
        .then(({ packages, total }) => {
          setState({ query: trimmed, packages, error: null });
          // Recorded when the debounced query resolves, zero results included.
          // trackSearch suppresses identical consecutive queries itself, and
          // is fire-and-forget — not setState, so fine inside this effect.
          // The count is the API's total, not the fetched page (capped at 6).
          trackSearch(trimmed, total);
        })
        .catch((error) => {
          if (error.name === 'AbortError') return;
          setState({ query: trimmed, packages: [], error });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, shouldSearch, trimmed]);

  // Remember recent query
  const rememberQuery = (value) => {
    const clean = value.trim();
    if (clean.length < MIN_QUERY) return;
    const next = [clean, ...recent.filter((q) => q.toLowerCase() !== clean.toLowerCase())].slice(0, 5);
    setRecent(next);
    writeRecent(next);
  };

  const handleSelectDestination = (d) => {
    rememberQuery(trimmed || d.name);
    onClose();
    setQuery('');
    navigate(`/destination/${d.slug}`);
  };

  const handleSelectPackage = (pkg) => {
    rememberQuery(trimmed || pkg.title);
    onClose();
    setQuery('');
    navigate(`/trip/${pkg.slug}`);
  };

  const handleSelectExperience = (exp) => {
    rememberQuery(trimmed || exp.label);
    onClose();
    setQuery('');
    navigate(`/packages?tag=${exp.tag}`);
  };

  const submitFreeText = () => {
    if (!shouldSearch) return;
    rememberQuery(trimmed);
    onClose();
    navigate(`/packages?q=${encodeURIComponent(trimmed)}`);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (flatItems.length === 0) return;
      setActiveIndex((i) => (i + 1) % flatItems.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (flatItems.length === 0) return;
      setActiveIndex((i) => (i - 1 + flatItems.length) % flatItems.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex >= 0 && flatItems[activeIndex]) {
        const item = flatItems[activeIndex];
        if (item.type === 'destination') handleSelectDestination(item.data);
        else if (item.type === 'package') handleSelectPackage(item.data);
        else if (item.type === 'experience') handleSelectExperience(item.data);
      } else {
        submitFreeText();
      }
    }
  };

  if (!open) return null;

  return (
    <div ref={dialogRef} className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Search destinations, packages or experiences">
      {/* Soft translucent backdrop */}
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-zinc-950/60 backdrop-blur-sm animate-backdrop-in"
      />

      {/* Floating Spotlight Palette */}
      <div className="relative mx-auto mt-[12vh] sm:mt-[15vh] w-[min(42rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] transition-all duration-200 focus-within:border-zinc-400 dark:focus-within:border-zinc-600 focus-within:ring-2 focus-within:ring-zinc-900/5 dark:focus-within:ring-zinc-100/5 animate-fade-slide-up">
        {/* Input Header */}
        <div className="flex h-14 sm:h-16 shrink-0 items-center gap-3 border-b border-zinc-100 dark:border-zinc-800 px-4 sm:px-5">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5 shrink-0 text-zinc-400 dark:text-zinc-500">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>

          <input
            ref={inputRef}
            type="search"
            data-search-input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // Reset the keyboard highlight here rather than in an effect:
              // setState inside an effect body triggers cascading renders and is
              // a lint error in this project.
              setActiveIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search destinations, packages or experiences..."
            aria-label="Search destinations, packages or experiences"
            className="h-full flex-1 border-none bg-transparent text-base sm:text-lg font-medium text-zinc-900 dark:text-zinc-100 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
          />

          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search query"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          )}

          {loading && (
            <span className="h-4 w-4 shrink-0 rounded-full border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-100 animate-spin" />
          )}

          <kbd className="hidden sm:inline-flex shrink-0 items-center rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
            ESC
          </kbd>
        </div>

        {/* Scrollable Results Area */}
        <div ref={resultsContainerRef} className="max-h-[60vh] overflow-y-auto p-3 sm:p-4">
          {/* Searching Loader Skeletons */}
          {loading && flatItems.length === 0 && (
            <div className="space-y-3 p-2" role="status" aria-label="Searching">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-10 w-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-2/5 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                    <div className="h-3 w-1/4 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Grouped Search Results */}
          {!loading && shouldSearch && flatItems.length > 0 && (
            <div className="space-y-4">
              {/* Destinations Section */}
              {destinationResults.length > 0 && (
                <div>
                  <h4 className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
                    Destinations
                  </h4>
                  <ul className="space-y-1">
                    {destinationResults.map((dest) => {
                      const itemIndex = flatItems.findIndex((i) => i.id === `dest-${dest.slug}`);
                      const isActive = itemIndex === activeIndex;

                      return (
                        <li key={dest.slug}>
                          <button
                            type="button"
                            onClick={() => handleSelectDestination(dest)}
                            onMouseEnter={() => setActiveIndex(itemIndex)}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ${
                              isActive ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-zinc-800 dark:text-zinc-200'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                                📍
                              </span>
                              <div className="min-w-0">
                                <span className="block truncate text-sm font-semibold">{dest.name}</span>
                                <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                                  {[dest.region, dest.country].filter(Boolean).join(' · ')}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {dest.packageCount > 0 && (
                                <span className="text-xs text-zinc-400 dark:text-zinc-500">{dest.packageCount} trips</span>
                              )}
                              <span className="text-zinc-400 dark:text-zinc-500">→</span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Packages Section */}
              {packageResults.length > 0 && (
                <div>
                  <h4 className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
                    Packages
                  </h4>
                  <ul className="space-y-1">
                    {packageResults.map((pkg) => {
                      const itemIndex = flatItems.findIndex((i) => i.id === `pkg-${pkg.slug}`);
                      const isActive = itemIndex === activeIndex;

                      return (
                        <li key={pkg.slug}>
                          <button
                            type="button"
                            onClick={() => handleSelectPackage(pkg)}
                            onMouseEnter={() => setActiveIndex(itemIndex)}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ${
                              isActive ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-zinc-800 dark:text-zinc-200'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <img
                                src={pkg.heroImage}
                                alt=""
                                className="h-10 w-10 shrink-0 rounded-lg bg-zinc-100 dark:bg-zinc-800 object-cover"
                              />
                              <div className="min-w-0">
                                <span className="block truncate text-sm font-semibold">{pkg.title}</span>
                                <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                                  {[pkg.destination?.name, pkg.duration].filter(Boolean).join(' · ')}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {pkg.price && (
                                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">From {pkg.price}</span>
                              )}
                              <span className="text-zinc-400 dark:text-zinc-500">→</span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Experiences Section */}
              {experienceResults.length > 0 && (
                <div>
                  <h4 className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
                    Experiences
                  </h4>
                  <ul className="space-y-1">
                    {experienceResults.map((exp) => {
                      const itemIndex = flatItems.findIndex((i) => i.id === `exp-${exp.tag}`);
                      const isActive = itemIndex === activeIndex;

                      return (
                        <li key={exp.tag}>
                          <button
                            type="button"
                            onClick={() => handleSelectExperience(exp)}
                            onMouseEnter={() => setActiveIndex(itemIndex)}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ${
                              isActive ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-zinc-800 dark:text-zinc-200'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                                🏝️
                              </span>
                              <div className="min-w-0">
                                <span className="block truncate text-sm font-semibold">{exp.label}</span>
                                <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{exp.description}</span>
                              </div>
                            </div>
                            <span className="text-xs text-zinc-700 dark:text-zinc-300 font-semibold shrink-0">Explore →</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Free Text Direct Search Option */}
              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-2 px-2">
                <button
                  type="button"
                  onClick={submitFreeText}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <span>View all results for “{trimmed}”</span>
                  <span>↵</span>
                </button>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!loading && shouldSearch && flatItems.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No trips or destinations match “{trimmed}”.</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Try searching for places like Bali, Dubai, or Kashmir.</p>
              <button
                type="button"
                onClick={submitFreeText}
                className="mt-4 rounded-xl bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
              >
                Browse all packages
              </button>
            </div>
          )}

          {/* Default / Unsearched State */}
          {!shouldSearch && (
            <div className="space-y-5 p-1">
              {/* Recent Searches */}
              {recent.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between px-1">
                    <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
                      Recent Searches
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setRecent([]);
                        writeRecent([]);
                      }}
                      className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recent.map((entry) => (
                      <button
                        key={entry}
                        type="button"
                        onClick={() => {
                          setQuery(entry);
                          setActiveIndex(-1);
                        }}
                        className="rounded-full border border-zinc-200/90 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                      >
                        {entry}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Popular Destinations */}
              <div>
                <h4 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
                  Popular Destinations
                </h4>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_DESTINATIONS.map((dest) => (
                    <button
                      key={dest.slug}
                      type="button"
                      onClick={() => handleSelectDestination(dest)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 dark:border-zinc-700 bg-zinc-50/70 dark:bg-zinc-800/70 px-3 py-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <span>📍 {dest.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recently Viewed Trips */}
              {recentlyViewedPkgs && recentlyViewedPkgs.length > 0 && (
                <div>
                  <h4 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
                    Recently Viewed
                  </h4>
                  <ul className="space-y-1">
                    {recentlyViewedPkgs.map((pkg) => (
                      <li key={pkg.slug}>
                        <button
                          type="button"
                          onClick={() => handleSelectPackage(pkg)}
                          className="flex w-full items-center justify-between gap-3 rounded-xl p-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={pkg.heroImage}
                              alt=""
                              className="h-9 w-9 shrink-0 rounded-lg bg-zinc-100 dark:bg-zinc-800 object-cover"
                            />
                            <span className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">{pkg.title}</span>
                          </div>
                          <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">→</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 px-4 py-2.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-3">
            <span><kbd className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">↑</kbd> <kbd className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">↓</kbd> to navigate</span>
            <span><kbd className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">↵</kbd> to select</span>
          </div>
          <span>Zurii Global Search</span>
        </div>
      </div>
    </div>
  );
}
