import { Link } from 'react-router-dom';

import Container from '../ui/Container';
import SectionHeader from '../ui/SectionHeader';
import SmartImage from '../ui/SmartImage';
import CardRail from '../ui/CardRail';

/**
 * Category browsing.
 *
 * Every category here maps to a tag that genuinely exists on the migrated
 * packages (adventure, beach, heritage, family) or to the domestic/international
 * split — so no link ever lands on an empty result. Each card carries an image
 * borrowed from a package in that category, which is why the images are passed
 * in rather than hardcoded.
 */

const CATEGORIES = [
  { tag: 'beach', title: 'Beaches & Islands', blurb: 'Coastlines, reefs and slow mornings' },
  { tag: 'adventure', title: 'Adventure', blurb: 'Treks, high passes and open road' },
  { tag: 'heritage', title: 'Heritage & Culture', blurb: 'Old cities, temples and forts' },
  { tag: 'family', title: 'Family Trips', blurb: 'Comfortable, easy-paced journeys' },
];

const KINDS = [
  { kind: 'international', title: 'International', blurb: 'Trips beyond India' },
  { kind: 'domestic', title: 'India', blurb: 'Closer to home' },
];

export default function TravelExperiences({ packages = [] }) {
  /** First package carrying each tag supplies that card's photograph. */
  const imageForTag = (tag) => packages.find((pkg) => pkg.tags?.includes(tag))?.heroImage ?? null;

  const cards = [
    ...CATEGORIES.map((category) => ({
      ...category,
      to: `/packages?tag=${category.tag}`,
      image: imageForTag(category.tag),
    })),
    ...KINDS.map((entry) => ({
      ...entry,
      to: `/packages?tag=${entry.kind}`,
      image: imageForTag(entry.kind),
    })),
  ];

  return (
    <Container as="section" aria-labelledby="travel-experiences" className="section-gap">
      <SectionHeader
        id="travel-experiences"
        eyebrow="Browse by style"
        title="Travel Experiences"
        description="Start from the kind of trip you want, rather than the map."
      />

      {/* Compact browse chips: ~62% slides show almost two categories at once. */}
      <CardRail grid="sm:grid-cols-2 lg:grid-cols-3 sm:gap-4" item="w-[62%]">
        {cards.map((card) => (
            <article key={card.to} className="group relative overflow-hidden rounded-2xl bg-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/20 focus-within:ring-offset-2 dark:focus-within:ring-zinc-100/20 dark:focus-within:ring-offset-zinc-950">
              <SmartImage
                src={card.image}
                alt=""
                ratio="aspect-[5/4] sm:aspect-[16/10]"
                imgClassName="transition-transform duration-500 ease-out group-hover:scale-105"
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <h3 className="text-sm font-bold text-white sm:text-base">
                    <Link
                      to={card.to}
                      className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                    >
                      {card.title}
                    </Link>
                  </h3>
                  <p className="mt-0.5 hidden text-xs text-white/70 sm:block">{card.blurb}</p>
                </div>
              </SmartImage>
            </article>
        ))}
      </CardRail>
    </Container>
  );
}
