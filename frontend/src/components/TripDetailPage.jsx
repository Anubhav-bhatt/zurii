import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getTripById } from "../data";
import GetQuoteModal from "./GetQuoteModal";

const statusStyle = {
  available: "bg-emerald-100 text-emerald-700",
  filling: "bg-amber-100 text-amber-700",
  soldout: "bg-gray-200 text-gray-400 line-through",
};

/* ── Lightbox Component ── */
const GalleryLightbox = ({ images, activeIndex, onClose, onPrev, onNext }) => {
  if (activeIndex === null) return null;
  return (
    <div 
      className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-sm flex items-center justify-center animate-backdrop-in"
      onClick={onClose}
    >
      {/* Close button */}
      <button 
        onClick={onClose}
        className="touch-target absolute top-6 right-6 w-11 h-11 bg-white/10 hover:bg-white/20 active:scale-95 rounded-full flex items-center justify-center text-white text-xl transition z-50"
      >
        ✕
      </button>

      {/* Counter */}
      <div className="absolute top-6 left-6 text-white/60 text-sm font-medium pt-3">
        {activeIndex + 1} / {images.length}
      </div>

      {/* Previous */}
      {images.length > 1 && (
        <button 
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="touch-target absolute left-4 md:left-8 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-2xl transition"
        >
          ‹
        </button>
      )}

      {/* Image */}
      <img 
        src={images[activeIndex]} 
        alt={`Gallery ${activeIndex + 1}`} 
        className="max-h-[80vh] max-w-[85vw] md:max-h-[85vh] md:max-w-[90vw] object-contain rounded-2xl shadow-2xl animate-fade-slide-up"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Next */}
      {images.length > 1 && (
        <button 
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="touch-target absolute right-4 md:right-8 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-2xl transition"
        >
          ›
        </button>
      )}
    </div>
  );
};

const TripDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const trip = getTripById(id);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [showQuoteModal, setShowQuoteModal] = useState(false);

  if (!trip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50">
        <h1 className="text-2xl font-bold text-gray-800">Trip not found</h1>
        <button onClick={() => navigate("/")} className="px-6 py-3 bg-violet-600 text-white rounded-xl touch-target">
          Back to Home
        </button>
      </div>
    );
  }

  const galleryImages = trip.gallery && trip.gallery.length > 0 ? trip.gallery : [];

  const handleWhatsApp = () => {
    const phoneNumber = "919906892984";
    const message = `Hello Zurii Travels! I am interested in the premium package for "${trip.title}" (${trip.duration || ""}). Could you please connect me with a luxury travel concierge?`;
    window.open(`https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24 md:pb-12">
      {/* HERO */}
      <div className="relative h-[45vh] sm:h-[55vh] md:h-[60vh] overflow-hidden">
        <img src={trip.heroImage} alt={trip.title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

        <button
          onClick={() => navigate(-1)}
          className="touch-target absolute top-24 md:top-28 left-6 z-10 w-11 h-11 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full flex items-center justify-center text-white text-lg transition active:scale-95 shadow-sm"
          aria-label="Go Back"
        >
          ←
        </button>

        <div className="absolute bottom-6 left-4 right-4 sm:left-8 sm:right-8 max-content text-white">
          <p className="text-[10px] sm:text-xs uppercase tracking-widest text-white/70 mb-1.5 font-bold">{trip.subtitle}</p>
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-black mb-2.5 leading-tight tracking-tight">{trip.title}</h1>
          <p className="text-xs sm:text-base text-white/80 font-medium line-clamp-2 max-w-2xl">{trip.tagline}</p>

          <div className="flex flex-wrap gap-2 mt-4 text-xs">
            <span className="bg-white/10 backdrop-blur px-3 py-1.5 rounded-full font-semibold border border-white/10">⭐ {trip.rating} ({trip.reviews} reviews)</span>
            <span className="bg-white/10 backdrop-blur px-3 py-1.5 rounded-full font-semibold border border-white/10">🕐 {trip.duration}</span>
            {trip.groupSize && <span className="bg-white/10 backdrop-blur px-3 py-1.5 rounded-full font-semibold border border-white/10">👥 {trip.groupSize}</span>}
            {trip.difficulty && <span className="bg-white/10 backdrop-blur px-3 py-1.5 rounded-full font-semibold border border-white/10">📊 {trip.difficulty}</span>}
          </div>
        </div>
      </div>

      {/* CONTENT CONTAINER */}
      <div className="max-content section-padding py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main info panel */}
          <div className="lg:col-span-2 space-y-10 sm:space-y-12">
            
            {/* OVERVIEW */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">Overview</h2>
              <p className="text-gray-600 leading-relaxed text-sm sm:text-base md:text-lg font-medium">{trip.overview}</p>
            </div>

            {/* ITINERARY */}
            {trip.itinerary && (
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Day-by-Day Itinerary</h2>
                <div className="space-y-4">
                  {trip.itinerary.map((day) => (
                    <div key={day.day} className="bg-white rounded-3xl p-5 shadow-xs border border-zinc-200/40 hover:shadow-[0_8px_24px_rgba(0,0,0,0.03)] hover:border-zinc-300/60 transition duration-300">
                      <div className="flex items-start gap-4">
                        <div className="shrink-0 w-11 h-11 bg-violet-50 text-violet-600 border border-violet-100 rounded-2xl flex items-center justify-center font-bold text-sm">
                          D{day.day}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-gray-900 text-sm sm:text-base leading-snug">{day.title}</h3>
                          <p className="text-gray-500 mt-1.5 text-xs sm:text-sm leading-relaxed font-medium">{day.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* INCLUSIONS / EXCLUSIONS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              {trip.inclusions && (
                <div className="bg-emerald-50/40 border border-emerald-100/50 rounded-3xl p-6">
                  <h3 className="text-base sm:text-lg font-bold text-emerald-800 mb-4 flex items-center gap-1.5">
                    <span>✅</span> What's Included
                  </h3>
                  <ul className="space-y-2.5">
                    {trip.inclusions.map((item, i) => (
                      <li key={i} className="text-emerald-700 text-xs sm:text-sm flex items-start gap-2 leading-relaxed font-medium">
                        <span className="mt-1.5 text-emerald-500 font-bold w-1 h-1 bg-emerald-500 rounded-full shrink-0" /> 
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {trip.exclusions && (
                <div className="bg-red-50/40 border border-red-100/50 rounded-3xl p-6">
                  <h3 className="text-base sm:text-lg font-bold text-red-800 mb-4 flex items-center gap-1.5">
                    <span>❌</span> Not Included
                  </h3>
                  <ul className="space-y-2.5">
                    {trip.exclusions.map((item, i) => (
                      <li key={i} className="text-red-700 text-xs sm:text-sm flex items-start gap-2 leading-relaxed font-medium">
                        <span className="mt-1.5 text-red-500 font-bold w-1 h-1 bg-red-500 rounded-full shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* BATCHES */}
            {trip.batches && (
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Upcoming Batches</h2>
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {trip.batches.map((batch) => (
                    <div
                      key={batch.id || batch.date}
                      className={`rounded-2xl p-4 border text-center transition-premium ${batch.status === "soldout" ? "bg-zinc-50 border-zinc-200/50" : "bg-white border-zinc-200/50 shadow-xs hover:shadow-md"}`}
                    >
                      <p className="font-bold text-gray-900 text-xs sm:text-sm">{batch.date}</p>
                      <p className="text-violet-600 font-bold text-base sm:text-lg mt-1">{batch.price}</p>
                      {batch.slots !== undefined && (
                        <p className="text-[10px] sm:text-xs text-gray-400 mt-1">{batch.slots} slots left</p>
                      )}
                      <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-[9px] sm:text-xs font-bold uppercase tracking-wider ${statusStyle[batch.status] || ""}`}>
                        {batch.status === "soldout" ? "Sold Out" : batch.status === "filling" ? "Filling Fast" : "Available"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* GALLERY */}
            {trip.gallery && (
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Gallery</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                  {galleryImages.length > 0 ? galleryImages.map((img, i) => (
                    <img 
                      key={i} 
                      src={img} 
                      alt={`Gallery ${i + 1}`} 
                      onClick={() => setLightboxIndex(i)}
                      className="rounded-2xl h-36 sm:h-44 md:h-48 w-full object-cover shadow-xs border border-zinc-200/20 hover:shadow-md hover:scale-[1.01] transition-all duration-300 cursor-pointer" 
                    />
                  )) : (
                    <p className="text-gray-400 text-sm">Images coming soon.</p>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* SIDEBAR BOOKING CARD (Sticky on Desktop) */}
          <div className="hidden lg:block lg:col-span-1">
            <div className="bg-white rounded-3xl border border-zinc-200/50 p-6 flex flex-col items-center justify-center text-center shadow-xs transition-premium md:sticky md:top-24 max-w-sm mx-auto">
              <span className="text-[10px] font-bold text-violet-600 uppercase tracking-widest mb-1">Starting Price</span>
              {trip.originalPrice && (
                <span className="text-zinc-400 line-through text-xs sm:text-sm">{trip.originalPrice}</span>
              )}
              <span className="text-3xl sm:text-4xl font-extrabold text-zinc-950 tracking-tight">{trip.price}</span>
              <span className="text-zinc-500 text-xs mt-1 font-semibold">per person</span>

              <div className="flex flex-col gap-2.5 mt-6 w-full">
                <button
                  onClick={() => setShowQuoteModal(true)}
                  className="touch-target w-full h-11 rounded-full bg-zinc-950 text-white font-semibold text-xs sm:text-sm hover:bg-zinc-800 active:scale-[0.98] transition-all duration-300 flex items-center justify-center shadow-xs focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2"
                  aria-label={`Get quote for ${trip.title}`}
                >
                  Get Quote
                </button>

                <button
                  onClick={handleWhatsApp}
                  className="touch-target w-full h-11 rounded-full bg-emerald-500/[0.02] border border-emerald-500/15 text-emerald-700 font-semibold text-xs sm:text-sm hover:bg-emerald-500/[0.06] hover:border-emerald-500/25 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                  aria-label={`Inquire about ${trip.title} on WhatsApp`}
                >
                  <svg
                    className="w-4 h-4 fill-current shrink-0"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  <span>WhatsApp Concierge</span>
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* MOBILE BOTTOM STICKY BAR CTA (Compliant with Apple bottom action standards) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-xl border-t border-zinc-200/50 p-4 pb-safe flex items-center justify-between lg:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold">Price per person</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-extrabold text-zinc-950 tracking-tight">{trip.price}</span>
            {trip.originalPrice && (
              <span className="text-[10px] text-zinc-400 line-through font-semibold">{trip.originalPrice}</span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {/* Quick WhatsApp icon button */}
          <button
            onClick={handleWhatsApp}
            className="touch-target w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-500/15 flex items-center justify-center text-emerald-600 hover:bg-emerald-100 hover:border-emerald-500/25 active:scale-95 transition-all duration-300 shrink-0"
            aria-label="WhatsApp Concierge"
          >
            <svg
              className="w-5 h-5 fill-current"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </button>

          <button
            onClick={() => setShowQuoteModal(true)}
            className="touch-target px-6 h-11 bg-zinc-950 hover:bg-zinc-800 text-white font-bold text-xs uppercase tracking-wider rounded-2xl active:scale-95 transition-all shadow-xs flex items-center justify-center"
          >
            Get Quote
          </button>
        </div>
      </div>

      {/* Lightbox Overlay */}
      <GalleryLightbox
        images={galleryImages}
        activeIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onPrev={() => setLightboxIndex((prev) => (prev - 1 + galleryImages.length) % galleryImages.length)}
        onNext={() => setLightboxIndex((prev) => (prev + 1) % galleryImages.length)}
      />

      {/* Get Quote Modal */}
      <GetQuoteModal
        isOpen={showQuoteModal}
        onClose={() => setShowQuoteModal(false)}
        tripName={trip.title}
      />
    </div>
  );
};

export default TripDetailPage;
