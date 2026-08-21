import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import Button from '../components/ui/Button';
import EnquiryForm from '../components/travel/EnquiryForm';
import { SITE, whatsappLink } from '../config/site';
import { track } from '../services/analytics';

/**
 * "Plan My Trip" — a travel enquiry that does not start from a package.
 *
 * This is deliberately NOT the contact page. The two lead types stay separate:
 *
 *   /contact-us     general company message  →  POST /api/contact  →  contacts
 *   /plan-my-trip   wants a trip planned     →  POST /api/bookings →  bookings
 *
 * Both are real leads, but only the second one belongs in the travel-enquiry
 * pipeline where it can carry a destination, dates, travellers and a budget. The
 * same `EnquiryForm` serves it in `tripContext` mode, so there is one enquiry
 * form in the codebase rather than one per entry point.
 */
export default function PlanTripPage() {
  // The modal fires enquiry_form_opened when it opens; this page IS the open
  // form, so the equivalent moment is the page render. Without it, the
  // funnel's "started" stage could exceed "opened". `track` is not setState.
  useEffect(() => {
    track('enquiry_form_opened', { meta: { context: 'plan-my-trip' } });
  }, []);

  return (
    <div className="pt-16 sm:pt-[68px]">
      <Container className="py-10 sm:py-14">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Plan My Trip' }]} />

        <div className="mt-6 max-w-2xl">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-400">Plan My Trip</p>
          <h1 className="text-fluid-display font-bold text-zinc-950 dark:text-zinc-50">Tell us the trip you have in mind</h1>
          <p className="mt-3 text-fluid-body text-zinc-600 dark:text-zinc-300">
            Rough dates and a rough idea are enough to start. We'll come back with an itinerary and a price — there's
            nothing to pay and nothing to commit to.
          </p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
          <EnquiryForm tripContext />

          <aside className="lg:pt-1">
            <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Rather just talk?</h2>

              <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                Call us or send a message and we'll plan it with you directly.
              </p>

              <ul className="mt-4 space-y-1">
                {SITE.phones.map((phone) => (
                  <li key={phone.href}>
                    <a
                      href={phone.href}
                      className="rounded text-sm font-semibold text-zinc-900 dark:text-zinc-100 transition-colors hover:text-violet-700 dark:hover:text-violet-400"
                    >
                      {phone.label}
                    </a>
                  </li>
                ))}
              </ul>

              <Button
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                variant="whatsapp"
                size="md"
                className="mt-5 w-full"
              >
                Chat with Travel Expert
              </Button>

              <p className="mt-5 border-t border-zinc-200 dark:border-zinc-800 pt-4 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                Looking for something else? The{' '}
                <Link
                  to="/contact-us"
                  className="font-semibold text-violet-700 hover:text-violet-900 dark:text-violet-400 dark:hover:text-violet-300"
                >
                  contact page
                </Link>{' '}
                is the place for general questions.
              </p>
            </div>
          </aside>
        </div>
      </Container>
    </div>
  );
}
