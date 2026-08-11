import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import Button from '../components/ui/Button';
import SmartImage from '../components/ui/SmartImage';
import { useAsyncData } from '../hooks/useAsyncData';
import { getDestinationsCached } from '../services/destinationsApi';
import { SITE, whatsappLink } from '../config/site';

/**
 * About page.
 *
 * Deliberately free of statistics: no traveller counts, years in business,
 * awards or partner logos, because the project states none of those anywhere.
 * The only numbers shown are counted live from the database — how many
 * destinations and how many trips actually exist.
 */
export default function AboutPage() {
  const { data: destinations } = useAsyncData(() => getDestinationsCached(), ['about-destinations']);

  const list = destinations ?? [];
  const tripCount = list.reduce((total, destination) => total + (destination.packageCount ?? 0), 0);
  const heroImage = list.find((destination) => destination.thumbnail)?.thumbnail;

  return (
    <div className="pt-16 sm:pt-[68px]">
      <Container className="py-10 sm:py-14">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'About' }]} />

        <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-400">About Zurii</p>

            <h1 className="text-fluid-display font-bold text-zinc-950 dark:text-zinc-50">Trips planned by people, not algorithms</h1>

            <div className="mt-5 space-y-4 text-fluid-body leading-relaxed text-zinc-700 dark:text-zinc-300">
              <p>
                Zurii is a travel company built around a simple idea: a good holiday is designed, not booked. Every
                itinerary we publish has been put together by hand — the route, the pace, the stays and the things
                worth doing when you get there.
              </p>
              <p>
                We cover the Himalayas and the backwaters as carefully as we cover Bali and the Alps. Whether you want
                a three-day escape or a ten-day journey across Europe, you will always know what is included, what
                isn't, and exactly what happens on each day.
              </p>
              <p>
                And if nothing on the site is quite right, tell us where you want to go. Most of what we plan starts as
                a conversation.
              </p>
            </div>

            {list.length > 0 && (
              <dl className="mt-8 grid grid-cols-2 gap-6 pt-4 sm:max-w-md">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Destinations</dt>
                  <dd className="mt-1 text-2xl font-bold text-zinc-950 dark:text-zinc-50">{list.length}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Trips planned</dt>
                  <dd className="mt-1 text-2xl font-bold text-zinc-950 dark:text-zinc-50">{tripCount}</dd>
                </div>
              </dl>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <Button to="/packages" variant="accent" size="lg">
                Browse our trips
              </Button>
              <Button href={whatsappLink()} target="_blank" rel="noopener noreferrer" variant="secondary" size="lg">
                Talk to us
              </Button>
            </div>
          </div>

          <SmartImage
            src={heroImage}
            alt="A destination Zurii travels to"
            ratio="aspect-[4/5] sm:aspect-[4/3] lg:aspect-[4/5]"
            className="rounded-3xl"
            priority
          />
        </div>
      </Container>

      {/* How we work */}
      <section
        aria-labelledby="how-we-work"
        className="bg-zinc-50/70 dark:bg-zinc-900/60"
      >
        <Container className="section-gap">
          <h2 id="how-we-work" className="text-fluid-section font-bold text-zinc-950 dark:text-zinc-50">
            How planning with us works
          </h2>

          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {[
              {
                step: '01',
                title: 'Tell us the shape of the trip',
                body: 'Where, roughly when, how many of you, and the sort of pace you enjoy.',
              },
              {
                step: '02',
                title: 'We send an itinerary and a price',
                body: 'Day by day, with stays and inclusions written out. Adjust anything you like.',
              },
              {
                step: '03',
                title: 'You travel, we stay reachable',
                body: 'One contact before you leave and while you are away, on call or WhatsApp.',
              },
            ].map((item) => (
              <li key={item.step}>
                <span className="text-xs font-bold tracking-widest text-violet-700 dark:text-violet-400">{item.step}</span>
                <h3 className="mt-2 text-base font-bold text-zinc-950 dark:text-zinc-50">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{item.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Contact */}
      <Container className="section-gap">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Speak to us</h3>
            <ul className="mt-2 space-y-1">
              {SITE.phones.map((phone) => (
                <li key={phone.href}>
                  <a
                    href={phone.href}
                    className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 hover:text-violet-700 dark:hover:text-violet-400"
                  >
                    {phone.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Office</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              {SITE.address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Hours</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              {SITE.hours.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>
          </div>
        </div>
      </Container>
    </div>
  );
}
