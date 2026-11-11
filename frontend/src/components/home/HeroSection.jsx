import { useEffect, useState } from 'react';

import Button from '../ui/Button';
import Container from '../ui/Container';
import ResponsiveImage from '../ui/ResponsiveImage';
import TravelSearch from '../travel/TravelSearch';

/**
 * Homepage hero: one full-bleed travel photograph behind a controlled dark
 * scrim, concise copy, and the travel search panel overlapping the bottom edge.
 *
 * Slides come from the featured packages already fetched by the homepage, so
 * the hero adds no request of its own.
 *
 * Only the first slide is in the document on first paint — it is the largest
 * contentful paint, so it loads eagerly, at high priority, and at the width
 * the viewport needs rather than one fixed desktop size. Each later slide is
 * mounted a couple of seconds before its turn: stacked slides all sit inside
 * the viewport, so `loading="lazy"` never deferred them, and every one was
 * downloaded at full size before the visitor had seen the first.
 * Rotation stops entirely under prefers-reduced-motion, and then no further
 * slide is ever fetched.
 */

const ROTATE_MS = 6000;
/** How long before its turn the next slide starts loading. */
const PRELOAD_LEAD_MS = 2500;

/** A remote Unsplash cover (not a locally hosted asset) is asked for a hero-sized file. */
function heroSized(url) {
  if (!url) return url;
  if (!url.includes('images.unsplash.com')) return url;
  return `${url.split('?')[0]}?q=80&w=2000&auto=format&fit=crop`;
}

export default function HeroSection({ slides = [] }) {
  const [current, setCurrent] = useState(0);
  // Slides 0..mounted-1 are rendered. Rotation is sequential, so a count is enough.
  const [mounted, setMounted] = useState(1);

  const usable = slides.filter((slide) => slide.heroImage);

  useEffect(() => {
    if (usable.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const count = usable.length;
    const preload = setTimeout(() => setMounted((n) => Math.max(n, Math.min(count, current + 2))), ROTATE_MS - PRELOAD_LEAD_MS);
    const rotate = setTimeout(() => setCurrent((prev) => (prev + 1) % count), ROTATE_MS);
    return () => {
      clearTimeout(preload);
      clearTimeout(rotate);
    };
  }, [current, usable.length]);

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

        {usable.slice(0, Math.max(mounted, current + 1)).map((slide, index) => (
          <ResponsiveImage
            key={slide.slug}
            src={heroSized(slide.heroImage)}
            alt=""
            aria-hidden="true"
            /* The width the photo is drawn at, not the viewport's: below `xl` the
               hero is taller than a landscape photo scaled to the screen width,
               so `object-cover` draws it 1100–1600 px wide and crops the sides. */
            sizes="(min-width: 1280px) 100vw, (min-width: 640px) 1200px, 1500px"
            /* Mounting is the deferral, so each slide is eager once mounted;
               only the first competes for bandwidth at high priority. */
            priority={index === 0}
            loading="eager"
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
        <div className="relative">
          <TravelSearch />

          {usable.length > 1 && (
          // Anchored just above the search panel's right end. Pinned to the
          // hero's corner they sat on top of the panel from lg to ~1366px wide.
          // Each button is a 24×24 target (WCAG 2.5.8) around the same 6px dot.
          // After the form in the DOM, so the tab order is unchanged.
          <div className="absolute bottom-full right-0 mb-2 hidden lg:flex">
          {usable.map((slide, index) => (
            <button
              key={slide.slug}
              type="button"
              onClick={() => setCurrent(index)}
              aria-label={`Show ${slide.title}`}
              aria-current={index === current}
              className="group flex h-6 min-w-6 items-center justify-center focus-visible:outline-none"
            >
              <span
                aria-hidden="true"
                className={`block h-1.5 rounded-full transition-all duration-300 group-focus-visible:ring-2 group-focus-visible:ring-white ${
                  index === current ? 'w-7 bg-white' : 'w-2.5 bg-white/45 group-hover:bg-white/70'
                }`}
              />
            </button>
          ))}
          </div>
          )}
        </div>
      </Container>
    </section>
  );
}
