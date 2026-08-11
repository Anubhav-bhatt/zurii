import Container from '../ui/Container';
import Button from '../ui/Button';
import { whatsappLink } from '../../config/site';

/**
 * Closing conversion section. Both actions route to destinations that already
 * exist: the contact page (which posts to the existing /api/contact endpoint)
 * and the WhatsApp number configured in the project.
 */
export default function PlanTripCTA() {
  return (
    <Container as="section" aria-labelledby="plan-trip" className="section-gap">
      <div className="overflow-hidden rounded-3xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-white to-zinc-50 px-6 py-12 text-center sm:px-12 sm:py-16 dark:border-violet-900/50 dark:from-violet-950/40 dark:via-zinc-900 dark:to-zinc-900">
        <h2 id="plan-trip" className="text-fluid-section font-bold text-zinc-950 dark:text-zinc-50">
          Can't find the perfect trip?
        </h2>

        <p className="mx-auto mt-3 max-w-xl text-fluid-body text-zinc-600 dark:text-zinc-300">
          Tell us where you want to go and how you like to travel — we'll put together an itinerary built around you.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button to="/plan-my-trip" variant="accent" size="lg" className="w-full sm:w-auto">
            Plan My Trip
          </Button>
          <Button
            href={whatsappLink()}
            target="_blank"
            rel="noopener noreferrer"
            variant="whatsapp"
            size="lg"
            className="w-full sm:w-auto"
          >
            Talk to a Travel Expert
          </Button>
        </div>
      </div>
    </Container>
  );
}
