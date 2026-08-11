import { useEffect, useState } from 'react';

import Button from '../ui/Button';
import Container from '../ui/Container';
import TravelSearch from '../travel/TravelSearch';

/**
 * Homepage hero: one full-bleed travel photograph behind a controlled dark
 * scrim, concise copy, and the travel search panel overlapping the bottom edge.
 *
 * Slides come from the featured packages already fetched by the homepage, so
 * the hero adds no request of its own. The first image loads eagerly and at
 * high priority (it is the largest contentful paint); the rest are lazy.
 * Rotation stops entirely under prefers-reduced-motion.
 */

const ROTATE_MS = 6000;

/** Unsplash serves a larger, better-compressed file when asked. */
function heroSized(url) {
  if (!url) return url;
  if (!url.includes('images.unsplash.com')) return url;
  return `${url.split('?')[0]}?q=80&w=2000&auto=format&fit=crop`;
}

export default function HeroSection({ slides = [] }) {
  const [current, setCurrent] = useState(0);

  const usable = slides.filter((slide) => slide.heroImage);

  useEffect(() => {
    if (usable.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = setInterval(() => setCurrent((prev) => (prev + 1) % usable.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [usable.length]);

  const active = usable[current];

  // Two things about the layout below:
  //
  // 1. The section has no `overflow-hidden` — the search panel overhangs the
  //    hero's bottom edge on wide screens, and clipping the section cut it in
  //    half. The backdrop wrapper does the clipping the images need instead.
  // 2. That overhang only happens from `lg` up. Stacked into a single column the
  //    panel is five fields tall, and pulling it up over the hero buried the
  //    supporting line and both CTAs on a phone. Below `lg` it simply sits in
  //    flow beneath the copy.
  return (
    <section className="relative isolate flex min-h-[560px] flex-col justify-end bg-zinc-900 pb-10 pt-32 sm:min-h-[620px] sm:pb-12 lg:min-h-[720px] lg:pb-36">
      {/* Backdrop */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {usable.length === 0 && <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900" />}

        {usable.map((slide, index) => (
          <img
            key={slide.slug}
            src={heroSized(slide.heroImage)}
            alt=""
            aria-hidden="true"
            loading={index === 0 ? 'eager' : 'lazy'}
            fetchPriority={index === 0 ? 'high' : 'low'}
            /* Portrait crops keep the subject centred; wide screens favour the
               upper third where horizons and skylines sit. */
            className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-[1200ms] ease-out sm:object-[center_35%] ${
              index === current ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ))}

        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/35" />
      </div>

      <Container>
        <div className="max-w-2xl">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
            Curated journeys · Personally planned
          </p>

          <h1 className="text-fluid-hero font-bold text-white">Explore the world with Zurii</h1>

          <p className="mt-4 max-w-xl text-fluid-subtitle text-white/85">
            Curated holidays and unforgettable experiences, designed around the way you want to travel.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button to="/packages" variant="accent" size="lg">
              Browse All Trips
            </Button>
            <Button
              to="/plan-my-trip"
              variant="secondaryOnDark"
              size="lg"
            >
              Plan My Trip
            </Button>
          </div>

          {active?.title && (
            <p className="mt-6 text-xs font-medium text-white/60">
              Now trending: <span className="text-white/85">{active.title}</span>
            </p>
          )}
        </div>
      </Container>

      {/* In flow on small screens; overhanging the hero's lower edge from lg up. */}
      <Container className="mt-8 lg:absolute lg:inset-x-0 lg:bottom-0 lg:mt-0 lg:translate-y-1/2">
        <TravelSearch />
      </Container>

      {usable.length > 1 && (
        <div className="absolute bottom-6 right-6 hidden gap-1.5 lg:flex">
          {usable.map((slide, index) => (
            <button
              key={slide.slug}
              type="button"
              onClick={() => setCurrent(index)}
              aria-label={`Show ${slide.title}`}
              aria-current={index === current}
              className={`h-1.5 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                index === current ? 'w-7 bg-white' : 'w-2.5 bg-white/45 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
