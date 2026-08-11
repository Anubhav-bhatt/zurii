import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export default function BackToTop() {
  const { pathname } = useLocation();
  // The trip page's mobile sticky bar owns the bottom edge below lg — same
  // lift as FloatingWhatsApp so this never covers the primary conversion bar.
  const offset = pathname.startsWith('/trip/') ? 'bottom-[5.75rem] lg:bottom-6' : 'bottom-6';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 400);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top of page"
      className={`fixed left-4 sm:left-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200/80 bg-white/90 text-zinc-700 shadow-lg backdrop-blur-md transition-all duration-300 hover:border-zinc-300 hover:bg-white hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100 animate-fade-slide-up ${offset}`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
        <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
