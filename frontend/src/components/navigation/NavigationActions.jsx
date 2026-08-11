import { Link } from 'react-router-dom';

import Button from '../ui/Button';
import ThemeToggle from '../ui/ThemeToggle';
import { useWishlist } from '../../hooks/useWishlist';

export default function NavigationActions({ onOpenSearch, onOpenMenu, menuOpen, onDark, menuButtonRef }) {
  const { count } = useWishlist();

  const iconButton = `flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 ${
    onDark
      ? 'text-white hover:bg-white/15 focus-visible:ring-white'
      : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100'
  }`;

  return (
    <div className="flex items-center gap-1.5">
      <ThemeToggle onDark={onDark} />
      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="Search destinations, packages or experiences (⌘K)"
        className={`hidden md:flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 ${
          onDark
            ? 'border-white/30 bg-white/10 text-white/90 hover:bg-white/20 focus-visible:ring-white/40'
            : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 focus-visible:ring-zinc-900/20 dark:focus-visible:ring-zinc-100/20'
        }`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 opacity-60">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
        </svg>
        <span>Search</span>
        <kbd className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ${
          onDark ? 'bg-white/20 text-white' : 'bg-zinc-200/80 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
        }`}>
          ⌘K
        </kbd>
      </button>

      {/* Mobile search icon */}
      <button type="button" onClick={onOpenSearch} aria-label="Search trips" className={`${iconButton} md:hidden`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
        </svg>
      </button>

      <Link to="/wishlist" aria-label={`Saved trips (${count})`} className={`relative ${iconButton}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
          <path
            d="M12 21s-7.5-4.7-9.3-9A5.2 5.2 0 0 1 12 6.2 5.2 5.2 0 0 1 21.3 12c-1.8 4.3-9.3 9-9.3 9z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {count > 0 && (
          <span
            aria-hidden="true"
            className={`absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ${
              onDark ? 'ring-white/30' : 'ring-white'
            }`}
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </Link>

      <Button to="/plan-my-trip" variant="accent" size="sm" className="hidden sm:inline-flex">
        Plan My Trip
      </Button>

      <button
        ref={menuButtonRef}
        type="button"
        onClick={onOpenMenu}
        aria-label="Open menu"
        aria-expanded={menuOpen}
        className={`${iconButton} lg:hidden`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
