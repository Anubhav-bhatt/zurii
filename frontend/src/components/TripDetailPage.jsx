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
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-xl transition z-50"
      >
        ✕
      </button>

      {/* Counter */}
      <div className="absolute top-6 left-6 text-white/60 text-sm font-medium">
        {activeIndex + 1} / {images.length}
      </div>

      {/* Previous */}
      {images.length > 1 && (
        <button 
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 md:left-8 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-2xl transition"
        >
          ‹
        </button>
      )}

      {/* Image */}
      <img 
        src={images[activeIndex]} 
        alt={`Gallery ${activeIndex + 1}`} 
        className="max-h-[85vh] max-w-[90vw] object-contain rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Next */}
      {images.length > 1 && (
        <button 
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 md:right-8 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-2xl transition"
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Trip not found</h1>
        <button onClick={() => navigate("/")} className="px-6 py-3 bg-violet-600 text-white rounded-xl">
          Back to Home
        </button>
      </div>
    );
  }

  const galleryImages = trip.gallery && trip.gallery.length > 0 ? trip.gallery : [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HERO */}
      <div className="relative h-[50vh] sm:h-[60vh] overflow-hidden">
        <img src={trip.heroImage} alt={trip.title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        <button
          onClick={() => navigate(-1)}
          className="absolute top-24 md:top-28 left-6 z-10 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/40 transition"
        >
          ←
        </button>

        <div className="absolute bottom-10 left-6 right-6 max-w-5xl mx-auto text-white">
          <p className="text-xs sm:text-sm uppercase tracking-widest text-white/70 mb-2">{trip.subtitle}</p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black mb-2 leading-tight">{trip.title}</h1>
          <p className="text-sm sm:text-lg text-white/80">{trip.tagline}</p>

          <div className="flex flex-wrap gap-2 mt-4 text-xs sm:text-sm">
            <span className="bg-white/20 backdrop-blur px-3 py-1 rounded-full">⭐ {trip.rating} ({trip.reviews} reviews)</span>
            <span className="bg-white/20 backdrop-blur px-3 py-1 rounded-full">🕐 {trip.duration}</span>
            {trip.groupSize && <span className="bg-white/20 backdrop-blur px-3 py-1 rounded-full">👥 {trip.groupSize}</span>}
            {trip.difficulty && <span className="bg-white/20 backdrop-blur px-3 py-1 rounded-full">📊 {trip.difficulty}</span>}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-12 sm:space-y-16">

        {/* PRICE + OVERVIEW */}
        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Overview</h2>
            <p className="text-gray-600 leading-relaxed text-lg">{trip.overview}</p>
          </div>

          <div className="bg-white rounded-3xl shadow-xl p-6 flex flex-col items-center justify-center text-center">
            {trip.originalPrice && (
              <span className="text-gray-400 line-through text-sm">{trip.originalPrice}</span>
            )}
            <span className="text-4xl font-black text-violet-600">{trip.price}</span>
            <span className="text-gray-500 text-sm mt-1">per person</span>

            <button
              onClick={() => setShowQuoteModal(true)}
              className="mt-4 w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm rounded-xl hover:brightness-110 active:scale-[0.97] transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              💰 Get Quote
            </button>
          </div>
        </div>

        {/* ITINERARY */}
        {trip.itinerary && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Day-by-Day Itinerary</h2>
            <div className="space-y-4">
              {trip.itinerary.map((day) => (
                <div key={day.day} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-12 h-12 bg-violet-100 text-violet-600 rounded-xl flex items-center justify-center font-bold text-sm">
                      D{day.day}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{day.title}</h3>
                      <p className="text-gray-500 mt-1 text-sm">{day.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INCLUSIONS / EXCLUSIONS */}
        <div className="grid md:grid-cols-2 gap-8">
          {trip.inclusions && (
            <div className="bg-emerald-50 rounded-3xl p-6">
              <h3 className="text-xl font-bold text-emerald-800 mb-4">✅ What's Included</h3>
              <ul className="space-y-2">
                {trip.inclusions.map((item, i) => (
                  <li key={i} className="text-emerald-700 text-sm flex items-start gap-2">
                    <span className="mt-1">•</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {trip.exclusions && (
            <div className="bg-red-50 rounded-3xl p-6">
              <h3 className="text-xl font-bold text-red-800 mb-4">❌ Not Included</h3>
              <ul className="space-y-2">
                {trip.exclusions.map((item, i) => (
                  <li key={i} className="text-red-700 text-sm flex items-start gap-2">
                    <span className="mt-1">•</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* BATCHES */}
        {trip.batches && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Upcoming Batches</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {trip.batches.map((batch) => (
                <div
                  key={batch.id || batch.date}
                  className={`rounded-2xl p-4 border text-center ${batch.status === "soldout" ? "bg-gray-100 border-gray-200" : "bg-white border-gray-200 shadow-sm"}`}
                >
                  <p className="font-bold text-gray-900 text-sm">{batch.date}</p>
                  <p className="text-violet-600 font-bold text-lg mt-1">{batch.price}</p>
                  {batch.slots !== undefined && (
                    <p className="text-xs text-gray-400 mt-1">{batch.slots} slots left</p>
                  )}
                  <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold ${statusStyle[batch.status] || ""}`}>
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
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Gallery</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {galleryImages.length > 0 ? galleryImages.map((img, i) => (
                <img 
                  key={i} 
                  src={img} 
                  alt={`Gallery ${i + 1}`} 
                  onClick={() => setLightboxIndex(i)}
                  className="rounded-2xl h-48 w-full object-cover shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer" 
                />
              )) : (
                <p className="text-gray-400">Images coming soon.</p>
              )}
            </div>
          </div>
        )}

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
