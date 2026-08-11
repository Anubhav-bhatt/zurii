import Container from '../ui/Container';
import SectionHeader from '../ui/SectionHeader';

/**
 * Trust section. Four points, each describing something the site and data
 * actually deliver — curated itineraries, a human contact, prices shown up
 * front, and detailed day-by-day plans. No statistics, awards or claims that
 * the business has not stated anywhere in the project.
 */

const POINTS = [
  {
    title: 'Curated Experiences',
    body: 'Every itinerary is planned by hand — not assembled from a booking feed.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.3 9.4l6.1-.8L12 3z"
      />
    ),
  },
  {
    title: 'Personal Travel Support',
    body: 'Talk to a real travel expert before, during and after your trip.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 20h3v-6a8 8 0 10-16 0v6h3m10 0v-5H7v5m10 0H7"
      />
    ),
  },
  {
    title: 'Transparent Pricing',
    body: "What's included and what isn't is listed on every package page.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 14l6-6m-5.5-.5h.01M14.5 16.5h.01M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v11a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5v-11z"
      />
    ),
  },
  {
    title: 'Detailed Day-by-Day Plans',
    body: 'You know where you are staying and what you are doing, every day.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 7V3m8 4V3M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"
      />
    ),
  },
];

export default function WhyZurii() {
  return (
    <section aria-labelledby="why-zurii" className="bg-zinc-50/70 dark:bg-zinc-900/60">
      <Container className="section-gap">
        <SectionHeader
          id="why-zurii"
          align="center"
          eyebrow="Why Zurii"
          title="Travel planned properly"
          description="A small team, a careful approach, and no surprises along the way."
        />

        <ul className="grid grid-cols-1 gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
          {POINTS.map((point) => (
            <li key={point.title}>
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-400">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
                  {point.icon}
                </svg>
              </span>
              <h3 className="text-base font-bold text-zinc-950 dark:text-zinc-50">{point.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{point.body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
