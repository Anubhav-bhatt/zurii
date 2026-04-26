import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { categories, internationalDestinations, domesticDestinations, tripDetails, topbarCategories } from "../data";
import GetQuoteModal from "./GetQuoteModal";

const pageConfig = {
  international: {
    title: "International Destinations",
    tagline: "Explore the world's most breathtaking destinations",
    description: "From the neon-lit streets of Tokyo to the sun-kissed shores of Bali, our international tours are designed to give you the most immersive experience possible.",
    image: "https://images.unsplash.com/photo-1518684079-3c830dffeef0",
  },
  "european-tours": {
    title: "European Tours",
    tagline: "Discover the timeless charm of Europe",
    description: "Europe is a tapestry of history, art, and culinary excellence. Walk through the romantic streets of Paris, marvel at the Swiss Alps, cruise the canals of Venice, and dance under the Mediterranean sun.",
    image: "https://images.unsplash.com/photo-1467269204594-9661b134dd2b",
  },
  "budget-tours": {
    title: "Budget Tours",
    tagline: "Unforgettable experiences without breaking the bank",
    description: "Travel doesn't have to be expensive to be extraordinary. Our budget tours are carefully curated to maximize experiences while keeping costs low.",
    image: "https://images.unsplash.com/photo-1540541338287-41700207dee6",
  },
  domestic: {
    title: "Domestic Destinations",
    tagline: "Explore India, state by state",
    description: "Discover curated travel experiences across India — from the backwaters of Kerala to the high passes of Ladakh.",
    image: "https://images.unsplash.com/photo-1593693397690-362cb9666fc2",
  },
  adventure: {
    title: "Adventure Tours",
    tagline: "Push your limits with adrenaline-fueled trips",
    description: "For the thrill seekers and explorers — white water rafting, mountain treks, desert safaris, and everything that gets your heart racing.",
    image: "https://images.unsplash.com/photo-1581793745862-99fde7fa73d2",
  },
  beach: {
    title: "Beach Getaways",
    tagline: "Sun, sand, and endless ocean vibes",
    description: "Unwind on pristine beaches — from the tropical shores of Bali and Andaman to the golden sands of Goa and Maldives.",
    image: "https://images.unsplash.com/photo-1540541338287-41700207dee6",
  },
  heritage: {
    title: "Heritage & Culture",
    tagline: "Walk through centuries of history and tradition",
    description: "Explore ancient temples, majestic forts, and colonial architecture. Our heritage tours immerse you in the rich cultural tapestry of destinations worldwide.",
    image: "https://images.unsplash.com/photo-1477587458883-47145ed94245",
  },
};

// Keywords for tag-based trip filtering
const tagKeywords = {
  adventure: ["adventure", "trek", "rafting", "safari", "expedition", "circuit", "kheerganga", "spiti", "ladakh", "rishikesh"],
  beach: ["beach", "island", "coast", "backwater", "bali", "andaman", "maldives", "goa", "havelock"],
  heritage: ["heritage", "cultural", "spiritual", "temple", "fort", "palace", "varanasi", "pushkar", "udaipur", "jaipur"],
};

const filterTripsByTag = (tag) => {
  const keywords = tagKeywords[tag] || [];
  return Object.entries(tripDetails)
    .filter(([, t]) => {
      const blob = `${t.title} ${t.subtitle} ${t.tagline} ${t.overview}`.toLowerCase();
      return keywords.some((k) => blob.includes(k));
    })
    .map(([id, t]) => ({ id, ...t }));
};

const europeanKeywords = ["paris", "france", "santorini", "greece", "swiss", "europe", "italy", "spain", "london"];

const budgetTrips = Object.entries(tripDetails)
  .filter(([, t]) => {
    const raw = String(t.price).replace(/[^0-9]/g, "");
    const p = parseInt(raw, 10);
    return p > 0 && p < 25000;
  })
  .map(([id, t]) => ({ id, ...t }));

const ExplorePage = () => {
  const { slug: paramSlug } = useParams();
  const navigate = useNavigate();
  const [quoteTrip, setQuoteTrip] = useState(null);

  // /international route has no slug param
  const slug = paramSlug || "international";

  // Check if it's a topbarCategories match (europe, turkey, japan, azerbaijan)
  const topbarCat = topbarCategories.find(
    (c) => c.name.toLowerCase() === slug.toLowerCase()
  );

  const info = pageConfig[slug];

  // If no predefined page and no topbar category match
  if (!info && !topbarCat) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Category not found</h1>
        <button onClick={() => navigate("/")} className="px-6 py-3 bg-violet-600 text-white rounded-xl">Back to Home</button>
      </div>
    );
  }

  // ─── Topbar Category Page (Europe, Turkey, Japan, Azerbaijan) ──
  if (topbarCat && !info) {
    const relatedTrips = Object.entries(tripDetails)
      .filter(([, t]) => {
        const blob = `${t.title} ${t.subtitle} ${t.tagline} ${t.overview}`.toLowerCase();
        return blob.includes(topbarCat.name.toLowerCase());
      })
      .map(([id, t]) => ({ id, ...t }));

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="relative h-[55vh] overflow-hidden">
          <div className="w-full h-full bg-gradient-to-br from-violet-500 to-indigo-700" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <button onClick={() => navigate(-1)} className="absolute top-6 left-6 z-10 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/40 transition">←</button>
          <div className="absolute bottom-10 left-6 right-6 max-w-5xl mx-auto text-white">
            <p className="text-sm uppercase tracking-widest text-white/70 mb-2">Travel Style</p>
            <h1 className="text-5xl font-black">{topbarCat.name}</h1>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-12 space-y-12">
          {/* Places / Cities */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Popular Places</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {topbarCat.places.map((place, idx) => (
                <div
                  key={idx}
                  onClick={() => navigate(`/destination/${place.city || place.country}`)}
                  className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:border-violet-200 cursor-pointer transition"
                >
                  <h3 className="text-lg font-bold text-gray-900">{place.city || place.country}</h3>
                  {place.description && <p className="text-gray-500 text-sm mt-1">{place.description}</p>}
                  {place.cities && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {place.cities.slice(0, 5).map((c) => (
                        <span key={c} className="text-xs bg-violet-50 text-violet-600 px-2 py-1 rounded-full">{c}</span>
                      ))}
                    </div>
                  )}
                  {place.highlights && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {place.highlights.slice(0, 3).map((h, i) => (
                        <span key={i} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full">{h}</span>
                      ))}
                    </div>
                  )}
                  <p className="text-violet-500 text-sm font-semibold mt-3">Explore →</p>
                </div>
              ))}
            </div>
          </div>

          {relatedTrips.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Trip Packages</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {relatedTrips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} navigate={navigate} onGetQuote={setQuoteTrip} />
                ))}
              </div>
            </div>
          )}
        </div>

        <GetQuoteModal isOpen={!!quoteTrip} onClose={() => setQuoteTrip(null)} tripName={quoteTrip?.title || ""} />
      </div>
    );
  }

  // ─── Predefined Category Pages ───────────────────
  const cat = categories.find(
    (c) => c.title.toLowerCase().replace(/\s+/g, "-") === slug
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HERO */}
      <div className="relative h-[55vh] overflow-hidden">
        <img src={info.image} alt={info.title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <button onClick={() => navigate(-1)} className="absolute top-6 left-6 z-10 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/40 transition">←</button>
        <div className="absolute bottom-10 left-6 right-6 max-w-5xl mx-auto text-white">
          {cat && <p className="text-sm uppercase tracking-widest text-white/70 mb-2">{cat.subtitle}</p>}
          <h1 className="text-5xl font-black mb-2">{info.title}</h1>
          <p className="text-lg text-white/80">{info.tagline}</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12 space-y-12">
        <p className="text-gray-600 leading-relaxed text-lg">{info.description}</p>

        {/* INTERNATIONAL */}
        {slug === "international" && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Popular Destinations</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {internationalDestinations.map((dest) => (
                <div key={dest.country} onClick={() => navigate(`/destination/${dest.country}`)} className="group bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-lg cursor-pointer transition">
                  <img src={dest.thumbnail} alt={dest.country} className="h-44 w-full object-cover group-hover:scale-105 transition duration-500" />
                  <div className="p-5">
                    <h3 className="text-lg font-bold text-gray-900">{dest.country}</h3>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {dest.cities.map((city) => (
                        <span key={city} className="text-xs bg-violet-100 text-violet-600 px-3 py-1 rounded-full">{city}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EUROPEAN TOURS */}
        {slug === "european-tours" && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">European Trip Packages</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(tripDetails)
                .filter(([, t]) => {
                  const loc = `${t.title} ${t.subtitle}`.toLowerCase();
                  return europeanKeywords.some((k) => loc.includes(k));
                })
                .map(([id, trip]) => (
                  <TripCard key={id} trip={{ id, ...trip }} navigate={navigate} onGetQuote={setQuoteTrip} />
                ))}
            </div>
          </div>
        )}

        {/* BUDGET TOURS */}
        {slug === "budget-tours" && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Budget-Friendly Packages</h2>
            {budgetTrips.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {budgetTrips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} navigate={navigate} onGetQuote={setQuoteTrip} />
                ))}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {domesticDestinations.slice(0, 6).map((dest) => (
                  <div key={dest.state} onClick={() => navigate(`/destination/${dest.state}`)} className="group bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-lg cursor-pointer transition">
                    {dest.thumbnail && <img src={dest.thumbnail} alt={dest.state} className="h-44 w-full object-cover group-hover:scale-105 transition duration-500" />}
                    <div className="p-5">
                      <h3 className="text-lg font-bold text-gray-900">{dest.state}</h3>
                      {dest.highlight && <p className="text-gray-500 text-sm mt-1">{dest.highlight}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* DOMESTIC */}
        {slug === "domestic" && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">All Domestic Destinations</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {domesticDestinations.map((dest) => (
                <div key={dest.state} onClick={() => navigate(`/destination/${dest.state}`)} className="group bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-lg cursor-pointer transition">
                  {dest.thumbnail ? (
                    <img src={dest.thumbnail} alt={dest.state} className="h-44 w-full object-cover group-hover:scale-105 transition duration-500" />
                  ) : (
                    <div className="h-44 w-full bg-gradient-to-br from-violet-100 to-indigo-200 flex items-center justify-center"><span className="text-4xl opacity-30">🏔️</span></div>
                  )}
                  <div className="p-5">
                    <h3 className="text-lg font-bold text-gray-900">{dest.state}</h3>
                    {dest.highlight && <p className="text-gray-500 text-sm mt-1">{dest.highlight}</p>}
                    {dest.about && <p className="text-gray-400 text-xs mt-2 line-clamp-2">{dest.about}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ADVENTURE / BEACH / HERITAGE */}
        {["adventure", "beach", "heritage"].includes(slug) && (() => {
          const trips = filterTripsByTag(slug);
          return (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">{info.title} Packages</h2>
              {trips.length > 0 ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {trips.map((trip) => (
                    <TripCard key={trip.id} trip={trip} navigate={navigate} onGetQuote={setQuoteTrip} />
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-lg text-center py-8">Packages coming soon!</p>
              )}
            </div>
          );
        })()}
      </div>

      <GetQuoteModal isOpen={!!quoteTrip} onClose={() => setQuoteTrip(null)} tripName={quoteTrip?.title || ""} />
    </div>
  );
};

// Reusable trip card
const TripCard = ({ trip, navigate, onGetQuote }) => (
  <div onClick={() => navigate(`/trip/${trip.id}`)} className="group bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-lg cursor-pointer transition">
    {trip.heroImage && <img src={trip.heroImage} alt={trip.title} className="h-44 w-full object-cover group-hover:scale-105 transition duration-500" />}
    <div className="p-5">
      <h3 className="text-lg font-bold text-gray-900">{trip.title}</h3>
      {trip.tagline && <p className="text-gray-500 text-sm mt-1">{trip.tagline}</p>}
      <div className="flex items-center justify-between mt-3">
        <span className="font-bold text-violet-600">{trip.price}</span>
        {trip.duration && <span className="text-xs text-gray-400">{trip.duration}</span>}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onGetQuote && onGetQuote(trip);
        }}
        className="mt-3 w-full py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold rounded-full hover:brightness-110 active:scale-[0.97] transition-all shadow-md shadow-emerald-500/20"
      >
        💰 Get Quote
      </button>
    </div>
  </div>
);

export default ExplorePage;
