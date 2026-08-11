import { Navigate, useParams } from 'react-router-dom';

/**
 * Keeps the old category URLs working.
 *
 * `/explore/:slug`, `/best-sellers` and `/all-domestic-destinations` used to be
 * separate pages, each filtering the static data object with its own keyword
 * rules. Those rules became `tags` on the packages during the migration, so the
 * pages collapse into `/packages` with a query — and the old links redirect
 * there rather than 404ing.
 */

const EXPLORE_TARGETS = {
  international: '/packages?tag=international',
  domestic: '/packages?tag=domestic',
  adventure: '/packages?tag=adventure',
  beach: '/packages?tag=beach',
  heritage: '/packages?tag=heritage',
  'european-tours': '/packages?tag=international&q=europe',
  'budget-tours': '/packages?maxPrice=25000&sort=price_asc',
};

export function ExploreRedirect() {
  const { slug } = useParams();
  return <Navigate to={EXPLORE_TARGETS[slug] ?? '/packages'} replace />;
}

export default function LegacyRedirect({ to }) {
  return <Navigate to={to} replace />;
}
