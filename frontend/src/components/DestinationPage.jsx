import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { domesticDestinations, internationalDestinations, internationalFallback, topbarCategories, tripDetails } from "../data";
import GetQuoteModal from "./GetQuoteModal";

const DestinationPage = () => {
  const { name } = useParams();
  const navigate = useNavigate();
  const [quoteTrip, setQuoteTrip] = useState(null);

  // Try domestic match first
  const domestic = domesticDestinations.find(
    (d) => d.state.toLowerCase() === name.toLowerCase()
  );

  // Try international country match (check both arrays)
  let intlCountry = internationalDestinations.find(
    (d) => d.country.toLowerCase() === name.toLowerCase()
  );
  if (!intlCountry) {
    for (const region of internationalFallback) {
      const found = region.countries.find(
        (c) => c.country.toLowerCase() === name.toLowerCase()
      );
      if (found) {
        intlCountry = found;
        break;
      }
    }
  }

  // If name is a city inside internationalFallback, use the parent country's data
  if (!intlCountry && !domestic) {
    outer: for (const region of internationalFallback) {
      for (const country of region.countries) {
        const cityFound = country.cities.find(
          (c) => c.toLowerCase() === name.toLowerCase()
        );
        if (cityFound) {
          intlCountry =
            internationalDestinations.find(
              (d) => d.country.toLowerCase() === country.country.toLowerCase()
            ) || country;
          break outer;
        }
      }
    }
  }

  // Try matching a city inside topbarCategories
  let cityMatch = null;
  let cityParentCountry = null;
  if (!domestic && !intlCountry) {
    for (const cat of topbarCategories) {
      for (const place of cat.places) {
        if (place.city && place.city.toLowerCase() === name.toLowerCase()) {
          cityMatch = place;
          cityParentCountry = cat.name;
          break;
        }
        if (place.cities) {
          const found = place.cities.find((c) => c.toLowerCase() === name.toLowerCase());
          if (found) {
            cityMatch = { city: found, country: place.country };
            cityParentCountry = place.country;
            break;
          }
        }
      }
      if (cityMatch) break;
    }
  }

  // Find related trips for a given search term
  const findRelatedTrips = (term) => {
    const q = term.toLowerCase();
    return Object.entries(tripDetails)
      .filter(([, t]) => {
        const blob = `${t.title} ${t.subtitle} ${t.tagline} ${t.overview}`.toLowerCase();
        return blob.includes(q);
      })
      .map(([id, t]) => ({ id, ...t }));
  };

  // ─── Domestic State ──────────────────────────────
  if (domestic) {
    // Resolve full tripDetail for each tour so we can show images and prices
    const resolvedDomesticTours = (domestic.tours || [])
      .map((tour) => {
        const detail = tripDetails[tour.id];
        return detail ? { id: tour.id, ...detail } : null;
      })
      .filter(Boolean);

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="relative h-[55vh] overflow-hidden">
          {domestic.thumbnail ? (
            <img src={domestic.thumbnail} alt={domestic.state} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-violet-500 to-indigo-700" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

          <button onClick={() => navigate(-1)} className="absolute top-24 md:top-28 left-6 z-10 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/40 transition">←</button>

          <div className="absolute bottom-10 left-6 right-6 max-w-5xl mx-auto text-white">
            {domestic.highlight && <p className="text-sm uppercase tracking-widest text-violet-300 mb-2">{domestic.highlight}</p>}
            <h1 className="text-5xl font-black">{domestic.state}</h1>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-12 space-y-12">
          {domestic.about && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">About {domestic.state}</h2>
              <p className="text-gray-600 leading-relaxed text-lg">{domestic.about}</p>
            </div>
          )}

          {resolvedDomesticTours.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Tour Packages</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {resolvedDomesticTours.map((trip) => (
                  <div
                    key={trip.id}
                    onClick={() => navigate(`/trip/${trip.id}`)}
                    className="group bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-lg cursor-pointer transition"
                  >
                    {trip.heroImage && (
                      <img
                        src={trip.heroImage}
                        alt={trip.title}
                        className="h-44 w-full object-cover group-hover:scale-105 transition duration-500"
                      />
                    )}
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
                          setQuoteTrip(trip);
                        }}
                        className="mt-3 w-full py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold rounded-full hover:brightness-110 active:scale-[0.97] transition-all shadow-md shadow-emerald-500/20"
                      >
                        💰 Get Quote
                      </button>
                      <p className="text-violet-500 text-sm font-semibold mt-3">View Details →</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <GetQuoteModal isOpen={!!quoteTrip} onClose={() => setQuoteTrip(null)} tripName={quoteTrip?.title || ""} />
      </div>
    );
  }

  // ─── International Country ───────────────────────
  if (intlCountry) {
    const related = findRelatedTrips(intlCountry.country);
    // Merge explicit tours array with fuzzy related trips (deduplicated)
    const explicitTourIds = new Set((intlCountry.tours || []).map((t) => t.id));
    const explicitTrips = (intlCountry.tours || [])
      .map((t) => {
        const detail = tripDetails[t.id];
        return detail ? { id: t.id, ...detail } : null;
      })
      .filter(Boolean);
    const extraRelated = related.filter((t) => !explicitTourIds.has(t.id));
    const allTrips = [...explicitTrips, ...extraRelated];

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="relative h-[55vh] overflow-hidden">
          <img src={intlCountry.thumbnail} alt={intlCountry.country} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <button onClick={() => navigate(-1)} className="absolute top-24 md:top-28 left-6 z-10 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/40 transition">←</button>
          <div className="absolute bottom-10 left-6 right-6 max-w-5xl mx-auto text-white">
            <p className="text-sm uppercase tracking-widest text-white/70 mb-2">International</p>
            <h1 className="text-5xl font-black">{intlCountry.country}</h1>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-12 space-y-12">
          {intlCountry.about && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">About {intlCountry.country}</h2>
              <p className="text-gray-600 leading-relaxed text-lg">{intlCountry.about}</p>
            </div>
          )}

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Popular Destinations</h2>
            <div className="flex flex-wrap gap-3">
              {intlCountry.cities.map((city) => (
                <span key={city} className="px-5 py-2.5 bg-white rounded-2xl shadow-sm border border-gray-100 text-sm font-semibold text-gray-700">
                  📍 {city}
                </span>
              ))}
            </div>
          </div>

          {allTrips.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Trip Packages</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {allTrips.map((trip) => (
                  <div key={trip.id} onClick={() => navigate(`/trip/${trip.id}`)} className="group bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-lg cursor-pointer transition">
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
                          setQuoteTrip(trip);
                        }}
                        className="mt-3 w-full py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold rounded-full hover:brightness-110 active:scale-[0.97] transition-all shadow-md shadow-emerald-500/20"
                      >
                        💰 Get Quote
                      </button>
                      <p className="text-violet-500 text-sm font-semibold mt-3">View Details →</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <GetQuoteModal isOpen={!!quoteTrip} onClose={() => setQuoteTrip(null)} tripName={quoteTrip?.title || ""} />
      </div>
    );
  }

  // ─── City Match ──────────────────────────────────
  if (cityMatch) {
    const related = findRelatedTrips(cityMatch.city || name);
    const heroImg = cityMatch.thumbnail || (related.length > 0 ? related[0].heroImage : null);
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="relative h-[55vh] overflow-hidden">
          {heroImg ? (
            <img src={heroImg} alt={cityMatch.city || name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-violet-500 to-indigo-700" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <button onClick={() => navigate(-1)} className="absolute top-24 md:top-28 left-6 z-10 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/40 transition">←</button>
          <div className="absolute bottom-10 left-6 right-6 max-w-5xl mx-auto text-white">
            <p className="text-sm uppercase tracking-widest text-white/70 mb-2">{cityParentCountry}</p>
            <h1 className="text-5xl font-black">{cityMatch.city || name}</h1>
            {cityMatch.description && <p className="text-lg text-white/80 mt-2">{cityMatch.description}</p>}
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-12 space-y-12">
          {cityMatch.highlights && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Highlights</h2>
              <div className="flex flex-wrap gap-3">
                {cityMatch.highlights.map((h, i) => (
                  <span key={i} className="px-4 py-2 bg-violet-50 text-violet-700 rounded-xl text-sm font-medium">{h}</span>
                ))}
              </div>
            </div>
          )}

          {cityMatch.best_for && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Best For</h2>
              <div className="flex flex-wrap gap-3">
                {cityMatch.best_for.map((b, i) => (
                  <span key={i} className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-medium">{b}</span>
                ))}
              </div>
            </div>
          )}

          {related.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Related Trips</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {related.map((trip) => (
                  <div key={trip.id} onClick={() => navigate(`/trip/${trip.id}`)} className="group bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-lg cursor-pointer transition">
                    <img src={trip.heroImage} alt={trip.title} className="h-44 w-full object-cover group-hover:scale-105 transition duration-500" />
                    <div className="p-5">
                      <h3 className="text-lg font-bold text-gray-900">{trip.title}</h3>
                      <p className="text-gray-500 text-sm mt-1">{trip.tagline}</p>
                      <div className="flex items-center justify-between mt-3">
                        <span className="font-bold text-violet-600">{trip.price}</span>
                        <span className="text-xs text-gray-400">{trip.duration}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setQuoteTrip(trip);
                        }}
                        className="mt-3 w-full py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold rounded-full hover:brightness-110 active:scale-[0.97] transition-all shadow-md shadow-emerald-500/20"
                      >
                        💰 Get Quote
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {related.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400 text-lg">Tours for {cityMatch.city || name} coming soon!</p>
              <button onClick={() => navigate("/")} className="mt-4 px-6 py-3 bg-violet-600 text-white rounded-xl font-bold">Back to Home</button>
            </div>
          )}
        </div>

        <GetQuoteModal isOpen={!!quoteTrip} onClose={() => setQuoteTrip(null)} tripName={quoteTrip?.title || ""} />
      </div>
    );
  }

  // ─── Fallback: generic search ────────────────────
  const related = findRelatedTrips(name);
  if (related.length > 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="relative h-[55vh] overflow-hidden">
          <img src={related[0].heroImage} alt={name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <button onClick={() => navigate(-1)} className="absolute top-24 md:top-28 left-6 z-10 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/40 transition">←</button>
          <div className="absolute bottom-10 left-6 right-6 max-w-5xl mx-auto text-white">
            <h1 className="text-5xl font-black capitalize">{name}</h1>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Trips in {name}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {related.map((trip) => (
              <div key={trip.id} onClick={() => navigate(`/trip/${trip.id}`)} className="group bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-lg cursor-pointer transition">
                <img src={trip.heroImage} alt={trip.title} className="h-44 w-full object-cover group-hover:scale-105 transition duration-500" />
                <div className="p-5">
                  <h3 className="text-lg font-bold text-gray-900">{trip.title}</h3>
                  <p className="text-gray-500 text-sm mt-1">{trip.tagline}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="font-bold text-violet-600">{trip.price}</span>
                    <span className="text-xs text-gray-400">{trip.duration}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuoteTrip(trip);
                    }}
                    className="mt-3 w-full py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold rounded-full hover:brightness-110 active:scale-[0.97] transition-all shadow-md shadow-emerald-500/20"
                  >
                    💰 Get Quote
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <GetQuoteModal isOpen={!!quoteTrip} onClose={() => setQuoteTrip(null)} tripName={quoteTrip?.title || ""} />
      </div>
    );
  }

  // ─── 404 ─────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold text-gray-800">Destination not found</h1>
      <p className="text-gray-500 capitalize">"{name}" has no matching trips yet.</p>
      <button onClick={() => navigate("/")} className="px-6 py-3 bg-violet-600 text-white rounded-xl">Back to Home</button>
    </div>
  );
};

export default DestinationPage;
