import { Link } from 'react-router-dom';

import ResponsiveImage from '../components/ui/ResponsiveImage';
import { whatsappLink } from '../config/site';
import { trackWhatsAppClick } from '../services/marketing';

/**
 * ZT-34: the page had no way to enquire, and the "Goa Offsite Retreat" card
 * showed a photo of Dubai. The Goa card now shows no photo until a licensed
 * Goa image is supplied (listed for the owner in the Phase 5 report).
 */
const CorporateTours = () => (
  <section className="py-20 px-6 max-w-4xl mx-auto min-h-screen">
    <h1 className="text-3xl font-black mb-4 text-gray-900 dark:text-zinc-50">Corporate Tours</h1>
    <p className="text-gray-600 dark:text-zinc-300 mb-8">Tailored tours for teams and organizations. Boost morale, foster teamwork, and create lasting memories with our corporate travel solutions.</p>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
      {tours.map((tour) => (
        <div key={tour.title} className="bg-white dark:bg-zinc-900 rounded-2xl shadow p-4 flex flex-col items-center">
          {tour.image ? (
            <ResponsiveImage src={tour.image} alt={tour.title} sizes="(min-width: 768px) 280px, 100vw" className="w-full h-40 object-cover rounded-xl mb-4" />
          ) : (
            <div className="w-full h-40 rounded-xl mb-4 bg-gradient-to-br from-sky-100 via-cyan-50 to-amber-50 dark:from-sky-950/60 dark:via-zinc-900 dark:to-amber-950/40 flex items-center justify-center" aria-hidden="true">
              <span className="text-4xl">🏖️</span>
            </div>
          )}
          <h2 className="text-lg font-bold mb-2 text-gray-900 dark:text-zinc-50">{tour.title}</h2>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mb-2 text-center">{tour.desc}</p>
        </div>
      ))}
    </div>

    <div className="mt-12 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-6 sm:p-8 text-center">
      <h2 className="text-xl font-bold text-gray-900 dark:text-zinc-50">Planning a team trip?</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-zinc-300 max-w-xl mx-auto">
        Tell us your group size, rough dates and what the trip is for. Our team will come back with a proposal — there is nothing to pay to ask.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link
          to="/plan-my-trip"
          className="touch-target inline-flex items-center rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Plan a corporate trip
        </Link>
        <a
          href={whatsappLink(null, 'corporate')}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackWhatsAppClick('corporate_page')}
          className="touch-target inline-flex items-center rounded-xl border border-zinc-300 px-5 text-sm font-semibold text-zinc-900 hover:bg-white dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Chat on WhatsApp
        </a>
      </div>
    </div>
  </section>
);

export default CorporateTours;

const tours = [
  {
    title: "Team Building in Manali",
    desc: "Adventure activities, bonfire nights, and leadership workshops in the Himalayas.",
    image: "/assets/travel/v1/corporate-team-building-in-manali-bdd492a7/1280.jpg"
  },
  {
    title: "Goa Offsite Retreat",
    desc: "Beachside resorts, strategy sessions, and water sports for your corporate team.",
    // Was the Dubai destination photo. No licensed Goa photo exists yet.
    image: null
  },
  {
    title: "Jaipur Heritage Conference",
    desc: "Palace venues, cultural evenings, and guided city tours for a memorable business event.",
    image: "/assets/travel/v1/corporate-jaipur-heritage-conference-40a64a8b/1280.jpg"
  }
];
