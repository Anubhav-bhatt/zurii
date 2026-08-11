import Container from '../components/ui/Container';
import Button from '../components/ui/Button';

/**
 * 404. Previously the catch-all route silently rendered the homepage, so a
 * mistyped URL looked like it had worked. This says what happened and offers
 * the two routes people actually want.
 */
export default function NotFoundPage() {
  return (
    <div className="pt-16 sm:pt-[68px]">
      <Container className="flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-400">Error 404</p>

        <h1 className="mt-3 text-fluid-display font-bold text-zinc-950 dark:text-zinc-50">This route took a detour</h1>

        <p className="mt-3 max-w-md text-fluid-body text-zinc-600 dark:text-zinc-300">
          The page you were looking for doesn't exist. It may have moved, or the link might be out of date.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button to="/" variant="accent" size="lg">
            Back to Home
          </Button>
          <Button to="/packages" variant="secondary" size="lg">
            Explore Packages
          </Button>
        </div>
      </Container>
    </div>
  );
}
