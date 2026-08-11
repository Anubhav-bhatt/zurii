import Container from '../ui/Container';
import SectionHeader from '../ui/SectionHeader';
import CardRail from '../ui/CardRail';

/**
 * Testimonials.
 *
 * Content comes from the project's existing testimonial data — the same six
 * entries the previous section rendered. Nothing here is generated: if the data
 * is empty the section does not render at all rather than showing invented
 * reviews.
 */

const Stars = ({ rating }) => (
  <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
    {Array.from({ length: 5 }, (_, i) => (
      <svg
        key={i}
        aria-hidden="true"
        viewBox="0 0 20 20"
        /* Unfilled stars use the strong-border shade in dark, not zinc-800:
           against the zinc-900 card an -800 fill disappears entirely. */
        className={`h-3.5 w-3.5 ${i < rating ? 'fill-amber-400' : 'fill-zinc-200 dark:fill-zinc-700'}`}
      >
        <path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.07 3.29a1 1 0 00.95.69h3.46c.97 0 1.37 1.24.59 1.81l-2.8 2.03a1 1 0 00-.37 1.12l1.07 3.3c.3.91-.75 1.68-1.54 1.11l-2.8-2.03a1 1 0 00-1.17 0l-2.8 2.03c-.79.57-1.84-.2-1.54-1.11l1.07-3.3a1 1 0 00-.36-1.12l-2.8-2.03c-.79-.57-.39-1.81.58-1.81h3.47a1 1 0 00.95-.69l1.07-3.29z" />
      </svg>
    ))}
  </div>
);

export default function TestimonialsSection({ testimonials = [] }) {
  if (testimonials.length === 0) return null;

  const visible = testimonials.slice(0, 3);

  return (
    <Container as="section" aria-labelledby="testimonials" className="section-gap">
      <SectionHeader
        id="testimonials"
        align="center"
        eyebrow="Travellers"
        title="What our travellers say"
      />

      <CardRail grid="md:grid-cols-3 sm:grid-cols-2 sm:gap-5">
        {visible.map((testimonial) => (
            <figure key={testimonial.id} className="flex h-full flex-col rounded-2xl border border-zinc-200/80 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <Stars rating={testimonial.rating} />

              <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                “{testimonial.text}”
              </blockquote>

              <figcaption className="mt-5 flex items-center gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                {testimonial.image && (
                  <img
                    src={testimonial.image}
                    alt=""
                    loading="lazy"
                    className="h-10 w-10 shrink-0 rounded-full bg-zinc-100 object-cover dark:bg-zinc-800"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">{testimonial.name}</p>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {[testimonial.trip, testimonial.city].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </figcaption>
            </figure>
        ))}
      </CardRail>
    </Container>
  );
}
