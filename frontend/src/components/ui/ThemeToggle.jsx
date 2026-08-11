import { useTheme } from '../../context/themeStore';

export default function ThemeToggle({ className = '', onDark = false }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 ${
        onDark
          ? 'text-white hover:bg-white/15 focus-visible:ring-white'
          : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100'
      } ${className}`}
    >
      {isDark ? (
        /* Sun Icon for Light Mode */
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4.5 w-4.5 text-amber-400">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        /* Moon Icon for Dark Mode */
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4.5 w-4.5 text-zinc-700 dark:text-zinc-200">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
