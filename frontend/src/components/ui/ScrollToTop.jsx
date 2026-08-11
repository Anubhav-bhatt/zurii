import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Ensures page starts at the top when navigating to a new route,
 * while preserving natural browser Back/Forward (POP) position restoration.
 */
export default function ScrollToTop() {
  const { pathname, search } = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    // Only scroll to top on PUSH or REPLACE navigation, not POP (Back/Forward)
    if (navType !== 'POP') {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'instant',
      });
    }
  }, [pathname, search, navType]);

  return null;
}
