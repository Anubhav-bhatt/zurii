import React from "react";
import { useNavigate } from "react-router-dom";
import { badgeColors } from "../data";

const TravelCard = React.memo(({ trip, onGetQuote, onClick, className = "" }) => {
  const navigate = useNavigate();

  if (!trip) return null;

  // Normalize image source (some trips use 'image', others 'heroImage')
  const imageSrc = trip.image || trip.heroImage;

  // Dynamic WhatsApp Concierge link
  const handleWhatsApp = (e) => {
    e.stopPropagation();
    const phoneNumber = "919906892984";
    const message = `Hello Zurii Travels! I am interested in the premium package for "${trip.title}" (${trip.duration || ""}). Could you please connect me with a luxury travel concierge?`;
    window.open(`https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`, "_blank");
  };

  const handleGetQuote = (e) => {
    e.stopPropagation();
    if (onGetQuote) {
      onGetQuote(trip);
    }
  };

  const handleCardClick = (e) => {
    if (onClick) {
      onClick(e);
    } else {
      navigate(`/trip/${trip.id}`);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group bg-white rounded-3xl border border-zinc-200/50 overflow-hidden flex flex-col shadow-sm hover:shadow-[0_12px_30px_rgba(0,0,0,0.04)] hover:border-zinc-300/60 cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 ${className}`}
    >
      {/* Image Section */}
      <div className="relative h-56 overflow-hidden bg-zinc-50">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={trip.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.02]"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center">
            <span className="text-3xl opacity-30">🏔️</span>
          </div>
        )}
        
        {/* Subtle Vignette Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent pointer-events-none" />

        {/* Badge / Pill */}
        {trip.badge && (
          <span
            className={`absolute top-4 left-4 px-3 py-1 text-[9px] uppercase tracking-wider font-bold rounded-full text-white bg-gradient-to-r ${
              badgeColors[trip.badge] || "from-violet-500 to-indigo-600"
            }`}
          >
            {trip.badge}
          </span>
        )}

        {/* Duration Label */}
        {trip.duration && (
          <span className="absolute bottom-4 left-4 px-3 py-1 text-[9px] uppercase tracking-wider font-semibold rounded-full bg-white/90 backdrop-blur-md text-zinc-800 shadow-sm border border-white/20">
            {trip.duration}
          </span>
        )}
      </div>

      {/* Details Section */}
      <div className="p-6 flex-1 flex flex-col justify-between">
        <div>
          {/* Tagline / Location */}
          <p className="text-[10px] font-bold text-violet-600 uppercase tracking-widest mb-1.5">
            {trip.location || trip.subtitle || "Premium Getaway"}
          </p>

          {/* Title */}
          <h3 className="text-[17px] font-bold text-zinc-950 leading-snug tracking-tight mb-2 group-hover:text-violet-600 transition-colors duration-300">
            {trip.title}
          </h3>

          {/* Ratings & Reviews */}
          {trip.rating && (
            <div className="flex items-center gap-1.5 mb-4">
              <svg
                className="w-3.5 h-3.5 text-amber-400 fill-current"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-xs font-semibold text-zinc-800">{trip.rating}</span>
              {trip.reviews && (
                <span className="text-xs text-zinc-400 font-medium">({trip.reviews} reviews)</span>
              )}
            </div>
          )}
        </div>

        <div>
          {/* Price & Discounts */}
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-lg font-bold text-zinc-950 tracking-tight">
              {trip.price}
            </span>
            {trip.originalPrice && (
              <span className="text-xs text-zinc-400 line-through">
                {trip.originalPrice}
              </span>
            )}
            {trip.save && (
              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                Save {trip.save}
              </span>
            )}
          </div>

          {/* Premium Dual CTA Buttons */}
          <div className="grid grid-cols-2 gap-2 mt-auto">
            {/* Get Quote Button (Apple style primary dark pill) */}
            <button
              onClick={handleGetQuote}
              className="touch-target relative h-11 rounded-full bg-zinc-950 text-white text-xs font-semibold hover:bg-zinc-800 active:scale-[0.98] transition-all duration-300 flex items-center justify-center shadow-xs focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2"
              aria-label={`Get quote for ${trip.title}`}
            >
              Get Quote
            </button>

            {/* WhatsApp Concierge Button (Glassmorphic subtle emerald pill) */}
            <button
              onClick={handleWhatsApp}
              className="touch-target relative h-11 rounded-full bg-emerald-500/[0.02] border border-emerald-500/15 text-emerald-700 text-xs font-semibold hover:bg-emerald-500/[0.06] hover:border-emerald-500/25 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              aria-label={`Inquire about ${trip.title} on WhatsApp`}
            >
              <svg
                className="w-3.5 h-3.5 fill-current shrink-0"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              <span>WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default TravelCard;
